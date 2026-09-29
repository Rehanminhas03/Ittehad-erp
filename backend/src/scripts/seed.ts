/**
 * Idempotent development seed (owner connection): dealerships, a main branch each, an admin and
 * a few demo users. Safe to re-run; existing rows are left untouched.
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DEALERSHIPS } from '../config/dealerships';
import { env } from '../config/env';
import { createDb } from '../db/client';
import { branch, dealership, role, user, userRole } from '../modules/core/models';
import { hashPassword } from '../modules/core/service';
import type { EntityCtx } from '../entity/types';
import { addMoney, lineAmount } from '../lib/money';
import { ensureChart, post } from '../modules/accounts/ledger';
import { account } from '../modules/accounts/models';
import { vehicle, vehicleDealership, vehicleModel } from '../modules/master/models';
import { inventoryTransaction, part, stockItem, supplier } from '../modules/parts/models';
import { seedHyundaiVariants } from '../modules/sales/variantCatalog';
import { inspectionTemplateItem, scheduleItem } from '../modules/service/models';

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

const { pool, db } = createDb(env.MIGRATION_DATABASE_URL, 2);
type SeedTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Demo users and their role assignments (idempotent). */
async function seedUsers(tx: SeedTx, dealershipIds: Map<string, number>) {
  for (const u of USERS) {
    let [existing] = await tx.select({ id: user.id }).from(user).where(sql`lower(${user.email}) = ${u.email}`);
    if (!existing) {
      [existing] = await tx
        .insert(user)
        .values({ email: u.email, fullName: u.fullName, passwordHash: await hashPassword(u.password) })
        .returning({ id: user.id });
    }
    for (const a of u.roles) {
      const [r] = await tx.select({ id: role.id }).from(role).where(eq(role.name, a.role));
      if (!r) throw new Error(`Role "${a.role}" missing; run npm run db:sync first`);
      const dealershipId = a.dealership ? dealershipIds.get(a.dealership)! : null;
      const [has] = await tx
        .select({ id: userRole.id })
        .from(userRole)
        .where(
          and(
            eq(userRole.userId, existing!.id),
            eq(userRole.roleId, r.id),
            dealershipId === null ? isNull(userRole.dealershipId) : eq(userRole.dealershipId, dealershipId),
            isNull(userRole.branchId),
          ),
        );
      if (!has) await tx.insert(userRole).values({ userId: existing!.id, roleId: r.id, dealershipId });
    }
  }
}

try {
  await db.transaction(async (tx) => {
    const dealershipIds = new Map<string, number>();
    for (const d of DEALERSHIPS) {
      await tx.insert(dealership).values(d).onConflictDoNothing({ target: dealership.code });
      const [row] = await tx.select({ id: dealership.id }).from(dealership).where(eq(dealership.code, d.code));
      dealershipIds.set(d.code, row!.id);
      await tx
        .insert(branch)
        .values({ dealershipId: row!.id, code: 'MAIN', name: `${d.name} - Main`, city: d.city })
        .onConflictDoNothing();
    }

    await tx.insert(vehicleModel).values(VEHICLE_MODELS).onConflictDoNothing();

    for (const m of await tx.select({ id: vehicleModel.id }).from(vehicleModel)) {
      await tx.insert(scheduleItem).values(SCHEDULE.map((s) => ({ ...s, modelId: m.id }))).onConflictDoNothing();
    }
    await tx
      .insert(inspectionTemplateItem)
      .values(INSPECTION.map(([area, item], i) => ({ area, item, sortOrder: (i + 1) * 10 })))
      .onConflictDoNothing();

    for (const s of STOCK) {
      const [m] = await tx
        .select({ id: vehicleModel.id })
        .from(vehicleModel)
        .where(and(eq(vehicleModel.brand, s.brand), eq(vehicleModel.name, s.model)));
      const [v] = await tx.insert(vehicle).values({ vin: s.vin, modelId: m!.id, color: s.color, modelYear: 2026 }).onConflictDoNothing().returning();
      if (v) await tx.insert(vehicleDealership).values({ vehicleId: v.id, dealershipId: dealershipIds.get(s.dealership)! }).onConflictDoNothing();
    }

    await seedUsers(tx, dealershipIds);

    // Hyundai variant codes for the quotation (Hyundai Islamabad only; Jetour and CSM use none).
    for (const d of DEALERSHIPS) if (d.code.startsWith('HYD')) await seedHyundaiVariants(tx, dealershipIds.get(d.code)!);

    // Parts catalogue, a supplier per dealership, and opening stock at each main branch. Runs after
    // the users so the opening-stock ledger rows have an actor; on-hand and ledger are written together.
    await tx
      .insert(part)
      .values(PARTS.map(({ cost: _c, opening: _o, ...p }) => ({ ...p, partNo: p.partNo.toUpperCase() })))
      .onConflictDoNothing();
    const [admin] = await tx.select({ id: user.id }).from(user).where(sql`lower(${user.email}) = 'admin@dms.local'`);
    if (!admin) throw new Error('admin@dms.local missing');
    for (const d of DEALERSHIPS) {
      const dealershipId = dealershipIds.get(d.code)!;
      await tx.insert(supplier).values({ dealershipId, code: 'MAIN-SUP', name: `${d.brand} Genuine Parts` }).onConflictDoNothing();
      const [mainBranch] = await tx.select({ id: branch.id }).from(branch).where(and(eq(branch.dealershipId, dealershipId), eq(branch.code, 'MAIN')));
      const opening: string[] = [];
      for (const p of PARTS) {
        const [pr] = await tx.select({ id: part.id }).from(part).where(eq(part.partNo, p.partNo.toUpperCase()));
        const created = await tx
          .insert(stockItem)
          .values({ dealershipId, branchId: mainBranch!.id, partId: pr!.id, quantityOnHand: p.opening, averageCost: p.cost, reorderLevel: '5' })
          .onConflictDoNothing()
          .returning({ id: stockItem.id });
        if (created.length) {
          opening.push(lineAmount(p.cost, p.opening));
          await tx.insert(inventoryTransaction).values({
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
          });
        }
      }
      // The books carry the opening stock too: Dr parts inventory / Cr owner's equity.
      const ctx = { tx, access: { userId: admin.id } } as unknown as EntityCtx;
      await ensureChart(ctx, dealershipId);
      if (opening.length) {
        const [equity] = await tx.select({ id: account.id }).from(account).where(and(eq(account.dealershipId, dealershipId), eq(account.code, '3000')));
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
  });
  console.log('Seed complete. Admin login: admin@dms.local / Admin@12345');
  await pool.end();
  process.exit(0);
} catch (err) {
  console.error(err);
  await pool.end();
  process.exit(1);
}
