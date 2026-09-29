import { describe, expect, it } from 'vitest';
import { api, bearer, createDealership, createUser, owner, PASSWORD, roleByName, useTestDb } from './helpers';

useTestDb();

type Login = Awaited<ReturnType<typeof createUser>>;

async function staff(roleName: string, dealershipId: number): Promise<Login> {
  const u = await createUser();
  await owner.db.userRole.create({ data: { userId: u.user.id, roleId: await roleByName(roleName), dealershipId } });
  return u;
}

const NEW_PASSWORD = 'NewPassw0rd-2026';
const newUser = (email: string, roleId: number, dealershipId: number) => ({
  email,
  fullName: 'New Hire',
  password: 'Welcome-2026x',
  roles: [{ roleId, dealershipId }],
});

describe('Sales Manager: managing the sales team', () => {
  it('creates staff in sales roles at their own dealership only', async () => {
    const d = await createDealership('HYD');
    const other = await createDealership('JET');
    const manager = await staff('Sales Manager', d.id);

    for (const name of ['Salesperson', 'CRO', 'Assistant Manager', 'Sales Admin', 'Delivery Team']) {
      const res = await api.post('/api/core/users').set(bearer(manager.token)).send(newUser(`${name.replace(/\W/g, '').toLowerCase()}@hyd.test`, await roleByName(name), d.id));
      expect(res.status, name).toBe(201);
      expect(res.body.roles[0]).toMatchObject({ roleName: name, dealershipId: d.id });
    }
    // Not another manager, not an admin, not at another dealership, not without a role.
    for (const name of ['Sales Manager', 'System Admin', 'Dealership Manager', 'Accountant']) {
      const res = await api.post('/api/core/users').set(bearer(manager.token)).send(newUser(`x-${name.length}@hyd.test`, await roleByName(name), d.id));
      expect(res.status, name).toBe(403);
    }
    expect((await api.post('/api/core/users').set(bearer(manager.token)).send(newUser('far@jet.test', await roleByName('Salesperson'), other.id))).status).toBe(403);
    expect((await api.post('/api/core/users').set(bearer(manager.token)).send({ ...newUser('none@hyd.test', 1, d.id), roles: [] })).status).toBe(422);

    // The new salesperson can sign in straight away.
    expect((await api.post('/api/auth/login').send({ email: 'salesperson@hyd.test', password: 'Welcome-2026x' })).status).toBe(200);
  });

  it('offers only the roles they may assign', async () => {
    const d = await createDealership('HYD');
    const manager = await staff('Sales Manager', d.id);
    const res = await api.get(`/api/core/roles/assignable?dealershipId=${d.id}`).set(bearer(manager.token));
    expect(res.status).toBe(200);
    expect(res.body.map((r: { name: string }) => r.name).sort()).toEqual(['Assistant Manager', 'CRO', 'Delivery Team', 'Sales Admin', 'Salesperson']);
    const other = await createDealership('JET');
    expect((await api.get(`/api/core/roles/assignable?dealershipId=${other.id}`).set(bearer(manager.token))).body).toEqual([]);
  });

  it('resets a salesperson\'s password and deactivates a leaver (signed out, cannot sign in)', async () => {
    const d = await createDealership('HYD');
    const manager = await staff('Sales Manager', d.id);
    const leaver = await staff('Salesperson', d.id);

    const reset = await api.patch(`/api/core/users/${leaver.user.id}`).set(bearer(manager.token)).send({ password: NEW_PASSWORD });
    expect(reset.status).toBe(200);
    expect((await api.post('/api/auth/login').send({ email: leaver.user.email, password: PASSWORD })).status).toBe(401);
    expect((await api.post('/api/auth/login').send({ email: leaver.user.email, password: NEW_PASSWORD })).status).toBe(200);

    const off = await api.patch(`/api/core/users/${leaver.user.id}`).set(bearer(manager.token)).send({ isActive: false });
    expect(off.body.isActive).toBe(false);
    expect((await api.post('/api/auth/login').send({ email: leaver.user.email, password: NEW_PASSWORD })).status).toBe(401);
    // Their existing token no longer works either.
    expect((await api.get('/api/sales/leads').set(bearer(leaver.token))).status).toBe(401);

    // Reactivating brings them back.
    await api.patch(`/api/core/users/${leaver.user.id}`).set(bearer(manager.token)).send({ isActive: true }).expect(200);
    expect((await api.post('/api/auth/login').send({ email: leaver.user.email, password: NEW_PASSWORD })).status).toBe(200);
  });

  it('changes a staff member\'s role, but cannot touch managers, admins or other dealerships', async () => {
    const d = await createDealership('HYD');
    const other = await createDealership('JET');
    const manager = await staff('Sales Manager', d.id);
    const sp = await staff('Salesperson', d.id);
    const peer = await staff('Sales Manager', d.id);
    const boss = await staff('Dealership Manager', d.id);
    const elsewhere = await staff('Salesperson', other.id);

    // Promote the salesperson to Assistant Manager, then drop the old role.
    const promoted = await api.post(`/api/core/users/${sp.user.id}/roles`).set(bearer(manager.token)).send({ roleId: await roleByName('Assistant Manager'), dealershipId: d.id });
    expect(promoted.status).toBe(201);
    const old = promoted.body.roles.find((r: { roleName: string }) => r.roleName === 'Salesperson');
    expect((await api.delete(`/api/core/users/${sp.user.id}/roles/${old.id}`).set(bearer(manager.token))).status).toBe(200);

    for (const target of [peer, boss]) {
      expect((await api.patch(`/api/core/users/${target.user.id}`).set(bearer(manager.token)).send({ password: NEW_PASSWORD })).status).toBe(403);
      expect((await api.patch(`/api/core/users/${target.user.id}`).set(bearer(manager.token)).send({ isActive: false })).status).toBe(403);
    }
    const bossRole = (await api.get(`/api/core/users/${boss.user.id}`).set(bearer(manager.token))).body.roles[0];
    expect((await api.delete(`/api/core/users/${boss.user.id}/roles/${bossRole.id}`).set(bearer(manager.token))).status).toBe(403);
    expect((await api.patch(`/api/core/users/${elsewhere.user.id}`).set(bearer(manager.token)).send({ isActive: false })).status).toBe(404);
  });

  it('is the Sales Manager\'s right alone among the sales roles', async () => {
    const d = await createDealership('HYD');
    const sp = await staff('Salesperson', d.id);
    for (const name of ['Salesperson', 'CRO', 'Assistant Manager', 'Sales Admin', 'Delivery Team']) {
      const who = await staff(name, d.id);
      expect((await api.get('/api/core/users').set(bearer(who.token))).status, name).toBe(403);
      expect((await api.patch(`/api/core/users/${sp.user.id}`).set(bearer(who.token)).send({ isActive: false })).status, name).toBe(403);
    }
  });
});
