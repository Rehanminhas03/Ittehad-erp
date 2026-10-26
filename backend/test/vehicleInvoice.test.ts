import { describe, expect, it } from 'vitest';
import { pakistanToday } from '../src/lib/dates';
import { api, bearer, createDealership, createUser, owner, useTestDb } from './helpers';

useTestDb();

const ADMIN = ['sales.orders.view_all', 'sales.orders.invoice'];
const SELLER = ['sales.orders.view_own'];

async function setup() {
  const d = await createDealership('JET');
  const admin = await createUser([{ permissions: ADMIN, dealershipId: d.id }]);
  const seller = await createUser([{ permissions: SELLER, dealershipId: d.id }]);
  const otherSeller = await createUser([{ permissions: SELLER, dealershipId: d.id }]);
  const model = await owner.db.vehicleModel.create({ data: { brand: 'Jetour', name: 'X70 Plus' } });
  const customer = await owner.db.customer.create({ data: { dealershipId: d.id, fullName: 'Invoice Customer', mobile: '03001230000', mobileNormalized: '+923001230000' } });
  let n = 0;
  const order = async (over: Record<string, unknown> = {}, withCar = true) => {
    n += 1;
    const v = withCar ? await owner.db.vehicle.create({ data: { vin: `INVVIN${String(n).padStart(6, '0')}`, modelId: model!.id } }) : null;
    return owner.db.salesOrder.create({
      data: {
        dealershipId: d.id,
        orderNo: `JET-SO-2026-${String(n).padStart(5, '0')}`,
        customerId: customer!.id,
        salespersonId: seller.user.id,
        modelId: model!.id,
        status: 'approved',
        vehicleId: v?.id ?? null,
        ...over,
      },
    });
  };
  return { d, admin, seller, otherSeller, order };
}

describe('vehicle invoice received for a car', () => {
  it('is recorded by the admin, corrected, shown to the salesperson, and one invoice belongs to one car', async () => {
    const s = await setup();
    const o = await s.order();
    const put = (id: number, token: string, body: Record<string, unknown>) => api.put(`/api/sales/orders/${id}/invoice`).set(bearer(token)).send(body);

    const rec = await put(o!.id, s.admin.token, { invoiceNo: 'JIN-001', notes: 'Original copy received' });
    expect(rec.status).toBe(200);
    expect(rec.body).toMatchObject({ invoiceNo: 'JIN-001', invoiceReceivedOn: pakistanToday(), invoiceNotes: 'Original copy received' });
    expect(rec.body.invoiceReceivedByName).toContain('Test User');

    // The salesperson of the customer sees it on the order, and cannot record or change it.
    const seen = await api.get(`/api/sales/orders/${o!.id}`).set(bearer(s.seller.token));
    expect(seen.body).toMatchObject({ invoiceNo: 'JIN-001' });
    expect((await put(o!.id, s.seller.token, { invoiceNo: 'HACK' })).status).toBe(403);
    // Another salesperson does not see the order at all.
    expect((await api.get(`/api/sales/orders/${o!.id}`).set(bearer(s.otherSeller.token))).status).toBe(404);

    // Correcting it replaces the number; a future day is refused.
    expect((await put(o!.id, s.admin.token, { invoiceNo: 'JIN-001A' })).body.invoiceNo).toBe('JIN-001A');
    expect((await put(o!.id, s.admin.token, { invoiceNo: 'X', receivedOn: '2999-01-01' })).status).toBe(422);
    expect((await put(o!.id, s.admin.token, { invoiceNo: '  ' })).status).toBe(422);

    // The same invoice number cannot be on two orders.
    const o2 = await s.order();
    const dup = await put(o2!.id, s.admin.token, { invoiceNo: 'JIN-001A' });
    expect(dup.status).toBe(409);
    expect(JSON.stringify(dup.body)).toContain(o!.orderNo);
  });

  it('needs a car on an approved or delivered order; lists received and pending; can be removed', async () => {
    const s = await setup();
    const put = (id: number, body: Record<string, unknown>) => api.put(`/api/sales/orders/${id}/invoice`).set(bearer(s.admin.token)).send(body);
    const noCar = await s.order({}, false);
    expect((await put(noCar!.id, { invoiceNo: 'A1' })).status).toBe(409);
    const draft = await s.order({ status: 'draft' });
    expect((await put(draft!.id, { invoiceNo: 'A2' })).status).toBe(409);

    const done = await s.order();
    const waiting = await s.order({ status: 'delivered' });
    await put(done!.id, { invoiceNo: 'B1' }).then((r) => expect(r.status).toBe(200));
    const list = (q: string) => api.get(`/api/sales/orders?${q}&pageSize=50`).set(bearer(s.admin.token));
    expect((await list('invoice=received')).body.items.map((i: { id: number }) => i.id)).toEqual([done!.id]);
    expect((await list('invoice=pending')).body.items.map((i: { id: number }) => i.id)).toEqual([waiting!.id]);

    const dash = await api.get('/api/sales/dashboard').set(bearer(s.admin.token));
    expect(dash.body.orders).toMatchObject({ invoicesReceived: 1, invoicesPending: 1 });

    const cleared = await api.delete(`/api/sales/orders/${done!.id}/invoice`).set(bearer(s.admin.token));
    expect(cleared.status).toBe(200);
    expect(cleared.body.invoiceNo).toBeNull();
    expect((await api.delete(`/api/sales/orders/${done!.id}/invoice`).set(bearer(s.admin.token))).status).toBe(409);
  });
});
