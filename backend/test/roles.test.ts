import { describe, expect, it } from 'vitest';
import { api, bearer, createDealership, createUser, owner, roleByName, useTestDb } from './helpers';

useTestDb();

describe('roles & permissions (runtime-editable RBAC)', () => {
  it('seeds default roles from templates (data, not code checks)', async () => {
    const { token } = await createUser([{ permissions: ['core.roles.view'] }]);
    const res = await api.get('/api/core/roles?pageSize=50').set(bearer(token));
    expect(res.body.items.map((r: { name: string }) => r.name)).toContain('System Admin');
    const admin = await roleByName('System Admin');
    const perms = await api.get(`/api/core/roles/${admin}/permissions`).set(bearer(token));
    const catalog = await api.get('/api/core/permissions').set(bearer(token));
    expect(perms.body.permissionCodes).toHaveLength(catalog.body.length);
  });

  it('permission edits take effect on the very next request', async () => {
    const d = await createDealership('A');
    const admin = await createUser([{ permissions: ['core.roles.view', 'core.roles.manage'] }]);
    const r = await owner.raw<{ id: number }>("insert into core.role(name) values ('Viewer') returning id::int");
    const roleId = r.rows[0]!.id;
    const u = await createUser([]);
    await owner.raw('insert into core.user_role(user_id, role_id, dealership_id) values ($1, $2, $3)', [u.user.id, roleId, d.id]);

    expect((await api.get('/api/core/dealerships').set(bearer(u.token))).status).toBe(403);
    const set = await api.put(`/api/core/roles/${roleId}/permissions`).set(bearer(admin.token)).send({ permissionCodes: ['core.dealerships.view'] });
    expect(set.status).toBe(200);
    expect(set.body.permissionCodes).toEqual(['core.dealerships.view']);
    const now = await api.get('/api/core/dealerships').set(bearer(u.token));
    expect(now.status).toBe(200);
    expect(now.body.total).toBe(1);
  });

  it('only a global grant can edit role permissions', async () => {
    const d = await createDealership('A');
    const scoped = await createUser([{ permissions: ['core.roles.view', 'core.roles.manage'], dealershipId: d.id }]);
    const roleId = await roleByName('Salesperson');
    const res = await api.put(`/api/core/roles/${roleId}/permissions`).set(bearer(scoped.token)).send({ permissionCodes: [] });
    expect(res.status).toBe(403);
    expect((await api.post('/api/core/roles').set(bearer(scoped.token)).send({ name: 'Nope' })).status).toBe(403);
  });

  it('rejects unknown permission codes', async () => {
    const admin = await createUser([{ permissions: ['core.roles.view', 'core.roles.manage'] }]);
    const roleId = await roleByName('Accountant');
    const res = await api.put(`/api/core/roles/${roleId}/permissions`).set(bearer(admin.token)).send({ permissionCodes: ['core.fake.do'] });
    expect(res.status).toBe(422);
  });

  it('system roles cannot be deleted; custom roles can', async () => {
    const admin = await createUser([{ permissions: ['core.roles.view', 'core.roles.manage'] }]);
    const sys = await roleByName('System Admin');
    expect((await api.delete(`/api/core/roles/${sys}`).set(bearer(admin.token))).status).toBe(409);
    const created = await api.post('/api/core/roles').set(bearer(admin.token)).send({ name: 'Temp Role' });
    expect(created.status).toBe(201);
    expect((await api.delete(`/api/core/roles/${created.body.id}`).set(bearer(admin.token))).status).toBe(204);
  });
});

describe('audit log', () => {
  it('is scoped: dealership viewers do not see other dealerships or global events', async () => {
    const a = await createDealership('A');
    const b = await createDealership('B');
    const editor = await createUser([{ permissions: ['core.dealerships.update', 'core.dealerships.view'] }]);
    await api.patch(`/api/core/dealerships/${a.id}`).set(bearer(editor.token)).send({ name: 'A2' });
    await api.patch(`/api/core/dealerships/${b.id}`).set(bearer(editor.token)).send({ name: 'B2' });
    await api.post('/api/core/roles').set(bearer((await createUser([{ permissions: ['core.roles.manage'] }])).token)).send({ name: 'Global Event' });

    const scoped = await createUser([{ permissions: ['core.audit.view'], dealershipId: a.id }]);
    const res = await api.get('/api/core/audit').set(bearer(scoped.token));
    expect(res.status).toBe(200);
    expect(res.body.items.map((e: { dealershipId: number }) => e.dealershipId)).toEqual([a.id]);

    const global = await createUser([{ permissions: ['core.audit.view'] }]);
    const all = await api.get('/api/core/audit').set(bearer(global.token));
    expect(all.body.total).toBe(3);
  });
});
