/**
 * Idempotent development seed (owner connection): dealerships, a main branch each, an admin and
 * a few demo users. Safe to re-run; existing rows are left untouched.
 */
import { DEALERSHIPS } from '../config/dealerships';
import { env } from '../config/env';
import { type Executor, type Tx, createDb, query, transaction } from '../db/client';
import { sql } from '../db/sql';
import { user } from '../modules/core/models';
import { hashPassword } from '../modules/core/service';
import type { EntityCtx } from '../entity/types';
import { addMoney, lineAmount } from '../lib/money';
import { ensureChart, post } from '../modules/accounts/ledger';
import { seedHyundaiVariants } from '../modules/sales/variantCatalog';

/** Starter model catalogue; maintained afterwards under Administration → Vehicle models. */
const VEHICLE_MODELS: { brand: string; name: string; bodyType: string }[] = [
  { brand: 'Hyundai', name: 'Tucson', bodyType: 'SUV' },
  { brand: 'Hyundai', name: 'Elantra', bodyType: 'Sedan' },
  { brand: 'Hyundai', name: 'Sonata', bodyType: 'Sedan' },
  { brand: 'Hyundai', name: 'Santa Fe', bodyType: 'SUV' },
  { brand: 'Hyundai', name: 'Palisade', bodyType: 'SUV' },
  { brand: 'Hyundai', name: 'Staria', bodyType: 'Van' },
  { brand: 'Hyundai', name: 'Porter H-100', bodyType: 'Pickup' },
  { brand: 'Jetour', name: 'X70 Plus', bodyType: 'SUV' },
  { brand: 'Jetour', name: 'Dashing', bodyType: 'SUV' },
];

const USERS: { email: string; fullName: string; password: string; roles: { role: string; dealership: string | null }[] }[] = [
  { email: 'admin@dms.local', fullName: 'System Administrator', password: 'Admin@12345', roles: [{ role: 'System Admin', dealership: null }] },
  { email: 'management@dms.local', fullName: 'Group Management', password: 'Demo@12345', roles: [{ role: 'Management', dealership: null }] },
  { email: 'manager.hyundai@dms.local', fullName: 'Hyundai Islamabad Manager', password: 'Demo@12345', roles: [{ role: 'Dealership Manager', dealership: 'HYD-ISB' }] },
  { email: 'manager.jetour@dms.local', fullName: 'Jetour Ittehad Manager', password: 'Demo@12345', roles: [{ role: 'Dealership Manager', dealership: 'JET-ITH' }] },
  { email: 'manager.csm@dms.local', fullName: 'CSM Ittehad Manager', password: 'Demo@12345', roles: [{ role: 'Dealership Manager', dealership: 'CSM-ITH' }] },
];

/**
 * Sales department logins: six per dealership, each scoped to that dealership only, plus one
 * Delivery Team login shared by all dealerships (below).
 * DEV / TEST ONLY — shared passwords; replace with unique ones (reset on first login) before go-live.
 */
const SALES_TEAMS = [
  { code: 'HYD-ISB', label: 'Hyundai', domain: 'hyundai.com', password: 'hyundai123' },
  { code: 'JET-ITH', label: 'Jetour', domain: 'jetour.com', password: 'jetour123' },
  { code: 'CSM-ITH', label: 'CSM', domain: 'csm.com', password: 'csm123' },
] as const;
const SALES_SEATS = [
  { prefix: 'manager', title: 'Sales Manager', role: 'Sales Manager' },
  { prefix: 'am', title: 'Assistant Manager', role: 'Assistant Manager' },
  { prefix: 'cro', title: 'CRO', role: 'CRO' },
  { prefix: 'admin', title: 'Sales Admin', role: 'Sales Admin' },
  { prefix: 'sales1', title: 'Salesperson 1', role: 'Salesperson' },
  { prefix: 'sales2', title: 'Salesperson 2', role: 'Salesperson' },
] as const;
for (const t of SALES_TEAMS) {
  for (const s of SALES_SEATS) {
    USERS.push({ email: `${s.prefix}@${t.domain}`, fullName: `${t.label} ${s.title}`, password: t.password, roles: [{ role: s.role, dealership: t.code }] });
  }
}
// One Delivery Team for the whole group: a single login holding the role at every dealership.
USERS.push({
  email: 'delivery@ittehad.com',
  fullName: 'Ittehad Delivery Team',
  password: 'ittehad123',
  roles: SALES_TEAMS.map((t) => ({ role: 'Delivery Team', dealership: t.code })),
});

for (const [code, label] of [['HYD-ISB', 'Hyundai'], ['JET-ITH', 'Jetour'], ['CSM-ITH', 'CSM']] as const) {
  const slug = label.toLowerCase();
  USERS.push(
    { email: `advisor.${slug}@dms.local`, fullName: `${label} Service Advisor`, password: 'Demo@12345', roles: [{ role: 'Service Advisor', dealership: code }] },
    { email: `tech.${slug}@dms.local`, fullName: `${label} Technician`, password: 'Demo@12345', roles: [{ role: 'Technician', dealership: code }] },
  );
}

for (const [code, label] of [['HYD-ISB', 'Hyundai'], ['JET-ITH', 'Jetour'], ['CSM-ITH', 'CSM']] as const) {
  const slug = label.toLowerCase();
  USERS.push(
    { email: `store.${slug}@dms.local`, fullName: `${label} Storekeeper`, password: 'Demo@12345', roles: [{ role: 'Storekeeper', dealership: code }] },
    { email: `accounts.${slug}@dms.local`, fullName: `${label} Accountant`, password: 'Demo@12345', roles: [{ role: 'Accountant', dealership: code }] },
  );
}

/** Starter parts catalogue (maintained under Parts → Parts catalogue) with opening stock per main branch. */
const PARTS: { partNo: string; description: string; brand: string; uom: 'each' | 'litre' | 'set'; sellingPrice: string; cost: string; opening: string }[] = [
  { partNo: '26300-35505', description: 'Oil filter', brand: 'Hyundai', uom: 'each', sellingPrice: '1800.00', cost: '1200.00', opening: '40' },
  { partNo: '28113-D3300', description: 'Air filter', brand: 'Hyundai', uom: 'each', sellingPrice: '3200.00', cost: '2200.00', opening: '20' },
  { partNo: '58101-D3A01', description: 'Front brake pad set', brand: 'Hyundai', uom: 'set', sellingPrice: '14500.00', cost: '9800.00', opening: '8' },
  { partNo: 'OIL-5W30-1L', description: 'Engine oil 5W-30 (1 litre)', brand: 'Generic', uom: 'litre', sellingPrice: '2500.00', cost: '1650.00', opening: '120' },
  { partNo: 'JT-OF-1012', description: 'Oil filter (Jetour)', brand: 'Jetour', uom: 'each', sellingPrice: '2100.00', cost: '1400.00', opening: '30' },
];

/** Starter service schedule applied to every seeded model (maintained under Service setup). */
const SCHEDULE: { sequence: number; name: string; dueKm: number; dueMonths: number; isFree: boolean; labourHours: string }[] = [
  { sequence: 1, name: '1st service', dueKm: 1000, dueMonths: 1, isFree: true, labourHours: '1' },
  { sequence: 2, name: '2nd service', dueKm: 5000, dueMonths: 6, isFree: true, labourHours: '1.5' },
  { sequence: 3, name: '3rd service', dueKm: 10000, dueMonths: 12, isFree: false, labourHours: '2' },
  { sequence: 4, name: '4th service', dueKm: 20000, dueMonths: 24, isFree: false, labourHours: '2.5' },
  { sequence: 5, name: '5th service', dueKm: 30000, dueMonths: 36, isFree: false, labourHours: '3' },
];

/** Starter multi-point inspection checklist. */
const INSPECTION: [area: string, item: string][] = [
  ['Engine', 'Engine oil level & condition'],
  ['Engine', 'Coolant level'],
  ['Engine', 'Drive belts'],
  ['Brakes', 'Front brake pads'],
  ['Brakes', 'Rear brake pads / shoes'],
  ['Brakes', 'Brake fluid'],
  ['Tyres', 'Tread depth & pressure'],
  ['Suspension', 'Shock absorbers'],
  ['Electrical', 'Battery health'],
  ['Electrical', 'Lights & indicators'],
  ['Body', 'Wipers & washer fluid'],
  ['Body', 'AC performance'],
];

/** Demo new-vehicle stock (undelivered), so orders can be allocated out of the box. */
const STOCK: { dealership: string; brand: string; model: string; vin: string; color: string }[] = [
  { dealership: 'HYD-ISB', brand: 'Hyundai', model: 'Tucson', vin: 'KMHJ381DEMO00001', color: 'White' },
  { dealership: 'HYD-ISB', brand: 'Hyundai', model: 'Tucson', vin: 'KMHJ381DEMO00002', color: 'Black' },
  { dealership: 'HYD-ISB', brand: 'Hyundai', model: 'Elantra', vin: 'KMHL341DEMO00003', color: 'Silver' },
  { dealership: 'JET-ITH', brand: 'Jetour', model: 'X70 Plus', vin: 'LVTDB21DEMO00004', color: 'Grey' },
  { dealership: 'JET-ITH', brand: 'Jetour', model: 'Dashing', vin: 'LVTDB31DEMO00005', color: 'Blue' },
];

const { db, disconnect } = createDb(env.MIGRATION_DATABASE_URL, 2);
type SeedTx = Tx;

/** A user's id by email, case-insensitively (as the sign-in looks it up). */
async function userIdByEmail(ex: Executor, email: string): Promise<number | undefined> {
  const [row] = await query<{ id: number }>(ex, sql`select ${user.id} as "id" from ${user} where lower(${user.email}) = ${email} limit 1`);
  return row?.id;
}

/** Demo users and their role assignments (idempotent). */
async function seedUsers(tx: SeedTx, dealershipIds: Map<string, number>) {
  for (const u of USERS) {
    let userId = await userIdByEmail(tx, u.email);
    if (!userId) {
      userId = (
        await tx.user.create({
          data: { email: u.email, fullName: u.fullName, passwordHash: await hashPassword(u.password) },
          select: { id: true },
        })
      ).id;
    }
    for (const a of u.roles) {
      const r = await tx.role.findFirst({ where: { name: a.role }, select: { id: true } });
      if (!r) throw new Error(`Role "${a.role}" missing; run npm run db:migrate first`);
      const dealershipId = a.dealership ? dealershipIds.get(a.dealership)! : null;
      const has = await tx.userRole.findFirst({
        where: { userId, roleId: r.id, dealershipId, branchId: null },
        select: { id: true },
      });
      if (!has) await tx.userRole.create({ data: { userId, roleId: r.id, dealershipId }, select: { id: true } });
    }
  }
}

try {
  await transaction(db, async (tx) => {
    const dealershipIds = new Map<string, number>();
    for (const d of DEALERSHIPS) {
      await tx.dealership.createMany({ data: [{ code: d.code, name: d.name, brand: d.brand, city: d.city }], skipDuplicates: true });
      const row = await tx.dealership.findUnique({ where: { code: d.code }, select: { id: true } });
      dealershipIds.set(d.code, row!.id);
      await tx.branch.createMany({
        data: [{ dealershipId: row!.id, code: 'MAIN', name: `${d.name} - Main`, city: d.city }],
        skipDuplicates: true,
      });
    }

    await tx.vehicleModel.createMany({ data: VEHICLE_MODELS, skipDuplicates: true });

    for (const m of await tx.vehicleModel.findMany({ select: { id: true } })) {
      await tx.scheduleItem.createMany({ data: SCHEDULE.map((s) => ({ ...s, modelId: m.id })), skipDuplicates: true });
    }
    await tx.inspectionTemplateItem.createMany({
      data: INSPECTION.map(([area, item], i) => ({ area, item, sortOrder: (i + 1) * 10 })),
      skipDuplicates: true,
    });

    for (const s of STOCK) {
      const m = await tx.vehicleModel.findFirst({ where: { brand: s.brand, name: s.model }, select: { id: true } });
      const [v] = await tx.vehicle.createManyAndReturn({
        data: [{ vin: s.vin, modelId: m!.id, color: s.color, modelYear: 2026 }],
        skipDuplicates: true,
        select: { id: true },
      });
      if (v) {
        await tx.vehicleDealership.createMany({ data: [{ vehicleId: v.id, dealershipId: dealershipIds.get(s.dealership)! }], skipDuplicates: true });
      }
    }

    await seedUsers(tx, dealershipIds);

    // Hyundai variant codes for the quotation (Hyundai Islamabad only; Jetour and CSM use none).
    for (const d of DEALERSHIPS) if (d.code.startsWith('HYD')) await seedHyundaiVariants(tx, dealershipIds.get(d.code)!);

    // Parts catalogue, a supplier per dealership, and opening stock at each main branch. Runs after
    // the users so the opening-stock ledger rows have an actor; on-hand and ledger are written together.
    await tx.part.createMany({
      data: PARTS.map(({ cost: _c, opening: _o, ...p }) => ({ ...p, partNo: p.partNo.toUpperCase() })),
      skipDuplicates: true,
    });
    const adminId = await userIdByEmail(tx, 'admin@dms.local');
    if (!adminId) throw new Error('admin@dms.local missing');
    const admin = { id: adminId };
    for (const d of DEALERSHIPS) {
      const dealershipId = dealershipIds.get(d.code)!;
      await tx.supplier.createMany({ data: [{ dealershipId, code: 'MAIN-SUP', name: `${d.brand} Genuine Parts` }], skipDuplicates: true });
      const mainBranch = await tx.branch.findFirst({ where: { dealershipId, code: 'MAIN' }, select: { id: true } });
      const opening: string[] = [];
      for (const p of PARTS) {
        const pr = await tx.part.findUnique({ where: { partNo: p.partNo.toUpperCase() }, select: { id: true } });
        const created = await tx.stockItem.createManyAndReturn({
          data: [{ dealershipId, branchId: mainBranch!.id, partId: pr!.id, quantityOnHand: p.opening, averageCost: p.cost, reorderLevel: '5' }],
          skipDuplicates: true,
          select: { id: true },
        });
        if (created.length) {
          opening.push(lineAmount(p.cost, p.opening));
          await tx.inventoryTransaction.create({
            data: {
              dealershipId,
              branchId: mainBranch!.id,
              partId: pr!.id,
              type: 'adjustment',
              quantity: p.opening,
              unitCost: p.cost,
              value: lineAmount(p.cost, p.opening),
              balanceAfter: p.opening,
              averageCostAfter: p.cost,
              referenceType: 'opening_stock',
              referenceId: 0,
              referenceNo: 'OPENING',
              notes: 'Opening stock (seed)',
              actorId: admin.id,
            },
            select: { id: true },
          });
        }
      }
      // The books carry the opening stock too: Dr parts inventory / Cr owner's equity.
      const ctx = { tx, access: { userId: admin.id } } as unknown as EntityCtx;
      await ensureChart(ctx, dealershipId);
      if (opening.length) {
        const equity = await tx.account.findFirst({ where: { dealershipId, code: '3000' }, select: { id: true } });
        const value = addMoney(...opening);
        await post(ctx, {
          dealershipId,
          branchId: mainBranch!.id,
          source: 'manual',
          memo: 'Opening parts stock (seed)',
          lines: [
            { role: 'parts_inventory', debit: value },
            { accountId: equity!.id, credit: value },
          ],
        });
      }
    }
  }, 10 * 60_000); // one transaction, hundreds of statements: minutes against a remote database (Neon)
  console.log('Seed complete. Admin login: admin@dms.local / Admin@12345');
  await disconnect();
  process.exit(0);
} catch (err) {
  console.error(err);
  await disconnect();
  process.exit(1);
}
