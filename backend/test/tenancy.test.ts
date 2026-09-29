import { describe, expect, it } from 'vitest';
import { api, bearer, createBranch, createDealership, createUser, useTestDb } from './helpers';

useTestDb();

const DV = 'core.dealerships.view';
const BV = 'core.branches.view';

describe('dealerships (generic entity, tenant root)', () => {
  it('global viewer sees all; dealership-scoped viewer sees only theirs', async () => {
    const a = await createDealership('A');
    await createDealership('B');
    const global = await createUser([{ permissions: [DV] }]);
    const scoped = await createUser([{ permissions: [DV], dealershipId: a.id }]);

    const all = await api.get('/api/core/dealerships').set(bearer(global.token));
    expect(all.status).toBe(200);
    expect(all.body.total).toBe(2);

    const mine = await api.get('/api/core/dealerships').set(bearer(scoped.token));
    expect(mine.body.items.map((d: { code: string }) => d.code)).toEqual(['A']);
    expect(mine.body.total).toBe(1);
  });

  it('returns 404 (not 403) for an out-of-scope record', async () => {
    const a = await createDealership('A');
    const b = await createDealership('B');
    const { token } = await createUser([{ permissions: [DV], dealershipId: a.id }]);
    expect((await api.get(`/api/core/dealerships/${b.id}`).set(bearer(token))).status).toBe(404);
    expect((await api.get(`/api/core/dealerships/${a.id}`).set(bearer(token))).status).toBe(200);
  });

  it('paginates, searches and sorts server-side', async () => {
    for (const c of ['AA', 'BB', 'CC', 'DD']) await createDealership(c, `Name ${c}`);
    const { token } = await createUser([{ permissions: [DV] }]);
    const p = await api.get('/api/core/dealerships?page=2&pageSize=3&sort=-code').set(bearer(token));
    expect(p.body).toMatchObject({ total: 4, page: 2, pageSize: 3 });
    expect(p.body.items.map((d: { code: string }) => d.code)).toEqual(['AA']);
    const s = await api.get('/api/core/dealerships?q=cc').set(bearer(token));
    expect(s.body.items.map((d: { code: string }) => d.code)).toEqual(['CC']);
    expect((await api.get('/api/core/dealerships?sort=passwordHash').set(bearer(token))).status).toBe(422);
    expect((await api.get('/api/core/dealerships?pageSize=1000').set(bearer(token))).status).toBe(422);
  });

  it('creating a dealership requires a global grant', async () => {
    const a = await createDealership('A');
    const scoped = await createUser([{ permissions: ['core.dealerships.create'], dealershipId: a.id }]);
    const global = await createUser([{ permissions: ['core.dealerships.create', DV] }]);
    const body = { code: 'NEW', name: 'New Dealer', brand: 'Hyundai' };
    expect((await api.post('/api/core/dealerships').set(bearer(scoped.token)).send(body)).status).toBe(403);
    const ok = await api.post('/api/core/dealerships').set(bearer(global.token)).send(body);
    expect(ok.status).toBe(201);
    expect(ok.body.code).toBe('NEW');
    const dup = await api.post('/api/core/dealerships').set(bearer(global.token)).send(body);
    expect(dup.status).toBe(409);
  });

  it('update is scoped and audited with a field diff', async () => {
    const a = await createDealership('A');
    const b = await createDealership('B');
    const { token } = await createUser([{ permissions: ['core.dealerships.update', DV], dealershipId: a.id }]);
    expect((await api.patch(`/api/core/dealerships/${b.id}`).set(bearer(token)).send({ name: 'Other' })).status).toBe(404);
    const ok = await api.patch(`/api/core/dealerships/${a.id}`).set(bearer(token)).send({ name: 'Renamed' });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe('Renamed');

    const hist = await api.get(`/api/core/dealerships/${a.id}/history`).set(bearer(token));
    expect(hist.status).toBe(200);
    expect(hist.body.audit[0]).toMatchObject({ action: 'update', changes: { name: { from: 'Dealer A', to: 'Renamed' } } });
  });
});

describe('branches (generic entity, branch-aware)', () => {
  it('branch-level grant sees only its branch', async () => {
    const a = await createDealership('A');
    const b1 = await createBranch(a.id, 'B1');
    await createBranch(a.id, 'B2');
    const { token } = await createUser([{ permissions: [BV], dealershipId: a.id, branchId: b1.id }]);
    const res = await api.get('/api/core/branches').set(bearer(token));
    expect(res.body.items.map((b: { code: string }) => b.code)).toEqual(['B1']);
    expect(res.body.items[0].dealershipName).toBe('Dealer A');
  });

  it('cannot create branches in another dealership; branch-level grant cannot create siblings', async () => {
    const a = await createDealership('A');
    const b = await createDealership('B');
    const b1 = await createBranch(a.id, 'B1');
    const dealerAdmin = await createUser([{ permissions: ['core.branches.create', BV], dealershipId: a.id }]);
    const branchAdmin = await createUser([{ permissions: ['core.branches.create', BV], dealershipId: a.id, branchId: b1.id }]);

    expect((await api.post('/api/core/branches').set(bearer(dealerAdmin.token)).send({ dealershipId: b.id, code: 'X1', name: 'Other' })).status).toBe(403);
    expect((await api.post('/api/core/branches').set(bearer(branchAdmin.token)).send({ dealershipId: a.id, code: 'X2', name: 'Sibling' })).status).toBe(403);
    const ok = await api.post('/api/core/branches').set(bearer(dealerAdmin.token)).send({ dealershipId: a.id, code: 'B9', name: 'New' });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ dealershipId: a.id, code: 'B9', dealershipName: 'Dealer A' });
  });

  it('filters by dealershipId', async () => {
    const a = await createDealership('A');
    const b = await createDealership('B');
    await createBranch(a.id, 'A1');
    await createBranch(b.id, 'B1');
    const { token } = await createUser([{ permissions: [BV] }]);
    const res = await api.get(`/api/core/branches?dealershipId=${b.id}`).set(bearer(token));
    expect(res.body.items.map((x: { code: string }) => x.code)).toEqual(['B1']);
  });
});

describe('global master data (legal entities)', () => {
  it('reads with the view permission, writes only with a global manage grant', async () => {
    const a = await createDealership('A');
    const scoped = await createUser([{ permissions: ['core.entities.view', 'core.entities.manage'], dealershipId: a.id }]);
    const global = await createUser([{ permissions: ['core.entities.view', 'core.entities.manage'] }]);
    expect((await api.post('/api/core/legal-entities').set(bearer(scoped.token)).send({ name: 'Ittehad Pvt Ltd' })).status).toBe(403);
    const ok = await api.post('/api/core/legal-entities').set(bearer(global.token)).send({ name: 'Ittehad Pvt Ltd' });
    expect(ok.status).toBe(201);
    expect((await api.get('/api/core/legal-entities').set(bearer(scoped.token))).body.total).toBe(1);
  });
});
