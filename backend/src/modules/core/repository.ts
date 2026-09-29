import { matchesPattern, permissionCatalog } from '../../auth/permissions';
import { type Executor, query } from '../../db/client';
import { join, notInArray, sql } from '../../db/sql';
import { DEFAULT_ROLES } from './defaultRoles';
import { branch, dealership, permission, role, user, userRole } from './models';

/** Prisma `select` for the user fields the API exposes (never the password hash). */
export const publicUserColumns = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Case-insensitive exact match on the email (lower() = lower(), as before). */
export async function findUserByEmail(ex: Executor, email: string) {
  const [hit] = await query<{ id: number }>(ex, sql`select ${user.id} as "id" from ${user} where lower(${user.email}) = ${email.toLowerCase()} limit 1`);
  if (!hit) return undefined;
  return (await ex.user.findUnique({ where: { id: hit.id } })) ?? undefined;
}

export interface Assignment {
  id: number;
  userId: number;
  roleId: number;
  roleName: string;
  dealershipId: number | null;
  dealershipName: string | null;
  branchId: number | null;
  branchName: string | null;
}

/**
 * Role assignments for users, with names. dealership/branch names are looked up through
 * LEFT JOINs that are subject to RLS, so names of out-of-scope tenants come back null.
 */
export function assignmentsFor(ex: Executor, userIds: number[]): Promise<Assignment[]> {
  if (!userIds.length) return Promise.resolve([]);
  return query<Assignment>(
    ex,
    sql`select ${userRole.id} as "id", ${userRole.userId} as "userId", ${userRole.roleId} as "roleId", ${role.name} as "roleName",
               ${userRole.dealershipId} as "dealershipId", ${dealership.name} as "dealershipName",
               ${userRole.branchId} as "branchId", ${branch.name} as "branchName"
          from ${userRole}
          join ${role} on ${role.id} = ${userRole.roleId}
          left join ${dealership} on ${dealership.id} = ${userRole.dealershipId}
          left join ${branch} on ${branch.id} = ${userRole.branchId}
         where ${userRole.userId} in (${join(userIds)})
         order by ${role.name}, ${userRole.id}`,
  );
}

export async function permissionCodesOfRole(ex: Executor, roleId: number): Promise<string[]> {
  const rows = await ex.rolePermission.findMany({
    where: { roleId },
    select: { permission: { select: { code: true } } },
    orderBy: { permission: { code: 'asc' } },
  });
  return rows.map((r) => r.permission.code);
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
  const existing = new Set((await ex.permission.findMany({ select: { code: true } })).map((r) => r.code));
  const added = codes.filter((c) => !existing.has(c));

  if (catalog.length) {
    await query(
      ex,
      sql`insert into ${permission} (code, module, description)
          values ${join(catalog.map((p) => sql`(${p.code}, ${p.module}, ${p.description})`))}
          on conflict (code) do update set description = excluded.description, module = excluded.module
          returning 1 as "ok"`,
    );
  }
  const removed = await query<{ code: string }>(ex, sql`delete from ${permission} where ${notInArray(permission.code, codes)} returning code`);

  const allPerms = await ex.permission.findMany({ select: { id: true, code: true } });
  for (const tpl of DEFAULT_ROLES) {
    let r = await ex.role.findFirst({ where: { name: tpl.name } });
    let candidates: typeof allPerms;
    if (!r) {
      r = await ex.role.create({ data: { name: tpl.name, description: tpl.description, isSystem: true, delegatedBy: tpl.delegatedBy ?? null } });
      candidates = allPerms;
    } else {
      candidates = allPerms.filter((p) => added.includes(p.code));
      // A delegation introduced by a newer template is filled in; one an admin set is kept.
      if (tpl.delegatedBy && !r.delegatedBy) await ex.role.update({ where: { id: r.id }, data: { delegatedBy: tpl.delegatedBy } });
    }
    const grant = candidates.filter((p) => tpl.patterns.some((pat) => matchesPattern(p.code, pat)));
    if (grant.length) {
      await ex.rolePermission.createMany({ data: grant.map((p) => ({ roleId: r!.id, permissionId: p.id })), skipDuplicates: true });
    }
  }
  return { added, removed: removed.map((r) => r.code) };
}
