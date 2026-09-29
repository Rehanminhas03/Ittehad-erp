import { describe, expect, it } from 'vitest';
import { db, withTenantTx } from '../src/db/client';
import { createBranch, createDealership, owner, useTestDb } from './helpers';

useTestDb();

describe('Postgres Row-Level Security (second isolation layer)', () => {
  it('shows nothing without tenant context', async () => {
    await createDealership('A');
    const rows = await db.dealership.findMany();
    expect(rows).toHaveLength(0);
  });

  it('shows only dealerships in app.dealership_ids, even with an unfiltered query', async () => {
    const a = await createDealership('A');
    const b = await createDealership('B');
    await createBranch(a.id, 'A1');
    await createBranch(b.id, 'B1');
    const result = await withTenantTx({ userId: 1, dealershipIds: [a.id] }, async (tx) => ({
      dealerships: await tx.dealership.findMany(),
      branches: await tx.branch.findMany(),
    }));
    expect(result.dealerships.map((d) => d.code)).toEqual(['A']);
    expect(result.branches.map((d) => d.code)).toEqual(['A1']);
  });

  it('shows everything for global context', async () => {
    await createDealership('A');
    await createDealership('B');
    const rows = await withTenantTx({ userId: 1, dealershipIds: 'all' }, (tx) => tx.dealership.findMany());
    expect(rows).toHaveLength(2);
  });

  it('rejects writes into another tenant (WITH CHECK)', async () => {
    const a = await createDealership('A');
    const b = await createDealership('B');
    await expect(
      withTenantTx({ userId: 1, dealershipIds: [a.id] }, (tx) =>
        tx.branch.create({ data: { dealershipId: b.id, code: 'X', name: 'X' } }),
      ),
    ).rejects.toThrow();
  });

  it('does not leak tenant context between pooled transactions', async () => {
    const a = await createDealership('A');
    await withTenantTx({ userId: 1, dealershipIds: 'all' }, (tx) => tx.dealership.findMany());
    // same pool, no context => nothing
    const rows = await db.dealership.findMany();
    expect(rows).toHaveLength(0);
    expect(a.id).toBeGreaterThan(0);
  });

  it('keeps the audit log append-only for the app role and the owner', async () => {
    await withTenantTx({ userId: 1, dealershipIds: 'all' }, (tx) =>
      tx.auditLog.create({ data: { entityType: 't', entityId: '1', action: 'x' } }),
    );
    await expect(
      withTenantTx({ userId: 1, dealershipIds: 'all' }, (tx) => tx.auditLog.updateMany({ data: { action: 'y' } })),
    ).rejects.toThrow();
    // Prisma raw-query errors carry the database message in their own message (no pg `cause`).
    await expect(owner.raw('delete from audit.audit_log')).rejects.toThrow(/append-only/);
  });
});
