import { describe, expect, it } from 'vitest';
import { api, bearer, createDealership, createUser, owner, useTestDb, clearForDelivery } from './helpers';

useTestDb();

const ADVISOR = [
  'service.visits.view', 'service.visits.create', 'service.visits.update',
  'service.job_cards.view', 'service.job_cards.create', 'service.job_cards.update',
  'service.inspections.view', 'service.inspections.create', 'service.inspections.update',
  'service.estimates.view', 'service.estimates.create', 'service.estimates.update', 'service.estimates.submit',
  'master.vehicles.view', 'master.customers.view',
];
const TECH = ['service.job_cards.view', 'service.job_cards.work', 'service.inspections.view', 'service.inspections.update'];
const MANAGER = [...ADVISOR, 'service.job_cards.work', 'service.estimates.approve'];

const today = () => new Date().toISOString().slice(0, 10);
const shift = (months: number, days = 0) => {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

async function setup() {
  const d = await createDealership('HYD');
  const other = await createDealership('JET');
  const advisor = await createUser([{ permissions: ADVISOR, dealershipId: d.id }]);
  const tech = await createUser([{ permissions: TECH, dealershipId: d.id }]);
  const manager = await createUser([{ permissions: MANAGER, dealershipId: d.id }]);
  const outsider = await createUser([{ permissions: MANAGER, dealershipId: other.id }]);
  const model = await owner.db.vehicleModel.create({ data: { brand: 'Hyundai', name: 'Tucson' } });
  await owner.db.scheduleItem.createMany({
    data: [
      { modelId: model!.id, sequence: 1, name: '1st service', dueKm: 1000, dueMonths: 1, isFree: true, labourHours: '1' },
      { modelId: model!.id, sequence: 2, name: '2nd service', dueKm: 5000, dueMonths: 6, isFree: true, labourHours: '1.5' },
      { modelId: model!.id, sequence: 3, name: '3rd service', dueKm: 10000, dueMonths: 12, isFree: false, labourHours: '2' },
    ],
  });
  await owner.db.inspectionTemplateItem.createMany({
    data: [
      { area: 'Brakes', item: 'Front pads', sortOrder: 1 },
      { area: 'Tyres', item: 'Tread depth', sortOrder: 2 },
    ],
  });
  return { d, other, advisor, tech, manager, outsider, modelId: model!.id };
}

/** A delivered vehicle (as Sales would leave it) with an owner and its schedule. */
async function deliveredCar(s: Awaited<ReturnType<typeof setup>>, opts: { activatedOn?: string; warrantyEndsOn?: string; vin?: string } = {}) {
  const v = await owner.db.vehicle.create({
    data: {
      vin: opts.vin ?? 'SERVICEVIN001',
      modelId: s.modelId,
      activatedOn: opts.activatedOn ?? today(),
      warrantyEndsOn: opts.warrantyEndsOn ?? shift(36),
      activationOdometerKm: 10,
    },
  });
  await owner.db.vehicleDealership.create({ data: { vehicleId: v!.id, dealershipId: s.d.id, source: 'sale' } });
  const n = String(v!.id).padStart(7, '0');
  const c = await owner.db.customer.create({
    data: { dealershipId: s.d.id, fullName: `Owner ${v!.id}`, mobile: `0300-${n}`, mobileNormalized: `+92300${n}` },
  });
  await owner.db.vehicleOwnership.create({ data: { dealershipId: s.d.id, vehicleId: v!.id, customerId: c!.id, startDate: today() } });
  const items = await owner.db.scheduleItem.findMany({ where: { modelId: s.modelId } });
  await owner.db.vehicleSchedule.createMany({
    data: items.map((i) => ({
      vehicleId: v!.id,
      scheduleItemId: i.id,
      sequence: i.sequence,
      name: i.name,
      dueKm: i.dueKm,
      dueDate: shift(i.dueMonths),
      isFree: i.isFree,
      labourHours: i.labourHours,
    })),
  });
  return { vehicleId: v!.id, customerId: c!.id };
}

const checkIn = (s: Awaited<ReturnType<typeof setup>>, vehicleId: number, over: Record<string, unknown> = {}) =>
  api
    .post('/api/service/visits')
    .set(bearer(s.advisor.token))
    .send({ dealershipId: s.d.id, vehicleId, visitType: 'scheduled', odometerKm: 950, ...over });

/** Visit -> job card with a technician, started. */
async function startedJob(s: Awaited<ReturnType<typeof setup>>, vehicleId: number) {
  const v = await checkIn(s, vehicleId);
  const jc = await api.post(`/api/service/visits/${v.body.id}/job-card`).set(bearer(s.advisor.token));
  await api.patch(`/api/service/job-cards/${jc.body.id}`).set(bearer(s.advisor.token)).send({ technicianId: s.tech.user.id }).expect(200);
  await api.post(`/api/service/job-cards/${jc.body.id}/transitions`).set(bearer(s.tech.token)).send({ action: 'start' }).expect(200);
  return { visitId: v.body.id as number, jobCardId: jc.body.id as number };
}

describe('service schedule from vehicle activation', () => {
  it('delivering a car in Sales builds its schedule in Service (domain event)', async () => {
    const s = await setup();
    const salesPerms = [
      'sales.orders.create', 'sales.orders.view_all', 'sales.orders.update', 'sales.orders.submit', 'sales.orders.approve',
      'sales.orders.allocate', 'sales.deliveries.schedule', 'sales.deliveries.complete', 'sales.deliveries.view_all', 'master.customers.create',
    ];
    const seller = await createUser([{ permissions: salesPerms, dealershipId: s.d.id }]);
    const approver = await createUser([{ permissions: salesPerms, dealershipId: s.d.id }]);
    const v = await owner.db.vehicle.create({ data: { vin: 'EVENTVIN0001', modelId: s.modelId } });
    await owner.db.vehicleDealership.create({ data: { vehicleId: v!.id, dealershipId: s.d.id } });
    const c = await api.post('/api/master/customers').set(bearer(seller.token)).send({ dealershipId: s.d.id, fullName: 'Buyer', mobile: '0300-2222222' });
    const o = await api.post('/api/sales/orders').set(bearer(seller.token)).send({ dealershipId: s.d.id, customerId: c.body.id, modelId: s.modelId, unitPrice: '100' });
    await api.post(`/api/sales/orders/${o.body.id}/transitions`).set(bearer(seller.token)).send({ action: 'submit' }).expect(200);
    await api.post(`/api/sales/orders/${o.body.id}/transitions`).set(bearer(approver.token)).send({ action: 'approve' }).expect(200);
    await api.put(`/api/sales/orders/${o.body.id}/allocation`).set(bearer(approver.token)).send({ vehicleId: v!.id }).expect(200);
    for (const status of ['in_transit', 'received']) {
      await api.patch(`/api/sales/orders/${o.body.id}/vehicle-status`).set(bearer(approver.token)).send({ status, ...(status === 'received' ? { pdi: { done: true, issue: false } } : {}) }).expect(200);
    }
    const dl = await api.post(`/api/sales/orders/${o.body.id}/deliveries`).set(bearer(approver.token)).send({ scheduledDate: today() });
    await clearForDelivery();
    await api.post(`/api/sales/deliveries/${dl.body.id}/complete`).set(bearer(approver.token)).send({ odometerKm: 7, checklist: ['pdi_done', 'documents_ready', 'accessories_fitted'], customerAcknowledged: true }).expect(200);

    const sched = await api.get(`/api/service/vehicles/${v!.id}/schedule`).set(bearer(s.advisor.token));
    expect(sched.status).toBe(200);
    expect(sched.body.map((e: { sequence: number; dueKm: number; dueDate: string; status: string }) => [e.sequence, e.dueKm, e.dueDate, e.status])).toEqual([
      [1, 1000, shift(1), 'due'],
      [2, 5000, shift(6), 'due'],
      [3, 10000, shift(12), 'due'],
    ]);
  });
});

describe('check-in', () => {
  it('computes service number, visit sequence and entitlements; preview matches', async () => {
    const s = await setup();
    const car = await deliveredCar(s);
    const preview = await api.get(`/api/service/visits/check-in-preview?vehicleId=${car.vehicleId}&dealershipId=${s.d.id}`).set(bearer(s.advisor.token));
    expect(preview.body).toMatchObject({ visitSequence: 1, warrantyValid: true, freeServiceIfScheduled: true, lastOdometerKm: 10, openVisitId: null });
    expect(preview.body.nextScheduled).toMatchObject({ sequence: 1, name: '1st service' });
    expect(preview.body.currentOwner).toMatchObject({ customerId: car.customerId });

    const v = await checkIn(s, car.vehicleId);
    expect(v.status).toBe(201);
    expect(v.body).toMatchObject({ serviceNumber: 1, visitSequence: 1, freeService: true, warrantyValid: true, customerId: car.customerId, status: 'open' });
    expect(v.body.visitNo).toMatch(/^HYD-SV-/);
  });

  it('allows only one live visit per vehicle and rejects odometer rollback', async () => {
    const s = await setup();
    const car = await deliveredCar(s);
    await checkIn(s, car.vehicleId).expect(201);
    expect((await checkIn(s, car.vehicleId, { visitType: 'repair' })).status).toBe(409);
    const car2 = await deliveredCar(s, { vin: 'SERVICEVIN002' });
    const low = await checkIn(s, car2.vehicleId, { odometerKm: 5 });
    expect(low.status).toBe(422);
    expect(low.body.error.details[0].message).toMatch(/lower than the last recorded 10 km/);
  });

  it('charges a free service when the car is past the km grace', async () => {
    const s = await setup();
    const car = await deliveredCar(s);
    const v = await checkIn(s, car.vehicleId, { odometerKm: 1501 }); // due 1,000 + 500 grace
    expect(v.body.freeService).toBe(false);
  });

  it('rejects warranty visits out of warranty, and scheduled visits with nothing pending', async () => {
    const s = await setup();
    const old = await deliveredCar(s, { activatedOn: shift(-48), warrantyEndsOn: shift(-12) });
    expect((await checkIn(s, old.vehicleId, { visitType: 'warranty' })).status).toBe(422);
    await owner.db.vehicleSchedule.updateMany({ where: { vehicleId: old.vehicleId }, data: { status: 'done' } });
    const res = await checkIn(s, old.vehicleId);
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].message).toMatch(/No scheduled service is pending/);
  });

  it('needs a customer when the car has no owner on record at this dealership', async () => {
    const s = await setup();
    const v = await owner.db.vehicle.create({ data: { vin: 'NOOWNERVIN01', modelId: s.modelId } });
    await owner.db.vehicleDealership.create({ data: { vehicleId: v!.id, dealershipId: s.d.id } });
    expect((await checkIn(s, v!.id, { visitType: 'repair' })).status).toBe(422);
  });

  it('cancelling a check-in releases the visit sequence', async () => {
    const s = await setup();
    const car = await deliveredCar(s);
    const v = await checkIn(s, car.vehicleId);
    await api.post(`/api/service/visits/${v.body.id}/transitions`).set(bearer(s.advisor.token)).send({ action: 'cancel', comment: 'Customer left' }).expect(200);
    const again = await checkIn(s, car.vehicleId);
    expect(again.body).toMatchObject({ visitSequence: 1, serviceNumber: 1 });
  });
});

describe('job card', () => {
  it('runs the full cycle: free scheduled labour, technician, done lines, visit states, schedule advances', async () => {
    const s = await setup();
    const car = await deliveredCar(s);
    const v = await checkIn(s, car.vehicleId);
    const jc = await api.post(`/api/service/visits/${v.body.id}/job-card`).set(bearer(s.advisor.token));
    expect(jc.status).toBe(201);
    expect(jc.body.jobCardNo).toMatch(/^HYD-JC-/);
    const lines = await api.get(`/api/service/job-cards/${jc.body.id}/lines`).set(bearer(s.advisor.token));
    expect(lines.body).toEqual([
      expect.objectContaining({ kind: 'labour', source: 'schedule', quantity: '1.00', unitPrice: '3000.00', amount: '3000.00', billable: false }),
    ]);
    // Scheduled work cannot be edited as a manual line.
    expect((await api.patch(`/api/service/job-cards/${jc.body.id}/lines/${lines.body[0].id}`).set(bearer(s.advisor.token)).send({ unitPrice: '1' })).status).toBe(409);

    const url = `/api/service/job-cards/${jc.body.id}/transitions`;
    expect((await api.post(url).set(bearer(s.tech.token)).send({ action: 'start' })).status).toBe(409); // no technician
    expect((await api.patch(`/api/service/job-cards/${jc.body.id}`).set(bearer(s.advisor.token)).send({ technicianId: s.advisor.user.id })).status).toBe(422);
    await api.patch(`/api/service/job-cards/${jc.body.id}`).set(bearer(s.advisor.token)).send({ technicianId: s.tech.user.id }).expect(200);
    expect((await api.post(url).set(bearer(s.advisor.token)).send({ action: 'start' })).status).toBe(403); // advisors don't work cards
    await api.post(url).set(bearer(s.tech.token)).send({ action: 'start' }).expect(200);
    expect((await api.get(`/api/service/visits/${v.body.id}`).set(bearer(s.advisor.token))).body.status).toBe('in_progress');

    expect((await api.post(url).set(bearer(s.tech.token)).send({ action: 'complete' })).status).toBe(409); // line pending
    await api.post(`/api/service/job-cards/${jc.body.id}/lines/${lines.body[0].id}/done`).set(bearer(s.tech.token)).send({ done: true }).expect(200);
    await api.post(url).set(bearer(s.tech.token)).send({ action: 'complete' }).expect(200);
    expect((await api.get(`/api/service/visits/${v.body.id}`).set(bearer(s.advisor.token))).body.status).toBe('ready');

    await api.post(`/api/service/visits/${v.body.id}/transitions`).set(bearer(s.advisor.token)).send({ action: 'deliver' }).expect(200);
    const sched = await api.get(`/api/service/vehicles/${car.vehicleId}/schedule`).set(bearer(s.advisor.token));
    expect(sched.body[0]).toMatchObject({ sequence: 1, status: 'done', visitId: v.body.id, completedOn: today() });

    const next = await checkIn(s, car.vehicleId, { odometerKm: 4800 });
    expect(next.body).toMatchObject({ serviceNumber: 2, visitSequence: 2, freeService: true });
  });

  it('is invisible to other dealerships', async () => {
    const s = await setup();
    const car = await deliveredCar(s);
    const { visitId, jobCardId } = await startedJob(s, car.vehicleId);
    expect((await api.get(`/api/service/visits/${visitId}`).set(bearer(s.outsider.token))).status).toBe(404);
    expect((await api.get(`/api/service/job-cards/${jobCardId}`).set(bearer(s.outsider.token))).status).toBe(404);
    expect((await api.get(`/api/service/vehicles/${car.vehicleId}/schedule`).set(bearer(s.outsider.token))).status).toBe(404);
  });
});

describe('inspection and estimates', () => {
  it('inspects, estimates from findings, prices server-side, approves onto the job card', async () => {
    const s = await setup();
    const car = await deliveredCar(s);
    const { jobCardId } = await startedJob(s, car.vehicleId);

    const insp = await api.post(`/api/service/job-cards/${jobCardId}/inspection`).set(bearer(s.tech.token));
    expect(insp.status).toBe(403); // technicians record results, advisors start inspections
    const started = await api.post(`/api/service/job-cards/${jobCardId}/inspection`).set(bearer(s.advisor.token));
    expect(started.status).toBe(201);
    expect(started.body.items.map((i: { item: string; condition: string }) => [i.item, i.condition])).toEqual([
      ['Front pads', 'not_checked'],
      ['Tread depth', 'not_checked'],
    ]);
    const [pads, tyres] = started.body.items;
    await api
      .put(`/api/service/job-cards/${jobCardId}/inspection/items`)
      .set(bearer(s.tech.token))
      .send({ items: [{ id: pads.id, condition: 'urgent', notes: '2 mm left' }] })
      .expect(200);
    expect((await api.post(`/api/service/job-cards/${jobCardId}/inspection/complete`).set(bearer(s.tech.token))).status).toBe(409);
    await api.put(`/api/service/job-cards/${jobCardId}/inspection/items`).set(bearer(s.tech.token)).send({ items: [{ id: tyres.id, condition: 'ok' }] }).expect(200);
    await api.post(`/api/service/job-cards/${jobCardId}/inspection/complete`).set(bearer(s.tech.token)).expect(200);

    const est = await api.post(`/api/service/job-cards/${jobCardId}/estimates`).set(bearer(s.advisor.token)).send({ fromInspection: true });
    expect(est.status).toBe(201);
    expect(est.body.estimateNo).toMatch(/^HYD-ES-/);
    const lines = await api.get(`/api/service/estimates/${est.body.id}/lines`).set(bearer(s.advisor.token));
    expect(lines.body).toEqual([expect.objectContaining({ description: 'Brakes: Front pads (urgent) – 2 mm left', inspectionItemId: pads.id })]);

    const base = `/api/service/estimates/${est.body.id}`;
    expect((await api.post(`${base}/transitions`).set(bearer(s.advisor.token)).send({ action: 'submit' })).status).toBe(409); // unpriced
    await api.patch(`${base}/lines/${lines.body[0].id}`).set(bearer(s.advisor.token)).send({ unitPrice: '1500', quantity: '1.5' }).expect(200);
    await api.post(`${base}/lines`).set(bearer(s.advisor.token)).send({ kind: 'part', description: 'Brake pads set', partNo: 'BP-01', quantity: '1', unitPrice: '12999.99' }).expect(201);
    expect((await api.get(base).set(bearer(s.advisor.token))).body.totalAmount).toBe('15249.99');

    await api.post(`${base}/transitions`).set(bearer(s.advisor.token)).send({ action: 'submit' }).expect(200);
    expect((await api.post(`${base}/lines`).set(bearer(s.advisor.token)).send({ kind: 'labour', description: 'Late add', quantity: '1', unitPrice: '1' })).status).toBe(409);
    expect((await api.post(`${base}/transitions`).set(bearer(s.advisor.token)).send({ action: 'approve' })).status).toBe(403);
    // The job card cannot complete while an estimate awaits approval.
    const jcLines = await api.get(`/api/service/job-cards/${jobCardId}/lines`).set(bearer(s.tech.token));
    await api.post(`/api/service/job-cards/${jobCardId}/lines/${jcLines.body[0].id}/done`).set(bearer(s.tech.token)).send({ done: true }).expect(200);
    expect((await api.post(`/api/service/job-cards/${jobCardId}/transitions`).set(bearer(s.tech.token)).send({ action: 'complete' })).status).toBe(409);

    await api.post(`${base}/transitions`).set(bearer(s.manager.token)).send({ action: 'approve', comment: 'Customer agreed by phone' }).expect(200);
    const after = await api.get(`/api/service/job-cards/${jobCardId}/lines`).set(bearer(s.tech.token));
    expect(after.body.filter((l: { source: string }) => l.source === 'estimate').map((l: { amount: string }) => l.amount)).toEqual(['2250.00', '12999.99']);
  });

  it('requires a reason to reject; rejected estimates can be revised', async () => {
    const s = await setup();
    const car = await deliveredCar(s);
    const { jobCardId } = await startedJob(s, car.vehicleId);
    const est = await api.post(`/api/service/job-cards/${jobCardId}/estimates`).set(bearer(s.advisor.token)).send({});
    const base = `/api/service/estimates/${est.body.id}`;
    await api.post(`${base}/lines`).set(bearer(s.advisor.token)).send({ kind: 'labour', description: 'Wheel alignment', quantity: '1', unitPrice: '2500' }).expect(201);
    await api.post(`${base}/transitions`).set(bearer(s.advisor.token)).send({ action: 'submit' }).expect(200);
    expect((await api.post(`${base}/transitions`).set(bearer(s.manager.token)).send({ action: 'reject' })).status).toBe(422);
    await api.post(`${base}/transitions`).set(bearer(s.manager.token)).send({ action: 'reject', comment: 'Too expensive' }).expect(200);
    const revised = await api.post(`${base}/transitions`).set(bearer(s.advisor.token)).send({ action: 'revise' });
    expect(revised.body.status).toBe('draft');
  });
});

describe('free service: labour free, parts and oil charged', () => {
  it('labour lines of a free visit default to free; parts are charged; a paid visit charges everything', async () => {
    const s = await setup();
    const car = await deliveredCar(s);
    const v = await checkIn(s, car.vehicleId);
    expect(v.body.freeService).toBe(true);
    const jc = await api.post(`/api/service/visits/${v.body.id}/job-card`).set(bearer(s.advisor.token));
    const url = `/api/service/job-cards/${jc.body.id}/lines`;
    const labour = await api.post(url).set(bearer(s.advisor.token)).send({ kind: 'labour', description: 'Wheel alignment', quantity: '1', unitPrice: '1500' });
    expect(labour.status).toBe(201);
    expect(labour.body.billable).toBe(false);
    const oil = await api.post(url).set(bearer(s.advisor.token)).send({ kind: 'part', description: 'Engine oil 5W-30 4L', partNo: 'OIL4L', quantity: '1', unitPrice: '7699' });
    expect(oil.status).toBe(201);
    expect(oil.body.billable).toBe(true);

    // An explicit choice is respected.
    const gift = await api.post(url).set(bearer(s.advisor.token)).send({ kind: 'part', description: 'Wiper blades (goodwill)', quantity: '1', unitPrice: '900', billable: false });
    expect(gift.body.billable).toBe(false);

    // A paid visit (repair): the labour is charged.
    await api.post(`/api/service/visits/${v.body.id}/transitions`).set(bearer(s.advisor.token)).send({ action: 'cancel', comment: 'test' }).expect(200);
    const car2 = await deliveredCar(s, { vin: 'SERVICEVIN002' });
    const paid = await checkIn(s, car2.vehicleId, { visitType: 'repair' });
    const jc2 = await api.post(`/api/service/visits/${paid.body.id}/job-card`).set(bearer(s.advisor.token));
    const l2 = await api.post(`/api/service/job-cards/${jc2.body.id}/lines`).set(bearer(s.advisor.token)).send({ kind: 'labour', description: 'Brake work', quantity: '1', unitPrice: '2000' });
    expect(l2.body.billable).toBe(true);
  });
});

describe('services due (the call list)', () => {
  it('lists due services with the owner, records calls, and stays inside the dealership', async () => {
    const s = await setup();
    const car = await deliveredCar(s);
    const caller = await createUser([{ permissions: ['service.reminders.view', 'service.reminders.update'], dealershipId: s.d.id }]);
    const elsewhere = await createUser([{ permissions: ['service.reminders.view', 'service.reminders.update'], dealershipId: s.other.id }]);

    const list = await api.get('/api/service/reminders?days=60').set(bearer(caller.token));
    expect(list.status).toBe(200);
    const first = list.body.items.find((i: { vehicleId: number; service: string }) => i.vehicleId === car.vehicleId && i.service === '1st service');
    expect(first).toMatchObject({ isFree: true, overdue: false, callCount: 0, lastCall: null, dealershipId: s.d.id });
    expect(first.customerName).toContain('Owner');

    // Another dealership's caller sees nothing of this one, and cannot record a call for it.
    expect((await api.get('/api/service/reminders?days=60').set(bearer(elsewhere.token))).body.items).toEqual([]);
    // Hidden by the dealership boundary (not found), or refused: never recorded.
    expect([403, 404]).toContain((await api.post('/api/service/reminders/calls').set(bearer(elsewhere.token)).send({ scheduleId: first.scheduleId, outcome: 'no_answer' })).status);

    // A booked call needs the day; then it shows as the last call.
    expect((await api.post('/api/service/reminders/calls').set(bearer(caller.token)).send({ scheduleId: first.scheduleId, outcome: 'booked' })).status).toBe(422);
    const day = shift(0, 3);
    await api.post('/api/service/reminders/calls').set(bearer(caller.token)).send({ scheduleId: first.scheduleId, outcome: 'booked', nextCallOn: day, remarks: 'Will come Saturday' }).expect(201);
    const again = await api.get('/api/service/reminders?days=60').set(bearer(caller.token));
    const row = again.body.items.find((i: { scheduleId: number }) => i.scheduleId === first.scheduleId);
    expect(row.callCount).toBe(1);
    expect(row.lastCall).toMatchObject({ outcome: 'booked', nextCallOn: day, remarks: 'Will come Saturday' });
    expect((await api.get('/api/service/reminders?days=60&uncalledOnly=true').set(bearer(caller.token))).body.items.find((i: { scheduleId: number }) => i.scheduleId === first.scheduleId)).toBeUndefined();
    const calls = await api.get(`/api/service/reminders/${first.scheduleId}/calls`).set(bearer(caller.token));
    expect(calls.body).toHaveLength(1);

    // Nobody without the permission sees the list.
    expect((await api.get('/api/service/reminders').set(bearer(s.tech.token))).status).toBe(403);
  });
});

describe('a car bought elsewhere', () => {
  it('is registered with its owner at check-in, found again by its chassis, and never shows in open stock', async () => {
    const s = await setup();
    const body = {
      dealershipId: s.d.id,
      customer: { fullName: 'Walk-in Owner', mobile: '0300-5550001' },
      vehicle: { vin: 'ELSEWHEREVIN01', registrationNo: 'ABC-123', modelId: s.modelId, color: 'White' },
      boughtFrom: 'Another showroom',
      odometerKm: 1500,
    };
    const reg = await api.post('/api/service/vehicles/register').set(bearer(s.advisor.token)).send(body);
    expect(reg.status).toBe(201);
    expect(reg.body).toMatchObject({ alreadyInSystem: false, customerName: 'Walk-in Owner' });

    const preview = await api.get(`/api/service/visits/check-in-preview?vehicleId=${reg.body.vehicleId}&dealershipId=${s.d.id}`).set(bearer(s.advisor.token));
    expect(preview.body).toMatchObject({ boughtElsewhere: true, delivered: null, warrantyValid: false, lastOdometerKm: 1500, currentOwner: { fullName: 'Walk-in Owner' }, previousVisits: [] });

    // The same car again is recognised (and the same customer reused), not duplicated.
    const again = await api.post('/api/service/vehicles/register').set(bearer(s.advisor.token)).send(body);
    expect(again.body).toMatchObject({ alreadyInSystem: true, vehicleId: reg.body.vehicleId, customerId: reg.body.customerId });

    // A visit can start (no free schedule for a car we did not deliver).
    const visit = await checkIn(s, reg.body.vehicleId, { visitType: 'paid_service', odometerKm: 1600 });
    expect(visit.status).toBe(201);
    expect(visit.body.freeService).toBe(false);
    const next = await api.get(`/api/service/visits/check-in-preview?vehicleId=${reg.body.vehicleId}&dealershipId=${s.d.id}`).set(bearer(s.advisor.token));
    expect(next.body.openVisitId).toBe(visit.body.id);

    // Another dealership's advisor cannot register cars for this one.
    expect((await api.post('/api/service/vehicles/register').set(bearer(s.outsider.token)).send(body)).status).toBe(403);
  });
});
