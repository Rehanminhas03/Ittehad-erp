import { db } from '../db/client';
import { Access, type Grant } from './access';

/**
 * Resolves the caller's effective permissions with their scopes. Runs every request
 * (two indexed queries) so role/permission edits take effect immediately.
 * user / user_role / permission tables are authorization metadata and carry no RLS.
 */
export async function loadAccess(userId: number, tokenVersion: number): Promise<Access | null> {
  const u = await db.user.findFirst({
    where: { id: userId, isActive: true },
    select: { id: true, email: true, fullName: true, tokenVersion: true },
  });
  if (!u || u.tokenVersion !== tokenVersion) return null;

  const roles = await db.userRole.findMany({
    where: { userId },
    select: { dealershipId: true, branchId: true, role: { select: { rolePermissions: { select: { permission: { select: { code: true } } } } } } },
  });

  const grants = new Map<string, Grant[]>();
  for (const r of roles) {
    for (const rp of r.role.rolePermissions) {
      const code = rp.permission.code;
      const list = grants.get(code) ?? [];
      list.push({ dealershipId: r.dealershipId, branchId: r.branchId });
      grants.set(code, list);
    }
  }
  return new Access({ id: u.id, email: u.email, fullName: u.fullName }, grants);
}
