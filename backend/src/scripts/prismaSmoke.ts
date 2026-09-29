// Temporary check of the Prisma data layer (removed after the migration).
import { createDb, query, transaction } from '../db/client';
import { sql } from '../db/sql';
import { lead, salesOrder } from '../db/tables.generated';

const { db, disconnect } = createDb(process.env.MIGRATION_DATABASE_URL!, 2);
try {
  const d = await db.dealership.findFirst({ orderBy: { id: 'asc' } });
  console.log('dealership', typeof d?.id, d?.id, d?.code);
  const v = await db.vehicle.findFirst();
  console.log('vehicle', typeof v?.id, v?.vin, 'modelYear', v?.modelYear);
  const tpl = await db.documentTemplate.findFirst();
  console.log('template', tpl ? Object.keys(tpl).length : 0);
  const p = await db.part.findFirst();
  console.log('part money', p?.sellingPrice, typeof p?.sellingPrice);
  const o = await db.vehicleOwnership.findFirst();
  console.log('ownership date', o?.startDate);
  const rows = await query<{ n: number; t: string }>(db, sql`select count(*) as n, ${'hi'}::text as t from ${lead} where ${lead.status} = ${'new'}`);
  console.log('raw', rows[0], typeof rows[0]?.n);
  // Money + date round trip inside a rolled-back transaction.
  await transaction(db, async (tx) => {
    const o = await tx.salesOrder.findFirst();
    console.log('order money', o?.unitPrice, typeof o?.unitPrice, 'date', o?.expectedDeliveryDate);
    const r = await query(tx, sql`select ${salesOrder.id} as id from ${salesOrder} limit 1`);
    console.log('raw order id', r[0]);
    throw new Error('rollback');
  }).catch((e) => console.log('tx:', (e as Error).message));
} finally {
  await disconnect();
}
