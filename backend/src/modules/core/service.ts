import bcrypt from 'bcryptjs';
import { type Access, type ScopeTarget, scopeWhere } from '../../auth/access';
import { loadAccess } from '../../auth/grants';
import { isKnownPermission } from '../../auth/permissions';
import { hashRefreshToken, newRefreshToken, signAccessToken } from '../../auth/tokens';
import { env } from '../../config/env';
import { type Executor, type Tx, applyTenant, db, query } from '../../db/client';
import { type SQL, and, eq, gte, ilike, lte, or, raw, sql, where as whereClause } from '../../db/sql';
import { escapeLike } from '../../entity/entityService';
import type { EntityCtx } from '../../entity/types';
import { conflict, forbidden, notFound, unauthorized, validationError } from '../../lib/errors';
import { type PageQuery, offsetOf } from '../../lib/pagination';
import { type AuditMeta, diffChanges, writeAudit } from './audit';
import { auditLog, branch, refreshToken, role, user, userRole } from './models';
import { CorePerm } from './permissions';
import { assignmentsFor, findUserByEmail, permissionCodesOfRole, publicUserColumns } from './repository';
import type { z } from '../../lib/zod';
import type { AuditQuery, RoleAssignmentInput, UserCreate, UserListQuery, UserUpdate } from './schemas';

const BCRYPT_COST = 11;
// Compared against when the email is unknown, so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_COST);

// =============================================================================
// Auth
// =============================================================================
export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  me: Awaited<ReturnType<typeof buildMe>>;
}

/** Issues tokens for an already-resolved `Access` (its grants are reused, not re-queried). */
async function issueSessionFor(tx: Tx, access: Access, tokenVersion: number, meta: { ip?: string; userAgent?: string }): Promise<SessionTokens> {
  const { token, hash } = newRefreshToken();
  await tx.refreshToken.create({
    data: {
      userId: access.userId,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_SEC * 1000),
      ip: meta.ip,
      userAgent: meta.userAgent?.slice(0, 300),
    },
    select: { id: true },
  });
  await applyTenant(tx, access.tenantContext());
  return {
    accessToken: signAccessToken(access.userId, tokenVersion),
    refreshToken: token,
    expiresIn: env.ACCESS_TOKEN_TTL_SEC,
    me: await buildMe(tx, access),
  };
}

/**
 * Issues tokens for a user by id, re-resolving their permissions (login/refresh/dev-login: the
 * caller isn't authenticated yet, so there is no `Access` to reuse). Reads through the pool, not
 * `tx`: never call this after a write that must be visible immediately in the same transaction
 * (e.g. a just-bumped tokenVersion) — use `issueSessionFor` with the request's own `access` instead.
 */
async function issueSession(tx: Tx, userId: number, tokenVersion: number, meta: { ip?: string; userAgent?: string }): Promise<SessionTokens> {
  const access = await loadAccess(userId, tokenVersion);
  if (!access) throw unauthorized();
  return issueSessionFor(tx, access, tokenVersion, meta);
}

/**
 * The dealership a user's sign-ins and sign-outs are recorded under (their first dealership role), so
 * that the managers of that dealership see them. Null for users with global roles only.
 */
async function homeDealership(ex: Executor, userId: number): Promise<number | null> {
  const r = await ex.userRole.findFirst({
    where: { userId, dealershipId: { not: null } },
    orderBy: { id: 'asc' },
    select: { dealershipId: true },
  });
  return r?.dealershipId ?? null;
}

export async function login(tx: Tx, email: string, password: string, meta: { ip?: string; userAgent?: string; requestId?: string }) {
  const u = await findUserByEmail(tx, email);
  const ok = await bcrypt.compare(password, u?.passwordHash ?? DUMMY_HASH);
  if (!u || !ok || !u.isActive) {
    // Recorded through the pool: the 401 below rolls the request transaction back, but a refused
    // sign-in must stay on record (a wrong password, or a deactivated account trying to get in).
    await writeAudit(
      db,
      { actorId: u?.id ?? null, ip: meta.ip, requestId: meta.requestId },
      {
        entityType: 'core.user',
        entityId: u?.id ?? 0,
        action: u && ok && !u.isActive ? 'login.blocked' : 'login.failed',
        dealershipId: u ? await homeDealership(db, u.id) : null,
        changes: { email, userAgent: meta.userAgent },
      },
    );
    throw unauthorized('Invalid email or password');
  }
  await tx.user.update({ where: { id: u.id }, data: { lastLoginAt: new Date() }, select: { id: true } });
  await writeAudit(
    tx,
    { actorId: u.id, ip: meta.ip, requestId: meta.requestId },
    { entityType: 'core.user', entityId: u.id, action: 'login', dealershipId: await homeDealership(tx, u.id), changes: { userAgent: meta.userAgent } },
  );
  return issueSession(tx, u.id, u.tokenVersion, meta);
}

/** Development-only: sign in as an active user by email, no password (router guards the environment). */
export async function devLogin(tx: Tx, email: string, meta: { ip?: string; userAgent?: string; requestId?: string }) {
  const u = await findUserByEmail(tx, email);
  if (!u || !u.isActive) throw unauthorized('No active user with that email');
  await writeAudit(tx, { actorId: u.id, ip: meta.ip, requestId: meta.requestId }, { entityType: 'core.user', entityId: u.id, action: 'login.dev' });
  return issueSession(tx, u.id, u.tokenVersion, meta);
}

/** Development-only: accounts offered by the "Switch user" menu. */
export function devAccounts(tx: Tx) {
  return tx.user.findMany({ where: { isActive: true }, select: { email: true, fullName: true }, orderBy: { id: 'asc' }, take: 100 });
}

/**
 * Rotating refresh tokens. Presenting an already-rotated token means it was stolen or replayed:
 * every session of that user is revoked.
 */
export async function refresh(tx: Tx, token: string, meta: { ip?: string; userAgent?: string }) {
  const [locked] = await query<{ id: number }>(
    tx,
    sql`select ${refreshToken.id} as "id" from ${refreshToken} where ${refreshToken.tokenHash} = ${hashRefreshToken(token)} for update`,
  );
  const row = locked ? await tx.refreshToken.findUnique({ where: { id: locked.id } }) : null;
  if (!row) throw unauthorized('Invalid refresh token');
  if (row.revokedAt) {
    // Outside the request transaction: the 401 below rolls that back, but this revocation must stick.
    await db.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    throw unauthorized('Refresh token reuse detected; all sessions were signed out');
  }
  if (row.expiresAt <= new Date()) throw unauthorized('Refresh token expired');
  const u = await tx.user.findUnique({ where: { id: row.userId } });
  if (!u || !u.isActive) throw unauthorized();
  await tx.refreshToken.update({ where: { id: row.id }, data: { revokedAt: new Date() }, select: { id: true } });
  return issueSession(tx, u.id, u.tokenVersion, meta);
}

export async function logout(tx: Tx, token: string | undefined, meta: { ip?: string; userAgent?: string; requestId?: string } = {}) {
  if (!token) return;
  const [revoked] = await query<{ userId: number }>(
    tx,
    sql`update ${refreshToken} set revoked_at = ${new Date()}
         where ${refreshToken.tokenHash} = ${hashRefreshToken(token)} and ${refreshToken.revokedAt} is null
         returning user_id as "userId"`,
  );
  if (revoked) {
    await writeAudit(
      tx,
      { actorId: revoked.userId, ip: meta.ip, requestId: meta.requestId },
      { entityType: 'core.user', entityId: revoked.userId, action: 'logout', dealershipId: await homeDealership(tx, revoked.userId), changes: { userAgent: meta.userAgent } },
    );
  }
}

/**
 * Self-service password change. Requires the current password; every other session is signed out
 * (token version bump), and the caller gets a fresh session so they stay signed in here.
 */
export async function changePassword(
  tx: Tx,
  access: Access,
  input: { currentPassword: string; newPassword: string },
  meta: { ip?: string; userAgent?: string; requestId?: string },
) {
  const u = await tx.user.findUnique({ where: { id: access.userId } });
  if (!u || !(await bcrypt.compare(input.currentPassword, u.passwordHash))) {
    throw validationError([{ in: 'body', path: 'currentPassword', message: 'Current password is incorrect' }]);
  }
  if (input.currentPassword === input.newPassword) {
    throw validationError([{ in: 'body', path: 'newPassword', message: 'Choose a different password' }]);
  }
  await tx.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(input.newPassword) }, select: { id: true } });
  await revokeSessions(tx, u.id);
  await writeAudit(tx, { actorId: u.id, ip: meta.ip, requestId: meta.requestId }, { entityType: 'core.user', entityId: u.id, action: 'password.change' });
  // Reuses the request's own access (unaffected by the password change) instead of re-querying
  // loadAccess, whose read through the pool cannot see the tokenVersion bump before this tx commits.
  return issueSessionFor(tx, access, u.tokenVersion + 1, meta);
}

/** Self-service profile (name and phone); email and roles are managed by an administrator. */
export async function updateProfile(tx: Tx, access: Access, input: { fullName?: string; phone?: string | null }, meta: { ip?: string; requestId?: string }) {
  const before = await tx.user.findUnique({ where: { id: access.userId }, select: publicUserColumns });
  const patch: { fullName?: string; phone?: string | null } = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  const changes = diffChanges(before as Record<string, unknown>, patch);
  if (Object.keys(changes).length) {
    await tx.user.update({ where: { id: access.userId }, data: patch, select: { id: true } });
    await writeAudit(tx, { actorId: access.userId, ip: meta.ip, requestId: meta.requestId }, { entityType: 'core.user', entityId: access.userId, action: 'profile.update', changes });
  }
  return buildMe(tx, access);
}

/** Caller's profile, effective permissions with scope, and reachable dealerships/branches. */
export async function buildMe(tx: Executor, access: Access) {
  const codes = access.permissionCodes();
  const permissions = codes.map((code) => {
    const s = access.scope(code);
    return { code, global: s.global, dealershipIds: s.dealershipIds, branchIds: s.branches.map((b) => b.branchId) };
  });
  const all = access.scope(...codes);
  const dealerships = await tx.dealership.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, brand: true },
    orderBy: { name: 'asc' },
  });
  const branches = await query<{ id: number; dealershipId: number; code: string; name: string }>(
    tx,
    sql`select ${branch.id} as "id", ${branch.dealershipId} as "dealershipId", ${branch.code} as "code", ${branch.name} as "name"
          from ${branch}
         where ${branch.isActive} = true and ${scopeWhere(all, { dealership: branch.dealershipId, branch: branch.id })}
         order by ${branch.name}`,
  );
  const profile = await tx.user.findUnique({ where: { id: access.userId }, select: { id: true, email: true, fullName: true, phone: true } });
  return { user: profile ?? { ...access.user, phone: null }, permissions, dealerships, branches };
}

// =============================================================================
// Users
// =============================================================================
type UserCreateInput = z.output<typeof UserCreate>;
type UserUpdateInput = z.output<typeof UserUpdate>;
type AssignmentInput = z.output<typeof RoleAssignmentInput>;

/** Users reachable through the caller's `code` scope: users holding a role inside it. */
function userVisibility(access: Access, code: string): SQL {
  const scope = access.scope(code);
  if (scope.global) return sql`true`;
  return sql`exists (select 1 from ${userRole} where ${userRole.userId} = ${user.id} and ${scopeWhere(scope, { dealership: userRole.dealershipId, branch: userRole.branchId })})`;
}

/** The public user columns (publicUserColumns) for hand-written SQL, under their API names. */
const PUBLIC_USER_SQL = sql`${user.id} as "id", ${user.email} as "email", ${user.fullName} as "fullName", ${user.phone} as "phone",
  ${user.isActive} as "isActive", ${user.lastLoginAt} as "lastLoginAt", ${user.createdAt} as "createdAt", ${user.updatedAt} as "updatedAt"`;

type PublicUser = {
  id: number;
  email: string;
  fullName: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

async function presentUsers(ctx: EntityCtx, rows: { id: number }[]) {
  const scope = ctx.access.scope(CorePerm.usersView);
  const assignments = await assignmentsFor(ctx.tx, rows.map((r) => r.id));
  // Non-global viewers only see assignments inside their own reach.
  const visible = assignments.filter(
    (a) =>
      scope.global ||
      (a.dealershipId !== null &&
        (scope.dealershipIds.includes(a.dealershipId) || scope.branches.some((b) => b.branchId === a.branchId))),
  );
  return rows.map((r) => ({
    ...r,
    roles: visible.filter((a) => a.userId === r.id).map(({ userId: _u, ...a }) => a),
  }));
}

export async function listUsers(ctx: EntityCtx, q: PageQuery, f: z.output<typeof UserListQuery>) {
  const conds: SQL[] = [userVisibility(ctx.access, CorePerm.usersView)];
  if (q.q) {
    const p = `%${escapeLike(q.q)}%`;
    conds.push(or(ilike(user.email, p), ilike(user.fullName, p))!);
  }
  if (f.isActive !== undefined) conds.push(eq(user.isActive, f.isActive));
  if (f.dealershipId || f.roleId) {
    const c: SQL[] = [sql`${userRole.userId} = ${user.id}`];
    if (f.dealershipId) c.push(eq(userRole.dealershipId, f.dealershipId));
    if (f.roleId) c.push(eq(userRole.roleId, f.roleId));
    conds.push(sql`exists (select 1 from ${userRole} where ${and(...c)})`);
  }
  const where = and(...conds);
  const sortKey = (q.sort ?? 'fullName').replace(/^-/, '');
  const sortCols = { fullName: user.fullName, email: user.email, createdAt: user.createdAt, lastLoginAt: user.lastLoginAt } as const;
  const col = sortCols[sortKey as keyof typeof sortCols];
  if (!col) throw validationError([{ in: 'query', path: 'sort', message: `Sortable by: ${Object.keys(sortCols).join(', ')}` }]);
  const dir = raw(q.sort?.startsWith('-') ? 'desc' : 'asc');

  const rows = await query<PublicUser>(
    ctx.tx,
    sql`select ${PUBLIC_USER_SQL} from ${user} ${whereClause(where)}
         order by ${col} ${dir}, ${user.id} asc limit ${q.pageSize} offset ${offsetOf(q)}`,
  );
  const [{ total } = { total: 0 }] = await query<{ total: number }>(ctx.tx, sql`select count(*)::int as "total" from ${user} ${whereClause(where)}`);
  return { items: await presentUsers(ctx, rows), total, page: q.page, pageSize: q.pageSize };
}

async function findVisibleUser(ctx: EntityCtx, id: number, code: string = CorePerm.usersView) {
  const [row] = await query<PublicUser>(
    ctx.tx,
    sql`select ${PUBLIC_USER_SQL} from ${user} where ${user.id} = ${id} and ${userVisibility(ctx.access, code)}`,
  );
  if (!row) throw notFound('User');
  return row;
}

export async function getUser(ctx: EntityCtx, id: number) {
  const row = await findVisibleUser(ctx, id);
  return (await presentUsers(ctx, [row]))[0]!;
}

const USER_ADMIN_CODES: string[] = [CorePerm.usersCreate, CorePerm.usersUpdate, CorePerm.usersAssignRoles];

/**
 * Permissions of a role the caller could not hand out at `target` (empty: they may). They may if
 * they hold every permission of the role there, or the role is delegated to a permission they hold
 * there (role.delegatedBy, e.g. a Sales Manager and the Salesperson role).
 * Roles that administer users are appointed by a global administrator only: a dealership-scoped
 * manager can never create, reset or deactivate a peer (or anyone else who manages users).
 */
async function undelegablePermissions(ctx: EntityCtx, roleId: number, target: ScopeTarget | null): Promise<string[]> {
  const covers = (code: string) => (target ? ctx.access.canIn(code, target) : ctx.access.hasGlobal(code));
  const codes = await permissionCodesOfRole(ctx.tx, roleId);
  const administers = codes.filter((c) => USER_ADMIN_CODES.includes(c));
  if (administers.length && !administers.every((c) => ctx.access.hasGlobal(c))) return administers;
  const missing = codes.filter((c) => !covers(c));
  if (!missing.length) return [];
  const r = await ctx.tx.role.findUnique({ where: { id: roleId }, select: { delegatedBy: true } });
  return r?.delegatedBy && covers(r.delegatedBy) ? [] : missing;
}

/**
 * A user may be edited only by someone whose `code` scope covers every one of their assignments,
 * and who could grant each of their roles (so no one can reset the password of a more powerful user).
 */
async function assertManageable(ctx: EntityCtx, userId: number, code: string) {
  if (ctx.access.hasGlobal(code)) return;
  const rows = await ctx.tx.userRole.findMany({ where: { userId }, select: { roleId: true, dealershipId: true, branchId: true } });
  const ok =
    rows.length > 0 &&
    rows.every((r) => r.dealershipId !== null && ctx.access.canIn(code, { dealershipId: r.dealershipId, branchId: r.branchId }));
  if (!ok) throw forbidden('This user has roles outside your scope');
  if (userId === ctx.access.userId) return;
  for (const r of rows) {
    if ((await undelegablePermissions(ctx, r.roleId, { dealershipId: r.dealershipId!, branchId: r.branchId })).length) {
      throw forbidden('This user holds a role you cannot manage');
    }
  }
}

/**
 * Assign a role within a scope. Guards against privilege escalation: the assigner must hold
 * every permission of the role over the target scope (and assign_roles itself).
 */
async function assignRole(ctx: EntityCtx, userId: number, input: AssignmentInput) {
  const { access, tx } = ctx;
  const dealershipId = input.dealershipId ?? null;
  const branchId = input.branchId ?? null;
  const target: ScopeTarget | null = dealershipId === null ? null : { dealershipId, branchId };
  const covers = (code: string) => (target ? access.canIn(code, target) : access.hasGlobal(code));

  if (!covers(CorePerm.usersAssignRoles)) throw forbidden('You cannot assign roles in this scope');

  const r = await tx.role.findUnique({ where: { id: input.roleId }, select: { id: true, name: true } });
  if (!r) throw validationError([{ in: 'body', path: 'roleId', message: 'Role does not exist' }]);
  if (dealershipId !== null) {
    const d = await tx.dealership.findUnique({ where: { id: dealershipId }, select: { id: true } });
    if (!d) throw validationError([{ in: 'body', path: 'dealershipId', message: 'Dealership does not exist' }]);
  }
  if (branchId !== null) {
    const b = await tx.branch.findFirst({ where: { id: branchId, dealershipId: dealershipId! }, select: { id: true } });
    if (!b) throw validationError([{ in: 'body', path: 'branchId', message: 'Branch does not belong to the dealership' }]);
  }

  const missing = await undelegablePermissions(ctx, r.id, target);
  if (missing.length) {
    throw forbidden(`You cannot grant permissions you do not hold in this scope: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
  }

  const [row] = await query<{
    id: number;
    userId: number;
    roleId: number;
    dealershipId: number | null;
    branchId: number | null;
    createdAt: Date;
    createdById: number | null;
  }>(
    tx,
    sql`insert into ${userRole} (user_id, role_id, dealership_id, branch_id, created_by_id)
         values (${userId}, ${r.id}, ${dealershipId}, ${branchId}, ${access.userId})
         on conflict do nothing
         returning id as "id", user_id as "userId", role_id as "roleId", dealership_id as "dealershipId",
                   branch_id as "branchId", created_at as "createdAt", created_by_id as "createdById"`,
  );
  if (!row) throw conflict('User already has this role in this scope');
  await ctx.audit({
    entityType: 'core.user',
    entityId: userId,
    action: 'role.assign',
    dealershipId,
    branchId,
    changes: { roleId: r.id, roleName: r.name, dealershipId, branchId },
  });
  return row;
}

/** Roles the caller may hand out at a dealership (or globally), for the assign / new-user forms. */
export async function assignableRoles(ctx: EntityCtx, dealershipId?: number) {
  const target: ScopeTarget | null = dealershipId ? { dealershipId, branchId: null } : null;
  if (!(target ? ctx.access.canIn(CorePerm.usersAssignRoles, target) : ctx.access.hasGlobal(CorePerm.usersAssignRoles))) return [];
  const roles = await ctx.tx.role.findMany({ select: { id: true, name: true, description: true }, orderBy: { name: 'asc' }, take: 200 });
  const out: typeof roles = [];
  for (const r of roles) if (!(await undelegablePermissions(ctx, r.id, target)).length) out.push(r);
  return out;
}

export async function createUser(ctx: EntityCtx, input: UserCreateInput) {
  const { access, tx } = ctx;
  if (!access.hasGlobal(CorePerm.usersCreate)) {
    if (!input.roles.length) throw validationError([{ in: 'body', path: 'roles', message: 'Assign at least one role in your scope' }]);
    for (const a of input.roles) {
      if (a.dealershipId == null || !access.canIn(CorePerm.usersCreate, { dealershipId: a.dealershipId, branchId: a.branchId ?? null })) {
        throw forbidden('You cannot create users in this scope');
      }
    }
  }
  const row = await tx.user.create({
    data: { email: input.email, fullName: input.fullName, phone: input.phone ?? null, passwordHash: await hashPassword(input.password) },
    select: { id: true },
  });
  await ctx.audit({
    entityType: 'core.user',
    entityId: row.id,
    action: 'create',
    changes: { email: input.email, fullName: input.fullName, phone: input.phone },
  });
  for (const a of input.roles) await assignRole(ctx, row.id, a);
  const created = await tx.user.findUnique({ where: { id: row.id }, select: publicUserColumns });
  return (await presentUsers(ctx, [created!]))[0]!;
}

async function revokeSessions(tx: Tx, userId: number) {
  await tx.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } }, select: { id: true } });
  await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function updateUser(ctx: EntityCtx, id: number, input: UserUpdateInput) {
  const { access, tx } = ctx;
  const before = await findVisibleUser(ctx, id);
  await assertManageable(ctx, id, CorePerm.usersUpdate);
  if (id === access.userId && input.isActive === false) throw conflict('You cannot deactivate your own account');

  const patch: Record<string, unknown> = {};
  if (input.email !== undefined && input.email !== before.email.toLowerCase()) {
    const taken = await findUserByEmail(tx, input.email);
    if (taken && taken.id !== id) throw conflict('Another account already uses this email address');
    patch.email = input.email;
  }
  if (input.fullName !== undefined) patch.fullName = input.fullName;
  if (input.phone !== undefined) patch.phone = input.phone;
  if (input.isActive !== undefined) patch.isActive = input.isActive;
  const changes: Record<string, unknown> = diffChanges(before, patch);
  if (input.password) {
    patch.passwordHash = await hashPassword(input.password);
    changes.password = 'reset';
  }
  if (Object.keys(changes).length) {
    await tx.user.update({ where: { id }, data: patch, select: { id: true } });
    if (input.password || input.isActive === false) await revokeSessions(tx, id);
    await ctx.audit({ entityType: 'core.user', entityId: id, action: 'update', changes });
  }
  return getUser(ctx, id);
}

export async function addUserRole(ctx: EntityCtx, userId: number, input: AssignmentInput) {
  await findVisibleUser(ctx, userId, CorePerm.usersAssignRoles);
  if (userId === ctx.access.userId) throw forbidden('You cannot change your own role assignments');
  await assignRole(ctx, userId, input);
  return getUser(ctx, userId);
}

export async function removeUserRole(ctx: EntityCtx, userId: number, assignmentId: number) {
  const { access, tx } = ctx;
  await findVisibleUser(ctx, userId, CorePerm.usersAssignRoles);
  if (userId === access.userId) throw forbidden('You cannot change your own role assignments');
  const [locked] = await query<{ id: number }>(
    tx,
    sql`select ${userRole.id} as "id" from ${userRole} where ${userRole.id} = ${assignmentId} and ${userRole.userId} = ${userId} for update`,
  );
  const a = locked ? await tx.userRole.findUnique({ where: { id: locked.id } }) : null;
  if (!a) throw notFound('Role assignment');
  const covered = a.dealershipId === null
    ? access.hasGlobal(CorePerm.usersAssignRoles)
    : access.canIn(CorePerm.usersAssignRoles, { dealershipId: a.dealershipId, branchId: a.branchId });
  if (!covered) throw forbidden('This assignment is outside your scope');
  if ((await undelegablePermissions(ctx, a.roleId, a.dealershipId === null ? null : { dealershipId: a.dealershipId, branchId: a.branchId })).length) {
    throw forbidden('You cannot revoke a role you could not grant');
  }
  await tx.userRole.delete({ where: { id: assignmentId } });
  await ctx.audit({
    entityType: 'core.user',
    entityId: userId,
    action: 'role.revoke',
    dealershipId: a.dealershipId,
    branchId: a.branchId,
    changes: { roleId: a.roleId, dealershipId: a.dealershipId, branchId: a.branchId },
  });
  return getUser(ctx, userId);
}

// =============================================================================
// Roles & permissions
// =============================================================================
export async function getRolePermissions(ctx: EntityCtx, roleId: number) {
  const r = await ctx.tx.role.findUnique({ where: { id: roleId }, select: { id: true } });
  if (!r) throw notFound('Role');
  return { roleId, permissionCodes: await permissionCodesOfRole(ctx.tx, roleId) };
}

export async function setRolePermissions(ctx: EntityCtx, roleId: number, codes: string[]) {
  const { access, tx } = ctx;
  if (!access.hasGlobal(CorePerm.rolesManage)) throw forbidden('Editing roles requires a global grant');
  const [r] = await query<{ id: number }>(tx, sql`select ${role.id} as "id" from ${role} where ${role.id} = ${roleId} for update`);
  if (!r) throw notFound('Role');
  const unknown = codes.filter((c) => !isKnownPermission(c));
  if (unknown.length) throw validationError([{ in: 'body', path: 'permissionCodes', message: `Unknown: ${unknown.join(', ')}` }]);

  const wanted = [...new Set(codes)];
  const current = await permissionCodesOfRole(tx, roleId);
  const added = wanted.filter((c) => !current.includes(c));
  const removed = current.filter((c) => !wanted.includes(c));
  if (!added.length && !removed.length) return { roleId, permissionCodes: current };

  await tx.rolePermission.deleteMany({ where: { roleId } });
  if (wanted.length) {
    const perms = await tx.permission.findMany({ where: { code: { in: wanted } }, select: { id: true } });
    await tx.rolePermission.createMany({ data: perms.map((p) => ({ roleId, permissionId: p.id })) });
  }
  await tx.role.update({ where: { id: roleId }, data: { updatedById: access.userId }, select: { id: true } });
  await ctx.audit({ entityType: 'core.role', entityId: roleId, action: 'permissions.update', changes: { added, removed } });
  return { roleId, permissionCodes: wanted.sort() };
}

export async function listPermissions(ctx: EntityCtx, module?: string) {
  return ctx.tx.permission.findMany({ where: module ? { module } : undefined, orderBy: { code: 'asc' } });
}

// =============================================================================
// Audit log
// =============================================================================
export async function listAudit(ctx: EntityCtx, q: PageQuery, f: z.output<typeof AuditQuery>) {
  const conds: SQL[] = [
    scopeWhere(ctx.access.scope(CorePerm.auditView), { dealership: auditLog.dealershipId, branch: auditLog.branchId }),
  ];
  if (f.entityType) conds.push(eq(auditLog.entityType, f.entityType));
  if (f.entityId) conds.push(eq(auditLog.entityId, f.entityId));
  if (f.actorId) conds.push(eq(auditLog.actorId, f.actorId));
  if (f.dealershipId) conds.push(eq(auditLog.dealershipId, f.dealershipId));
  if (f.action) conds.push(eq(auditLog.action, f.action));
  if (f.from) conds.push(gte(auditLog.occurredAt, new Date(f.from)));
  if (f.to) conds.push(lte(auditLog.occurredAt, new Date(f.to)));
  const where = and(...conds);
  const items = await query<{
    id: number;
    occurredAt: Date;
    actorId: number | null;
    actorName: string | null;
    entityType: string;
    entityId: string;
    action: string;
    dealershipId: number | null;
    branchId: number | null;
    changes: unknown;
  }>(
    ctx.tx,
    sql`select ${auditLog.id} as "id", ${auditLog.occurredAt} as "occurredAt", ${auditLog.actorId} as "actorId",
               ${user.fullName} as "actorName", ${auditLog.entityType} as "entityType", ${auditLog.entityId} as "entityId",
               ${auditLog.action} as "action", ${auditLog.dealershipId} as "dealershipId", ${auditLog.branchId} as "branchId",
               ${auditLog.changes} as "changes"
          from ${auditLog}
          left join ${user} on ${user.id} = ${auditLog.actorId}
          ${whereClause(where)}
         order by ${auditLog.occurredAt} desc, ${auditLog.id} desc
         limit ${q.pageSize} offset ${offsetOf(q)}`,
  );
  const [{ total } = { total: 0 }] = await query<{ total: number }>(ctx.tx, sql`select count(*)::int as "total" from ${auditLog} ${whereClause(where)}`);
  return { items, total, page: q.page, pageSize: q.pageSize };
}

export type { AuditMeta };
