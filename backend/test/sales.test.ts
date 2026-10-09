import { describe, expect, it } from 'vitest';
import { subscribe } from '../src/events/bus';
import { api, bearer, createDealership, createUser, owner, roleByName, useTestDb, nextCnic, nextPbo, clearForDelivery } from './helpers';
import { pakistanToday } from '../src/lib/dates';

useTestDb();

// A test-only subscriber that can be told to fail, to prove delivery is all-or-nothing.
let failActivation = false;
subscribe('vehicle.activated', async () => {
  if (failActivation) throw new Error('subscriber failure');
});

type Login = Awaited<ReturnType<typeof createUser>>;

/** A user holding one of the real default sales roles, scoped to one dealership. */
async function staff(roleName: string, dealershipId: number): Promise<Login> {
  const u = await createUser();
  await owner.db.userRole.create({ data: { userId: u.user.id, roleId: await roleByName(roleName), dealershipId } });
  return u;
}

/** Stand-in for the (deferred) Delivery Team: schedules and completes deliveries, moves stock. */
const DELIVERY_DESK = ['sales.orders.view_all', 'sales.orders.allocate', 'sales.deliveries.view_all', 'sales.deliveries.schedule', 'sales.deliveries.complete'];

/** The vehicle on every test lead (model and variant are required); one per test (the data resets). */
let leadModelId = 0;
async function tucson() {
  const [found] = await owner.db.vehicleModel.findMany({ where: { name: 'Tucson' } });
  return found ? found.id : (await owner.db.vehicleModel.create({ data: { brand: 'Hyundai', name: 'Tucson' } })).id;
}

async function team(code: string) {
  const d = await createDealership(code);
  leadModelId = await tucson();
  return {
    d,
    manager: await staff('Sales Manager', d.id),
    am: await staff('Assistant Manager', d.id),
    cro: await staff('CRO', d.id),
    admin: await staff('Sales Admin', d.id),
    sales1: await staff('Salesperson', d.id),
    sales2: await staff('Salesperson', d.id),
    desk: await createUser([{ permissions: DELIVERY_DESK, dealershipId: d.id }]),
  };
}

async function setup() {
  const t = await team('HYD');
  return { ...t, modelId: leadModelId };
}
type Setup = Awaited<ReturnType<typeof setup>>;

const walkIn = (dealershipId: number, mobile = '0321-1112223', over: Record<string, unknown> = {}) => ({
  dealershipId,
  prospectName: 'Bilal Ahmed',
  prospectMobile: mobile,
  interestedModelId: leadModelId,
  variant: '2.0 GLS',
  ...over,
});

const conversion = (modelId: number, over: Record<string, unknown> = {}) => ({
  interestedModelId: modelId,
  variant: '2.0 GLS',
  preferredColor: 'Polar White',
  email: 'bilal@example.com',
  paymentInstrument: 'pay_order',
  customerCnic: nextCnic(), customerAddress: 'House 1, Street 2, F-10/2, Islamabad', paymentType: 'partial', vehiclePrice: '9500000', paymentInstrumentRef: 'PO-778812',
  paymentInstrumentBank: 'HBL',
  paymentAmount: '500000',
  ...over,
});

async function newLead(who: Login, dealershipId: number, mobile?: string, over?: Record<string, unknown>) {
  const res = await api.post('/api/sales/leads').set(bearer(who.token)).send(walkIn(dealershipId, mobile, over));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as number;
}

async function convert(who: Login, leadId: number, modelId: number) {
  const res = await api.post(`/api/sales/leads/${leadId}/convert`).set(bearer(who.token)).send(conversion(modelId));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body;
}

async function raiseOrder(s: Setup, leadId: number, over: Record<string, unknown> = {}) {
  const res = await api.post(`/api/sales/leads/${leadId}/order`).set(bearer(s.admin.token)).send({ customerCnic: nextCnic(), pboNo: nextPbo(), unitPrice: '9500000', discount: '100000', ...over });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

/** Converted lead → order raised → vehicle entered → submitted → approved. */
async function approvedOrder(s: Setup, mobile = '0300-5556667', vin = 'KMHJ381APPROVED1') {
  const leadId = await newLead(s.sales1, s.d.id, mobile);
  await convert(s.sales1, leadId, s.modelId);
  const o = await raiseOrder(s, leadId);
  await api.put(`/api/sales/orders/${o.id}/vehicle`).set(bearer(s.admin.token)).send({ vin, engineNo: `E${vin.slice(-9)}` }).expect(200);
  await api.post(`/api/sales/orders/${o.id}/transitions`).set(bearer(s.admin.token)).send({ action: 'submit' }).expect(200);
  await api.post(`/api/sales/orders/${o.id}/transitions`).set(bearer(s.manager.token)).send({ action: 'approve' }).expect(200);
  return { leadId, orderId: o.id as number };
}

/** The Delivery Team received the order's car at the dealership (a delivery is scheduled only then). */
async function carArrived(orderId: number) {
  await owner.raw(`update core.vehicle set status = 'received' where id = (select vehicle_id from sales.sales_order where id = $1)`, [orderId]);
}

async function deliver(s: Setup, orderId: number) {
  const today = pakistanToday();
  await carArrived(orderId);
  const d = await api.post(`/api/sales/orders/${orderId}/deliveries`).set(bearer(s.desk.token)).send({ scheduledDate: today });
  expect(d.status, JSON.stringify(d.body)).toBe(201);
  await clearForDelivery();
  await api.post(`/api/sales/deliveries/${d.body.id}/complete`).set(bearer(s.desk.token)).send({ odometerKm: 5, checklist: ['pdi_done', 'documents_ready', 'accessories_fitted'], customerAcknowledged: true }).expect(200);
  return d.body.id as number;
}

const ids = (res: { body: { items: { id: number }[] } }) => res.body.items.map((x) => x.id).sort();

// =============================================================================
describe('walk-in leads (Salesperson)', () => {
  it('needs the customer name, phone and model (the variant can wait); the lead belongs to whoever logged it', async () => {
    const s = await setup();
    const noPhone = await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send({ ...walkIn(s.d.id), prospectMobile: undefined });
    expect(noPhone.status).toBe(422);
    const noName = await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send({ ...walkIn(s.d.id), prospectName: undefined });
    expect(noName.status).toBe(422);
    const noModel = await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send({ ...walkIn(s.d.id), interestedModelId: undefined });
    expect(noModel.status).toBe(422);
    expect(noModel.body.error.details.map((i: { path: string }) => i.path)).toContain('interestedModelId');
    const noVariant = await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send({ ...walkIn(s.d.id, '0321-1119999'), variant: undefined });
    expect(noVariant.status).toBe(201);
    expect(noVariant.body.variant).toBeNull();

    const res = await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send(walkIn(s.d.id));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ownerId: s.sales1.user.id, status: 'new', source: 'walk_in', followUpCount: 0 });
    // A salesperson cannot hand their lead to someone else.
    const other = await api.patch(`/api/sales/leads/${res.body.id}`).set(bearer(s.sales1.token)).send({ ownerId: s.sales2.user.id });
    expect(other.status).toBe(403);
  });

  it('salespeople see only their own leads (server side)', async () => {
    const s = await setup();
    const mine = await newLead(s.sales1, s.d.id, '0300-0000001');
    const theirs = await newLead(s.sales2, s.d.id, '0300-0000002');
    expect(ids(await api.get('/api/sales/leads').set(bearer(s.sales1.token)))).toEqual([mine]);
    expect((await api.get(`/api/sales/leads/${theirs}`).set(bearer(s.sales1.token))).status).toBe(404);
    // Filters cannot widen the scope.
    expect(ids(await api.get(`/api/sales/leads?ownerId=${s.sales2.user.id}`).set(bearer(s.sales1.token)))).toEqual([]);
  });
});

describe('duplicate phone numbers', () => {
  it('blocks a second open lead for the same phone with "Duplicate lead already exists"', async () => {
    const s = await setup();
    const first = await newLead(s.sales1, s.d.id, '0321-1112223');
    // Same number, different formatting, different salesperson.
    const dup = await api.post('/api/sales/leads').set(bearer(s.sales2.token)).send(walkIn(s.d.id, '+92 321 111 2223'));
    expect(dup.status).toBe(409);
    expect(dup.body.error.message).toBe('Duplicate lead already exists');
    // The other salesperson is not told which record it is (they cannot open it)...
    expect(dup.body.error.details).toMatchObject({ duplicate: true, escalated: false });
    expect(dup.body.error.details.existingId).toBeUndefined();
    // ...and the owner cannot log it twice either.
    expect((await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send(walkIn(s.d.id))).status).toBe(409);
    // Also blocked while the first lead is converted (not yet a completed order).
    await convert(s.sales1, first, s.modelId);
    expect((await api.post('/api/sales/leads').set(bearer(s.sales2.token)).send(walkIn(s.d.id))).status).toBe(409);
    // Changing another lead's phone to that number is blocked too.
    const other = await newLead(s.sales2, s.d.id, '0300-9990001');
    expect((await api.patch(`/api/sales/leads/${other}`).set(bearer(s.sales2.token)).send({ prospectMobile: '03211112223' })).status).toBe(409);
  });

  it('allows a new lead once the earlier one became a completed order', async () => {
    const s = await setup();
    const { leadId, orderId } = await approvedOrder(s, '0333-1234567');
    expect((await api.post('/api/sales/leads').set(bearer(s.sales2.token)).send(walkIn(s.d.id, '0333-1234567'))).status).toBe(409);
    await deliver(s, orderId);
    expect((await api.get(`/api/sales/leads/${leadId}`).set(bearer(s.sales1.token))).body.status).toBe('completed');
    const again = await api.post('/api/sales/leads').set(bearer(s.sales2.token)).send(walkIn(s.d.id, '0333-1234567'));
    expect(again.status).toBe(201);
  });

  it('is per dealership: the same phone can be a lead at another dealership', async () => {
    const s = await setup();
    const jet = await team('JET');
    await newLead(s.sales1, s.d.id, '0321-1112223');
    expect((await api.post('/api/sales/leads').set(bearer(jet.sales1.token)).send(walkIn(jet.d.id, '0321-1112223'))).status).toBe(201);
  });
});

describe('escalation to the Assistant Manager', () => {
  it('flags the exact existing record, which the AM opens and converts for the unavailable owner', async () => {
    const s = await setup();
    const leadId = await newLead(s.sales1, s.d.id, '0321-1112223');

    // The AM cannot convert a lead that was never escalated.
    expect((await api.post(`/api/sales/leads/${leadId}/convert`).set(bearer(s.am.token)).send(conversion(s.modelId))).status).toBe(403);

    const blocked = await api.post('/api/sales/leads').set(bearer(s.sales2.token)).send(walkIn(s.d.id, '0321-1112223'));
    expect(blocked.status).toBe(409);
    const esc = await api
      .post('/api/sales/leads/escalations')
      .set(bearer(s.sales2.token))
      .send({ dealershipId: s.d.id, prospectMobile: '0321 1112223', note: 'Customer is at the showroom, sales1 is off today' });
    expect(esc.status).toBe(200);
    expect(esc.body.leadId).toBe(leadId);
    // The owner cannot escalate their own lead.
    expect((await api.post('/api/sales/leads/escalations').set(bearer(s.sales1.token)).send({ dealershipId: s.d.id, prospectMobile: '0321-1112223' })).status).toBe(409);

    // The AM's queue shows that exact record, with who escalated it and why.
    const queue = await api.get('/api/sales/leads?escalated=true').set(bearer(s.am.token));
    expect(ids(queue)).toEqual([leadId]);
    expect(queue.body.items[0]).toMatchObject({ escalatedById: s.sales2.user.id, escalationNote: expect.stringContaining('sales1 is off') });
    // Once escalated, a further duplicate attempt says so.
    const again = await api.post('/api/sales/leads').set(bearer(s.sales2.token)).send(walkIn(s.d.id, '0321-1112223'));
    expect(again.body.error.details).toMatchObject({ escalated: true });

    const converted = await api.post(`/api/sales/leads/${leadId}/convert`).set(bearer(s.am.token)).send(conversion(s.modelId));
    expect(converted.status).toBe(200);
    // The lead stays with its owner; the AM is recorded as the one who converted it.
    expect(converted.body).toMatchObject({ status: 'converted', ownerId: s.sales1.user.id, convertedById: s.am.user.id });
    // The escalating salesperson still cannot see it.
    expect((await api.get(`/api/sales/leads/${leadId}`).set(bearer(s.sales2.token))).status).toBe(404);
  });

  it('only the owner (or the AM, escalated) converts: Manager, Admin and other salespeople cannot', async () => {
    const s = await setup();
    const leadId = await newLead(s.sales1, s.d.id);
    await api.post('/api/sales/leads/escalations').set(bearer(s.sales2.token)).send({ dealershipId: s.d.id, prospectMobile: '0321-1112223' }).expect(200);
    expect((await api.post(`/api/sales/leads/${leadId}/convert`).set(bearer(s.manager.token)).send(conversion(s.modelId))).status).toBe(403);
    expect((await api.post(`/api/sales/leads/${leadId}/convert`).set(bearer(s.admin.token)).send(conversion(s.modelId))).status).toBe(403);
    expect((await api.post(`/api/sales/leads/${leadId}/convert`).set(bearer(s.sales2.token)).send(conversion(s.modelId))).status).toBe(404);
  });
});

describe('Convert to Lead', () => {
  it('the Assistant Manager and the Manager convert the leads they logged, also for a salesperson (who stays the owner)', async () => {
    const s = await setup();
    const convertAs = (who: Login, leadId: number) => api.post(`/api/sales/leads/${leadId}/convert`).set(bearer(who.token)).send(conversion(s.modelId));

    // Logged by the AM for Salesperson 1: the AM converts it; the other salesperson cannot (cannot even see it).
    const forSales1 = await api.post('/api/sales/leads').set(bearer(s.am.token)).send(walkIn(s.d.id, '0300-7100001', { ownerId: s.sales1.user.id }));
    expect(forSales1.status, JSON.stringify(forSales1.body)).toBe(201);
    expect((await convertAs(s.sales2, forSales1.body.id)).status).toBe(404);
    const byAm = await convertAs(s.am, forSales1.body.id);
    expect(byAm.status, JSON.stringify(byAm.body)).toBe(200);
    expect(byAm.body).toMatchObject({ status: 'converted', ownerId: s.sales1.user.id, convertedById: s.am.user.id });

    // The Manager's own lead, and one they logged for a salesperson.
    const own = await api.post('/api/sales/leads').set(bearer(s.manager.token)).send(walkIn(s.d.id, '0300-7100002'));
    expect((await convertAs(s.manager, own.body.id)).status).toBe(200);
    const forSales2 = await api.post('/api/sales/leads').set(bearer(s.manager.token)).send(walkIn(s.d.id, '0300-7100003', { ownerId: s.sales2.user.id }));
    expect((await convertAs(s.manager, forSales2.body.id)).body).toMatchObject({ status: 'converted', ownerId: s.sales2.user.id });

    // A salesperson's own lead stays theirs to convert (not the AM's, unless sent as a duplicate).
    const salesLead = await newLead(s.sales1, s.d.id, '0300-7100004');
    expect((await convertAs(s.am, salesLead)).status).toBe(403);
  });

  it('requires model, variant, colour, email and the payment instrument, then hands the lead to the Admin', async () => {
    const s = await setup();
    const leadId = await newLead(s.sales1, s.d.id);
    for (const missing of ['email', 'preferredColor', 'interestedModelId', 'variant', 'paymentInstrument', 'paymentInstrumentRef', 'customerAddress', 'paymentType', 'paymentAmount']) {
      const body: Record<string, unknown> = conversion(s.modelId);
      delete body[missing];
      const res = await api.post(`/api/sales/leads/${leadId}/convert`).set(bearer(s.sales1.token)).send(body);
      expect(res.status, missing).toBe(422);
    }
    // Before conversion the Admin cannot see the lead at all.
    expect((await api.get(`/api/sales/leads/${leadId}`).set(bearer(s.admin.token))).status).toBe(404);
    expect((await api.get('/api/sales/leads').set(bearer(s.admin.token))).body.total).toBe(0);

    const l = await convert(s.sales1, leadId, s.modelId);
    expect(l).toMatchObject({ status: 'converted', email: 'bilal@example.com', preferredColor: 'Polar White', paymentInstrument: 'pay_order', convertedById: s.sales1.user.id });
    expect(l.customerId).toBeTruthy();
    expect((await api.get(`/api/sales/leads/${leadId}`).set(bearer(s.admin.token))).body.status).toBe('converted');
    // Converted details are fixed.
    expect((await api.patch(`/api/sales/leads/${leadId}`).set(bearer(s.sales1.token)).send({ notes: 'x' })).status).toBe(409);
    expect((await api.post(`/api/sales/leads/${leadId}/convert`).set(bearer(s.sales1.token)).send(conversion(s.modelId))).status).toBe(409);
  });
});

describe('CRO follow-ups', () => {
  it('enforces at least 3 follow-ups before a lead is exhausted', async () => {
    const s = await setup();
    const leadId = await newLead(s.cro, s.d.id, '0345-2223334', { source: 'social' });
    const exhaust = () => api.post(`/api/sales/leads/${leadId}/transitions`).set(bearer(s.cro.token)).send({ action: 'exhaust', comment: 'No response' });
    const followUp = (outcome: string, remarks: string) =>
      api.post(`/api/sales/leads/${leadId}/follow-ups`).set(bearer(s.cro.token)).send({ outcome, remarks });

    expect((await exhaust()).status).toBe(409);
    const f1 = await followUp('interested', 'Asked for the price list');
    expect(f1.status).toBe(201);
    expect(f1.body).toMatchObject({ status: 'follow_up', followUpCount: 1 });
    await followUp('not_interested', 'Budget issue').expect(201);
    const second = await exhaust();
    expect(second.status).toBe(409);
    expect(second.body.error.message).toMatch(/At least 3 follow-ups/);
    await followUp('not_interested', 'Still no').expect(201);
    const done = await exhaust();
    expect(done.status).toBe(200);
    expect(done.body.status).toBe('exhausted');

    const history = await api.get(`/api/sales/leads/${leadId}/follow-ups`).set(bearer(s.cro.token));
    expect(history.body.map((f: { outcome: string }) => f.outcome)).toEqual(['not_interested', 'not_interested', 'interested']);
    // An exhausted lead no longer blocks the phone number.
    expect((await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send(walkIn(s.d.id, '0345-2223334'))).status).toBe(201);
  });

  it('marks an in-person visit as Visited and converts directly', async () => {
    const s = await setup();
    const leadId = await newLead(s.cro, s.d.id, '0345-9998887', { source: 'social' });
    const v = await api.post(`/api/sales/leads/${leadId}/follow-ups`).set(bearer(s.cro.token)).send({ outcome: 'visited', remarks: 'Came for a test drive' });
    expect(v.body).toMatchObject({ status: 'visited', followUpCount: 1 });
    const l = await convert(s.cro, leadId, s.modelId);
    expect(l.status).toBe('converted');
    // Nobody else records follow-ups on the CRO's lead.
    expect((await api.post(`/api/sales/leads/${leadId}/follow-ups`).set(bearer(s.am.token)).send({ outcome: 'interested' })).status).toBe(403);
  });
});

describe('in-person visits', () => {
  it('are recorded by the CRO on social / digital leads; never by a salesperson, never on a walk-in', async () => {
    const s = await setup();
    const social = await newLead(s.cro, s.d.id, '0345-1110001', { source: 'social' });
    const croWalkIn = await newLead(s.cro, s.d.id, '0345-1110002', { source: 'walk_in' });
    const phoneLead = await newLead(s.sales1, s.d.id, '0345-1110003', { source: 'phone' });
    const walkIn = await newLead(s.sales1, s.d.id, '0345-1110004');
    const visit = (who: Login, id: number) => api.post(`/api/sales/leads/${id}/follow-ups`).set(bearer(who.token)).send({ outcome: 'visited' });

    expect((await visit(s.cro, social)).body.status).toBe('visited');
    const walkInRes = await visit(s.cro, croWalkIn);
    expect(walkInRes.status).toBe(422);
    expect(JSON.stringify(walkInRes.body)).toContain('already visited');
    expect((await visit(s.sales1, phoneLead)).status).toBe(403);
    expect((await visit(s.sales1, walkIn)).status).toBe(422);
    // Salespeople still record calls and outcomes on their leads.
    expect((await api.post(`/api/sales/leads/${walkIn}/follow-ups`).set(bearer(s.sales1.token)).send({ outcome: 'interested' })).status).toBe(201);
  });
});

describe('sales orders (Admin)', () => {
  it('CNIC at conversion (checked and corrected by the Admin), a PBO number on every order, and search by PBO', async () => {
    const s = await setup();
    // The salesperson enters the customer's CNIC when converting.
    const first = await newLead(s.sales1, s.d.id, '0300-8100001');
    const noCnic = await api.post(`/api/sales/leads/${first}/convert`).set(bearer(s.sales1.token)).send({ ...conversion(s.modelId), customerCnic: undefined });
    expect(noCnic.status).toBe(422);
    expect(JSON.stringify(noCnic.body)).toContain('customerCnic');
    expect((await api.post(`/api/sales/leads/${first}/convert`).set(bearer(s.sales1.token)).send(conversion(s.modelId, { customerCnic: '12345' }))).status).toBe(422);
    const converted = await api.post(`/api/sales/leads/${first}/convert`).set(bearer(s.sales1.token)).send(conversion(s.modelId, { customerCnic: '14301-5305891-1' }));
    expect(converted.status, JSON.stringify(converted.body)).toBe(200);
    const customerId = converted.body.customerId as number;
    expect((await owner.db.customer.findFirst({ where: { id: customerId }, select: { cnic: true } }))?.cnic).toBe('1430153058911');

    // The Admin raises the order with the PBO number from the head-office system, correcting the CNIC.
    const raise = (leadId: number, body: Record<string, unknown>) =>
      api.post(`/api/sales/leads/${leadId}/order`).set(bearer(s.admin.token)).send({ unitPrice: '9000000', ...body });
    const noPbo = await raise(first, {});
    expect(noPbo.status).toBe(422);
    expect(JSON.stringify(noPbo.body)).toContain('pboNo');
    const ok = await raise(first, { pboNo: 'PBO-11873', customerCnic: '14301-5305891-2' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.pboNo).toBe('PBO-11873');
    expect((await owner.db.customer.findFirst({ where: { id: customerId }, select: { cnic: true } }))?.cnic).toBe('1430153058912');

    // A PBO number is used once per dealership; another customer cannot take this CNIC.
    const second = await newLead(s.sales1, s.d.id, '0300-8100002', { prospectName: 'Other Buyer' });
    await convert(s.sales1, second, s.modelId);
    const samePbo = await raise(second, { pboNo: 'pbo-11873' });
    expect(samePbo.status).toBe(422);
    expect(JSON.stringify(samePbo.body)).toContain('already on sales order');
    const sameCnic = await raise(second, { pboNo: 'PBO-22000', customerCnic: '14301-5305891-2' });
    expect(sameCnic.status).toBe(422);
    expect(JSON.stringify(sameCnic.body)).toContain('belongs to another customer');

    // Leads and orders are found by the PBO number, or just its last digits.
    const ids = (res: { body: { items: { id: number }[] } }) => res.body.items.map((x) => x.id);
    expect(ids(await api.get('/api/sales/orders?q=873').set(bearer(s.admin.token)))).toEqual([ok.body.id]);
    expect(ids(await api.get('/api/sales/leads?q=873&range=all').set(bearer(s.manager.token)))).toEqual([first]);
  });

  it('raises a PBO / CBO from a converted lead; the lead shows Processing to the Salesperson and AM', async () => {
    const s = await setup();
    const leadId = await newLead(s.sales1, s.d.id);
    for (const who of [s.sales1, s.am, s.manager, s.cro]) {
      expect((await api.post(`/api/sales/leads/${leadId}/order`).set(bearer(who.token)).send({ customerCnic: nextCnic(), pboNo: nextPbo(), unitPrice: '1' })).status).toBe(403);
    }
    // Not converted yet: invisible to the Admin.
    expect((await api.post(`/api/sales/leads/${leadId}/order`).set(bearer(s.admin.token)).send({ customerCnic: nextCnic(), pboNo: nextPbo(), unitPrice: '1' })).status).toBe(404);
    await convert(s.sales1, leadId, s.modelId);

    const o = await raiseOrder(s, leadId, { orderType: 'cbo' });
    expect(o).toMatchObject({
      status: 'draft',
      orderType: 'cbo',
      leadId,
      salespersonId: s.sales1.user.id,
      modelId: s.modelId,
      color: 'Polar White',
      paymentReference: 'PO-778812',
      bookingAmount: '500000.00',
      totalAmount: '9400000.00',
      vehicleId: null,
    });
    expect(o.orderNo).toMatch(/^HYD-SO-\d{4}-00001$/);
    for (const who of [s.sales1, s.am]) {
      const l = await api.get(`/api/sales/leads/${leadId}`).set(bearer(who.token));
      expect(l.body).toMatchObject({ status: 'processing', orderNo: o.orderNo });
    }
    expect((await api.post(`/api/sales/leads/${leadId}/order`).set(bearer(s.admin.token)).send({ customerCnic: nextCnic(), pboNo: nextPbo(), unitPrice: '1' })).status).toBe(409);
    // The discount policy still applies.
    const l2 = await newLead(s.sales2, s.d.id, '0300-1231231');
    await convert(s.sales2, l2, s.modelId);
    expect((await api.post(`/api/sales/leads/${l2}/order`).set(bearer(s.admin.token)).send({ customerCnic: nextCnic(), pboNo: nextPbo(), unitPrice: '1000', discount: '900' })).status).toBe(422);
  });

  it('allocates the vehicle by chassis / engine number, pending until entered and editable later', async () => {
    const s = await setup();
    const leadId = await newLead(s.sales1, s.d.id);
    await convert(s.sales1, leadId, s.modelId);
    const o = await raiseOrder(s, leadId);
    expect(o.vehicleId).toBeNull();

    const put = (body: Record<string, unknown>) => api.put(`/api/sales/orders/${o.id}/vehicle`).set(bearer(s.admin.token)).send(body);
    expect((await put({})).status).toBe(422);
    // Both the chassis and the engine number are required.
    const onlyVin = await put({ vin: 'kmhj-381-abc-001' });
    expect(onlyVin.status).toBe(422);
    expect(onlyVin.body.error.details.map((i: { path: string }) => i.path)).toEqual(['engineNo']);
    expect((await put({ engineNo: 'G4FL-123456' })).status).toBe(422);
    const withVin = await put({ vin: 'kmhj-381-abc-001', engineNo: 'G4FL-123456' });
    expect(withVin.status).toBe(200);
    expect(withVin.body).toMatchObject({ vehicleVin: 'KMHJ381ABC001', vehicleEngineNo: 'G4FL123456', vehicleLabel: 'KMHJ381ABC001', vehicleStatus: 'booked' });
    // Once on the car, one of them can be corrected alone.
    const fixEngine = await put({ engineNo: 'G4FL-123457' });
    expect(fixEngine.body).toMatchObject({ vehicleId: withVin.body.vehicleId, vehicleVin: 'KMHJ381ABC001', vehicleEngineNo: 'G4FL123457' });
    // The vehicle is linked to the dealership (visible in its stock later).
    const links = await owner.db.vehicleDealership.findMany({ where: { vehicleId: withVin.body.vehicleId } });
    expect(links.map((x) => x.dealershipId)).toEqual([s.d.id]);

    // Identifiers are unique across the group.
    const l2 = await newLead(s.sales2, s.d.id, '0300-4443332');
    await convert(s.sales2, l2, s.modelId);
    const o2 = await raiseOrder(s, l2);
    const clash = await api.put(`/api/sales/orders/${o2.id}/vehicle`).set(bearer(s.admin.token)).send({ vin: 'KMHJ381ABC001', engineNo: 'OTHERENG01' });
    expect(clash.status).toBe(409);
    // Only the Admin enters it.
    expect((await api.put(`/api/sales/orders/${o2.id}/vehicle`).set(bearer(s.manager.token)).send({ vin: 'X12345' })).status).toBe(403);
  });

  it('links an existing undelivered stock vehicle when its chassis number is entered', async () => {
    const s = await setup();
    const v = await owner.db.vehicle.create({ data: { vin: 'STOCKVIN0001', engineNo: 'ENG0001', modelId: s.modelId } });
    await owner.db.vehicleDealership.create({ data: { vehicleId: v!.id, dealershipId: s.d.id, source: 'manual' } });
    const leadId = await newLead(s.sales1, s.d.id);
    await convert(s.sales1, leadId, s.modelId);
    const o = await raiseOrder(s, leadId);
    // The chassis number alone is enough: the stock car already has its engine number.
    const res = await api.put(`/api/sales/orders/${o.id}/vehicle`).set(bearer(s.admin.token)).send({ vin: 'STOCKVIN0001' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({ vehicleId: v!.id, vehicleEngineNo: 'ENG0001', vehicleStatus: 'booked' });

    // Numbers of two different cars, or a car of another dealership, are refused.
    const elsewhere = await owner.db.vehicle.create({ data: { vin: 'JETSTOCK0001', engineNo: 'JETENG0001', modelId: s.modelId } });
    const jet = await createDealership('JET');
    await owner.db.vehicleDealership.create({ data: { vehicleId: elsewhere!.id, dealershipId: jet.id, source: 'manual' } });
    const l2 = await newLead(s.sales2, s.d.id, '0300-7771112');
    await convert(s.sales2, l2, s.modelId);
    const o2 = await raiseOrder(s, l2);
    expect((await api.put(`/api/sales/orders/${o2.id}/vehicle`).set(bearer(s.admin.token)).send({ vin: 'JETSTOCK0001' })).status).toBe(409);
  });

  it('flows draft -> submitted -> approved with the Manager approving; cancelling returns the lead to converted', async () => {
    const s = await setup();
    const leadId = await newLead(s.sales1, s.d.id);
    await convert(s.sales1, leadId, s.modelId);
    const o = await raiseOrder(s, leadId);
    const url = `/api/sales/orders/${o.id}/transitions`;
    await api.post(url).set(bearer(s.admin.token)).send({ action: 'submit' }).expect(200);
    expect((await api.post(url).set(bearer(s.admin.token)).send({ action: 'approve' })).status).toBe(403);
    expect((await api.post(url).set(bearer(s.manager.token)).send({ action: 'approve' })).body.status).toBe('approved');
    await api.post(url).set(bearer(s.admin.token)).send({ action: 'cancel', comment: 'Customer withdrew' }).expect(200);
    expect((await api.get(`/api/sales/leads/${leadId}`).set(bearer(s.sales1.token))).body.status).toBe('converted');
    // A new order can then be raised for it.
    await raiseOrder(s, leadId);
  });
});

describe('delivery (hand-over)', () => {
  it('completes the order: lead completed, owner recorded, vehicle activated, event published', async () => {
    const s = await setup();
    const { leadId, orderId } = await approvedOrder(s);
    const deliveryId = await deliver(s, orderId);
    const today = pakistanToday();

    const order = await api.get(`/api/sales/orders/${orderId}`).set(bearer(s.manager.token));
    expect(order.body.status).toBe('delivered');
    expect((await api.get(`/api/sales/leads/${leadId}`).set(bearer(s.am.token))).body.status).toBe('completed');
    const [veh] = await owner.db.vehicle.findMany({ where: { id: order.body.vehicleId } });
    expect(veh).toMatchObject({ activatedOn: today, soldByDealershipId: s.d.id, status: 'delivered' });
    const [own] = await owner.db.vehicleOwnership.findMany({ where: { vehicleId: veh!.id } });
    expect(own).toMatchObject({ customerId: order.body.customerId, startDate: today });
    const [event] = await owner.db.domainEvent.findMany({ where: { aggregateId: veh!.id } });
    expect(event).toMatchObject({ type: 'vehicle.activated', dealershipId: s.d.id });
    expect(event!.payload).toMatchObject({ salesOrderId: orderId, deliveryId });
  });

  it('requires the customer acknowledgement and rolls everything back if a subscriber fails', async () => {
    const s = await setup();
    const { leadId, orderId } = await approvedOrder(s);
    const today = pakistanToday();
    await carArrived(orderId);
    const d = await api.post(`/api/sales/orders/${orderId}/deliveries`).set(bearer(s.desk.token)).send({ scheduledDate: today });
    await clearForDelivery();
    const complete = (body: Record<string, unknown>) => api.post(`/api/sales/deliveries/${d.body.id}/complete`).set(bearer(s.desk.token)).send(body);
    expect((await complete({ odometerKm: 3, customerAcknowledged: false })).status).toBe(422);
    failActivation = true;
    try {
      expect((await complete({ odometerKm: 3, checklist: ['pdi_done', 'documents_ready', 'accessories_fitted'], customerAcknowledged: true })).status).toBe(500);
    } finally {
      failActivation = false;
    }
    expect((await api.get(`/api/sales/orders/${orderId}`).set(bearer(s.manager.token))).body.status).toBe('approved');
    expect((await api.get(`/api/sales/leads/${leadId}`).set(bearer(s.am.token))).body.status).toBe('processing');
  });
});

describe('Sales Manager team report', () => {
  it('reports per person, daily walk-ins, orders raised / completed and how many salespeople produced an order', async () => {
    const s = await setup();
    const { orderId } = await approvedOrder(s, '0300-1000001', 'VINREPORT0001');
    await deliver(s, orderId);
    await newLead(s.sales1, s.d.id, '0300-1000002');
    await newLead(s.sales2, s.d.id, '0300-1000003', { source: 'phone' });
    const croLead = await newLead(s.cro, s.d.id, '0300-1000004', { source: 'social' });
    await api.post(`/api/sales/leads/${croLead}/follow-ups`).set(bearer(s.cro.token)).send({ outcome: 'interested' }).expect(201);

    const res = await api.get(`/api/sales/team/report?dealershipId=${s.d.id}`).set(bearer(s.manager.token));
    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({ leads: 4, walkIns: 2, converted: 1, ordersRaised: 1, ordersCompleted: 1, salespeopleWithOrders: 1 });
    const byId = new Map(res.body.members.map((m: { userId: number }) => [m.userId, m]));
    expect(byId.get(s.sales1.user.id)).toMatchObject({ roles: 'Salesperson', leads: 2, walkIns: 2, converted: 1, ordersRaised: 1, ordersCompleted: 1 });
    expect(byId.get(s.sales2.user.id)).toMatchObject({ leads: 1, walkIns: 0, ordersRaised: 0 });
    expect(byId.get(s.cro.user.id)).toMatchObject({ roles: 'CRO', leads: 1, followUps: 1 });
    // Team leaders are listed only with work of their own in the period.
    expect(byId.has(s.am.user.id)).toBe(false);
    expect(byId.has(s.manager.user.id)).toBe(false);
    expect(byId.has(s.admin.user.id)).toBe(false);
    await newLead(s.am, s.d.id, '0300-1000005');
    const withAm = await api.get(`/api/sales/team/report?dealershipId=${s.d.id}`).set(bearer(s.manager.token));
    expect(withAm.body.members.find((m: { userId: number }) => m.userId === s.am.user.id)).toMatchObject({ roles: 'Assistant Manager', leads: 1 });
    expect(res.body.daily).toHaveLength(30);
    expect(res.body.daily[0]).toMatchObject({ walkIns: 2, leads: 4 });

    // The Assistant Manager oversees records, not the department report.
    expect((await api.get(`/api/sales/team/report?dealershipId=${s.d.id}`).set(bearer(s.am.token))).status).toBe(403);
    expect((await api.get(`/api/sales/team/members?dealershipId=${s.d.id}`).set(bearer(s.am.token))).status).toBe(200);
  });
});

// =============================================================================
// Access matrix (every role is scoped to one dealership)
// =============================================================================
describe('access matrix', () => {
  it('grants each role exactly its column', async () => {
    const s = await setup();
    const own = await newLead(s.sales1, s.d.id, '0300-2000001');
    const croLead = await newLead(s.cro, s.d.id, '0300-2000002', { source: 'social' });
    const converted = await newLead(s.sales2, s.d.id, '0300-2000003');
    await convert(s.sales2, converted, s.modelId);
    const o = await raiseOrder(s, converted);
    const all = [own, croLead, converted].sort();

    const leadsOf = async (who: Login) => ids(await api.get('/api/sales/leads').set(bearer(who.token)));
    expect(await leadsOf(s.sales1)).toEqual([own]);
    expect(await leadsOf(s.cro)).toEqual([croLead]);
    expect(await leadsOf(s.am)).toEqual(all);
    expect(await leadsOf(s.manager)).toEqual(all);
    expect(await leadsOf(s.admin)).toEqual([converted]); // post-conversion only

    // Logging leads: Salesperson, CRO and the team leaders (AM, Manager, for themselves or a
    // salesperson); not the Sales Admin.
    expect((await api.post('/api/sales/leads').set(bearer(s.admin.token)).send(walkIn(s.d.id, '0300-2999999'))).status).toBe(403);
    expect((await api.post('/api/sales/leads').set(bearer(s.am.token)).send(walkIn(s.d.id, '0300-2999998'))).status).toBe(201);
    expect((await api.post('/api/sales/leads').set(bearer(s.manager.token)).send(walkIn(s.d.id, '0300-2999997'))).status).toBe(201);
    // Orders: the Admin creates; the Manager and the Assistant Manager see all (to follow the car and
    // schedule the delivery); Salesperson and CRO have no order screens.
    const orderList = (who: Login) => api.get('/api/sales/orders').set(bearer(who.token));
    expect((await orderList(s.admin)).body.total).toBe(1);
    expect((await orderList(s.manager)).body.total).toBe(1);
    expect((await orderList(s.am)).body.total).toBe(1);
    for (const who of [s.sales1, s.cro]) expect((await orderList(who)).status).toBe(403);
    const direct = { dealershipId: s.d.id, customerId: o.customerId, modelId: s.modelId, unitPrice: '100' };
    for (const who of [s.manager, s.am, s.sales1, s.cro]) {
      expect((await api.post('/api/sales/orders').set(bearer(who.token)).send(direct)).status).toBe(403);
    }
    // Team report: Manager only.
    for (const who of [s.sales1, s.cro, s.am, s.admin]) {
      expect((await api.get(`/api/sales/team/report?dealershipId=${s.d.id}`).set(bearer(who.token))).status).toBe(403);
    }
    // None of them reach other modules.
    for (const who of [s.sales1, s.cro, s.am, s.manager, s.admin]) {
      expect((await api.get('/api/service/visits').set(bearer(who.token))).status).toBe(403);
    }
  });
});

describe('dealership isolation (Hyundai, Jetour, CSM)', () => {
  it('confines every role to its own dealership', async () => {
    const model = await owner.db.vehicleModel.create({ data: { brand: 'Any', name: 'Model' } });
    const modelId = model!.id;
    const teams = [await team('HYD'), await team('JET'), await team('CSM')];
    const data = new Map<number, { leads: number[]; order: number }>();
    for (const [i, t] of teams.entries()) {
      const a = await newLead(t.sales1, t.d.id, `0300-300000${i}`);
      const b = await newLead(t.cro, t.d.id, `0300-310000${i}`, { source: 'social' });
      await convert(t.sales1, a, modelId);
      const o = await api.post(`/api/sales/leads/${a}/order`).set(bearer(t.admin.token)).send({ customerCnic: nextCnic(), pboNo: nextPbo(), unitPrice: '100' });
      expect(o.status).toBe(201);
      data.set(t.d.id, { leads: [a, b], order: o.body.id });
    }

    for (const t of teams) {
      const mine = data.get(t.d.id)!;
      for (const [roleKey, who] of Object.entries({ manager: t.manager, am: t.am, cro: t.cro, admin: t.admin, sales1: t.sales1, sales2: t.sales2 })) {
        const list = await api.get('/api/sales/leads?pageSize=100').set(bearer(who.token));
        for (const x of list.body.items as { dealershipId: number }[]) expect(x.dealershipId, `${roleKey}@${t.d.code}`).toBe(t.d.id);
        for (const other of teams.filter((o) => o.d.id !== t.d.id)) {
          const theirs = data.get(other.d.id)!;
          for (const leadId of theirs.leads) {
            expect((await api.get(`/api/sales/leads/${leadId}`).set(bearer(who.token))).status, `${roleKey}@${t.d.code}`).toBe(404);
          }
          // Cannot log leads or raise orders there either.
          expect((await api.post('/api/sales/leads').set(bearer(who.token)).send(walkIn(other.d.id, '0300-3999999'))).status).toBe(403);
          const orderRes = await api.get(`/api/sales/orders/${theirs.order}`).set(bearer(who.token));
          expect([403, 404], `${roleKey}@${t.d.code}`).toContain(orderRes.status);
          const report = await api.get(`/api/sales/team/report?dealershipId=${other.d.id}`).set(bearer(who.token));
          expect(report.status).toBe(403);
        }
      }
      // Scope within the dealership still holds.
      expect(ids(await api.get('/api/sales/leads').set(bearer(t.manager.token)))).toEqual([...mine.leads].sort());
      expect((await api.get('/api/sales/orders').set(bearer(t.admin.token))).body.items.map((x: { id: number }) => x.id)).toEqual([mine.order]);
    }
  });
});

describe('Convert to Lead: correcting the customer while converting', () => {
  it("updates the name and phone on the lead and the new customer; a phone that is another open lead's is refused", async () => {
    const s = await setup();
    const leadId = await newLead(s.sales1, s.d.id, '0300-8000001');
    await newLead(s.sales2, s.d.id, '0300-8000002');
    const taken = await api.post(`/api/sales/leads/${leadId}/convert`).set(bearer(s.sales1.token)).send(conversion(s.modelId, { prospectMobile: '0300-8000002' }));
    expect(taken.status).toBe(409);

    const l = await api
      .post(`/api/sales/leads/${leadId}/convert`)
      .set(bearer(s.sales1.token))
      .send(conversion(s.modelId, { prospectName: 'Bilal Ahmed Khan', prospectMobile: '03008000009' }));
    expect(l.status, JSON.stringify(l.body)).toBe(200);
    expect(l.body).toMatchObject({ status: 'converted', prospectName: 'Bilal Ahmed Khan', prospectMobile: '03008000009', variant: '2.0 GLS' });
    const [c] = await owner.db.customer.findMany({ where: { id: l.body.customerId } });
    expect(c).toMatchObject({ fullName: 'Bilal Ahmed Khan', mobileNormalized: '+923008000009' });
  });
});

describe('leads summary above the list', () => {
  it('counts by status within your own scope and the list filters (period, salesperson, source)', async () => {
    const s = await setup();
    const a = await newLead(s.sales1, s.d.id, '0300-7000001');
    await newLead(s.sales1, s.d.id, '0300-7000002', { source: 'social' });
    const old = await newLead(s.sales2, s.d.id, '0300-7000003');
    await convert(s.sales1, a, s.modelId);
    // An old lead: last touched 40 days ago.
    await owner.raw(`update sales.lead set updated_at = now() - interval '40 days' where id = $1`, [old]);

    const summary = (who: Login, query = '') => api.get(`/api/sales/leads/summary${query}`).set(bearer(who.token));
    const today = pakistanToday();
    const from30 = pakistanToday(-29);
    expect((await summary(s.manager)).body).toEqual({ total: 3, byStatus: { new: 2, converted: 1 } });
    expect((await summary(s.manager, `?activityFrom=${from30}&activityTo=${today}`)).body).toEqual({ total: 2, byStatus: { new: 1, converted: 1 } });
    expect((await summary(s.manager, `?ownerId=${s.sales1.user.id}`)).body.total).toBe(2);
    expect((await summary(s.manager, '?source=social')).body.total).toBe(1);
    // A salesperson counts only their own, and cannot ask for someone else's.
    expect((await summary(s.sales2)).body.total).toBe(1);
    expect((await summary(s.sales2, `?ownerId=${s.sales1.user.id}`)).status).toBe(403);
    expect((await summary(s.manager, `?activityFrom=${today}&activityTo=${from30}`)).status).toBe(422);
  });
});

describe('Appointments and reassigning', () => {
  it('the salesperson, AM and Manager set appointments; everyone following the lead is reminded on the day', async () => {
    const s = await setup();
    const lead = (await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send(walkIn(s.d.id, '0300-7300001'))).body;
    const appoint = (who: Login, at: string | null, note?: string) =>
      api.put(`/api/sales/leads/${lead.id}/appointment`).set(bearer(who.token)).send({ appointmentAt: at, note });
    const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

    // Not another salesperson, not in the past.
    expect((await appoint(s.sales2, inHours(2))).status).toBe(404);
    expect((await appoint(s.sales1, inHours(-3))).status).toBe(422);
    const set = await appoint(s.sales1, inHours(48), 'Test drive');
    expect(set.status, JSON.stringify(set.body)).toBe(200);
    expect(set.body).toMatchObject({ appointmentNote: 'Test drive', appointmentSetById: s.sales1.user.id, appointmentSetByName: s.sales1.user.fullName });
    // The Assistant Manager moves it to later today (still in the future).
    const later = new Date(Math.min(Date.now() + 60_000 * 5, Date.parse(`${pakistanToday()}T23:59:00+05:00`))).toISOString();
    expect((await appoint(s.am, later, 'Showroom visit')).status).toBe(200);

    // Today's reminder: the salesperson, the AM and the Manager; once.
    const { sendAppointmentReminders } = await import('../src/modules/sales/services/appointmentReminders');
    expect(await sendAppointmentReminders()).toBeGreaterThanOrEqual(1);
    const reminders = async (who: Login) =>
      ((await api.get('/api/notifications').set(bearer(who.token))).body.items as { title: string; href: string }[]).filter((n) => n.title === 'Customer appointment today');
    for (const who of [s.sales1, s.am, s.manager]) expect(await reminders(who)).toEqual([expect.objectContaining({ href: `/sales/leads/${lead.id}` })]);
    expect(await reminders(s.sales2)).toEqual([]);
    await sendAppointmentReminders();
    expect(await reminders(s.manager)).toHaveLength(1);

    // "Action needed" and the leads list (appointments today).
    const items = (await api.get('/api/sales/dashboard/actions').set(bearer(s.manager.token))).body as { key: string; count: number }[];
    expect(items.find((i) => i.key === 'appointments-today')?.count).toBe(1);
    const today = (await api.get(`/api/sales/leads?appointmentOn=${pakistanToday()}`).set(bearer(s.manager.token))).body;
    expect(today.items.map((l: { id: number }) => l.id)).toEqual([lead.id]);

    // Cancelled.
    expect((await appoint(s.manager, null)).body).toMatchObject({ appointmentAt: null, appointmentNote: null });
  });

  it('the Assistant Manager and the Manager reassign a lead (with its quotations) to another salesperson', async () => {
    const s = await setup();
    const lead = (await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send(walkIn(s.d.id, '0300-7300002'))).body;
    const reassign = (who: Login, ownerId: number) => api.post(`/api/sales/leads/${lead.id}/reassign`).set(bearer(who.token)).send({ ownerId, note: 'On leave' });

    expect((await reassign(s.sales1, s.sales2.user.id)).status).toBe(403);
    expect((await reassign(s.am, s.sales1.user.id)).status).toBe(422); // already theirs
    expect((await reassign(s.am, s.admin.user.id)).status).toBe(422); // not in the sales team
    const moved = await reassign(s.am, s.sales2.user.id);
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body).toMatchObject({ ownerId: s.sales2.user.id, ownerName: s.sales2.user.fullName });
    expect((await api.get(`/api/sales/leads/${lead.id}`).set(bearer(s.sales2.token))).status).toBe(200);
    expect((await api.get(`/api/sales/leads/${lead.id}`).set(bearer(s.sales1.token))).status).toBe(404);
    // The new salesperson is notified.
    const titles = ((await api.get('/api/notifications').set(bearer(s.sales2.token))).body.items as { title: string }[]).map((n) => n.title);
    expect(titles).toContain('Lead reassigned');
    // The Manager gives it back.
    expect((await reassign(s.manager, s.sales1.user.id)).body.ownerId).toBe(s.sales1.user.id);
  });
});
