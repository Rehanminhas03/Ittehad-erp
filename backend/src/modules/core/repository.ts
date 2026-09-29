import { eq, inArray, notInArray, sql } from 'drizzle-orm';
import { matchesPattern, permissionCatalog } from '../../auth/permissions';
import type { Executor } from '../../db/client';
import { DEFAULT_ROLES } from './defaultRoles';
import { branch, dealership, permission, role, rolePermission, user, userRole } from './models';

export const publicUserColumns = {
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  phone: user.phone,
  isActive: user.isActive,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
};

export function findUserByEmail(ex: Executor, email: string) {
  return ex
    .select()
    .from(user)
    .where(sql`lower(${user.email}) = ${email.toLowerCase()}`)
    .then((r) => r[0]);
}

/**
 * Role assignments for users, with names. dealership/branch names are looked up through
 * LEFT JOINs that are subject to RLS, so names of out-of-scope tenants come back null.
 */
export function assignmentsFor(ex: Executor, userIds: number[]) {
  if (!userIds.length) return Promise.resolve([]);
  return ex
    .select({
      id: userRole.id,
      userId: userRole.userId,
      roleId: userRole.roleId,
      roleName: role.name,
      dealershipId: userRole.dealershipId,
      dealershipName: dealership.name,
      branchId: userRole.branchId,
      branchName: branch.name,
    })
    .from(userRole)
    .innerJoin(role, eq(role.id, userRole.roleId))
    .leftJoin(dealership, eq(dealership.id, userRole.dealershipId))
    .leftJoin(branch, eq(branch.id, userRole.branchId))
    .where(inArray(userRole.userId, userIds))
    .orderBy(role.name, userRole.id);
}

export async function permissionCodesOfRole(ex: Executor, roleId: number): Promise<string[]> {
  const rows = await ex
    .select({ code: permission.code })
    .from(rolePermission)
    .innerJoin(permission, eq(permission.id, rolePermission.permissionId))
    .where(eq(rolePermission.roleId, roleId))
    .orderBy(permission.code);
  return rows.map((r) => r.code);
}

/**
 * Syncs the code-defined catalog into core.permission and applies role templates:
 *  - inserts new codes, updates descriptions, deletes codes no longer in the catalog;
 *  - creates missing default roles with every matching permission;
 *  - grants newly-inserted codes to existing default-named roles whose patterns match.
 * Runs with the owner connection (migrations/seed), never at request time.
 */
export async function syncPermissionsAndRoles(ex: Executor): Promise<{ added: string[]; removed: string[] }> {
  const catalog = permissionCatalog();
  const codes = catalog.map((p) => p.code);
  const existing = new Set((await ex.select({ code: permission.code }).from(permission)).map((r) => r.code));
  const added = codes.filter((c) => !existing.has(c));

  if (catalog.length) {
    await ex
      .insert(permission)
      .values(catalog)
      .onConflictDoUpdate({
        target: permission.code,
        set: { description: sql`excluded.description`, module: sql`excluded.module` },
      });
  }
  const removed = await ex
    .delete(permission)
    .where(codes.length ? notInArray(permission.code, codes) : sql`true`)
    .returning({ code: permission.code });

  const allPerms = await ex.select({ id: permission.id, code: permission.code }).from(permission);
  for (const tpl of DEFAULT_ROLES) {
    let [r] = await ex.select().from(role).where(eq(role.name, tpl.name));
    let candidates: typeof allPerms;
    if (!r) {
      [r] = await ex.insert(role).values({ name: tpl.name, description: tpl.description, isSystem: true, delegatedBy: tpl.delegatedBy ?? null }).returning();
      candidates = allPerms;
    } else {
      candidates = allPerms.filter((p) => added.includes(p.code));
      // A delegation introduced by a newer template is filled in; one an admin set is kept.
      if (tpl.delegatedBy && !r.delegatedBy) await ex.update(role).set({ delegatedBy: tpl.delegatedBy }).where(eq(role.id, r.id));
    }
    const grant = candidates.filter((p) => tpl.patterns.some((pat) => matchesPattern(p.code, pat)));
    if (grant.length) {
      await ex
        .insert(rolePermission)
        .values(grant.map((p) => ({ roleId: r!.id, permissionId: p.id })))
        .onConflictDoNothing();
    }
  }
  return { added, removed: removed.map((r) => r.code) };
}
