import { db, query } from '../db/client';
import { sql } from '../db/sql';
import { permission, rolePermission, user, userRole } from '../modules/core/models';
import { Access, type Grant } from './access';

interface Row {
  id: number;
  email: string;
  fullName: string;
  tokenVersion: number;
  code: string | null;
  dealershipId: number | null;
  branchId: number | null;
}

/**
 * Resolves the caller's effective permissions with their scopes. Runs every request (one indexed
 * query: the user, and a row per granted permission) so role/permission edits take effect immediately.
 * user / user_role / permission tables are authorization metadata and carry no RLS.
 */
export async function loadAccess(userId: number, tokenVersion: number): Promise<Access | null> {
  const rows = await query<Row>(
    db,
    sql`select ${user.id} as "id", ${user.email} as "email", ${user.fullName} as "fullName", ${user.tokenVersion} as "tokenVersion",
          ${permission.code} as "code", ${userRole.dealershipId} as "dealershipId", ${userRole.branchId} as "branchId"
        from ${user}
        left join (${userRole}
          inner join ${rolePermission} on ${rolePermission.roleId} = ${userRole.roleId}
          inner join ${permission} on ${permission.id} = ${rolePermission.permissionId})
          on ${userRole.userId} = ${user.id}
        where ${user.id} = ${userId} and ${user.isActive} = true`,
  );
  const u = rows[0];
  if (!u || u.tokenVersion !== tokenVersion) return null;

  const grants = new Map<string, Grant[]>();
  for (const r of rows) {
    if (r.code === null) continue; // the user holds no role
    const list = grants.get(r.code) ?? [];
    list.push({ dealershipId: r.dealershipId, branchId: r.branchId });
    grants.set(r.code, list);
  }
  return new Access({ id: u.id, email: u.email, fullName: u.fullName }, grants);
}
