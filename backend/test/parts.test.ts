import { describe, expect, it } from 'vitest';
import { api, bearer, createBranch, createDealership, createUser, owner, useTestDb } from './helpers';

useTestDb();

const BUYER = [
  'parts.catalog.view', 'parts.suppliers.view', 'parts.suppliers.create',
  'parts.purchase_orders.view', 'parts.purchase_orders.create', 'parts.purchase_orders.update', 'parts.purchase_orders.submit',
];
const STORE = [
  'parts.catalog.view', 'parts.purchase_orders.view', 'parts.receipts.view', 'parts.receipts.create', 'parts.stock.view',
  'parts.requests.view', 'parts.issues.create', 'parts.transfers.view', 'parts.transfers.create', 'parts.transfers.dispatch',
  'parts.transfers.receive', 'parts.adjustments.view', 'parts.adjustments.create',
];
const MANAGER = [...BUYER, ...STORE, 'parts.purchase_orders.approve', 'parts.purchase_orders.cancel', 'parts.adjustments.approve'];
const ADVISOR = [
  'service.visits.view', 'service.visits.create', 'service.job_cards.view', 'service.job_cards.create', 'service.job_cards.update',
  'parts.requests.view', 'parts.requests.create', 'parts.catalog.view', 'master.vehicles.view',
];

async function setup() {
  const d = await createDealership('HYD');
  const other = await createDealership('JET');
  const main = await createBranch(d.id, 'MAIN');
  const north = await createBranch(d.id, 'NORTH');
  const buyer = await createUser([{ permissions: BUYER, dealershipId: d.id }]);
  const store = await createUser([{ permissions: STORE, dealershipId: d.id, branchId: main.id }]);
  const manager = await createUser([{ permissions: MANAGER, dealershipId: d.id }]);
  const advisor = await createUser([{ permissions: ADVISOR, dealershipId: d.id }]);
  const outsider = await createUser([{ permissions: MANAGER, dealershipId: other.id }]);
  await owner.db.part.createMany({
    data: [
      { partNo: 'OIL-5W30', description: 'Engine oil 5W-30 (1 L)', uom: 'litre', sellingPrice: '2500.00' },
      { partNo: 'BP-FRONT', description: 'Front brake pads', sellingPrice: '14500.00' },
    ],
  });
  const sup = await api.post('/api/parts/suppliers').set(bearer(buyer.token)).send({ dealershipId: d.id, code: 'hmp', name: 'Hyundai Motor Parts' });
  return { d, other, main, north, buyer, store, manager, advisor, outsider, supplierId: sup.body.id as number };
}

type S = Awaited<ReturnType<typeof setup>>;

async function approvedPo(s: S, lines: { partNo: string; quantity: string; unitPrice: string }[], branchId = s.main.id) {
  const po = await api.post('/api/parts/purchase-orders').set(bearer(s.buyer.token)).send({ dealershipId: s.d.id, branchId, supplierId: s.supplierId });
  for (const l of lines) await api.post(`/api/parts/purchase-orders/${po.body.id}/lines`).set(bearer(s.buyer.token)).send(l).expect(201);
  await api.post(`/api/parts/purchase-orders/${po.body.id}/transitions`).set(bearer(s.buyer.token)).send({ action: 'submit' }).expect(200);
  await api.post(`/api/parts/purchase-orders/${po.body.id}/transitions`).set(bearer(s.manager.token)).send({ action: 'approve' }).expect(200);
  const poLines = await api.get(`/api/parts/purchase-orders/${po.body.id}/lines`).set(bearer(s.buyer.token));
  return { poId: po.body.id as number, lines: poLines.body as { id: number; partNo: string; partId: number }[] };
}

function receiveAll(s: S, po: Awaited<ReturnType<typeof approvedPo>>, qty: Record<string, string>) {
  return api
    .post(`/api/parts/purchase-orders/${po.poId}/receipts`)
    .set(bearer(s.store.token))
    .send({ supplierInvoiceNo: 'INV-1', lines: po.lines.filter((l) => qty[l.partNo]).map((l) => ({ lineId: l.id, quantity: qty[l.partNo] })) });
}

const onHand = async (branchId: number, partNo: string) => {
  const p = await owner.db.part.findFirst({ where: { partNo }, select: { id: true } });
  const item = p && (await owner.db.stockItem.findFirst({ where: { branchId, partId: p.id }, select: { quantityOnHand: true, averageCost: true } }));
  return item ? { qty: item.quantityOnHand, avg: item.averageCost } : { qty: '0.00', avg: '0.00' };
};

describe('catalogue', () => {
  it('is managed globally and normalises part numbers', async () => {
    const s = await setup();
    const scoped = await createUser([{ permissions: ['parts.catalog.view', 'parts.catalog.manage'], dealershipId: s.d.id }]);
    expect((await api.post('/api/parts/catalog').set(bearer(scoped.token)).send({ partNo: 'x-1', description: 'X part', sellingPrice: '1' })).status).toBe(403);
    const global = await createUser([{ permissions: ['parts.catalog.view', 'parts.catalog.manage'] }]);
    const res = await api.post('/api/parts/catalog').set(bearer(global.token)).send({ partNo: ' 28113 d3300 ', description: 'Air filter', sellingPrice: '3200' });
    expect(res.body.partNo).toBe('28113D3300');
  });
});

describe('purchase orders and receipts', () => {
  it('prices lines by part number, rejects unknown/duplicate parts, requires a different approver', async () => {
    const s = await setup();
    const po = await api.post('/api/parts/purchase-orders').set(bearer(s.buyer.token)).send({ dealershipId: s.d.id, branchId: s.main.id, supplierId: s.supplierId });
    expect(po.body.poNo).toMatch(/^HYD-PO-/);
    const url = `/api/parts/purchase-orders/${po.body.id}`;
    expect((await api.post(`${url}/lines`).set(bearer(s.buyer.token)).send({ partNo: 'NOPE', quantity: '1', unitPrice: '1' })).status).toBe(422);
    const line = await api.post(`${url}/lines`).set(bearer(s.buyer.token)).send({ partNo: 'oil-5w30', quantity: '12.5', unitPrice: '1999.99' });
    expect(line.body).toMatchObject({ partNo: 'OIL-5W30', description: 'Engine oil 5W-30 (1 L)', amount: '24999.88' });
    expect((await api.post(`${url}/lines`).set(bearer(s.buyer.token)).send({ partNo: 'OIL-5W30', quantity: '1', unitPrice: '1' })).status).toBe(409);
    expect((await api.get(url).set(bearer(s.buyer.token))).body.totalAmount).toBe('24999.88');

    await api.post(`${url}/transitions`).set(bearer(s.buyer.token)).send({ action: 'submit' }).expect(200);
    expect((await api.post(`${url}/lines`).set(bearer(s.buyer.token)).send({ partNo: 'BP-FRONT', quantity: '1', unitPrice: '1' })).status).toBe(409);
    expect((await api.post(`${url}/transitions`).set(bearer(s.buyer.token)).send({ action: 'approve' })).status).toBe(403);
    const self = await createUser([{ permissions: MANAGER, dealershipId: s.d.id }]);
    const selfPo = await api.post('/api/parts/purchase-orders').set(bearer(self.token)).send({ dealershipId: s.d.id, branchId: s.main.id, supplierId: s.supplierId });
    await api.post(`/api/parts/purchase-orders/${selfPo.body.id}/lines`).set(bearer(self.token)).send({ partNo: 'BP-FRONT', quantity: '1', unitPrice: '1' });
    await api.post(`/api/parts/purchase-orders/${selfPo.body.id}/transitions`).set(bearer(self.token)).send({ action: 'submit' });
    expect((await api.post(`/api/parts/purchase-orders/${selfPo.body.id}/transitions`).set(bearer(self.token)).send({ action: 'approve' })).status).toBe(409);
    expect((await api.post(`${url}/transitions`).set(bearer(s.manager.token)).send({ action: 'approve' })).body.status).toBe('approved');
  });

  it('receives partially then fully, keeps a moving average cost, never over-receives', async () => {
    const s = await setup();
    const po = await approvedPo(s, [
      { partNo: 'OIL-5W30', quantity: '20', unitPrice: '100.00' },
      { partNo: 'BP-FRONT', quantity: '2', unitPrice: '9000.00' },
    ]);
    const first = await receiveAll(s, po, { 'OIL-5W30': '10' });
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ totalCost: '1000.00', supplierInvoiceNo: 'INV-1' });
    expect(first.body.grnNo).toMatch(/^HYD-GR-/);
    expect((await api.get(`/api/parts/purchase-orders/${po.poId}`).set(bearer(s.buyer.token))).body.status).toBe('partially_received');
    expect(await onHand(s.main.id, 'OIL-5W30')).toEqual({ qty: '10.00', avg: '100.00' });

    expect((await receiveAll(s, po, { 'OIL-5W30': '10.01' })).status).toBe(422);
    await receiveAll(s, po, { 'OIL-5W30': '10', 'BP-FRONT': '2' }).expect(201);
    expect((await api.get(`/api/parts/purchase-orders/${po.poId}`).set(bearer(s.buyer.token))).body.status).toBe('received');
    expect(await onHand(s.main.id, 'OIL-5W30')).toEqual({ qty: '20.00', avg: '100.00' });

    // A later order at a different cost moves the average: (20 x 100 + 10 x 130) / 30 = 110.00
    const po2 = await approvedPo(s, [{ partNo: 'OIL-5W30', quantity: '10', unitPrice: '130.00' }]);
    await receiveAll(s, po2, { 'OIL-5W30': '10' }).expect(201);
    expect(await onHand(s.main.id, 'OIL-5W30')).toEqual({ qty: '30.00', avg: '110.00' });

    const events = await owner.db.domainEvent.findMany({ where: { type: 'goods.received' } });
    expect(events.map((e) => (e.payload as { totalCost: string }).totalCost)).toEqual(['1000.00', '19000.00', '1300.00']);
  });

  it('is invisible to other dealerships', async () => {
    const s = await setup();
    const po = await approvedPo(s, [{ partNo: 'BP-FRONT', quantity: '1', unitPrice: '1' }]);
    expect((await api.get(`/api/parts/purchase-orders/${po.poId}`).set(bearer(s.outsider.token))).status).toBe(404);
    expect((await api.post(`/api/parts/purchase-orders/${po.poId}/receipts`).set(bearer(s.outsider.token)).send({ lines: [{ lineId: po.lines[0]!.id, quantity: '1' }] })).status).toBe(404);
  });
});

describe('stock ledger', () => {
  it('always equals on-hand, is append-only, and refuses negative stock', async () => {
    const s = await setup();
    const po = await approvedPo(s, [{ partNo: 'BP-FRONT', quantity: '3', unitPrice: '9000' }]);
    await receiveAll(s, po, { 'BP-FRONT': '3' }).expect(201);

    // Adjust -5 when only 3 are on hand: approval fails and nothing changes.
    const adj = await api.post('/api/parts/adjustments').set(bearer(s.store.token)).send({ dealershipId: s.d.id, branchId: s.main.id, reason: 'count' });
    await api.post(`/api/parts/adjustments/${adj.body.id}/lines`).set(bearer(s.store.token)).send({ partNo: 'BP-FRONT', quantity: '-5' }).expect(201);
    await api.post(`/api/parts/adjustments/${adj.body.id}/transitions`).set(bearer(s.store.token)).send({ action: 'submit' }).expect(200);
    expect((await api.post(`/api/parts/adjustments/${adj.body.id}/transitions`).set(bearer(s.store.token)).send({ action: 'approve' })).status).toBe(403);
    const neg = await api.post(`/api/parts/adjustments/${adj.body.id}/transitions`).set(bearer(s.manager.token)).send({ action: 'approve' });
    expect(neg.status).toBe(409);
    expect(neg.body.error.message).toMatch(/Not enough stock of BP-FRONT: 3 on hand, 5 needed/);
    expect((await api.get(`/api/parts/adjustments/${adj.body.id}`).set(bearer(s.store.token))).body.status).toBe('submitted');

    const adj2 = await api.post('/api/parts/adjustments').set(bearer(s.store.token)).send({ dealershipId: s.d.id, branchId: s.main.id, reason: 'damage' });
    await api.post(`/api/parts/adjustments/${adj2.body.id}/lines`).set(bearer(s.store.token)).send({ partNo: 'BP-FRONT', quantity: '-1' });
    await api.post(`/api/parts/adjustments/${adj2.body.id}/transitions`).set(bearer(s.store.token)).send({ action: 'submit' });
    await api.post(`/api/parts/adjustments/${adj2.body.id}/transitions`).set(bearer(s.manager.token)).send({ action: 'approve' }).expect(200);
    expect(await onHand(s.main.id, 'BP-FRONT')).toEqual({ qty: '2.00', avg: '9000.00' });

    const { rows } = await owner.raw<{ mismatches: string }>(`
      select count(*)::text as mismatches from parts.stock_item si
       where si.quantity_on_hand <> (select coalesce(sum(t.quantity), 0) from parts.inventory_transaction t
                                      where t.branch_id = si.branch_id and t.part_id = si.part_id)`);
    expect(rows[0]!.mismatches).toBe('0');

    const moves = await api.get('/api/parts/movements?partId=' + po.lines[0]!.partId).set(bearer(s.store.token));
    expect(moves.body.items.map((m: { type: string; quantity: string; balanceAfter: string }) => [m.type, m.quantity, m.balanceAfter])).toEqual([
      ['adjustment', '-1.00', '2.00'],
      ['receipt', '3.00', '3.00'],
    ]);
    // Prisma raw-query errors carry the database message in their own message (no pg `cause`).
    await expect(owner.raw('update parts.inventory_transaction set quantity = 99')).rejects.toThrow(/append-only/);
  });
});

describe('parts requests from the workshop', () => {
  async function jobCardFor(s: S) {
    const m = await owner.db.vehicleModel.create({ data: { brand: 'Hyundai', name: 'Tucson' } });
    const v = await owner.db.vehicle.create({ data: { vin: 'PARTSVIN0001', modelId: m!.id } });
    await owner.db.vehicleDealership.create({ data: { vehicleId: v!.id, dealershipId: s.d.id } });
    const c = await owner.db.customer.create({ data: { dealershipId: s.d.id, fullName: 'C', mobile: '0300-9999999', mobileNormalized: '+923009999999' } });
    const visit = await api
      .post('/api/service/visits')
      .set(bearer(s.advisor.token))
      .send({ dealershipId: s.d.id, vehicleId: v!.id, customerId: c!.id, visitType: 'repair', odometerKm: 100 });
    const jc = await api.post(`/api/service/visits/${visit.body.id}/job-card`).set(bearer(s.advisor.token));
    return jc.body.id as number;
  }

  it('issues to the job card at selling price, costs stock at average, and takes returns', async () => {
    const s = await setup();
    const po = await approvedPo(s, [{ partNo: 'OIL-5W30', quantity: '10', unitPrice: '100.00' }]);
    await receiveAll(s, po, { 'OIL-5W30': '10' }).expect(201);
    const jobCardId = await jobCardFor(s);

    const req = await api
      .post('/api/parts/requests')
      .set(bearer(s.advisor.token))
      .send({ jobCardId, branchId: s.main.id, lines: [{ partNo: 'OIL-5W30', quantity: '4.5' }] });
    expect(req.status).toBe(201);
    expect(req.body.requestNo).toMatch(/^HYD-PR-/);
    const lines = await api.get(`/api/parts/requests/${req.body.id}/lines`).set(bearer(s.store.token));
    expect(lines.body[0]).toMatchObject({ quantity: '4.50', issuedQty: '0.00', onHand: '10.00' });
    const lineId = lines.body[0].id;

    expect((await api.post(`/api/parts/requests/${req.body.id}/issue`).set(bearer(s.advisor.token)).send({ lines: [{ lineId, quantity: '1' }] })).status).toBe(403);
    expect((await api.post(`/api/parts/requests/${req.body.id}/issue`).set(bearer(s.store.token)).send({ lines: [{ lineId, quantity: '5' }] })).status).toBe(422);
    await api.post(`/api/parts/requests/${req.body.id}/issue`).set(bearer(s.store.token)).send({ lines: [{ lineId, quantity: '4' }] }).expect(200);
    expect((await api.get(`/api/parts/requests/${req.body.id}`).set(bearer(s.store.token))).body.status).toBe('partially_issued');
    expect(await onHand(s.main.id, 'OIL-5W30')).toEqual({ qty: '6.00', avg: '100.00' });

    let jcLines = await api.get(`/api/service/job-cards/${jobCardId}/lines`).set(bearer(s.advisor.token));
    expect(jcLines.body).toEqual([expect.objectContaining({ kind: 'part', partNo: 'OIL-5W30', quantity: '4.00', unitPrice: '2500.00', amount: '10000.00', source: 'parts', status: 'done' })]);
    // Issued parts are fixed on the job card; changes go through returns.
    expect((await api.patch(`/api/service/job-cards/${jobCardId}/lines/${jcLines.body[0].id}`).set(bearer(s.advisor.token)).send({ quantity: '1' })).status).toBe(409);

    await api.post(`/api/parts/requests/${req.body.id}/issue`).set(bearer(s.store.token)).send({ lines: [{ lineId, quantity: '0.5' }] }).expect(200);
    expect((await api.get(`/api/parts/requests/${req.body.id}`).set(bearer(s.store.token))).body.status).toBe('issued');

    await api.post(`/api/parts/requests/${req.body.id}/return`).set(bearer(s.store.token)).send({ lines: [{ lineId, quantity: '1.5' }] }).expect(200);
    expect((await api.post(`/api/parts/requests/${req.body.id}/return`).set(bearer(s.store.token)).send({ lines: [{ lineId, quantity: '3.01' }] })).status).toBe(422);
    expect(await onHand(s.main.id, 'OIL-5W30')).toEqual({ qty: '7.00', avg: '100.00' });
    jcLines = await api.get(`/api/service/job-cards/${jobCardId}/lines`).set(bearer(s.advisor.token));
    expect(jcLines.body[0]).toMatchObject({ quantity: '3.00', amount: '7500.00' });

    const types = await owner.db.inventoryTransaction.findMany({ where: { referenceType: 'parts_request' }, select: { type: true, value: true }, orderBy: { id: 'asc' } });
    expect(types.map(({ type, value }) => ({ type, value }))).toEqual([
      { type: 'issue', value: '-400.00' },
      { type: 'issue', value: '-50.00' },
      { type: 'return', value: '150.00' },
    ]);
  });

  it('refuses to issue more than the store holds, changing nothing', async () => {
    const s = await setup();
    const jobCardId = await jobCardFor(s);
    const req = await api.post('/api/parts/requests').set(bearer(s.advisor.token)).send({ jobCardId, branchId: s.main.id, lines: [{ partNo: 'BP-FRONT', quantity: '1' }] });
    const lines = await api.get(`/api/parts/requests/${req.body.id}/lines`).set(bearer(s.store.token));
    const res = await api.post(`/api/parts/requests/${req.body.id}/issue`).set(bearer(s.store.token)).send({ lines: [{ lineId: lines.body[0].id, quantity: '1' }] });
    expect(res.status).toBe(409);
    expect((await api.get(`/api/service/job-cards/${jobCardId}/lines`).set(bearer(s.advisor.token))).body).toEqual([]);
    expect((await api.get(`/api/parts/requests/${req.body.id}`).set(bearer(s.store.token))).body.status).toBe('open');
  });
});

describe('transfers between branches', () => {
  it('moves stock out on dispatch and in on receipt at the same cost; only the destination receives', async () => {
    const s = await setup();
    const po = await approvedPo(s, [{ partNo: 'BP-FRONT', quantity: '4', unitPrice: '9000' }]);
    await receiveAll(s, po, { 'BP-FRONT': '4' }).expect(201);

    const t = await api.post('/api/parts/transfers').set(bearer(s.store.token)).send({ dealershipId: s.d.id, branchId: s.main.id, toBranchId: s.north.id });
    expect(t.body.transferNo).toMatch(/^HYD-ST-/);
    await api.post(`/api/parts/transfers/${t.body.id}/lines`).set(bearer(s.store.token)).send({ partNo: 'BP-FRONT', quantity: '3' }).expect(201);
    await api.post(`/api/parts/transfers/${t.body.id}/transitions`).set(bearer(s.store.token)).send({ action: 'dispatch' }).expect(200);
    expect(await onHand(s.main.id, 'BP-FRONT')).toEqual({ qty: '1.00', avg: '9000.00' });
    expect((await onHand(s.north.id, 'BP-FRONT')).qty).toBe('0.00');

    // The storekeeper's grant covers the MAIN branch only: they cannot receive at NORTH.
    expect((await api.post(`/api/parts/transfers/${t.body.id}/transitions`).set(bearer(s.store.token)).send({ action: 'receive' })).status).toBe(409);
    await api.post(`/api/parts/transfers/${t.body.id}/transitions`).set(bearer(s.manager.token)).send({ action: 'receive' }).expect(200);
    expect(await onHand(s.north.id, 'BP-FRONT')).toEqual({ qty: '3.00', avg: '9000.00' });
  });
});
