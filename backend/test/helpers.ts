import bcrypt from 'bcryptjs';
import { eq, inArray } from 'drizzle-orm';
import supertest from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import { signAccessToken } from '../src/auth/tokens';
import { env } from '../src/config/env';
import { createDb, pool } from '../src/db/client';
import { branch, dealership, permission, role, rolePermission, user, userRole } from '../src/modules/core/models';
import { syncPermissionsAndRoles } from '../src/modules/core/repository';
import { vehicleModel } from '../src/modules/master/models';

/** Owner connection: bypasses RLS, used only to arrange fixtures. */
export const owner = createDb(env.MIGRATION_DATABASE_URL, 2);
export const app = createApp();
export const api = supertest(app);

export const PASSWORD = 'Passw0rd-123';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

const MODULE_SCHEMAS = ['core', 'audit', 'sales', 'service', 'parts', 'accounts'];

/** Wipes all data and restores the permission catalog / default roles. */
export async function resetData() {
  const { rows } = await owner.pool.query<{ t: string }>(
    `select format('%I.%I', schemaname, tablename) as t from pg_tables where schemaname = any($1)`,
    [MODULE_SCHEMAS],
  );
  if (rows.length) await owner.pool.query(`truncate ${rows.map((r) => r.t).join(', ')} restart identity cascade`);
  await owner.db.transaction((tx) => syncPermissionsAndRoles(tx));
}

/**
 * Registers per-file hooks: reset before each test (or once, for read-only suites whose requests
 * never change data), and close pools after the file.
 */
export function useTestDb(opts: { resetEach?: boolean } = {}) {
  if (opts.resetEach === false) beforeAll(resetData);
  else beforeEach(resetData);
  afterAll(async () => {
    await owner.pool.end();
    await pool.end();
  });
}

export async function createDealership(code: string, name = `Dealer ${code}`) {
  const [row] = await owner.db.insert(dealership).values({ code, name, brand: 'TestBrand' }).returning();
  return row!;
}

export async function createBranch(dealershipId: number, code: string) {
  const [row] = await owner.db.insert(branch).values({ dealershipId, code, name: `Branch ${code}` }).returning();
  return row!;
}

export interface GrantSpec {
  permissions: string[];
  dealershipId?: number | null;
  branchId?: number | null;
}

let seq = 0;

/** Creates a user holding a dedicated role per grant; returns the user and a valid access token. */
export async function createUser(grants: GrantSpec[] = [], opts: { email?: string; isActive?: boolean } = {}) {
  seq += 1;
  const [u] = await owner.db
    .insert(user)
    .values({
      email: opts.email ?? `user${seq}@test.local`,
      fullName: `Test User ${seq}`,
      passwordHash: PASSWORD_HASH,
      isActive: opts.isActive ?? true,
    })
    .returning();
  for (const [i, g] of grants.entries()) {
    const [r] = await owner.db.insert(role).values({ name: `role-${seq}-${i}` }).returning();
    const codes = [...new Set(g.permissions)];
    if (codes.length) {
      const perms = await owner.db.select({ id: permission.id }).from(permission).where(inArray(permission.code, codes));
      if (perms.length !== codes.length) throw new Error(`Unknown permission in ${codes.join(',')}`);
      await owner.db.insert(rolePermission).values(perms.map((p) => ({ roleId: r!.id, permissionId: p.id })));
    }
    await owner.db.insert(userRole).values({ userId: u!.id, roleId: r!.id, dealershipId: g.dealershipId ?? null, branchId: g.branchId ?? null });
  }
  return { user: u!, token: signAccessToken(u!.id, 0) };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Model and variant are required on every lead: the vehicle for a test lead (one model per test). */
export async function leadVehicle() {
  const [found] = await owner.db.select({ id: vehicleModel.id }).from(vehicleModel).where(eq(vehicleModel.name, 'Tucson')).limit(1);
  const id = found?.id ?? (await owner.db.insert(vehicleModel).values({ brand: 'Hyundai', name: 'Tucson' }).returning())[0]!.id;
  return { interestedModelId: id, variant: '2.0 GLS' };
}

export async function roleByName(name: string) {
  const { rows } = await owner.pool.query<{ id: number }>('select id::int from core.role where name = $1', [name]);
  return rows[0]!.id;
}
