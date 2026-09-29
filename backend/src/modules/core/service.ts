import bcrypt from 'bcryptjs';
import { type SQL, and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { type Access, type ScopeTarget, scopeWhere } from '../../auth/access';
import { loadAccess } from '../../auth/grants';
import { isKnownPermission } from '../../auth/permissions';
import { hashRefreshToken, newRefreshToken, signAccessToken } from '../../auth/tokens';
import { env } from '../../config/env';
import { type Executor, type Tx, applyTenant, db } from '../../db/client';
import { escapeLike } from '../../entity/entityService';
import type { EntityCtx } from '../../entity/types';
import { conflict, forbidden, notFound, unauthorized, validationError } from '../../lib/errors';
import { type PageQuery, offsetOf } from '../../lib/pagination';
import { type AuditMeta, diffChanges, writeAudit } from './audit';
import { auditLog, branch, dealership, permission, refreshToken, role, rolePermission, user, userRole } from './models';
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
  await tx.insert(refreshToken).values({
    userId: access.userId,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_SEC * 1000),
    ip: meta.ip,
    userAgent: meta.userAgent?.slice(0, 300),
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
  const [r] = await ex
    .select({ d: userRole.dealershipId })
    .from(userRole)
    .where(and(eq(userRole.userId, userId), isNotNull(userRole.dealershipId)))
    .orderBy(userRole.id)
    .limit(1);
  return r?.d ?? null;
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
  await tx.update(user).set({ lastLoginAt: new Date() }).where(eq(user.id, u.id));
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
  return tx
    .select({ email: user.email, fullName: user.fullName })
    .from(user)
    .where(eq(user.isActive, true))
    .orderBy(user.id)
    .limit(100);
}

/**
 * Rotating refresh tokens. Presenting an already-rotated token means it was stolen or replayed:
 * every session of that user is revoked.
 */
export async function refresh(tx: Tx, token: string, meta: { ip?: string; userAgent?: string }) {
  const [row] = await tx.select().from(refreshToken).where(eq(refreshToken.tokenHash, hashRefreshToken(token))).for('update');
  if (!row) throw unauthorized('Invalid refresh token');
  if (row.revokedAt) {
    // Outside the request transaction: the 401 below rolls that back, but this revocation must stick.
    await db
      .update(refreshToken)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshToken.userId, row.userId), isNull(refreshToken.revokedAt)));
    throw unauthorized('Refresh token reuse detected; all sessions were signed out');
  }
  if (row.expiresAt <= new Date()) throw unauthorized('Refresh token expired');
  const [u] = await tx.select().from(user).where(eq(user.id, row.userId));
  if (!u || !u.isActive) throw unauthorized();
  await tx.update(refreshToken).set({ revokedAt: new Date() }).where(eq(refreshToken.id, row.id));
  return issueSession(tx, u.id, u.tokenVersion, meta);
}

export async function logout(tx: Tx, token: string | undefined, meta: { ip?: string; userAgent?: string; requestId?: string } = {}) {
  if (!token) return;
  const [revoked] = await tx
    .update(refreshToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshToken.tokenHash, hashRefreshToken(token)), isNull(refreshToken.revokedAt)))
    .returning({ userId: refreshToken.userId });
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
  const [u] = await tx.select().from(user).where(eq(user.id, access.userId));
  if (!u || !(await bcrypt.compare(input.currentPassword, u.passwordHash))) {
    throw validationError([{ in: 'body', path: 'currentPassword', message: 'Current password is incorrect' }]);
  }
  if (input.currentPassword === input.newPassword) {
    throw validationError([{ in: 'body', path: 'newPassword', message: 'Choose a different password' }]);
  }
  await tx.update(user).set({ passwordHash: await hashPassword(input.newPassword) }).where(eq(user.id, u.id));
  await revokeSessions(tx, u.id);
  await writeAudit(tx, { actorId: u.id, ip: meta.ip, requestId: meta.requestId }, { entityType: 'core.user', entityId: u.id, action: 'password.change' });
  // Reuses the request's own access (unaffected by the password change) instead of re-querying
  // loadAccess, whose read through the pool cannot see the tokenVersion bump before this tx commits.
  return issueSessionFor(tx, access, u.tokenVersion + 1, meta);
}

/** Self-service profile (name and phone); email and roles are managed by an administrator. */
export async function updateProfile(tx: Tx, access: Access, input: { fullName?: string; phone?: string | null }, meta: { ip?: string; requestId?: string }) {
  const [before] = await tx.select(publicUserColumns).from(user).where(eq(user.id, access.userId));
  const patch = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  const changes = diffChanges(before as Record<string, unknown>, patch);
  if (Object.keys(changes).length) {
    await tx.update(user).set(patch).where(eq(user.id, access.userId));
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
  const dealerships = await tx
    .select({ id: dealership.id, code: dealership.code, name: dealership.name, brand: dealership.brand })
    .from(dealership)
    .where(eq(dealership.isActive, true))
    .orderBy(dealership.name);
  const branches = await tx
    .select({ id: branch.id, dealershipId: branch.dealershipId, code: branch.code, name: branch.name })
    .from(branch)
    .where(and(eq(branch.isActive, true), scopeWhere(all, { dealership: branch.dealershipId, branch: branch.id })))
    .orderBy(branch.name);
  const [profile] = await tx
    .select({ id: user.id, email: user.email, fullName: user.fullName, phone: user.phone })
    .from(user)
    .where(eq(user.id, access.userId));
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
  const dir = q.sort?.startsWith('-') ? desc : asc;

  const rows = await ctx.tx.select(publicUserColumns).from(user).where(where).orderBy(dir(col), asc(user.id)).limit(q.pageSize).offset(offsetOf(q));
  const [{ total } = { total: 0 }] = await ctx.tx.select({ total: count() }).from(user).where(where);
  return { items: await presentUsers(ctx, rows), total, page: q.page, pageSize: q.pageSize };
}

async function findVisibleUser(ctx: EntityCtx, id: number, code: string = CorePerm.usersView) {
  const [row] = await ctx.tx.select(publicUserColumns).from(user).where(and(eq(user.id, id), userVisibility(ctx.access, code)));
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
  const [r] = await ctx.tx.select({ delegatedBy: role.delegatedBy }).from(role).where(eq(role.id, roleId));
  return r?.delegatedBy && covers(r.delegatedBy) ? [] : missing;
}

/**
 * A user may be edited only by someone whose `code` scope covers every one of their assignments,
 * and who could grant each of their roles (so no one can reset the password of a more powerful user).
 */
async function assertManageable(ctx: EntityCtx, userId: number, code: string) {
  if (ctx.access.hasGlobal(code)) return;
  const rows = await ctx.tx
    .select({ roleId: userRole.roleId, dealershipId: userRole.dealershipId, branchId: userRole.branchId })
    .from(userRole)
    .where(eq(userRole.userId, userId));
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

  const [r] = await tx.select({ id: role.id, name: role.name }).from(role).where(eq(role.id, input.roleId));
  if (!r) throw validationError([{ in: 'body', path: 'roleId', message: 'Role does not exist' }]);
  if (dealershipId !== null) {
    const [d] = await tx.select({ id: dealership.id }).from(dealership).where(eq(dealership.id, dealershipId));
    if (!d) throw validationError([{ in: 'body', path: 'dealershipId', message: 'Dealership does not exist' }]);
  }
  if (branchId !== null) {
    const [b] = await tx
      .select({ id: branch.id })
      .from(branch)
      .where(and(eq(branch.id, branchId), eq(branch.dealershipId, dealershipId!)));
    if (!b) throw validationError([{ in: 'body', path: 'branchId', message: 'Branch does not belong to the dealership' }]);
  }

  const missing = await undelegablePermissions(ctx, r.id, target);
  if (missing.length) {
    throw forbidden(`You cannot grant permissions you do not hold in this scope: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
  }

  const [row] = await tx
    .insert(userRole)
    .values({ userId, roleId: r.id, dealershipId, branchId, createdById: access.userId })
    .onConflictDoNothing()
    .returning();
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
  const roles = await ctx.tx.select({ id: role.id, name: role.name, description: role.description }).from(role).orderBy(role.name).limit(200);
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
  const [row] = await tx
    .insert(user)
    .values({ email: input.email, fullName: input.fullName, phone: input.phone ?? null, passwordHash: await hashPassword(input.password) })
    .returning({ id: user.id });
  await ctx.audit({
    entityType: 'core.user',
    entityId: row!.id,
    action: 'create',
    changes: { email: input.email, fullName: input.fullName, phone: input.phone },
  });
  for (const a of input.roles) await assignRole(ctx, row!.id, a);
  const [created] = await tx.select(publicUserColumns).from(user).where(eq(user.id, row!.id));
  return (await presentUsers(ctx, [created!]))[0]!;
}

async function revokeSessions(tx: Tx, userId: number) {
  await tx.update(user).set({ tokenVersion: sql`${user.tokenVersion} + 1` }).where(eq(user.id, userId));
  await tx.update(refreshToken).set({ revokedAt: new Date() }).where(and(eq(refreshToken.userId, userId), isNull(refreshToken.revokedAt)));
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
    await tx.update(user).set(patch).where(eq(user.id, id));
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
  const [a] = await tx
    .select()
    .from(userRole)
    .where(and(eq(userRole.id, assignmentId), eq(userRole.userId, userId)))
    .for('update');
  if (!a) throw notFound('Role assignment');
  const covered = a.dealershipId === null
    ? access.hasGlobal(CorePerm.usersAssignRoles)
    : access.canIn(CorePerm.usersAssignRoles, { dealershipId: a.dealershipId, branchId: a.branchId });
  if (!covered) throw forbidden('This assignment is outside your scope');
  if ((await undelegablePermissions(ctx, a.roleId, a.dealershipId === null ? null : { dealershipId: a.dealershipId, branchId: a.branchId })).length) {
    throw forbidden('You cannot revoke a role you could not grant');
  }
  await tx.delete(userRole).where(eq(userRole.id, assignmentId));
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
  const [r] = await ctx.tx.select({ id: role.id }).from(role).where(eq(role.id, roleId));
  if (!r) throw notFound('Role');
  return { roleId, permissionCodes: await permissionCodesOfRole(ctx.tx, roleId) };
}

export async function setRolePermissions(ctx: EntityCtx, roleId: number, codes: string[]) {
  const { access, tx } = ctx;
  if (!access.hasGlobal(CorePerm.rolesManage)) throw forbidden('Editing roles requires a global grant');
  const [r] = await tx.select().from(role).where(eq(role.id, roleId)).for('update');
  if (!r) throw notFound('Role');
  const unknown = codes.filter((c) => !isKnownPermission(c));
  if (unknown.length) throw validationError([{ in: 'body', path: 'permissionCodes', message: `Unknown: ${unknown.join(', ')}` }]);

  const wanted = [...new Set(codes)];
  const current = await permissionCodesOfRole(tx, roleId);
  const added = wanted.filter((c) => !current.includes(c));
  const removed = current.filter((c) => !wanted.includes(c));
  if (!added.length && !removed.length) return { roleId, permissionCodes: current };

  await tx.delete(rolePermission).where(eq(rolePermission.roleId, roleId));
  if (wanted.length) {
    const perms = await tx.select({ id: permission.id }).from(permission).where(inArray(permission.code, wanted));
    await tx.insert(rolePermission).values(perms.map((p) => ({ roleId, permissionId: p.id })));
  }
  await tx.update(role).set({ updatedById: access.userId }).where(eq(role.id, roleId));
  await ctx.audit({ entityType: 'core.role', entityId: roleId, action: 'permissions.update', changes: { added, removed } });
  return { roleId, permissionCodes: wanted.sort() };
}

export async function listPermissions(ctx: EntityCtx, module?: string) {
  return ctx.tx
    .select()
    .from(permission)
    .where(module ? eq(permission.module, module) : undefined)
    .orderBy(permission.code);
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
  const items = await ctx.tx
      .select({
        id: auditLog.id,
        occurredAt: auditLog.occurredAt,
        actorId: auditLog.actorId,
        actorName: user.fullName,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        action: auditLog.action,
        dealershipId: auditLog.dealershipId,
        branchId: auditLog.branchId,
        changes: auditLog.changes,
      })
      .from(auditLog)
      .leftJoin(user, eq(user.id, auditLog.actorId))
      .where(where)
      .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
      .limit(q.pageSize)
      .offset(offsetOf(q));
  const [{ total } = { total: 0 }] = await ctx.tx.select({ total: count() }).from(auditLog).where(where);
  return { items, total, page: q.page, pageSize: q.pageSize };
}

export type { AuditMeta };
