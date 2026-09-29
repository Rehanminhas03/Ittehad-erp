import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withTenantTx } from '../src/db/client';
import { auditLog, branch, dealership } from '../src/modules/core/models';
import { createBranch, createDealership, owner, useTestDb } from './helpers';

useTestDb();

describe('Postgres Row-Level Security (second isolation layer)', () => {
  it('shows nothing without tenant context', async () => {
    await createDealership('A');
    const rows = await db.select().from(dealership);
    expect(rows).toHaveLength(0);
  });

  it('shows only dealerships in app.dealership_ids, even with an unfiltered query', async () => {
    const a = await createDealership('A');
    const b = await createDealership('B');
    await createBranch(a.id, 'A1');
    await createBranch(b.id, 'B1');
    const result = await withTenantTx({ userId: 1, dealershipIds: [a.id] }, async (tx) => ({
      dealerships: await tx.select().from(dealership),
      branches: await tx.select().from(branch),
    }));
    expect(result.dealerships.map((d) => d.code)).toEqual(['A']);
    expect(result.branches.map((d) => d.code)).toEqual(['A1']);
  });

  it('shows everything for global context', async () => {
    await createDealership('A');
    await createDealership('B');
    const rows = await withTenantTx({ userId: 1, dealershipIds: 'all' }, (tx) => tx.select().from(dealership));
    expect(rows).toHaveLength(2);
  });

  it('rejects writes into another tenant (WITH CHECK)', async () => {
    const a = await createDealership('A');
    const b = await createDealership('B');
    await expect(
      withTenantTx({ userId: 1, dealershipIds: [a.id] }, (tx) =>
        tx.insert(branch).values({ dealershipId: b.id, code: 'X', name: 'X' }),
      ),
    ).rejects.toThrow();
  });

  it('does not leak tenant context between pooled transactions', async () => {
    const a = await createDealership('A');
    await withTenantTx({ userId: 1, dealershipIds: 'all' }, (tx) => tx.select().from(dealership));
    // same pool, no context => nothing
    const rows = await db.select().from(dealership);
    expect(rows).toHaveLength(0);
    expect(a.id).toBeGreaterThan(0);
  });

  it('keeps the audit log append-only for the app role and the owner', async () => {
    await withTenantTx({ userId: 1, dealershipIds: 'all' }, (tx) =>
      tx.insert(auditLog).values({ entityType: 't', entityId: '1', action: 'x' }),
    );
    await expect(
      withTenantTx({ userId: 1, dealershipIds: 'all' }, (tx) => tx.update(auditLog).set({ action: 'y' })),
    ).rejects.toThrow();
    await expect(owner.db.execute(sql`delete from audit.audit_log`)).rejects.toMatchObject({
      cause: { message: expect.stringMatching(/append-only/) },
    });
  });
});
