import { describe, expect, it } from 'vitest';
import { PASSWORD, api, bearer, createDealership, createUser, owner, roleByName, useTestDb } from './helpers';

useTestDb();

const ADMIN = ['core.users.view', 'core.users.create', 'core.users.update', 'core.users.assign_roles'];

describe('users & role assignment', () => {
  it('lists only users holding roles inside the caller scope, hiding out-of-scope assignments', async () => {
    const a = await createDealership('A');
    const b = await createDealership('B');
    const admin = await createUser([{ permissions: ADMIN, dealershipId: a.id }]);
    const inA = await createUser([{ permissions: [], dealershipId: a.id }, { permissions: [], dealershipId: b.id }]);
    await createUser([{ permissions: [], dealershipId: b.id }]);

    const res = await api.get('/api/core/users').set(bearer(admin.token));    expect(res.status).toBe(200);
    const ids = res.body.items.map((u: { id: number }) => u.id).sort();
    expect(ids).toEqual([admin.user.id, inA.user.id].sort());
    const row = res.body.items.find((u: { id: number }) => u.id === inA.user.id);
    expect(row.roles.map((r: { dealershipId: number }) => r.dealershipId)).toEqual([a.id]);
    expect(res.body.items[0]).not.toHaveProperty('passwordHash');
    expect((await api.get(`/api/core/users/${inA.user.id}`).set(bearer(admin.token))).status).toBe(200);
  });

  it('creates a user with a role in scope; non-global creators must assign one', async () => {
    const a = await createDealership('A');
    const admin = await createUser([{ permissions: [...ADMIN, 'core.dealerships.view'], dealershipId: a.id }]);
    const viewerRole = await roleByName('Management'); // holds many permissions admin lacks
    const salesRole = await owner.pool.query<{ id: number }>("insert into core.role(name) values ('Tiny') returning id::int");
    await owner.pool.query(
      "insert into core.role_permission select $1, id from core.permission where code = 'core.dealerships.view'",
      [salesRole.rows[0]!.id],
    );

    const noRole = await api.post('/api/core/users').set(bearer(admin.token)).send({ email: 'n@test.local', fullName: 'New Person', password: PASSWORD });
    expect(noRole.status).toBe(422);

    const escalate = await api
      .post('/api/core/users')
      .set(bearer(admin.token))
      .send({ email: 'e@test.local', fullName: 'Escalate', password: PASSWORD, roles: [{ roleId: viewerRole, dealershipId: a.id }] });
    expect(escalate.status).toBe(403);

    const ok = await api
      .post('/api/core/users')
      .set(bearer(admin.token))
      .send({ email: 'OK@Test.local', fullName: 'Okay Person', password: PASSWORD, roles: [{ roleId: salesRole.rows[0]!.id, dealershipId: a.id }] });
    expect(ok.status).toBe(201);
    expect(ok.body.email).toBe('ok@test.local');
    expect(ok.body.roles).toHaveLength(1);

    const login = await api.post('/api/auth/login').send({ email: 'ok@test.local', password: PASSWORD });
    expect(login.status).toBe(200);
  });

  it('rejects weak passwords and duplicate emails', async () => {
    const admin = await createUser([{ permissions: ADMIN }]);
    const weak = await api.post('/api/core/users').set(bearer(admin.token)).send({ email: 'w@test.local', fullName: 'Weak Pw', password: 'short' });
    expect(weak.status).toBe(422);
    await createUser([], { email: 'dup@test.local' });
    const dup = await api.post('/api/core/users').set(bearer(admin.token)).send({ email: 'DUP@test.local', fullName: 'Dup User', password: PASSWORD });
    expect(dup.status).toBe(409);
  });

  it('cannot assign roles outside scope or globally without a global grant', async () => {
    const a = await createDealership('A');
    const b = await createDealership('B');
    const admin = await createUser([{ permissions: ADMIN, dealershipId: a.id }]);
    const target = await createUser([{ permissions: [], dealershipId: a.id }]);
    const r = await owner.pool.query<{ id: number }>("insert into core.role(name) values ('Empty') returning id::int");
    const roleId = r.rows[0]!.id;
    const url = `/api/core/users/${target.user.id}/roles`;
    expect((await api.post(url).set(bearer(admin.token)).send({ roleId, dealershipId: b.id })).status).toBe(403);
    expect((await api.post(url).set(bearer(admin.token)).send({ roleId })).status).toBe(403);
    expect((await api.post(url).set(bearer(admin.token)).send({ roleId, dealershipId: a.id })).status).toBe(201);
    expect((await api.post(url).set(bearer(admin.token)).send({ roleId, dealershipId: a.id })).status).toBe(409);
  });

  it('users cannot change their own role assignments', async () => {
    const admin = await createUser([{ permissions: ADMIN }]);
    const r = await owner.pool.query<{ id: number }>("insert into core.role(name) values ('Self') returning id::int");
    const res = await api.post(`/api/core/users/${admin.user.id}/roles`).set(bearer(admin.token)).send({ roleId: r.rows[0]!.id });
    expect(res.status).toBe(403);
  });

  it('cannot edit users who also hold roles outside the caller scope', async () => {
    const a = await createDealership('A');
    const b = await createDealership('B');
    const admin = await createUser([{ permissions: ADMIN, dealershipId: a.id }]);
    const shared = await createUser([{ permissions: [], dealershipId: a.id }, { permissions: [], dealershipId: b.id }]);
    const res = await api.patch(`/api/core/users/${shared.user.id}`).set(bearer(admin.token)).send({ fullName: 'Changed Name' });
    expect(res.status).toBe(403);
  });

  it('deactivating a user signs them out immediately; self-deactivation is blocked', async () => {
    const admin = await createUser([{ permissions: ADMIN }]);
    const target = await createUser([{ permissions: ['core.users.view'] }]);
    expect((await api.get('/api/auth/me').set(bearer(target.token))).status).toBe(200);
    const res = await api.patch(`/api/core/users/${target.user.id}`).set(bearer(admin.token)).send({ isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.isActive).toBe(false);
    expect((await api.get('/api/auth/me').set(bearer(target.token))).status).toBe(401);
    expect((await api.patch(`/api/core/users/${admin.user.id}`).set(bearer(admin.token)).send({ isActive: false })).status).toBe(409);
  });

  it('revokes an assignment within scope and audits it', async () => {
    const a = await createDealership('A');
    const admin = await createUser([{ permissions: [...ADMIN, 'core.audit.view'], dealershipId: a.id }]);
    const target = await createUser([{ permissions: [], dealershipId: a.id }, { permissions: [], dealershipId: a.id }]);
    const detail = await api.get(`/api/core/users/${target.user.id}`).set(bearer(admin.token));
    const assignmentId = detail.body.roles[0].id;
    const res = await api.delete(`/api/core/users/${target.user.id}/roles/${assignmentId}`).set(bearer(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.roles).toHaveLength(1);
    const audit = await api.get(`/api/core/audit?entityType=core.user&action=role.revoke`).set(bearer(admin.token));
    expect(audit.body.total).toBe(1);
  });
});
