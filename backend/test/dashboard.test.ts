import { describe, expect, it } from 'vitest';
import { api, bearer, createDealership, createUser, owner, roleByName, useTestDb, nextCnic, nextPbo } from './helpers';

useTestDb();

type Login = Awaited<ReturnType<typeof createUser>>;

async function staff(roleName: string, dealershipId: number): Promise<Login> {
  const u = await createUser();
  await owner.db.userRole.create({ data: { userId: u.user.id, roleId: await roleByName(roleName), dealershipId } });
  return u;
}

async function setup() {
  const d = await createDealership('HYD');
  const model = await owner.db.vehicleModel.create({ data: { brand: 'Hyundai', name: 'Tucson' } });
  return {
    d,
    modelId: model!.id,
    manager: await staff('Sales Manager', d.id),
    am: await staff('Assistant Manager', d.id),
    admin: await staff('Sales Admin', d.id),
    sales1: await staff('Salesperson', d.id),
    sales2: await staff('Salesperson', d.id),
    delivery: await staff('Delivery Team', d.id),
  };
}
type Setup = Awaited<ReturnType<typeof setup>>;

const newLead = async (s: Setup, who: Login, mobile: string, name = 'Bilal Ahmed') =>
  (await api.post('/api/sales/leads').set(bearer(who.token)).send({ dealershipId: s.d.id, prospectName: name, prospectMobile: mobile, interestedModelId: s.modelId, variant: '2.0 GLS' })).body.id as number;

const convert = (s: Setup, who: Login, id: number) =>
  api
    .post(`/api/sales/leads/${id}/convert`)
    .set(bearer(who.token))
    .send({ interestedModelId: s.modelId, variant: '2.0 GLS', preferredColor: 'White', email: 'x@example.com', paymentInstrument: 'cheque', customerCnic: nextCnic(), paymentInstrumentRef: 'CH-1' })
    .expect(200);

const dashboard = (who: Login) => api.get('/api/sales/dashboard').set(bearer(who.token));

describe('sales dashboard', () => {
  it('counts only what each role can see', async () => {
    const s = await setup();
    const a = await newLead(s, s.sales1, '03001110001');
    await newLead(s, s.sales1, '03001110002');
    const c = await newLead(s, s.sales2, '03001110003');
    await convert(s, s.sales1, a);
    await api.post(`/api/sales/leads/${c}/follow-ups`).set(bearer(s.sales2.token)).send({ outcome: 'interested' }).expect(201);

    const own = (await dashboard(s.sales1)).body;
    expect(own.leads).toMatchObject({ open: 1, loggedToday: 2, byStatus: { new: 1, converted: 1 } });
    expect(own.leads.daily).toHaveLength(14);
    expect(own.leads.daily.at(-1)).toMatchObject({ logged: 2, converted: 1 });
    expect(own.orders).toBeUndefined();
    expect(own.stock).toBeUndefined();

    const other = (await dashboard(s.sales2)).body;
    expect(other.leads).toMatchObject({ open: 1, loggedToday: 1, myFollowUpsToday: 1, byStatus: { follow_up: 1 } });

    // Team views see every lead of the dealership; the Admin only converted ones.
    for (const who of [s.am, s.manager]) expect((await dashboard(who)).body.leads).toMatchObject({ open: 2, loggedToday: 3 });
    const admin = (await dashboard(s.admin)).body;
    expect(admin.leads).toMatchObject({ open: 0, byStatus: { converted: 1 } });
    expect(admin.orders).toMatchObject({ byStatus: {}, awaitingVehicle: 0 });

    // The Delivery Team has no leads section, but stock, orders and deliveries.
    await api.post('/api/sales/stock').set(bearer(s.delivery.token)).send({ dealershipId: s.d.id, modelId: s.modelId, vin: 'DASHVIN0001', engineNo: 'DASHENG0001' }).expect(201);
    const del = (await dashboard(s.delivery)).body;
    expect(del.leads).toBeUndefined();
    expect(del.stock).toMatchObject({ free: 1, byStatus: { available: 1 } });
    expect(del.deliveries).toMatchObject({ scheduled: 0, deliveredInPeriod: 0 });

    expect((await api.get('/api/sales/dashboard?days=30').set(bearer(s.sales1.token))).body.leads.daily).toHaveLength(30);
    expect((await api.get('/api/sales/dashboard?days=500').set(bearer(s.sales1.token))).status).toBe(422);
  });

  it('is scoped to the dealership', async () => {
    const s = await setup();
    const jet = await createDealership('JET');
    const jetManager = await staff('Sales Manager', jet.id);
    await newLead(s, s.sales1, '03002220001');
    expect((await dashboard(jetManager)).body.leads).toMatchObject({ open: 0, loggedToday: 0 });
  });
});

describe('leads by latest activity', () => {
  it('an old lead converted today shows under today; an untouched old lead does not', async () => {
    const s = await setup();
    const old = await newLead(s, s.sales1, '03004440001', 'Old Converted');
    const idle = await newLead(s, s.sales1, '03004440002', 'Old Idle');
    // Both were logged ten days ago.
    await owner.raw(`update sales.lead set created_at = now() - interval '10 days', updated_at = now() - interval '10 days' where id = any($1)`, [[old, idle]]);
    const fresh = await newLead(s, s.sales1, '03004440003', 'New Today');
    await convert(s, s.sales1, old);

    const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
    const res = await api.get(`/api/sales/leads?activityFrom=${today}&activityTo=${today}`).set(bearer(s.sales1.token));
    // Latest activity first: the conversion just now, then the lead logged today.
    expect(res.body.items.map((l: { id: number }) => l.id)).toEqual([old, fresh]);
    expect(res.body.items[0]).toMatchObject({ status: 'converted' });

    const tenDaysAgo = new Date(Date.parse(today) - 10 * 86400_000).toISOString().slice(0, 10);
    const past = await api.get(`/api/sales/leads?activityFrom=${tenDaysAgo}&activityTo=${tenDaysAgo}`).set(bearer(s.sales1.token));
    expect(past.body.items.map((l: { id: number }) => l.id)).toEqual([idle]);
  });
});

describe('lead search', () => {
  it('finds leads by name or by phone typed any way, full or partial', async () => {
    const s = await setup();
    const id = await newLead(s, s.sales1, '03001234567', 'Ayesha Khan');
    await newLead(s, s.sales1, '03339876543', 'Bilal Ahmed');
    for (const q of ['Ayesha', 'khan', '03001234567', '0300-1234567', '+92 300 1234567', '0300123', '0300 123', '1234567']) {
      const res = await api.get(`/api/sales/leads?q=${encodeURIComponent(q)}`).set(bearer(s.sales1.token));
      expect(res.body.items.map((l: { id: number }) => l.id), q).toEqual([id]);
    }
    // Search never widens scope: another salesperson finds nothing.
    expect((await api.get('/api/sales/leads?q=03001234567').set(bearer(s.sales2.token))).body.total).toBe(0);
  });
});
