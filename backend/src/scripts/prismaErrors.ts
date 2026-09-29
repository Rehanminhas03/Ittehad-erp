// Temporary probe: what Prisma 7 (adapter-pg) reports for database errors (removed after the migration).
import { createDb, db as appDb, query, transaction } from '../db/client';
import { sql } from '../db/sql';
import { dealership, lead } from '../db/tables.generated';

const { db, disconnect } = createDb(process.env.MIGRATION_DATABASE_URL!, 2);
const show = (label: string, e: unknown) => {
  const x = e as Record<string, unknown>;
  console.log(`\n## ${label}\nname=${x.name} code=${x.code}\nmeta=${JSON.stringify(x.meta)}\ncause=${JSON.stringify(x.cause, Object.getOwnPropertyNames(x.cause ?? {}))?.slice(0, 400)}\nmessage=${String(x.message).split('\n').slice(-3).join(' | ').slice(0, 300)}`);
};
const expectFail = async (label: string, fn: () => Promise<unknown>) => {
  try {
    await transaction(db, async (tx) => {
      await fn.call(null, tx);
      throw new Error('did not fail');
    });
  } catch (e) {
    show(label, e);
  }
};
try {
  const d = (await db.dealership.findFirst())!;
  await expectFail('unique (model API)', async () => {
    await db.$transaction(async (tx) => tx.dealership.create({ data: { code: d.code, name: 'dup', brand: 'x' } }));
  });
  await expectFail('unique (raw)', () => query(db, sql`insert into ${dealership} (code, name, brand) values (${d.code}, 'dup', 'x')`));
  await expectFail('foreign key (model API)', () => db.branch.create({ data: { dealershipId: 999999, code: 'X', name: 'X' } }));
  await expectFail('check (model API)', () => db.lead.update({ where: { id: 1 }, data: { followUpCount: -1 } }).catch(async (e) => {
    if (String(e).includes('Record to update not found')) {
      const l = await db.lead.findFirst();
      console.log('(no lead row, skipping check probe)', !!l);
      return;
    }
    throw e;
  }));
  // RLS: the app role with no tenant context sees/inserts nothing.
  await expectFail('RLS insert (app role, model API)', () =>
    appDb.lead.create({ data: { dealershipId: d.id, ownerId: 1, prospectName: 'x', prospectMobile: '1', prospectMobileNormalized: '1' } }),
  );
  await expectFail('RLS insert (app role, raw)', () =>
    query(appDb, sql`insert into ${lead} (dealership_id, owner_id, prospect_name, prospect_mobile, prospect_mobile_normalized) values (${d.id}, 1, 'x', '1', '1')`),
  );
} finally {
  await disconnect();
  process.exit(0);
}
