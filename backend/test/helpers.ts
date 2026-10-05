import bcrypt from 'bcryptjs';
import supertest from 'supertest';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import { createApp } from '../src/app';
import { signAccessToken } from '../src/auth/tokens';
import { env } from '../src/config/env';
import { createDb, disconnectDb, transaction } from '../src/db/client';
import { fromRawRow } from '../src/db/values';
import { syncPermissionsAndRoles } from '../src/modules/core/repository';

/**
 * Owner connection (Prisma Client, owner role): bypasses RLS, used only to arrange fixtures.
 *   owner.db.vehicleModel.create({ data })          Prisma Client
 *   owner.raw('update core.user set … where id = $1', [id])   plain SQL, rows as { rows }
 */
const ownerClient = createDb(env.MIGRATION_DATABASE_URL, 2);
export const owner = {
  db: ownerClient.db,
  /** Plain SQL with $1… parameters (ids / counts come back as numbers). */
  async raw<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<{ rows: T[] }> {
    const rows = (await ownerClient.db.$queryRawUnsafe(text, ...params)) as Record<string, unknown>[];
    return { rows: rows.map((r) => fromRawRow<T>(r)) };
  },
};
export const app = createApp();
export const api = supertest(app);

export const PASSWORD = 'Passw0rd-123';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

const MODULE_SCHEMAS = ['core', 'audit', 'sales', 'service', 'parts', 'accounts'];

/** Wipes all data and restores the permission catalog / default roles. */
export async function resetData() {
  const { rows } = await owner.raw<{ t: string }>(
    `select format('%I.%I', schemaname, tablename) as t from pg_tables where schemaname = any($1)`,
    [MODULE_SCHEMAS],
  );
  if (rows.length) await owner.db.$executeRawUnsafe(`truncate ${rows.map((r) => r.t).join(', ')} restart identity cascade`);
  await transaction(owner.db, (tx) => syncPermissionsAndRoles(tx));
}

/**
 * Registers per-file hooks: reset before each test (or once, for read-only suites whose requests
 * never change data), and close the connections after the file.
 */
export function useTestDb(opts: { resetEach?: boolean } = {}) {
  if (opts.resetEach === false) beforeAll(resetData);
  else beforeEach(resetData);
  afterAll(async () => {
    await ownerClient.disconnect();
    await disconnectDb();
  });
}

export async function createDealership(code: string, name = `Dealer ${code}`) {
  return owner.db.dealership.create({ data: { code, name, brand: 'TestBrand' } });
}

export async function createBranch(dealershipId: number, code: string) {
  return owner.db.branch.create({ data: { dealershipId, code, name: `Branch ${code}` } });
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
  const u = await owner.db.user.create({
    data: {
      email: opts.email ?? `user${seq}@test.local`,
      fullName: `Test User ${seq}`,
      passwordHash: PASSWORD_HASH,
      isActive: opts.isActive ?? true,
    },
  });
  for (const [i, g] of grants.entries()) {
    const r = await owner.db.role.create({ data: { name: `role-${seq}-${i}` } });
    const codes = [...new Set(g.permissions)];
    if (codes.length) {
      const perms = await owner.db.permission.findMany({ where: { code: { in: codes } }, select: { id: true } });
      if (perms.length !== codes.length) throw new Error(`Unknown permission in ${codes.join(',')}`);
      await owner.db.rolePermission.createMany({ data: perms.map((p) => ({ roleId: r.id, permissionId: p.id })) });
    }
    await owner.db.userRole.create({ data: { userId: u.id, roleId: r.id, dealershipId: g.dealershipId ?? null, branchId: g.branchId ?? null } });
  }
  return { user: u, token: signAccessToken(u.id, 0) };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Model and variant are required on every lead: the vehicle for a test lead (one model per test). */
export async function leadVehicle() {
  const found = await owner.db.vehicleModel.findFirst({ where: { name: 'Tucson' }, select: { id: true } });
  const id = found?.id ?? (await owner.db.vehicleModel.create({ data: { brand: 'Hyundai', name: 'Tucson' } })).id;
  return { interestedModelId: id, variant: '2.0 GLS' };
}

export async function roleByName(name: string) {
  const r = await owner.db.role.findFirst({ where: { name }, select: { id: true } });
  return r!.id;
}

let cnicSeq = 0;
/** A new valid CNIC (13 digits) for each call: every sales order needs the customer's CNIC. */
export const nextCnic = () => String(3520200000000 + ++cnicSeq);

let pboSeq = 0;
/** A new PBO number for each call: every sales order needs one (unique per dealership). */
export const nextPbo = () => `PBO-${10000 + ++pboSeq}`;

/** Required on every PPF voucher: the customer as printed (name, email, address) and the protection package. */
export const PPF_CUSTOMER = { customerName: 'Ayesha Khan', customerEmail: 'ayesha@example.com', customerAddress: 'House 1, Street 2, F-10/2, Islamabad', protectionPackage: 'nenotek_prime' };
