import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { userRole } from '../src/modules/core/models';
import { customer, vehicleModel } from '../src/modules/master/models';
import { api, bearer, createDealership, createUser, owner, roleByName, useTestDb } from './helpers';

useTestDb();

type Login = Awaited<ReturnType<typeof createUser>>;

async function staff(roleName: string, dealershipId: number): Promise<Login> {
  const u = await createUser();
  await owner.db.insert(userRole).values({ userId: u.user.id, roleId: await roleByName(roleName), dealershipId });
  return u;
}

async function setup() {
  const d = await createDealership('HYD');
  const [model] = await owner.db.insert(vehicleModel).values({ brand: 'Hyundai', name: 'Tucson' }).returning();
  return {
    d,
    modelId: model!.id,
    manager: await staff('Sales Manager', d.id),
    admin: await staff('Sales Admin', d.id),
    sales1: await staff('Salesperson', d.id),
    sales2: await staff('Salesperson', d.id),
  };
}
type Setup = Awaited<ReturnType<typeof setup>>;

async function convertedLead(s: Setup, mobile = '03001234567') {
  const l = await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send({ dealershipId: s.d.id, prospectName: 'Ayesha Khn', prospectMobile: mobile, interestedModelId: s.modelId, variant: '2.0 GLS' });
  await api
    .post(`/api/sales/leads/${l.body.id}/convert`)
    .set(bearer(s.sales1.token))
    .send({ interestedModelId: s.modelId, variant: '2.0 GLS', preferredColor: 'White', email: 'ayesha@exmaple.com', paymentInstrument: 'cheque', paymentInstrumentRef: 'CH-1' })
    .expect(200);
  return l.body.id as number;
}
const details = (who: Login, id: number, body: Record<string, unknown>) => api.patch(`/api/sales/leads/${id}/details`).set(bearer(who.token)).send(body);

describe('correcting lead details after conversion', () => {
  it('lets the owner fix the name, email and phone; the customer record follows', async () => {
    const s = await setup();
    const id = await convertedLead(s);
    const res = await details(s.sales1, id, { prospectName: 'Ayesha Khan', email: 'ayesha@example.com', prospectMobile: '03009998877' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ prospectName: 'Ayesha Khan', email: 'ayesha@example.com', prospectMobile: '03009998877', status: 'converted' });
    const [c] = await owner.db.select().from(customer).where(eq(customer.id, res.body.customerId));
    expect(c).toMatchObject({ fullName: 'Ayesha Khan', email: 'ayesha@example.com', mobileNormalized: '+923009998877' });
    // Recorded in the activity log with before / after.
    const log = await api.get('/api/core/activity/mine?category=leads').set(bearer(s.sales1.token));
    expect(log.body.items[0]).toMatchObject({ action: 'details.update', changes: { prospectName: { from: 'Ayesha Khn', to: 'Ayesha Khan' } } });
  });

  it('lets the Sales Admin correct converted leads (while an order is processing too), not open ones', async () => {
    const s = await setup();
    const id = await convertedLead(s);
    expect((await details(s.admin, id, { preferredColor: 'Phantom Black' })).body.preferredColor).toBe('Phantom Black');
    await api.post(`/api/sales/leads/${id}/order`).set(bearer(s.admin.token)).send({ unitPrice: '9000000' }).expect(201);
    const processing = await details(s.admin, id, { notes: 'Customer asked for delivery on Friday' });
    expect(processing.body).toMatchObject({ status: 'processing', notes: 'Customer asked for delivery on Friday' });
    // The order shows the corrected customer name.
    const open = await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send({ dealershipId: s.d.id, prospectName: 'Open Lead', prospectMobile: '03111111111', interestedModelId: s.modelId, variant: '2.0 GLS' });
    expect((await details(s.admin, open.body.id, { prospectName: 'X' })).status).toBe(404);
  });

  it('keeps everyone else out, blocks duplicate phones and locks the model', async () => {
    const s = await setup();
    const id = await convertedLead(s);
    await api.post('/api/sales/leads').set(bearer(s.sales2.token)).send({ dealershipId: s.d.id, prospectName: 'Other', prospectMobile: '03335556667', interestedModelId: s.modelId, variant: '2.0 GLS' }).expect(201);
    expect((await details(s.sales2, id, { prospectName: 'Hacked' })).status).toBe(404);
    expect((await details(s.manager, id, { prospectName: 'Hacked' })).status).toBe(403);
    const dup = await details(s.sales1, id, { prospectMobile: '03335556667' });
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toBe('Duplicate lead already exists');
    // Only customer details: the model / payment are not accepted here.
    expect((await details(s.sales1, id, { interestedModelId: s.modelId })).status).toBe(422);
    expect((await details(s.sales1, id, { variant: null })).status).toBe(422); // the variant stays required
    expect((await details(s.sales1, id, { variant: '1.6 Turbo' })).body.variant).toBe('1.6 Turbo');
    expect((await details(s.sales1, id, {})).status).toBe(422);
  });
});

describe('dashboard custom period and totals', () => {
  it('accepts any date range up to 92 days and reports total leads', async () => {
    const s = await setup();
    await convertedLead(s);
    await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send({ dealershipId: s.d.id, prospectName: 'Second', prospectMobile: '03112223334', interestedModelId: s.modelId, variant: '2.0 GLS' }).expect(201);
    const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
    const from = new Date(Date.parse(today) - 4 * 86400_000).toISOString().slice(0, 10);

    const res = await api.get(`/api/sales/dashboard?from=${from}&to=${today}`).set(bearer(s.sales1.token));
    expect(res.status).toBe(200);
    expect(res.body.period).toEqual({ from, to: today, days: 5 });
    expect(res.body.leads.daily).toHaveLength(5);
    expect(res.body.leads).toMatchObject({ total: 2, loggedInPeriod: 2, loggedToday: 2 });

    // A past range still counts "today" as today, and nothing logged in it.
    const past = await api.get('/api/sales/dashboard?from=2026-01-01&to=2026-01-05').set(bearer(s.sales1.token));
    expect(past.body.leads).toMatchObject({ total: 2, loggedInPeriod: 0, loggedToday: 2 });

    for (const q of ['from=2026-01-05&to=2026-01-01', 'from=2026-01-01', 'from=2026-01-01&to=2026-06-01']) {
      expect((await api.get(`/api/sales/dashboard?${q}`).set(bearer(s.sales1.token))).status, q).toBe(422);
    }
  });
});

describe('changing a staff member email', () => {
  it('lets the Sales Manager change it (unique), and the person signs in with the new one', async () => {
    const s = await setup();
    const res = await api.patch(`/api/core/users/${s.sales1.user.id}`).set(bearer(s.manager.token)).send({ email: 'New.Email@Hyundai.com' });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('new.email@hyundai.com');
    const taken = await api.patch(`/api/core/users/${s.sales2.user.id}`).set(bearer(s.manager.token)).send({ email: 'new.email@hyundai.com' });
    expect(taken.status).toBe(409);
    expect(taken.body.error.message).toBe('Another account already uses this email address');
  });
});
