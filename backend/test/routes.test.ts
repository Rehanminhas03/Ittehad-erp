import { beforeAll, describe, expect, it } from 'vitest';
import { ApiRouter } from '../src/http/apiRouter';
import { api, bearer, createDealership, createUser, useTestDb } from './helpers';

// Every request here is rejected before touching data, so one reset for the whole file suffices.
useTestDb({ resetEach: false });

let token = '';
beforeAll(async () => {
  const d = await createDealership('D');
  // Holds an unrelated permission so the user is valid and tenant-scoped, just not authorized.
  token = (await createUser([{ permissions: ['core.audit.view'], dealershipId: d.id }])).token;
});

const routes = ApiRouter.all.flatMap((r) => r.routes);
const PUBLIC = ['login', 'refreshSession', 'logout'];
const concrete = (path: string) => path.replace(/:\w+/g, '1');

describe('route authorization coverage', () => {
  it('registers routes', () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it('only the auth endpoints are public', () => {
    expect(routes.filter((r) => r.permission === 'public').map((r) => r.operationId).sort()).toEqual([...PUBLIC].sort());
  });

  it('never exposes the development sign-in outside NODE_ENV=development', () => {
    expect(routes.some((r) => r.operationId === 'devLogin' || r.operationId === 'listDevAccounts')).toBe(false);
  });

  it('has unique operationIds (they become generated client hook names)', () => {
    const ids = routes.map((r) => r.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  const secured = routes.filter((r) => r.permission !== 'public');

  it.each(secured.map((r) => [r.operationId, r] as const))('%s rejects anonymous callers with 401', async (_id, r) => {
    const res = await api[r.method](concrete(r.path)).send({});
    expect(res.status).toBe(401);
  });

  const guarded = secured.filter((r) => r.permission !== 'authenticated');

  it.each(guarded.map((r) => [r.operationId, r] as const))('%s rejects a user without the permission with 403', async (_id, r) => {
    const res = await api[r.method](concrete(r.path)).set(bearer(token)).send({});
    if (r.operationId === 'listAuditLog') expect(res.status).toBe(200);
    else expect(res.status).toBe(403);
  });
});
