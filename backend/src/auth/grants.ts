import { and, eq } from 'drizzle-orm';
import { db } from '../db/client';
import { permission, rolePermission, user, userRole } from '../modules/core/models';
import { Access, type Grant } from './access';

/**
 * Resolves the caller's effective permissions with their scopes. Runs every request
 * (two indexed queries) so role/permission edits take effect immediately.
 * user / user_role / permission tables are authorization metadata and carry no RLS.
 */
export async function loadAccess(userId: number, tokenVersion: number): Promise<Access | null> {
  const [u] = await db
    .select({ id: user.id, email: user.email, fullName: user.fullName, tokenVersion: user.tokenVersion })
    .from(user)
    .where(and(eq(user.id, userId), eq(user.isActive, true)));
  if (!u || u.tokenVersion !== tokenVersion) return null;

  const rows = await db
    .select({ code: permission.code, dealershipId: userRole.dealershipId, branchId: userRole.branchId })
    .from(userRole)
    .innerJoin(rolePermission, eq(rolePermission.roleId, userRole.roleId))
    .innerJoin(permission, eq(permission.id, rolePermission.permissionId))
    .where(eq(userRole.userId, userId));

  const grants = new Map<string, Grant[]>();
  for (const r of rows) {
    const list = grants.get(r.code) ?? [];
    list.push({ dealershipId: r.dealershipId, branchId: r.branchId });
    grants.set(r.code, list);
  }
  return new Access({ id: u.id, email: u.email, fullName: u.fullName }, grants);
}
