import { describe, expect, it } from 'vitest';
import { pakistanToday } from '../src/lib/dates';
import { api, bearer, createDealership, createUser, owner, roleByName, useTestDb, nextCnic, nextPbo, PPF_CUSTOMER, clearForDelivery } from './helpers';

useTestDb();

type Login = Awaited<ReturnType<typeof createUser>>;

async function staff(roleName: string, dealershipId: number): Promise<Login> {
  const u = await createUser();
  await owner.db.userRole.create({ data: { userId: u.user.id, roleId: await roleByName(roleName), dealershipId } });
  return u;
}

async function team(code: string) {
  const d = await createDealership(code);
  return {
    d,
    manager: await staff('Sales Manager', d.id),
    am: await staff('Assistant Manager', d.id),
    admin: await staff('Sales Admin', d.id),
    sales1: await staff('Salesperson', d.id),
    delivery: await staff('Delivery Team', d.id),
  };
}

async function setup() {
  const t = await team('HYD');
  const model = await owner.db.vehicleModel.create({ data: { brand: 'Hyundai', name: 'Tucson' } });
  const other = await owner.db.vehicleModel.create({ data: { brand: 'Hyundai', name: 'Elantra' } });
  return { ...t, modelId: model!.id, otherModelId: other!.id };
}
type Setup = Awaited<ReturnType<typeof setup>>;

const intake = (s: { d: { id: number } }, modelId: number, vin: string, over: Record<string, unknown> = {}) => ({
  dealershipId: s.d.id,
  modelId,
  vin,
  engineNo: `E${vin.slice(-8)}`,
  color: 'White',
  modelYear: 2026,
  ...over,
});

async function receive(s: Setup, vin: string, modelId = s.modelId) {
  const res = await api.post('/api/sales/stock').set(bearer(s.delivery.token)).send(intake(s, modelId, vin));
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.id as number;
}

/** A lead converted by the salesperson, ordered by the Admin and approved by the Manager (no vehicle yet). */
async function approvedOrder(s: Setup, mobile = '0300-5556667') {
  const o = await bookedOrder(s, mobile);
  await api.post(`/api/sales/orders/${o.orderId}/transitions`).set(bearer(s.manager.token)).send({ action: 'approve' }).expect(200);
  return o;
}

/** As approvedOrder, but only submitted: booked, waiting for the Manager's approval. */
async function bookedOrder(s: Setup, mobile = '0300-5556667') {
  const l = await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send({ dealershipId: s.d.id, prospectName: 'Ayesha Khan', prospectMobile: mobile, interestedModelId: s.modelId, variant: '2.0 GLS' });
  await api
    .post(`/api/sales/leads/${l.body.id}/convert`)
    .set(bearer(s.sales1.token))
    .send({ interestedModelId: s.modelId, variant: '2.0 GLS', preferredColor: 'White', email: 'a@example.com', paymentInstrument: 'pay_order', customerCnic: nextCnic(), paymentInstrumentRef: 'PO-1' })
    .expect(200);
  const o = await api.post(`/api/sales/leads/${l.body.id}/order`).set(bearer(s.admin.token)).send({ customerCnic: nextCnic(), pboNo: nextPbo(), unitPrice: '9000000' });
  await api.post(`/api/sales/orders/${o.body.id}/transitions`).set(bearer(s.admin.token)).send({ action: 'submit' }).expect(200);
  return { leadId: l.body.id as number, orderId: o.body.id as number };
}

describe('Delivery workflow: approved → in transit → received → scheduled → delivered', () => {
  it('in transit after approval (Sales Admin / AM / Manager too), received by the Delivery Team only, delivery scheduled once received', async () => {
    const s = await setup();
    const v = await receive(s, 'WFLOWVIN001');
    const { leadId, orderId } = await bookedOrder(s);
    await api.put(`/api/sales/orders/${orderId}/allocation`).set(bearer(s.delivery.token)).send({ vehicleId: v }).expect(200);
    const move = (who: Login, status: string) => api.patch(`/api/sales/orders/${orderId}/vehicle-status`).set(bearer(who.token)).send({ status });

    // Not before the Manager's approval, not even by the Delivery Team.
    for (const who of [s.admin, s.delivery]) {
      const early = await move(who, 'in_transit');
      expect(early.status).toBe(409);
      expect(early.body.error.message).toContain('approve');
    }
    await api.post(`/api/sales/orders/${orderId}/transitions`).set(bearer(s.manager.token)).send({ action: 'approve' }).expect(200);

    // The Assistant Manager follows orders now; the salesperson cannot move the car.
    expect((await api.get(`/api/sales/orders/${orderId}`).set(bearer(s.am.token))).status).toBe(200);
    expect((await move(s.sales1, 'in_transit')).status).toBe(403);
    const dispatched = await move(s.admin, 'in_transit');
    expect(dispatched.status, JSON.stringify(dispatched.body)).toBe(200);
    expect(dispatched.body.vehicleStatus).toBe('in_transit');
    // Everyone linked to the car is told: the salesperson on their lead (no order screens), the
    // Delivery Team on the order.
    const latest = async (who: Login) => (await api.get('/api/notifications').set(bearer(who.token))).body.items[0];
    expect(await latest(s.sales1)).toMatchObject({ title: 'Car in transit', href: `/sales/leads/${leadId}` });
    expect(await latest(s.delivery)).toMatchObject({ title: 'Car in transit', href: `/sales/orders/${orderId}` });

    // Received: the Delivery Team only. Scheduling waits for it.
    for (const who of [s.admin, s.am, s.manager]) expect((await move(who, 'received')).status).toBe(403);
    const schedule = (who: Login) => api.post(`/api/sales/orders/${orderId}/deliveries`).set(bearer(who.token)).send({ scheduledDate: pakistanToday() });
    const tooEarly = await schedule(s.am);
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.error.message).toContain('received');
    expect((await move(s.delivery, 'received')).body.vehicleStatus).toBe('received');

    // The Assistant Manager schedules; the car is then ready for delivery and the Delivery Team sees the date.
    const d = await schedule(s.am);
    expect(d.status, JSON.stringify(d.body)).toBe(201);
    expect((await api.get(`/api/sales/orders/${orderId}`).set(bearer(s.manager.token))).body.vehicleStatus).toBe('ready_for_delivery');
    const listed = await api.get('/api/sales/deliveries?pageSize=50').set(bearer(s.delivery.token));
    expect(listed.body.items.find((x: { id: number }) => x.id === d.body.id)).toMatchObject({ status: 'scheduled', scheduledDate: pakistanToday() });

    // The Deliveries page: the order is under "Scheduled"; the salesperson sees their customer's car.
    const pipeline = (who: Login, stage: string) => api.get(`/api/sales/delivery-pipeline?stage=${stage}`).set(bearer(who.token));
    const staffView = await pipeline(s.delivery, 'scheduled');
    expect(staffView.body.counts).toMatchObject({ scheduled: 1, waiting: 0 });
    expect(staffView.body.items.map((r: { orderId: number }) => r.orderId)).toEqual([orderId]);
    expect((await pipeline(s.sales1, 'scheduled')).body.items.map((r: { leadId: number }) => r.leadId)).toEqual([leadId]);

    // Delivered: the Delivery Team, with every item of the pre-delivery checklist ticked.
    await clearForDelivery();
    const complete = (checklist: string[]) =>
      api
        .post(`/api/sales/deliveries/${d.body.id}/complete`)
        .set(bearer(s.delivery.token))
        .send({ odometerKm: 5, documentsHandedOver: ['invoice'], accessoriesHandedOver: [], checklist, customerAcknowledged: true });
    expect((await complete(['pdi_done', 'documents_ready'])).status).toBe(422);
    const done = await complete(['pdi_done', 'documents_ready', 'accessories_fitted']);
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body).toMatchObject({ status: 'delivered', checklist: ['pdi_done', 'documents_ready', 'accessories_fitted'] });
    expect((await pipeline(s.delivery, 'delivered')).body.counts.delivered).toBe(1);
  });
});

describe('open stock', () => {
  it('the Delivery Team registers incoming vehicles; chassis numbers are unique across the group', async () => {
    const s = await setup();
    const res = await api.post('/api/sales/stock').set(bearer(s.delivery.token)).send(intake(s, s.modelId, 'kmh-j381-000001'));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ vin: 'KMHJ381000001', status: 'available', modelName: 'Hyundai Tucson', dealershipId: s.d.id, orderId: null });
    // The chassis number is required; duplicates are rejected, even from another dealership.
    expect((await api.post('/api/sales/stock').set(bearer(s.delivery.token)).send({ dealershipId: s.d.id, modelId: s.modelId })).status).toBe(422);
    const jet = await team('JET');
    expect((await api.post('/api/sales/stock').set(bearer(jet.delivery.token)).send(intake(jet, s.modelId, 'KMHJ381000001'))).status).toBe(409);
    // Only the Delivery Team registers stock.
    for (const who of [s.manager, s.admin, s.am, s.sales1]) {
      expect((await api.post('/api/sales/stock').set(bearer(who.token)).send(intake(s, s.modelId, 'NEWVIN0001'))).status).toBe(403);
    }
  });

  it('is visible to the Delivery Team, Admin and Manager of the dealership only; filters by free / allocated', async () => {
    const s = await setup();
    const jet = await team('JET');
    const free = await receive(s, 'FREEVIN0001');
    await receive(s, 'OTHERMODEL01', s.otherModelId);
    await api.post('/api/sales/stock').set(bearer(jet.delivery.token)).send(intake(jet, s.modelId, 'JETOURVIN001')).expect(201);

    for (const who of [s.delivery, s.admin, s.manager]) {
      const list = await api.get('/api/sales/stock').set(bearer(who.token));
      expect(list.status).toBe(200);
      expect(list.body.items.map((v: { vin: string }) => v.vin).sort()).toEqual(['FREEVIN0001', 'OTHERMODEL01']);
    }
    for (const who of [s.sales1, s.am]) expect((await api.get('/api/sales/stock').set(bearer(who.token))).status).toBe(403);
    expect((await api.get(`/api/sales/stock/${free}`).set(bearer(jet.delivery.token))).status).toBe(404);

    const { orderId } = await approvedOrder(s);
    await api.put(`/api/sales/orders/${orderId}/allocation`).set(bearer(s.delivery.token)).send({ vehicleId: free }).expect(200);
    const allocated = await api.get('/api/sales/stock?allocated=true').set(bearer(s.delivery.token));
    expect(allocated.body.items).toHaveLength(1);
    expect(allocated.body.items[0]).toMatchObject({ id: free, status: 'booked', orderId, customerName: 'Ayesha Khan' });
    expect((await api.get('/api/sales/stock?allocated=false').set(bearer(s.delivery.token))).body.items.map((v: { vin: string }) => v.vin)).toEqual(['OTHERMODEL01']);
  });

  it('corrects stock details, but not the model of a vehicle on an order', async () => {
    const s = await setup();
    const v = await receive(s, 'EDITVIN0001');
    const fix = await api.patch(`/api/sales/stock/${v}`).set(bearer(s.delivery.token)).send({ color: 'Phantom Black', engineNo: 'g4fl-9999' });
    expect(fix.body).toMatchObject({ color: 'Phantom Black', engineNo: 'G4FL9999' });
    expect((await api.patch(`/api/sales/stock/${v}`).set(bearer(s.admin.token)).send({ color: 'Red' })).status).toBe(403);
    const { orderId } = await approvedOrder(s);
    await api.put(`/api/sales/orders/${orderId}/allocation`).set(bearer(s.delivery.token)).send({ vehicleId: v }).expect(200);
    expect((await api.patch(`/api/sales/stock/${v}`).set(bearer(s.delivery.token)).send({ modelId: s.otherModelId })).status).toBe(409);
  });
});

describe('Delivery Team: allocation, logistics and hand-over', () => {
  it('allocates stock to an approved order, moves it to ready, and hands it over', async () => {
    const s = await setup();
    const v = await receive(s, 'FLOWVIN0001');
    const { leadId, orderId } = await approvedOrder(s);

    // The queue: approved orders still waiting for a vehicle.
    const queue = await api.get('/api/sales/orders?status=approved&hasVehicle=false').set(bearer(s.delivery.token));
    expect(queue.body.items.map((o: { id: number }) => o.id)).toEqual([orderId]);

    const options = await api.get(`/api/sales/orders/${orderId}/allocatable-vehicles`).set(bearer(s.delivery.token));
    expect(options.body.map((x: { id: number }) => x.id)).toEqual([v]);
    await api.put(`/api/sales/orders/${orderId}/allocation`).set(bearer(s.delivery.token)).send({ vehicleId: v }).expect(200);
    for (const step of ['in_transit', 'received', 'ready_for_delivery']) {
      const r = await api.patch(`/api/sales/orders/${orderId}/vehicle-status`).set(bearer(s.delivery.token)).send({ status: step });
      expect(r.body.vehicleStatus).toBe(step);
    }
    // The Manager and Admin see the vehicle's progress on the order.
    expect((await api.get(`/api/sales/orders/${orderId}`).set(bearer(s.manager.token))).body.vehicleStatus).toBe('ready_for_delivery');

    // Pakistan calendar day: between midnight and 5 AM the UTC date is still yesterday.
    const today = pakistanToday();
    const d = await api.post(`/api/sales/orders/${orderId}/deliveries`).set(bearer(s.delivery.token)).send({ scheduledDate: today });
    expect(d.status).toBe(201);
    await clearForDelivery();
    const done = await api
      .post(`/api/sales/deliveries/${d.body.id}/complete`)
      .set(bearer(s.delivery.token))
      .send({ odometerKm: 8, documentsHandedOver: ['invoice', 'warranty_card'], accessoriesHandedOver: ['Floor mats'], checklist: ['pdi_done', 'documents_ready', 'accessories_fitted'], customerAcknowledged: true });
    expect(done.status).toBe(200);
    // Delivered today (Pakistan), whatever the hour.
    expect(done.body).toMatchObject({ status: 'delivered', deliveredOn: today });

    expect((await api.get(`/api/sales/leads/${leadId}`).set(bearer(s.sales1.token))).body.status).toBe('completed');
    const [veh] = await owner.db.vehicle.findMany({ where: { id: v } });
    expect(veh).toMatchObject({ status: 'delivered', activatedOn: today });
    // Delivered vehicles leave the open stock.
    expect((await api.get(`/api/sales/stock/${v}`).set(bearer(s.delivery.token))).status).toBe(404);
  });

  it('can complete the chassis / engine number on an order', async () => {
    const s = await setup();
    const { orderId } = await approvedOrder(s);
    const r = await api.put(`/api/sales/orders/${orderId}/vehicle`).set(bearer(s.delivery.token)).send({ vin: 'LATEVIN0001', engineNo: 'ENG0001' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ vehicleVin: 'LATEVIN0001', vehicleEngineNo: 'ENG0001' });
  });

  it('has no access to leads, order creation or approval, and none at another dealership', async () => {
    const s = await setup();
    const jet = await team('JET');
    const { leadId, orderId } = await approvedOrder(s);
    expect((await api.get('/api/sales/leads').set(bearer(s.delivery.token))).status).toBe(403);
    expect((await api.get(`/api/sales/leads/${leadId}`).set(bearer(s.delivery.token))).status).toBe(403);
    expect((await api.post(`/api/sales/leads/${leadId}/order`).set(bearer(s.delivery.token)).send({ customerCnic: nextCnic(), pboNo: nextPbo(), unitPrice: '1' })).status).toBe(403);
    expect((await api.post(`/api/sales/orders/${orderId}/transitions`).set(bearer(s.delivery.token)).send({ action: 'cancel', comment: 'x' })).status).toBe(403);
    expect((await api.get(`/api/sales/orders/${orderId}`).set(bearer(jet.delivery.token))).status).toBe(404);
    expect((await api.put(`/api/sales/orders/${orderId}/vehicle`).set(bearer(jet.delivery.token)).send({ vin: 'X12345' })).status).toBe(404);
    // Sales roles do not move stock: the salesperson not at all; the Admin and Manager only mark an
    // approved order's car in transit (the rest is the Delivery Team's).
    expect((await api.patch(`/api/sales/orders/${orderId}/vehicle-status`).set(bearer(s.sales1.token)).send({ status: 'in_transit' })).status).toBe(403);
    for (const who of [s.admin, s.manager]) {
      expect((await api.patch(`/api/sales/orders/${orderId}/vehicle-status`).set(bearer(who.token)).send({ status: 'received' })).status).toBe(403);
    }
  });
});

describe('Delivery Team: from booking to the car arriving', () => {
  it('sees booked orders, registers the arriving car for its order (received), and the salesperson sees the stage', async () => {
    const s = await setup();
    // Booked: the Admin raised the order; the Manager has not approved it yet.
    const l = await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send({ dealershipId: s.d.id, prospectName: 'Bilal', prospectMobile: '0300-5557771', interestedModelId: s.modelId });
    await api
      .post(`/api/sales/leads/${l.body.id}/convert`)
      .set(bearer(s.sales1.token))
      .send({ interestedModelId: s.modelId, variant: '2.0 GLS', preferredColor: 'White', email: 'b@example.com', paymentInstrument: 'pay_order', customerCnic: nextCnic(), paymentInstrumentRef: 'PO-2' })
      .expect(200);
    const o = (await api.post(`/api/sales/leads/${l.body.id}/order`).set(bearer(s.admin.token)).send({ customerCnic: nextCnic(), pboNo: nextPbo(), unitPrice: '9000000' })).body;
    expect(o.status).toBe('draft');

    // The queue: booked orders waiting for a car.
    const queue = await api.get('/api/sales/orders?live=true&hasVehicle=false').set(bearer(s.delivery.token));
    expect(queue.body.items.map((x: { id: number }) => x.id)).toEqual([o.id]);

    // The car arrives: registered for that order, it is linked and received in one step.
    const wrongModel = await api.post('/api/sales/stock').set(bearer(s.delivery.token)).send(intake(s, s.otherModelId, 'ARRIVE00001', { orderId: o.id }));
    expect(wrongModel.status).toBe(422);
    const car = await api.post('/api/sales/stock').set(bearer(s.delivery.token)).send(intake(s, s.modelId, 'ARRIVE00002', { orderId: o.id }));
    expect(car.status, JSON.stringify(car.body)).toBe(201);
    expect(car.body).toMatchObject({ status: 'received', orderId: o.id });
    expect((await api.get('/api/sales/orders?live=true&hasVehicle=false').set(bearer(s.delivery.token))).body.items).toHaveLength(0);
    // A second car cannot take the same order.
    expect((await api.post('/api/sales/stock').set(bearer(s.delivery.token)).send(intake(s, s.modelId, 'ARRIVE00003', { orderId: o.id }))).status).toBe(422);

    // Tracked before approval; handed over only after.
    await api.patch(`/api/sales/orders/${o.id}/vehicle-status`).set(bearer(s.delivery.token)).send({ status: 'ready_for_delivery' }).expect(200);
    expect((await api.post(`/api/sales/orders/${o.id}/deliveries`).set(bearer(s.delivery.token)).send({ scheduledDate: pakistanToday() })).status).toBe(409);

    // The salesperson sees where the car is.
    expect((await api.get(`/api/sales/leads/${l.body.id}`).set(bearer(s.sales1.token))).body.vehicleStage).toBe('ready_for_delivery');
  });

  it('one Delivery Team login can work every dealership it is assigned to', async () => {
    const s = await setup();
    const jet = await team('JET');
    await owner.db.userRole.create({ data: { userId: s.delivery.user.id, roleId: await roleByName('Delivery Team'), dealershipId: jet.d.id } });
    await api.post('/api/sales/stock').set(bearer(s.delivery.token)).send(intake(jet, s.modelId, 'SHAREDVIN001')).expect(201);
    const list = await api.get('/api/sales/stock').set(bearer(s.delivery.token));
    expect(list.body.items.map((v: { dealershipId: number }) => v.dealershipId)).toContain(jet.d.id);
  });
});

describe('Mark as delivered on the order', () => {
  it('needs the Manager approval (from draft too) and a ready car, then hands over in one step', async () => {
    const s = await setup();
    const l = await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send({ dealershipId: s.d.id, prospectName: 'Hamza', prospectMobile: '0300-5558881', interestedModelId: s.modelId });
    await api
      .post(`/api/sales/leads/${l.body.id}/convert`)
      .set(bearer(s.sales1.token))
      .send({ interestedModelId: s.modelId, variant: '2.0 GLS', preferredColor: 'White', email: 'h@example.com', paymentInstrument: 'pay_order', customerCnic: nextCnic(), paymentInstrumentRef: 'PO-3' })
      .expect(200);
    const o = (await api.post(`/api/sales/leads/${l.body.id}/order`).set(bearer(s.admin.token)).send({ customerCnic: nextCnic(), pboNo: nextPbo(), unitPrice: '9000000' })).body;
    await api.post('/api/sales/stock').set(bearer(s.delivery.token)).send(intake(s, s.modelId, 'HANDOVER0001', { orderId: o.id })).expect(201);
    const handOver = { odometerKm: 5, documentsHandedOver: ['invoice'], checklist: ['pdi_done', 'documents_ready', 'accessories_fitted'], customerAcknowledged: true };
    const deliver = async () => {
      await clearForDelivery();
      return api.post(`/api/sales/orders/${o.id}/deliver`).set(bearer(s.delivery.token)).send(handOver);
    };

    // Received but not ready, and not approved: refused.
    expect((await deliver()).status).toBe(409);
    await api.patch(`/api/sales/orders/${o.id}/vehicle-status`).set(bearer(s.delivery.token)).send({ status: 'ready_for_delivery' }).expect(200);
    expect((await deliver()).status).toBe(409); // still a draft
    // The Manager sees it awaiting approval and approves the draft directly.
    const awaiting = await api.get('/api/sales/orders?awaitingApproval=true').set(bearer(s.manager.token));
    expect(awaiting.body.items.map((x: { id: number }) => x.id)).toContain(o.id);
    await api.post(`/api/sales/orders/${o.id}/transitions`).set(bearer(s.manager.token)).send({ action: 'approve' }).expect(200);
    // Only the Delivery Team hands over; the customer's acknowledgement is required.
    expect((await api.post(`/api/sales/orders/${o.id}/deliver`).set(bearer(s.admin.token)).send(handOver)).status).toBe(403);
    expect((await api.post(`/api/sales/orders/${o.id}/deliver`).set(bearer(s.delivery.token)).send({ ...handOver, customerAcknowledged: false })).status).toBe(422);

    const done = await deliver();
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect(done.body).toMatchObject({ status: 'delivered', salesOrderId: o.id, deliveredOn: pakistanToday() });
    expect((await api.get(`/api/sales/orders/${o.id}`).set(bearer(s.manager.token))).body.status).toBe('delivered');
    expect((await api.get(`/api/sales/leads/${l.body.id}`).set(bearer(s.sales1.token))).body.status).toBe('completed');
  });
});

describe('Action needed', () => {
  it('tells each role what is waiting for them', async () => {
    const s = await setup();
    const actions = async (who: Login) => {
      const res = await api.get('/api/sales/dashboard/actions').set(bearer(who.token));
      expect(res.status).toBe(200);
      return Object.fromEntries((res.body as { key: string; count: number; urgent: boolean }[]).map((i) => [i.key, i.count]));
    };
    // A converted lead: the Admin must raise its order.
    const l = await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send({ dealershipId: s.d.id, prospectName: 'Sara', prospectMobile: '0300-5559991', interestedModelId: s.modelId });
    await api
      .post(`/api/sales/leads/${l.body.id}/convert`)
      .set(bearer(s.sales1.token))
      .send({ interestedModelId: s.modelId, variant: '2.0 GLS', preferredColor: 'White', email: 's@example.com', paymentInstrument: 'pay_order', customerCnic: nextCnic(), paymentInstrumentRef: 'PO-9' })
      .expect(200);
    expect(await actions(s.admin)).toMatchObject({ 'raise-order': 1 });

    // Order raised (draft): the Manager is asked to approve; the Delivery Team to find a car.
    const o = (await api.post(`/api/sales/leads/${l.body.id}/order`).set(bearer(s.admin.token)).send({ customerCnic: nextCnic(), pboNo: nextPbo(), unitPrice: '9000000' })).body;
    expect(await actions(s.manager)).toMatchObject({ approve: 1 });
    expect(await actions(s.delivery)).toMatchObject({ 'needs-car': 1 });

    // The car arrives and is ready: urgent for the Manager (approve) and, once approved, the Delivery Team (hand over).
    await api.post('/api/sales/stock').set(bearer(s.delivery.token)).send(intake(s, s.modelId, 'ACTIONVIN001', { orderId: o.id })).expect(201);
    await api.patch(`/api/sales/orders/${o.id}/vehicle-status`).set(bearer(s.delivery.token)).send({ status: 'ready_for_delivery' }).expect(200);
    expect(await actions(s.manager)).toMatchObject({ 'approve-ready': 1, approve: 1 });
    expect(await actions(s.sales1)).toMatchObject({ 'car-ready': 1 });
    await api.post(`/api/sales/orders/${o.id}/transitions`).set(bearer(s.manager.token)).send({ action: 'approve' }).expect(200);
    expect(await actions(s.manager)).toEqual({});
    expect(await actions(s.delivery)).toMatchObject({ 'hand-over': 1 });
  });
});

describe('review fixes', () => {
  const bookedOrder = async (s: Setup, mobile: string) => {
    const l = await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send({ dealershipId: s.d.id, prospectName: 'Review', prospectMobile: mobile, interestedModelId: s.modelId });
    await api
      .post(`/api/sales/leads/${l.body.id}/convert`)
      .set(bearer(s.sales1.token))
      .send({ interestedModelId: s.modelId, variant: '2.0 GLS', preferredColor: 'White', email: 'r@example.com', paymentInstrument: 'pay_order', customerCnic: nextCnic(), paymentInstrumentRef: 'PO-R' })
      .expect(200);
    const o = (await api.post(`/api/sales/leads/${l.body.id}/order`).set(bearer(s.admin.token)).send({ customerCnic: nextCnic(), pboNo: nextPbo(), unitPrice: '9000000' })).body;
    return { leadId: l.body.id as number, orderId: o.id as number };
  };

  it('re-allocating another car frees the previous one', async () => {
    const s = await setup();
    const first = await receive(s, 'REALLOC00001');
    const second = await receive(s, 'REALLOC00002');
    const { orderId } = await bookedOrder(s, '0300-6660001');
    await api.put(`/api/sales/orders/${orderId}/allocation`).set(bearer(s.delivery.token)).send({ vehicleId: first }).expect(200);
    await api.put(`/api/sales/orders/${orderId}/allocation`).set(bearer(s.delivery.token)).send({ vehicleId: second }).expect(200);
    const [old] = await owner.db.vehicle.findMany({ where: { id: first } });
    expect(old!.status).toBe('available');
  });

  it('list filters behind the dashboard and "Action needed" links', async () => {
    const s = await setup();
    const { leadId, orderId } = await bookedOrder(s, '0300-6660002');
    await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send({ dealershipId: s.d.id, prospectName: 'Open one', prospectMobile: '0300-6660003', interestedModelId: s.modelId }).expect(201);
    const leadsOf = async (q: string) => (await api.get(`/api/sales/leads?${q}`).set(bearer(s.sales1.token))).body.items.map((x: { id: number }) => x.id);
    expect(await leadsOf('open=true')).not.toContain(leadId);
    expect(await leadsOf('open=false')).toEqual([leadId]);
    await api.post('/api/sales/stock').set(bearer(s.delivery.token)).send(intake(s, s.modelId, 'FILTERVIN001', { orderId })).expect(201);
    expect(await leadsOf('vehicleStage=received')).toEqual([leadId]);
    expect(await leadsOf('vehicleStage=ready_for_delivery')).toEqual([]);
    const today = pakistanToday();
    expect(await leadsOf(`createdBefore=${today}`)).toEqual([]);
    expect((await leadsOf(`createdOn=${today}`)).length).toBe(2);
  });

  it('the Sales Manager issues documents on own leads and reopens exhausted leads; the Delivery Team reads variant codes', async () => {
    const s = await setup();
    const own = await api.post('/api/sales/leads').set(bearer(s.manager.token)).send({ dealershipId: s.d.id, prospectName: 'Mgr', prospectMobile: '0300-6660004', interestedModelId: s.modelId });
    expect((await api.post(`/api/sales/leads/${own.body.id}/quotations`).set(bearer(s.manager.token)).send({ unitPrice: '9000000' })).status).toBe(201);
    expect((await api.post(`/api/sales/leads/${own.body.id}/ppf-forms`).set(bearer(s.manager.token)).send({ ...PPF_CUSTOMER, coverage: 'full_body', amount: '100000' })).status).toBe(201);

    const l = await api.post('/api/sales/leads').set(bearer(s.sales1.token)).send({ dealershipId: s.d.id, prospectName: 'Gone cold', prospectMobile: '0300-6660005', interestedModelId: s.modelId });
    for (let i = 0; i < 3; i++) await api.post(`/api/sales/leads/${l.body.id}/follow-ups`).set(bearer(s.sales1.token)).send({ outcome: 'not_interested' }).expect(201);
    await api.post(`/api/sales/leads/${l.body.id}/transitions`).set(bearer(s.sales1.token)).send({ action: 'exhaust', comment: 'No answer' }).expect(200);
    expect((await api.post(`/api/sales/leads/${l.body.id}/transitions`).set(bearer(s.sales1.token)).send({ action: 'reopen' })).status).toBe(403);
    const reopened = await api.post(`/api/sales/leads/${l.body.id}/transitions`).set(bearer(s.manager.token)).send({ action: 'reopen' });
    expect(reopened.status, JSON.stringify(reopened.body)).toBe(200);
    expect(reopened.body.status).toBe('follow_up');

    expect((await api.get(`/api/sales/variants?dealershipId=${s.d.id}`).set(bearer(s.delivery.token))).status).toBe(200);
  });
});
