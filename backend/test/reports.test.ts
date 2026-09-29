import { describe, expect, it } from 'vitest';
import { invoice, payment } from '../src/modules/accounts/models';
import { customer, vehicle, vehicleModel } from '../src/modules/master/models';
import { part, stockItem } from '../src/modules/parts/models';
import { delivery, lead, salesOrder } from '../src/modules/sales/models';
import { jobCard, jobCardLine, visit } from '../src/modules/service/models';
import { api, bearer, createBranch, createDealership, createUser, owner, useTestDb } from './helpers';

useTestDb();

const today = () => new Date().toISOString().slice(0, 10);
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
let seq = 0;

type Dashboard = {
  mode: string;
  metrics: { key: string; value: string | number | null; hint: string | null }[];
  charts: { key: string; data: { label: string; value: number }[] }[];
  tables: { key: string; rows: Record<string, unknown>[] }[];
};
const metric = (d: Dashboard, key: string) => d.metrics.find((x) => x.key === key)?.value;
const get = (token: string, key: string, query = '') => api.get(`/api/reports/dashboards/${key}${query}`).set(bearer(token));

async function setup() {
  const hyd = await createDealership('HYD');
  const jet = await createDealership('JET');
  const [m] = await owner.db.insert(vehicleModel).values({ brand: 'Hyundai', name: 'Tucson' }).returning();
  const exec1 = await createUser([{ permissions: ['reports.sales.view_own'], dealershipId: hyd.id }]);
  const exec2 = await createUser([{ permissions: ['reports.sales.view_own'], dealershipId: hyd.id }]);
  const manager = await createUser([{ permissions: ['reports.sales.view', 'reports.service.view', 'reports.parts.view', 'reports.accounts.view'], dealershipId: hyd.id }]);
  const group = await createUser([{ permissions: ['reports.sales.view', 'reports.service.view', 'reports.parts.view', 'reports.accounts.view'] }]);
  const nobody = await createUser([{ permissions: ['core.dealerships.view'] }]);
  return { hyd, jet, modelId: m!.id, exec1, exec2, manager, group, nobody };
}
type S = Awaited<ReturnType<typeof setup>>;

async function newCustomer(dealershipId: number) {
  const k = String(++seq).padStart(7, '0');
  const [c] = await owner.db.insert(customer).values({ dealershipId, fullName: `Customer ${seq}`, mobile: `0300-${k}`, mobileNormalized: `+92300${k}` }).returning();
  return c!.id;
}

/** An order (and optionally its completed delivery) for a salesperson. */
async function order(s: S, dealershipId: number, salespersonId: number, total: string, opts: { delivered?: boolean; discount?: string } = {}) {
  const customerId = await newCustomer(dealershipId);
  const unitPrice = (Number(total) + Number(opts.discount ?? 0)).toFixed(2);
  const [o] = await owner.db
    .insert(salesOrder)
    .values({ dealershipId, orderNo: `SO-${++seq}`, customerId, salespersonId, modelId: s.modelId, unitPrice, discount: opts.discount ?? '0', totalAmount: total, status: opts.delivered ? 'delivered' : 'approved' })
    .returning();
  if (opts.delivered) {
    const [v] = await owner.db.insert(vehicle).values({ vin: `RPTVIN${++seq}`, modelId: s.modelId }).returning();
    await owner.db.insert(delivery).values({
      dealershipId, deliveryNo: `DN-${seq}`, salesOrderId: o!.id, vehicleId: v!.id, customerId, salespersonId, scheduledDate: today(), deliveredOn: today(), deliveredAt: new Date(), status: 'delivered',
    });
  }
  return o!.id;
}

async function leadFor(dealershipId: number, ownerId: number, status: 'new' | 'converted' = 'new') {
  const k = String(++seq).padStart(7, '0');
  await owner.db.insert(lead).values({ dealershipId, ownerId, prospectName: 'P', prospectMobile: `0321-${k}`, prospectMobileNormalized: `+92321${k}`, source: 'walk_in', status });
}

describe('dashboard access', () => {
  it('lists only permitted dashboards with their reach, and refuses the rest', async () => {
    const s = await setup();
    expect((await api.get('/api/reports/dashboards').set(bearer(s.exec1.token))).body).toEqual([{ key: 'sales', title: 'Sales', mode: 'own' }]);
    const g = await api.get('/api/reports/dashboards').set(bearer(s.group.token));
    expect(g.body.map((d: { key: string; mode: string }) => `${d.key}:${d.mode}`)).toEqual(['sales:group', 'service:group', 'parts:group', 'accounts:group']);
    expect((await api.get('/api/reports/dashboards').set(bearer(s.nobody.token))).status).toBe(403);
    expect((await get(s.exec1.token, 'service')).status).toBe(403);
    expect((await get(s.manager.token, 'sales', `?dealershipId=${s.jet.id}`)).status).toBe(403);
    expect((await get(s.manager.token, 'sales', '?from=2026-02-01&to=2026-01-01')).status).toBe(422);
    expect((await get(s.manager.token, 'sales', '?from=2024-01-01&to=2026-01-01')).status).toBe(422);
  });
});

describe('sales dashboard', () => {
  it('scopes figures: own work, one dealership, or the whole group with a comparison', async () => {
    const s = await setup();
    await order(s, s.hyd.id, s.exec1.user.id, '9000000.00', { delivered: true, discount: '1000000.00' });
    await order(s, s.hyd.id, s.exec1.user.id, '5000000.00');
    await order(s, s.hyd.id, s.exec2.user.id, '7000000.00', { delivered: true });
    await order(s, s.jet.id, s.exec2.user.id, '6000000.00', { delivered: true });
    await leadFor(s.hyd.id, s.exec1.user.id, 'converted');
    await leadFor(s.hyd.id, s.exec1.user.id);
    await leadFor(s.hyd.id, s.exec2.user.id);

    const own = (await get(s.exec1.token, 'sales')).body as Dashboard;
    expect(own.mode).toBe('own');
    expect(metric(own, 'booked')).toBe(2);
    expect(metric(own, 'bookedValue')).toBe('14000000.00');
    expect(metric(own, 'delivered')).toBe(1);
    expect(metric(own, 'leads')).toBe(2);
    expect(metric(own, 'conversion')).toBe('50.0');
    expect(metric(own, 'discount')).toBe('6.7'); // 1,000,000 of 15,000,000 list
    expect(own.tables.map((t) => t.key)).toEqual([]); // no team table for a salesperson

    const mgr = (await get(s.manager.token, 'sales')).body as Dashboard;
    expect(mgr.mode).toBe('dealership');
    expect(metric(mgr, 'booked')).toBe(3);
    expect(metric(mgr, 'deliveredValue')).toBe('16000000.00');
    expect(mgr.tables.find((t) => t.key === 'by-dealership')).toBeUndefined();
    expect(mgr.tables.find((t) => t.key === 'by-salesperson')!.rows).toHaveLength(2);

    const grp = (await get(s.group.token, 'sales')).body as Dashboard;
    expect(grp.mode).toBe('group');
    expect(metric(grp, 'booked')).toBe(4);
    const cmp = grp.tables.find((t) => t.key === 'by-dealership')!;
    expect(cmp.rows.map((r) => [r.dealership, r.booked, r.deliveredValue])).toEqual([
      ['Dealer HYD', 3, '16000000.00'],
      ['Dealer JET', 1, '6000000.00'],
    ]);
    // Filtering to one dealership drops the comparison.
    const one = (await get(s.group.token, 'sales', `?dealershipId=${s.jet.id}`)).body as Dashboard;
    expect(metric(one, 'booked')).toBe(1);
    expect(one.tables.find((t) => t.key === 'by-dealership')).toBeUndefined();

    const trend = grp.charts.find((c) => c.key === 'deliveries-trend')!;
    expect(trend.data).toHaveLength(6);
    expect(trend.data[5]!.value).toBe(3);
  });

  it('respects the period', async () => {
    const s = await setup();
    await order(s, s.hyd.id, s.exec1.user.id, '1000000.00');
    const past = (await get(s.manager.token, 'sales', '?from=2025-01-01&to=2025-01-31')).body as Dashboard;
    expect(metric(past, 'booked')).toBe(0);
    expect(metric(past, 'bookedValue')).toBe('0.00');
    expect(metric(past, 'open')).toBe(1); // pipeline is "now", not period-bound
  });
});

describe('service, parts and finance dashboards', () => {
  it('computes turnaround, work billed and estimate figures', async () => {
    const s = await setup();
    const advisor = await createUser([{ permissions: ['reports.service.view_own'], dealershipId: s.hyd.id }]);
    const make = async (advisorId: number, arrivedHoursAgo: number, deliveredHoursAgo: number | null) => {
      const [v] = await owner.db.insert(vehicle).values({ vin: `SVCVIN${++seq}`, modelId: s.modelId }).returning();
      const [vi] = await owner.db
        .insert(visit)
        .values({
          dealershipId: s.hyd.id, visitNo: `V-${seq}`, vehicleId: v!.id, customerId: await newCustomer(s.hyd.id), advisorId, visitType: 'repair', visitSequence: 1, odometerKm: 1000,
          warrantyValid: false, freeService: false, arrivedAt: hoursAgo(arrivedHoursAgo), deliveredAt: deliveredHoursAgo === null ? null : hoursAgo(deliveredHoursAgo),
          status: deliveredHoursAgo === null ? 'in_progress' : 'delivered',
        })
        .returning();
      return vi!;
    };
    const v1 = await make(advisor.user.id, 10, 4); // 6 h
    await make(advisor.user.id, 5, 1); // 4 h
    await make(s.manager.user.id, 3, null);
    const [jc] = await owner.db
      .insert(jobCard)
      .values({ dealershipId: s.hyd.id, jobCardNo: `JC-${++seq}`, visitId: v1.id, vehicleId: v1.vehicleId, advisorId: advisor.user.id, status: 'completed', completedAt: hoursAgo(4) })
      .returning();
    await owner.db.insert(jobCardLine).values([
      { dealershipId: s.hyd.id, jobCardId: jc!.id, kind: 'labour', description: 'L', quantity: '2', unitPrice: '3000', amount: '6000.00' },
      { dealershipId: s.hyd.id, jobCardId: jc!.id, kind: 'part', description: 'P', quantity: '1', unitPrice: '14500', amount: '14500.00' },
      { dealershipId: s.hyd.id, jobCardId: jc!.id, kind: 'labour', description: 'Free', quantity: '1', unitPrice: '500', amount: '500.00', billable: false },
    ]);

    const own = (await get(advisor.token, 'service')).body as Dashboard;
    expect(own.mode).toBe('own');
    expect(metric(own, 'visits')).toBe(2);
    expect(metric(own, 'turnaround')).toBe('5.0');
    expect(metric(own, 'labour')).toBe('6000.00');
    expect(metric(own, 'parts')).toBe('14500.00');
    const mgr = (await get(s.manager.token, 'service')).body as Dashboard;
    expect(metric(mgr, 'visits')).toBe(3);
    expect(metric(mgr, 'inWorkshop')).toBe(1);
  });

  it('values stock and flags low stock per branch', async () => {
    const s = await setup();
    const [p1] = await owner.db.insert(part).values({ partNo: 'A-1', description: 'A', sellingPrice: '10' }).returning();
    const [p2] = await owner.db.insert(part).values({ partNo: 'B-1', description: 'B', sellingPrice: '10' }).returning();
    const b = await createBranch(s.hyd.id, 'MAIN');
    await owner.db.insert(stockItem).values([
      { dealershipId: s.hyd.id, branchId: b.id, partId: p1!.id, quantityOnHand: '10', averageCost: '150.00', reorderLevel: '5' },
      { dealershipId: s.hyd.id, branchId: b.id, partId: p2!.id, quantityOnHand: '2', averageCost: '1000.00', reorderLevel: '5' },
    ]);
    const d = (await get(s.manager.token, 'parts')).body as Dashboard;
    expect(metric(d, 'stockValue')).toBe('3500.00');
    expect(metric(d, 'low')).toBe(1);
    expect(d.tables.find((t) => t.key === 'by-branch')!.rows).toEqual([{ name: 'Branch MAIN', stockValue: '3500.00', stocked: 2, low: 1 }]);
    expect(metric((await get(s.group.token, 'parts', `?dealershipId=${s.jet.id}`)).body, 'stockValue')).toBe('0.00');
  });

  it('reports invoicing, collections, receivables and overdue', async () => {
    const s = await setup();
    const c = await newCustomer(s.hyd.id);
    const inv = (total: string, paid: string, status: 'issued' | 'partially_paid' | 'paid' | 'draft', due: string) => ({
      dealershipId: s.hyd.id, invoiceNo: `INV-${++seq}`, kind: 'service' as const, customerId: c, sourceType: 'job_card', sourceId: seq, invoiceDate: today(), dueDate: due,
      subtotal: total, taxAmount: '0', totalAmount: total, amountPaid: paid, status,
    });
    await owner.db.insert(invoice).values([
      inv('1000.00', '0', 'issued', '2020-01-01'),
      inv('2000.00', '500.00', 'partially_paid', '2999-01-01'),
      inv('3000.00', '3000.00', 'paid', today()),
      inv('9999.00', '0', 'draft', today()),
    ]);
    await owner.db.insert(payment).values({ dealershipId: s.hyd.id, paymentNo: `RC-${++seq}`, direction: 'receipt', customerId: c, method: 'cash', paymentDate: today(), amount: '3500.00' });
    const d = (await get(s.manager.token, 'accounts')).body as Dashboard;
    expect(metric(d, 'invoiced')).toBe('6000.00'); // drafts excluded
    expect(metric(d, 'collected')).toBe('3500.00');
    expect(metric(d, 'receivable')).toBe('2500.00');
    expect(metric(d, 'overdue')).toBe('1000.00');
    expect(d.tables.find((t) => t.key === 'top-debtors')!.rows[0]).toMatchObject({ outstanding: '2500.00', overdue: '1000.00' });
  });
});
