import { describe, expect, it } from 'vitest';
import { userRole } from '../src/modules/core/models';
import { api, bearer, createDealership, createUser, leadVehicle, owner, PASSWORD, roleByName, useTestDb } from './helpers';

useTestDb();

type Login = Awaited<ReturnType<typeof createUser>>;

async function staff(roleName: string, dealershipId: number): Promise<Login> {
  const u = await createUser();
  await owner.db.insert(userRole).values({ userId: u.user.id, roleId: await roleByName(roleName), dealershipId });
  return u;
}

const signIn = (email: string, password = PASSWORD) => api.post('/api/auth/login').send({ email, password });
const mine = (who: Login, query = '') => api.get(`/api/core/activity/mine${query}`).set(bearer(who.token));
const team = (who: Login, query = '') => api.get(`/api/core/activity/team${query}`).set(bearer(who.token));
const actions = (res: { body: { items: { action: string }[] } }) => res.body.items.map((i) => i.action);

describe('activity log', () => {
  it('records sign-ins, sign-outs, failed and blocked attempts, and shows each person their own', async () => {
    const d = await createDealership('HYD');
    const sp = await staff('Salesperson', d.id);

    await signIn(sp.user.email, 'wrong-password-1').expect(401);
    const ok = await signIn(sp.user.email).expect(200);
    const cookie = String(ok.headers['set-cookie']).split(';')[0]!;
    await api.post('/api/auth/logout').set('Cookie', cookie);

    const res = await mine(sp, '?category=sign_in');
    expect(res.status).toBe(200);
    expect(actions(res)).toEqual(['logout', 'login', 'login.failed']);
    expect(res.body.items[0]).toMatchObject({ actorId: sp.user.id, dealershipId: d.id, dealershipName: 'Dealer HYD' });

    // A deactivated account trying to sign in is recorded as blocked.
    await owner.pool.query('update core."user" set is_active = false where id = $1', [sp.user.id]);
    await signIn(sp.user.email).expect(401);
    const [row] = (await owner.pool.query("select action from audit.audit_log where actor_id = $1 order by id desc limit 1", [sp.user.id])).rows;
    expect(row.action).toBe('login.blocked');
  });

  it("records the person's work on leads, with readable names", async () => {
    const d = await createDealership('HYD');
    // A CRO's social-media lead: visits are recorded by the CRO (walk-ins have already visited).
    const sp = await staff('CRO', d.id);
    const lead = await api.post('/api/sales/leads').set(bearer(sp.token)).send({ dealershipId: d.id, prospectName: 'Ayesha Khan', prospectMobile: '03001234567', source: 'social', ...(await leadVehicle()) });
    await api.post(`/api/sales/leads/${lead.body.id}/follow-ups`).set(bearer(sp.token)).send({ outcome: 'interested', remarks: 'Wants a test drive' }).expect(201);
    await api.post(`/api/sales/leads/${lead.body.id}/follow-ups`).set(bearer(sp.token)).send({ outcome: 'visited' }).expect(201);

    const res = await mine(sp, '?category=leads');
    // Newest first: logged, first follow-up (moves it to Follow-up), then a visit (moves it to Visited).
    expect(actions(res)).toEqual(['transition:visit', 'follow_up', 'transition:follow_up', 'follow_up', 'create']);
    expect(res.body.items[1].changes).toMatchObject({ outcome: 'visited' });
    expect(res.body.items[3].changes).toMatchObject({ outcome: 'interested', remarks: 'Wants a test drive' });
    expect(res.body.items.every((i: { entityLabel: string }) => i.entityLabel === 'Ayesha Khan')).toBe(true);
  });

  it("lets a Sales Manager see and filter everyone's activity at their dealership, and nobody else's", async () => {
    const d = await createDealership('HYD');
    const other = await createDealership('JET');
    const manager = await staff('Sales Manager', d.id);
    const sp1 = await staff('Salesperson', d.id);
    const sp2 = await staff('Salesperson', d.id);
    const outsider = await staff('Salesperson', other.id);
    for (const u of [sp1, sp2, outsider, manager]) await signIn(u.user.email).expect(200);
    await api.post('/api/sales/leads').set(bearer(sp1.token)).send({ dealershipId: d.id, prospectName: 'Bilal Ahmed', prospectMobile: '03331112223', ...(await leadVehicle()) }).expect(201);

    const all = await team(manager, '?pageSize=100');
    expect(all.status).toBe(200);
    const actors = new Set(all.body.items.map((i: { actorId: number }) => i.actorId));
    expect(actors).toEqual(new Set([sp1.user.id, sp2.user.id, manager.user.id]));
    expect(actors.has(outsider.user.id)).toBe(false);

    // Filter by person, by name search, and by type.
    expect(new Set((await team(manager, `?actorId=${sp1.user.id}`)).body.items.map((i: { actorId: number }) => i.actorId))).toEqual(new Set([sp1.user.id]));
    const byName = await team(manager, `?q=${encodeURIComponent(sp2.user.fullName)}`);
    expect(new Set(byName.body.items.map((i: { actorId: number }) => i.actorId))).toEqual(new Set([sp2.user.id]));
    expect(actions(await team(manager, `?actorId=${sp1.user.id}&category=leads`))).toEqual(['create']);
    // Team view includes the IP of sign-ins, for security review.
    expect((await team(manager, '?category=sign_in')).body.items[0]).toHaveProperty('ip');

    // Date filter (Pakistan days).
    const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
    expect((await team(manager, `?from=${today}&to=${today}`)).body.total).toBe(all.body.total);
    expect((await team(manager, '?from=2000-01-01&to=2000-01-02')).body.total).toBe(0);
  });

  it("keeps the team view to managers: other roles only see their own", async () => {
    const d = await createDealership('HYD');
    const sp1 = await staff('Salesperson', d.id);
    const sp2 = await staff('Salesperson', d.id);
    await signIn(sp1.user.email).expect(200);
    await signIn(sp2.user.email).expect(200);
    for (const name of ['Salesperson', 'CRO', 'Assistant Manager', 'Sales Admin', 'Delivery Team']) {
      const who = await staff(name, d.id);
      expect((await team(who)).status, name).toBe(403);
    }
    const own = await mine(sp1);
    expect(new Set(own.body.items.map((i: { actorId: number }) => i.actorId))).toEqual(new Set([sp1.user.id]));
  });
});
