import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { dealership, userRole } from '../src/modules/core/models';
import { vehicleModel } from '../src/modules/master/models';
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
    am: await staff('Assistant Manager', d.id),
    sales1: await staff('Salesperson', d.id),
    sales2: await staff('Salesperson', d.id),
  };
}
type Setup = Awaited<ReturnType<typeof setup>>;

/** Model and variant are required on every lead. */
const vehicleOf = (s: Setup) => ({ interestedModelId: s.modelId, variant: '2.0 GLS' });
async function lead(s: Setup, mobile = '03001234567') {
  const l = await api
    .post('/api/sales/leads')
    .set(bearer(s.sales1.token))
    .send({ dealershipId: s.d.id, prospectName: 'Ayesha Khan', prospectMobile: mobile, preferredColor: 'White', ...vehicleOf(s) })
    .expect(201);
  return l.body.id as number;
}
async function convert(s: Setup, id: number) {
  await api
    .post(`/api/sales/leads/${id}/convert`)
    .set(bearer(s.sales1.token))
    .send({ ...vehicleOf(s), preferredColor: 'White', email: 'ayesha@example.com', paymentInstrument: 'cheque', paymentInstrumentRef: 'CH-1' })
    .expect(200);
}
const quote = (who: Login, id: number, body: Record<string, unknown> = {}) => api.post(`/api/sales/leads/${id}/quotations`).set(bearer(who.token)).send(body);
// PBO, chassis and engine are required on a voucher; tests that are not about them get placeholders.
const VOUCHER_IDS = { pboNo: 'PBO-T1', chassisNo: 'CHASSIST1', engineNo: 'ENGINET1' };
const ppf = (who: Login, id: number, body: Record<string, unknown>) => api.post(`/api/sales/leads/${id}/ppf-forms`).set(bearer(who.token)).send({ ...VOUCHER_IDS, ...body });
const get = (who: Login, path: string) => api.get(`/api/sales/${path}`).set(bearer(who.token));
const patch = (who: Login, path: string, body: Record<string, unknown>) => api.patch(`/api/sales/${path}`).set(bearer(who.token)).send(body);

describe('vehicle quotations', () => {
  it('are numbered and stored with the vehicle, customer and price; the document has everything to print', async () => {
    const s = await setup();
    const id = await lead(s);
    const res = await quote(s.sales1, id, { unitPrice: '9500000', discount: '150000', validDays: 10, notes: 'Includes registration' });
    expect(res.status).toBe(201);
    const validUntil = new Date(Date.now() + 5 * 3600_000 + 10 * 86400_000).toISOString().slice(0, 10);
    expect(res.body).toMatchObject({
      quotationNo: expect.stringMatching(/^HYD-QT-\d{4}-00001$/),
      leadId: id,
      ownerId: s.sales1.user.id,
      customerName: 'Ayesha Khan',
      modelName: 'Hyundai Tucson',
      color: 'White',
      unitPrice: '9500000.00',
      discount: '150000.00',
      totalAmount: '9350000.00',
      validUntil,
      createdByName: s.sales1.user.fullName,
    });
    const doc = await get(s.sales1, `quotations/${res.body.id}/document`);
    expect(doc.status).toBe(200);
    expect(doc.body).toMatchObject({
      quotationNo: res.body.quotationNo,
      validUntil,
      customer: { name: 'Ayesha Khan', mobile: '03001234567' },
      vehicle: { model: 'Hyundai Tucson', color: 'White' },
      pricing: { unitPrice: '9500000.00', discount: '150000.00', total: '9350000.00' },
      dealership: { code: 'HYD' },
      salesperson: { name: s.sales1.user.fullName },
      notes: 'Includes registration',
      createdByName: s.sales1.user.fullName,
    });
    expect((await quote(s.sales1, id, { unitPrice: '9500000' })).body.quotationNo).toMatch(/-00002$/);
  });

  it('adds freight & insurance and withholding tax as line items, per vehicle; corrections recompute the total', async () => {
    const s = await setup();
    const id = await lead(s);
    const res = await quote(s.sales1, id, {
      unitPrice: '12240000',
      freightInsurance: '68000',
      withholdingTax: '246160',
      withholdingTaxNonFiler: '1311450',
      billTo: 'Bank Islami Pakistan Ltd A/C Green Appliances Pvt Ltd',
      deliveryDays: 10,
      paymentMode: '100% Advance Payment',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ quantity: 1, totalAmount: '12554160.00', freightInsurance: '68000.00', withholdingTaxNonFiler: '1311450.00' });
    const doc = (await get(s.sales1, `quotations/${res.body.id}/document`)).body;
    expect(doc).toMatchObject({
      billTo: 'Bank Islami Pakistan Ltd A/C Green Appliances Pvt Ltd',
      deliveryDays: 10,
      paymentMode: '100% Advance Payment',
      pricing: { quantity: 1, unitPrice: '12240000.00', freightInsurance: '68000.00', withholdingTax: '246160.00', total: '12554160.00' },
    });
    const two = await patch(s.sales1, `quotations/${res.body.id}`, { quantity: 2 });
    expect(two.body.totalAmount).toBe('25108320.00');
    expect((await patch(s.sales1, `quotations/${res.body.id}`, { quantity: 0 })).status).toBe(422);
  });

  it('needs a model and a price, keeps to the discount policy, and uses the order price once raised', async () => {
    const s = await setup();
    const id = await lead(s);
    await convert(s, id);
    expect((await quote(s.sales1, id)).status).toBe(422); // no price yet, no order
    expect((await quote(s.sales1, id, { unitPrice: '1000', discount: '900' })).status).toBe(422); // discount policy
    await api.post(`/api/sales/leads/${id}/order`).set(bearer(s.admin.token)).send({ unitPrice: '8800000', discount: '50000' }).expect(201);
    const fromOrder = await quote(s.sales1, id);
    expect(fromOrder.status).toBe(201);
    expect(fromOrder.body).toMatchObject({ unitPrice: '8800000.00', discount: '50000.00', totalAmount: '8750000.00' });
    expect((await get(s.sales1, `quotations/${fromOrder.body.id}/document`)).body.orderNo).toMatch(/SO-/);
  });

  it('salesperson and Assistant Manager issue and correct; Manager and Admin view only; others see nothing', async () => {
    const s = await setup();
    const id = await lead(s);
    const q = (await quote(s.sales1, id, { unitPrice: '9000000' })).body;
    // The Assistant Manager may issue for anyone's lead; the owner stays the lead's salesperson.
    const byAm = await quote(s.am, id, { unitPrice: '9100000' });
    expect(byAm.status).toBe(201);
    expect(byAm.body).toMatchObject({ ownerId: s.sales1.user.id, createdById: s.am.user.id });
    expect((await quote(s.manager, id, { unitPrice: '1' })).status).toBe(403);
    expect((await quote(s.admin, id, { unitPrice: '1' })).status).toBe(403);
    expect((await quote(s.sales2, id, { unitPrice: '1' })).status).toBe(404);

    // Corrections: the salesperson, then the Assistant Manager; totals recomputed; who changed it is kept.
    const fixed = await patch(s.sales1, `quotations/${q.id}`, { discount: '100000', color: 'Phantom Black' });
    expect(fixed.status).toBe(200);
    expect(fixed.body).toMatchObject({ totalAmount: '8900000.00', color: 'Phantom Black', updatedByName: s.sales1.user.fullName });
    const byAmFix = await patch(s.am, `quotations/${q.id}`, { unitPrice: '9200000' });
    expect(byAmFix.body).toMatchObject({ totalAmount: '9100000.00', createdByName: s.sales1.user.fullName, updatedByName: s.am.user.fullName });
    expect((await patch(s.am, `quotations/${q.id}`, { discount: '5000000' })).status).toBe(422);
    expect((await patch(s.manager, `quotations/${q.id}`, { notes: 'x' })).status).toBe(403);
    expect((await patch(s.sales2, `quotations/${q.id}`, { notes: 'x' })).status).toBe(404);

    for (const who of [s.manager, s.admin, s.am]) {
      expect((await get(who, `quotations/${q.id}/document`)).status).toBe(200);
      expect((await get(who, 'quotations')).body.total).toBe(2);
    }
    expect((await get(s.sales2, 'quotations')).body.total).toBe(0);
    expect((await get(s.sales2, `quotations/${q.id}/document`)).status).toBe(404);

    // History: who created it and every change, also in the activity log.
    const history = (await get(s.manager, `quotations/${q.id}/history`)).body.audit;
    expect(history.map((h: { action: string; actorName: string }) => [h.action, h.actorName])).toEqual(
      expect.arrayContaining([
        ['create', s.sales1.user.fullName],
        ['update', s.sales1.user.fullName],
        ['update', s.am.user.fullName],
      ]),
    );
    const log = await api.get('/api/core/activity/mine?category=documents').set(bearer(s.am.token));
    expect(log.body.items[0]).toMatchObject({ entityType: 'sales.quotation', action: 'update', changes: { unitPrice: { to: '9200000' } } });
  });
});

describe('PPF (Paint Protection Film) forms', () => {
  it('records coverage and amount; balance after the advance is on the document', async () => {
    const s = await setup();
    const id = await lead(s);
    const res = await ppf(s.sales1, id, { coverage: 'full_body', filmBrand: 'XPEL', finish: 'matte', warrantyYears: 5, amount: '350000', discount: '20000', advancePaid: '100000', installationDate: '2026-10-05' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ formNo: expect.stringMatching(/^HYD-PF-\d{4}-00001$/), totalAmount: '330000.00', advancePaid: '100000.00', customerName: 'Ayesha Khan' });
    const doc = (await get(s.admin, `ppf-forms/${res.body.id}/document`)).body;
    expect(doc).toMatchObject({
      formNo: res.body.formNo,
      coverage: 'full_body',
      finish: 'matte',
      warrantyYears: 5,
      installationDate: '2026-10-05',
      vehicle: { model: 'Hyundai Tucson' },
      pricing: { amount: '350000.00', discount: '20000.00', total: '330000.00', advancePaid: '100000.00', balance: '230000.00' },
    });
  });

  it('checks the amounts and who may issue, correct and see them', async () => {
    const s = await setup();
    const id = await lead(s);
    expect((await ppf(s.sales1, id, { coverage: 'partial', amount: '100000', discount: '200000' })).status).toBe(422);
    expect((await ppf(s.sales1, id, { coverage: 'partial', amount: '100000', advancePaid: '200000' })).status).toBe(422);
    expect((await ppf(s.sales1, id, { coverage: 'nose', amount: '100000' })).status).toBe(422);
    expect((await ppf(s.manager, id, { coverage: 'partial', amount: '100000' })).status).toBe(403);
    const f = (await ppf(s.sales1, id, { coverage: 'front_package', amount: '120000' })).body;
    expect(f).toMatchObject({ finish: 'gloss', discount: '0.00', totalAmount: '120000.00' });

    const fixed = await patch(s.am, `ppf-forms/${f.id}`, { amount: '150000', advancePaid: '50000', coverageDetails: 'Bonnet, bumper, mirrors' });
    expect(fixed.body).toMatchObject({ totalAmount: '150000.00', updatedByName: s.am.user.fullName, createdByName: s.sales1.user.fullName });
    expect((await patch(s.sales1, `ppf-forms/${f.id}`, { discount: '120000', advancePaid: '50000' })).status).toBe(422); // advance > total
    expect((await patch(s.admin, `ppf-forms/${f.id}`, { amount: '1' })).status).toBe(403);
    expect((await get(s.sales2, `ppf-forms/${f.id}`)).status).toBe(404);
    expect((await get(s.manager, `ppf-forms?leadId=${id}`)).body.total).toBe(1);
    const log = await api.get(`/api/core/activity/team?category=documents`).set(bearer(s.manager.token));
    expect(log.body.items.map((i: { entityType: string }) => i.entityType)).toContain('sales.ppf_form');
  });
});

describe('monthly track record', () => {
  it('counts cars booked, PPF sold and its amount per salesperson; salespeople see only their own', async () => {
    const s = await setup();
    const id = await lead(s);
    await convert(s, id);
    await api.post(`/api/sales/leads/${id}/order`).set(bearer(s.admin.token)).send({ unitPrice: '9000000' }).expect(201);
    await ppf(s.sales1, id, { coverage: 'full_body', amount: '300000', discount: '20000', advancePaid: '50000' }).expect(201);
    await ppf(s.sales1, id, { coverage: 'partial', amount: '100000' }).expect(201);
    await quote(s.sales1, id).expect(201);
    const other = await api.post('/api/sales/leads').set(bearer(s.sales2.token)).send({ dealershipId: s.d.id, prospectName: 'Bilal', prospectMobile: '03220000000', ...vehicleOf(s) });
    await ppf(s.sales2, other.body.id, { coverage: 'front_package', amount: '90000' }).expect(201);

    const now = new Date(Date.now() + 5 * 3600_000);
    const [year, month] = [now.getUTCFullYear(), now.getUTCMonth() + 1];
    const track = (who: Login, extra = '') => api.get(`/api/sales/team/track-record?dealershipId=${s.d.id}&year=${year}${extra}`).set(bearer(who.token));

    const team = await track(s.manager, `&month=${month}`);
    expect(team.status).toBe(200);
    expect(team.body).toMatchObject({ scope: 'team', totals: { carsBooked: 1, ppfSold: 3, ppfAmount: '470000.00', ppfAdvance: '50000.00', quotations: 1 } });
    const row = (b: { members: { userId: number }[] }, u: Login) => b.members.find((m) => m.userId === u.user.id);
    expect(row(team.body, s.sales1)).toMatchObject({ carsBooked: 1, ppfSold: 2, ppfAmount: '380000.00', quotations: 1 });
    expect(row(team.body, s.sales2)).toMatchObject({ carsBooked: 0, ppfSold: 1, ppfAmount: '90000.00' });
    const thisMonth = team.body.months.find((m: { month: string }) => m.month === `${year}-${String(month).padStart(2, '0')}`);
    expect(team.body.months).toHaveLength(12);
    expect(thisMonth).toMatchObject({ carsBooked: 1, ppfSold: 3, ppfAmount: '470000.00' });
    for (const who of [s.am, s.admin]) expect((await track(who)).body.scope).toBe('salespeople');

    const own = await track(s.sales2);
    expect(own.body).toMatchObject({ scope: 'own', totals: { ppfSold: 1, ppfAmount: '90000.00', carsBooked: 0 } });
    expect(own.body.members).toHaveLength(1);
    expect(own.body.months.reduce((a: number, m: { ppfSold: number }) => a + m.ppfSold, 0)).toBe(1);

    // Every PPF record, filterable by salesperson and date.
    const today = now.toISOString().slice(0, 10);
    const list = await api.get(`/api/sales/ppf-forms?ownerId=${s.sales1.user.id}&createdFrom=${today}&createdTo=${today}`).set(bearer(s.manager.token));
    expect(list.body.total).toBe(2);
  });
});

describe('quotation format per dealership', () => {
  it('starts with the built-in format; the AM and Manager edit it, every quotation prints with it, audited', async () => {
    const s = await setup();
    const tpl = (who: Login) => api.get(`/api/sales/document-templates/quotation?dealershipId=${s.d.id}`).set(bearer(who.token));
    const save = (who: Login, body: Record<string, unknown>) => api.put('/api/sales/document-templates/quotation').set(bearer(who.token)).send({ dealershipId: s.d.id, ...body });

    const first = await tpl(s.sales1);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ isDefault: true, defaultValidityDays: 7 });
    const id = await lead(s);
    const q = (await quote(s.sales1, id, { unitPrice: '9000000' })).body;

    const { isDefault: _d, updatedAt: _u, updatedByName: _n, kind: _k, dealershipId: _i, ...fields } = first.body;
    const edited = { ...fields, companyName: 'Ittehad Automotive (Pvt) Ltd', terms: [...fields.terms, 'Test drive available on request.'], defaultValidityDays: 10 };
    expect((await save(s.sales1, edited)).status).toBe(403);
    expect((await save(s.admin, edited)).status).toBe(403);
    const byAm = await save(s.am, edited);
    expect(byAm.status).toBe(200);
    expect(byAm.body).toMatchObject({ isDefault: false, companyName: 'Ittehad Automotive (Pvt) Ltd', updatedByName: s.am.user.fullName });
    const byMgr = await save(s.manager, { ...edited, phone: '051-1234567' });
    expect(byMgr.body).toMatchObject({ phone: '051-1234567', updatedByName: s.manager.user.fullName });
    expect((await save(s.manager, { ...edited, companyName: '' })).status).toBe(422);

    // An existing quotation now prints with the edited format.
    const doc = (await get(s.admin, `quotations/${q.id}/document`)).body;
    expect(doc.template).toMatchObject({ companyName: 'Ittehad Automotive (Pvt) Ltd', phone: '051-1234567' });
    expect(doc.template.terms.at(-1)).toBe('Test drive available on request.');

    const log = await api.get('/api/core/activity/mine?category=documents').set(bearer(s.manager.token));
    expect(log.body.items[0]).toMatchObject({ entityType: 'sales.document_template', action: 'update', changes: { phone: { to: '051-1234567' } } });
  });
});

describe('PPF voucher', () => {
  it('prints PBO, chassis and engine: as written on the form, else from the sales order; with the letterhead', async () => {
    const s = await setup();
    const id = await lead(s);
    const written = (await ppf(s.sales1, id, { coverage: 'full_body', amount: '300000', advancePaid: '100000', pboNo: 'PBO-7781', chassisNo: 'MALPC81BLRM123456', engineNo: 'G4FL-889900', installationDate: '2026-10-05' })).body;
    const doc = (await get(s.sales1, `ppf-forms/${written.id}/document`)).body;
    expect(doc).toMatchObject({
      pboNo: 'PBO-7781',
      vehicle: { vin: 'MALPC81BLRM123456', engineNo: 'G4FL-889900' },
      installationDate: '2026-10-05',
      pricing: { total: '300000.00', advancePaid: '100000.00', balance: '200000.00' },
      template: { companyName: 'Ittehad Automotive' },
      salesperson: { name: s.sales1.user.fullName },
    });

    await convert(s, id);
    await api.post(`/api/sales/leads/${id}/order`).set(bearer(s.admin.token)).send({ unitPrice: '9000000' }).expect(201);
    // Not typed: taken from the sales order (PBO) and its vehicle (chassis / engine); none known yet -> required.
    const noVehicle = await api.post(`/api/sales/leads/${id}/ppf-forms`).set(bearer(s.sales1.token)).send({ coverage: 'partial', amount: '100000' });
    expect(noVehicle.status).toBe(422);
    expect(JSON.stringify(noVehicle.body)).toContain('chassisNo');
    expect(JSON.stringify(noVehicle.body)).not.toContain('pboNo'); // the order has a number
    const orderId = (await get(s.sales1, `leads/${id}`)).body.salesOrderId;
    await api.put(`/api/sales/orders/${orderId}/vehicle`).set(bearer(s.admin.token)).send({ vin: 'ORDERVIN0001', engineNo: 'ORDERENG1' }).expect(200);
    const fromOrder = await api.post(`/api/sales/leads/${id}/ppf-forms`).set(bearer(s.sales1.token)).send({ coverage: 'partial', amount: '100000' });
    expect(fromOrder.status).toBe(201);
    expect(fromOrder.body).toMatchObject({ pboNo: expect.stringMatching(/SO-/), chassisNo: 'ORDERVIN0001', engineNo: 'ORDERENG1' });
  });
});

describe('variant codes (Hyundai)', () => {
  it('AM / Manager paste codes from Excel; the salesperson picks one and its description is printed', async () => {
    const s = await setup();
    await owner.db.update(dealership).set({ brand: 'Hyundai' }).where(eq(dealership.id, s.d.id));
    const paste = (who: Login, rows: { code: string; description: string }[]) => api.post('/api/sales/variants/import').set(bearer(who.token)).send({ dealershipId: s.d.id, rows });
    const rows = [
      { code: 'nx4fl16thaw', description: 'TUCSON HEV 1598CC 6A/T AWD SIGNATURE' },
      { code: 'NX4FL16THFW', description: 'TUCSON HEV 1598CC 6A/T FWD SMART' },
    ];
    expect((await paste(s.sales1, rows)).status).toBe(403);
    expect((await paste(s.am, rows)).body).toEqual({ added: 2, updated: 0, unchanged: 0 });
    expect((await paste(s.manager, [...rows.slice(0, 1), { code: 'NX4FL16THFW', description: 'TUCSON HEV 1598CC 6A/T FWD SMART (NNB)' }])).body).toEqual({ added: 0, updated: 1, unchanged: 1 });

    const list = (await get(s.sales1, `variants?dealershipId=${s.d.id}&q=tucson`)).body;
    expect(list.total).toBe(2);
    expect(list.items[0]).toMatchObject({ code: 'NX4FL16THAW', modelId: s.modelId, modelName: 'Hyundai Tucson' });
    expect((await api.post('/api/sales/variants').set(bearer(s.sales1.token)).send({ dealershipId: s.d.id, code: 'X1', description: 'Test' })).status).toBe(403);
    expect((await api.post('/api/sales/variants').set(bearer(s.am.token)).send({ dealershipId: s.d.id, code: 'NX4FL16THAW', description: 'Dup' })).status).toBe(409);

    const id = await lead(s);
    const q = await quote(s.sales1, id, { unitPrice: '12240000', variantCode: 'nx4fl16thaw' });
    expect(q.status).toBe(201);
    expect(q.body).toMatchObject({ variantCode: 'NX4FL16THAW', variant: 'TUCSON HEV 1598CC 6A/T AWD SIGNATURE' });
    expect((await get(s.sales1, `quotations/${q.body.id}/document`)).body).toMatchObject({ variantCode: 'NX4FL16THAW', vehicle: { variant: 'TUCSON HEV 1598CC 6A/T AWD SIGNATURE' } });
    expect((await quote(s.sales1, id, { unitPrice: '1', variantCode: 'NOPE' })).status).toBe(422);
    const changed = await patch(s.sales1, `quotations/${q.body.id}`, { variantCode: 'NX4FL16THFW' });
    expect(changed.body).toMatchObject({ variantCode: 'NX4FL16THFW', variant: 'TUCSON HEV 1598CC 6A/T FWD SMART (NNB)' });
  });
});

describe('Hyundai Ref and PPF voucher from the order', () => {
  it('Hyundai quotations need a variant code (it is in the Ref); other brands do not', async () => {
    const s = await setup();
    const id = await lead(s);
    // TestBrand dealership, no format prefix: no code needed.
    expect((await quote(s.sales1, id, { unitPrice: '9000000' })).status).toBe(201);
    await owner.db.update(dealership).set({ brand: 'Hyundai' }).where(eq(dealership.id, s.d.id));
    // Hyundai but no codes yet: still fine.
    expect((await quote(s.sales1, id, { unitPrice: '9000000' })).status).toBe(201);
    await api.post('/api/sales/variants/import').set(bearer(s.am.token)).send({ dealershipId: s.d.id, rows: [{ code: 'NX4FL16THAW', description: 'TUCSON HEV 1598CC 6A/T AWD SIGNATURE' }] }).expect(200);
    const without = await quote(s.sales1, id, { unitPrice: '9000000' });
    expect(without.status).toBe(422);
    expect(JSON.stringify(without.body)).toContain('Choose the variant code');
    const withCode = await quote(s.sales1, id, { unitPrice: '9000000', variantCode: 'NX4FL16THAW' });
    expect(withCode.status).toBe(201);
    expect((await patch(s.sales1, `quotations/${withCode.body.id}`, { variantCode: null })).status).toBe(422);
    expect((await get(s.sales1, `quotations/${withCode.body.id}/document`)).body.template.refPrefix).toBe('HI');
  });

  it('gives the PPF voucher the PBO, chassis and engine from the sales order, else nothing', async () => {
    const s = await setup();
    const id = await lead(s);
    const before = await get(s.sales1, `leads/${id}/order-vehicle`);
    expect(before.status).toBe(200);
    expect(before.body).toEqual({ orderNo: null, chassisNo: null, engineNo: null });
    await convert(s, id);
    const order = (await api.post(`/api/sales/leads/${id}/order`).set(bearer(s.admin.token)).send({ unitPrice: '9000000' })).body;
    await api.put(`/api/sales/orders/${order.id}/vehicle`).set(bearer(s.admin.token)).send({ vin: 'MALPC81BLRM123456', engineNo: 'G4FL889900' });
    const after = (await get(s.sales1, `leads/${id}/order-vehicle`)).body;
    expect(after).toMatchObject({ orderNo: order.orderNo, chassisNo: 'MALPC81BLRM123456', engineNo: 'G4FL889900' });
    expect((await get(s.sales2, `leads/${id}/order-vehicle`)).status).toBe(404);
  });
});

describe('track record: every stage', () => {
  it('counts leads logged and converted before any order is raised; an escalated conversion is credited to the salesperson', async () => {
    const s = await setup();
    const now = new Date(Date.now() + 5 * 3600_000);
    const [year, month] = [now.getUTCFullYear(), now.getUTCMonth() + 1];
    const track = (who: Login) => api.get(`/api/sales/team/track-record?dealershipId=${s.d.id}&year=${year}&month=${month}`).set(bearer(who.token));

    // Salesperson 1: two leads, one converted, no order yet (the Sales Admin has not raised it).
    const a = await lead(s, '03001111111');
    await lead(s, '03001111112');
    await convert(s, a);
    // Salesperson 1's third lead is escalated by salesperson 2 and converted by the Assistant Manager.
    const c = await lead(s, '03001111113');
    await api.post('/api/sales/leads/escalations').set(bearer(s.sales2.token)).send({ dealershipId: s.d.id, prospectMobile: '03001111113', note: 'Customer is here' }).expect(200);
    await api
      .post(`/api/sales/leads/${c}/convert`)
      .set(bearer(s.am.token))
      .send({ ...vehicleOf(s), preferredColor: 'White', email: 'c@example.com', paymentInstrument: 'cheque', paymentInstrumentRef: 'CH-9' })
      .expect(200);

    for (const who of [s.am, s.manager, s.admin]) {
      const t = (await track(who)).body;
      expect(t).toMatchObject({ scope: who === s.manager ? 'team' : 'salespeople', totals: { leadsLogged: 3, converted: 2, carsBooked: 0 } });
      expect(t.members.find((m: { userId: number }) => m.userId === s.sales1.user.id)).toMatchObject({ leadsLogged: 3, converted: 2, carsBooked: 0 });
      expect(t.months.find((m: { month: string }) => m.month === `${year}-${String(month).padStart(2, '0')}`)).toMatchObject({ leadsLogged: 3, converted: 2 });
    }
    expect((await track(s.sales1)).body).toMatchObject({ scope: 'own', totals: { leadsLogged: 3, converted: 2 } });
    expect((await track(s.sales2)).body.totals).toMatchObject({ leadsLogged: 0, converted: 0 });

    // Once the Admin raises the order it is also a car booked.
    await api.post(`/api/sales/leads/${a}/order`).set(bearer(s.admin.token)).send({ unitPrice: '9000000' }).expect(201);
    expect((await track(s.manager)).body.totals).toMatchObject({ converted: 2, carsBooked: 1 });
  });
});

describe('track record, dashboard and leads for one person', () => {
  it('Manager sees everyone; AM / Admin only the salespeople; the record and dashboard narrow to one person', async () => {
    const s = await setup();
    const now = new Date(Date.now() + 5 * 3600_000);
    const q = `year=${now.getUTCFullYear()}&month=${now.getUTCMonth() + 1}`;
    const track = (who: Login, extra = '') => api.get(`/api/sales/team/track-record?dealershipId=${s.d.id}&${q}${extra}`).set(bearer(who.token));
    await lead(s, '03002222221'); // sales1
    await lead(s, '03002222222'); // sales1
    await api.post('/api/sales/leads').set(bearer(s.sales2.token)).send({ dealershipId: s.d.id, prospectName: 'Other', prospectMobile: '03002222223', ...vehicleOf(s) }).expect(201);

    const ids = (b: { members: { userId: number }[] }) => b.members.map((m) => m.userId).sort();
    const sellers = [s.sales1.user.id, s.sales2.user.id].sort();
    // A manager-level role that can also convert its own leads (Dealership Manager) is not a salesperson.
    const dm = await staff('Dealership Manager', s.d.id);
    const cro = await staff('CRO', s.d.id);
    await api.post('/api/sales/leads').set(bearer(dm.token)).send({ dealershipId: s.d.id, prospectName: 'Walk-in', prospectMobile: '03002222224', ...vehicleOf(s) });
    // Manager: Salespersons and CROs, plus team leaders only with leads of their own (not the AM or
    // the Sales Manager, who logged none). The Dealership Manager is never listed, even with a lead.
    // AM / Admin: the salespeople plus active team leaders; never the CRO.
    const mgr = (await track(s.manager)).body;
    expect(mgr.scope).toBe('team');
    expect(ids(mgr)).toEqual([...sellers, cro.user.id].sort());
    expect(mgr.totals.leadsLogged).toBe(3); // the Dealership Manager's walk-in is not counted
    const kind = (u: Login) => mgr.people.find((p: { userId: number }) => p.userId === u.user.id)?.kind;
    expect([kind(s.sales1), kind(cro), kind(dm)]).toEqual(['salesperson', 'cro', undefined]);
    // All Salespersons together, all CROs together.
    expect(ids((await track(s.manager, '&group=salespeople')).body)).toEqual(sellers);
    expect(ids((await track(s.manager, '&group=cros')).body)).toEqual([cro.user.id]);
    expect((await track(s.am, '&group=cros')).status).toBe(403);
    expect((await track(s.manager, `&userId=${dm.user.id}`)).status).toBe(403);
    // Nor in the salesperson filters (team members).
    const staffList = (await api.get(`/api/sales/team/members?dealershipId=${s.d.id}`).set(bearer(s.manager.token))).body;
    expect(staffList.map((m: { id: number }) => m.id)).not.toContain(dm.user.id);
    for (const who of [s.am, s.admin]) {
      const b = (await track(who)).body;
      expect(b.scope).toBe('salespeople');
      expect(ids(b)).toEqual(sellers);
      expect(b.people.map((p: { userId: number }) => p.userId).sort()).toEqual(sellers);
      expect(b.totals.leadsLogged).toBe(3);
      expect(ids(b)).not.toContain(s.am.user.id); // no leads of their own
      expect(ids(b)).not.toContain(cro.user.id); // CROs are not salespeople here
    }
    // One person.
    const one = (await track(s.am, `&userId=${s.sales1.user.id}`)).body;
    expect(one).toMatchObject({ userId: s.sales1.user.id, totals: { leadsLogged: 2 } });
    expect(ids(one)).toEqual([s.sales1.user.id]);
    expect((await track(s.am, `&userId=${s.manager.user.id}`)).status).toBe(403); // not a salesperson
    expect((await track(s.sales2, `&userId=${s.sales1.user.id}`)).status).toBe(403); // someone else's record

    // Dashboard for one person (team views only).
    const dash = (who: Login, extra = '') => api.get(`/api/sales/dashboard?days=14${extra}`).set(bearer(who.token));
    expect((await dash(s.manager, `&ownerId=${s.sales1.user.id}`)).body.leads.total).toBe(2);
    expect((await dash(s.manager)).body.leads.total).toBe(4); // incl. the Dealership Manager's lead
    expect((await dash(s.am, `&ownerId=${s.sales2.user.id}`)).body.leads.total).toBe(1);
    expect((await dash(s.sales2, `&ownerId=${s.sales1.user.id}`)).status).toBe(403);

    // Leads list for one person, and who sells in the team list.
    expect((await get(s.am, `leads?ownerId=${s.sales1.user.id}`)).body.total).toBe(2);
    const members = (await api.get(`/api/sales/team/members?dealershipId=${s.d.id}`).set(bearer(s.am.token))).body;
    const sells = (u: Login) => members.find((m: { id: number }) => m.id === u.user.id)?.sellsCars;
    expect([sells(s.sales1), sells(s.sales2), sells(s.am), sells(cro)]).toEqual([true, true, false, false]);
  });
});

describe('PPF voucher: required fields and its own format', () => {
  it("PBO, chassis and engine: optional before the sales order, required after; stores the dealership's own fields", async () => {
    const s = await setup();
    // No order yet: the voucher can be issued without them.
    const early = await lead(s, '03001234599');
    const blankEarly = await api.post(`/api/sales/leads/${early}/ppf-forms`).set(bearer(s.sales1.token)).send({ coverage: 'full_body', amount: '300000' });
    expect(blankEarly.status, JSON.stringify(blankEarly.body)).toBe(201);
    expect((await patch(s.sales1, `ppf-forms/${blankEarly.body.id}`, { chassisNo: null })).status).toBe(200);

    // With a sales order (no car on it yet): chassis and engine are required.
    const id = await lead(s);
    await convert(s, id);
    await api.post(`/api/sales/leads/${id}/order`).set(bearer(s.admin.token)).send({ unitPrice: '9000000' }).expect(201);
    const none = await api.post(`/api/sales/leads/${id}/ppf-forms`).set(bearer(s.sales1.token)).send({ coverage: 'full_body', amount: '300000' });
    expect(none.status).toBe(422);
    for (const f of ['chassisNo', 'engineNo']) expect(JSON.stringify(none.body)).toContain(f);

    // The Assistant Manager adds a field to the dealership's PPF voucher format.
    const fmt = (await api.get(`/api/sales/document-templates/ppf?dealershipId=${s.d.id}`).set(bearer(s.am.token))).body;
    expect(fmt).toMatchObject({ kind: 'ppf', title: 'PPF Voucher', signOff: ['Manager Sign'], isDefault: true });
    const { isDefault: _d, updatedAt: _u, updatedByName: _n, kind: _k, dealershipId: _i, ...fields } = fmt;
    const changes = { customFields: ['Film roll no.'], fieldLabels: { pbo: 'PBO No.' }, hiddenFields: ['email'], signOff: ['Manager Sign', 'Customer Sign'] };
    const saved = await api.put('/api/sales/document-templates/ppf').set(bearer(s.am.token)).send({ ...fields, ...changes, dealershipId: s.d.id });
    expect(saved.status).toBe(200);
    expect((await api.put('/api/sales/document-templates/ppf').set(bearer(s.sales1.token)).send({ ...fields, dealershipId: s.d.id })).status).toBe(403);
    // The quotation format is a separate format and is unchanged.
    expect((await api.get(`/api/sales/document-templates/quotation?dealershipId=${s.d.id}`).set(bearer(s.am.token))).body.isDefault).toBe(true);

    const v = await ppf(s.sales1, id, { coverage: 'full_body', amount: '300000', extraFields: { 'Film roll no.': 'R-778', Empty: ' ' } });
    expect(v.status).toBe(201);
    expect(v.body.extraFields).toEqual({ 'Film roll no.': 'R-778' });
    const doc = (await get(s.sales1, `ppf-forms/${v.body.id}/document`)).body;
    expect(doc).toMatchObject({
      extraFields: { 'Film roll no.': 'R-778' },
      ppfTemplate: { title: 'PPF Voucher', customFields: ['Film roll no.'], fieldLabels: { pbo: 'PBO No.' }, hiddenFields: ['email'] },
    });
    expect((await patch(s.sales1, `ppf-forms/${v.body.id}`, { chassisNo: null })).status).toBe(422); // the lead has an order now
    expect((await patch(s.am, `ppf-forms/${v.body.id}`, { extraFields: { 'Film roll no.': 'R-779' } })).body.extraFields).toEqual({ 'Film roll no.': 'R-779' });
  });
});

describe('track record: custom period', () => {
  it('counts only the chosen days, and checks the dates', async () => {
    const s = await setup();
    await lead(s, '03003333331');
    const today = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
    const lastWeek = new Date(Date.parse(today) - 7 * 86_400_000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10);
    const year = Number(today.slice(0, 4));
    const track = (extra: string) => api.get(`/api/sales/team/track-record?dealershipId=${s.d.id}&year=${year}${extra}`).set(bearer(s.manager.token));

    const inRange = (await track(`&from=${lastWeek}&to=${today}`)).body;
    expect(inRange).toMatchObject({ from: lastWeek, to: today, month: null, totals: { leadsLogged: 1 } });
    expect((await track(`&from=${lastWeek}&to=${yesterday}`)).body.totals.leadsLogged).toBe(0);
    expect((await track(`&from=${today}`)).status).toBe(422); // both dates needed
    expect((await track(`&from=${today}&to=${lastWeek}`)).status).toBe(422); // start after end
  });
});

describe('track record details (report download)', () => {
  it('lists leads logged, converted leads and PPF customers per salesperson, only for the people and period shown', async () => {
    const s = await setup();
    const now = new Date(Date.now() + 5 * 3600_000);
    const q = `year=${now.getUTCFullYear()}&month=${now.getUTCMonth() + 1}`;
    const a = await lead(s, '03004444441');
    await lead(s, '03004444442');
    await convert(s, a);
    await ppf(s.sales1, a, { coverage: 'full_body', amount: '300000', advancePaid: '100000' }).expect(201);
    await api.post('/api/sales/leads').set(bearer(s.sales2.token)).send({ dealershipId: s.d.id, prospectName: 'Other', prospectMobile: '03004444443', ...vehicleOf(s) }).expect(201);

    const track = (who: Login, extra = '') => api.get(`/api/sales/team/track-record?dealershipId=${s.d.id}&${q}${extra}`).set(bearer(who.token));
    expect((await track(s.manager)).body.details).toBeUndefined(); // only when asked
    const d = (await track(s.manager, '&details=true')).body.details;
    const mine = (rows: { userId: number }[]) => rows.filter((r) => r.userId === s.sales1.user.id);
    expect(mine(d.leads)).toHaveLength(2);
    expect(mine(d.converted)).toEqual([expect.objectContaining({ customer: 'Ayesha Khan', phone: '03004444441', vehicle: 'Hyundai Tucson', convertedOn: expect.any(String) })]);
    expect(mine(d.ppf)).toEqual([expect.objectContaining({ customer: 'Ayesha Khan', price: '300000.00', paid: '100000.00', unpaid: '200000.00', coverage: 'full_body' })]);
    expect(d.leads.filter((r: { userId: number }) => r.userId === s.sales2.user.id)).toHaveLength(1);

    // One person: only their customers. A salesperson: only their own.
    const one = (await track(s.am, `&details=true&userId=${s.sales2.user.id}`)).body.details;
    expect(one.leads.every((r: { userId: number }) => r.userId === s.sales2.user.id)).toBe(true);
    expect(one.ppf).toHaveLength(0);
    const own = (await track(s.sales2, '&details=true')).body.details;
    expect(own.leads.map((r: { customer: string }) => r.customer)).toEqual(['Other']);
  });
});

describe('team leaders log leads', () => {
  it('the Assistant Manager and Manager log leads for a salesperson or themselves; duplicates show whose lead it is', async () => {
    const s = await setup();
    const cro = await staff('CRO', s.d.id);
    const newLead = (who: Login, mobile: string, extra: Record<string, unknown> = {}) =>
      api.post('/api/sales/leads').set(bearer(who.token)).send({ dealershipId: s.d.id, prospectName: 'Walk-in', prospectMobile: mobile, ...vehicleOf(s), ...extra });

    const forSales1 = await newLead(s.am, '03005555551', { ownerId: s.sales1.user.id });
    expect(forSales1.status).toBe(201);
    expect(forSales1.body).toMatchObject({ ownerId: s.sales1.user.id, createdById: s.am.user.id });
    expect((await newLead(s.manager, '03005555552', { ownerId: cro.user.id })).body.ownerId).toBe(cro.user.id);
    const own = await newLead(s.manager, '03005555553');
    expect(own.body.ownerId).toBe(s.manager.user.id);
    // The leader works their own lead: follow-up and convert.
    await api.post(`/api/sales/leads/${own.body.id}/follow-ups`).set(bearer(s.manager.token)).send({ outcome: 'interested', remarks: 'Called' }).expect(201);
    await api
      .post(`/api/sales/leads/${own.body.id}/convert`)
      .set(bearer(s.manager.token))
      .send({ ...vehicleOf(s), preferredColor: 'White', email: 'x@example.com', paymentInstrument: 'cheque', paymentInstrumentRef: 'CH-7' })
      .expect(200);

    // Only Salespersons / CROs of the dealership; only team leaders assign.
    expect((await newLead(s.am, '03005555554', { ownerId: s.manager.user.id })).status).toBe(422);
    expect((await newLead(s.sales1, '03005555555', { ownerId: s.sales2.user.id })).status).toBe(403);
    // The salesperson sees the lead logged for them.
    expect((await get(s.sales1, `leads/${forSales1.body.id}`)).status).toBe(200);

    // A duplicate: the leader sees whose lead it is and can open it.
    const dup = await newLead(s.am, '03005555551');
    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toMatchObject({ existingId: forSales1.body.id, ownerName: s.sales1.user.fullName });
    const dupBySalesperson = await newLead(s.sales2, '03005555551');
    expect(dupBySalesperson.body.error.details.ownerName).toBeUndefined();
  });
});

describe("track record: team leaders' leads, who entered and who converted", () => {
  it('shows the leaders with leads of their own, and names who entered and converted each lead', async () => {
    const s = await setup();
    const now = new Date(Date.now() + 5 * 3600_000);
    const q = `year=${now.getUTCFullYear()}&month=${now.getUTCMonth() + 1}`;
    const track = (who: Login, extra = '') => api.get(`/api/sales/team/track-record?dealershipId=${s.d.id}&${q}${extra}`).set(bearer(who.token));
    const newLead = (who: Login, mobile: string, extra: Record<string, unknown> = {}) =>
      api.post('/api/sales/leads').set(bearer(who.token)).send({ dealershipId: s.d.id, prospectName: 'Walk-in', prospectMobile: mobile, ...vehicleOf(s), ...extra });
    const conversion = { ...vehicleOf(s), preferredColor: 'White', email: 'x@example.com', paymentInstrument: 'cheque', paymentInstrumentRef: 'CH-8' };

    // The AM logs a lead for salesperson 1, who converts it; the AM logs and converts one of their own.
    const forSales1 = (await newLead(s.am, '03006666661', { ownerId: s.sales1.user.id })).body.id;
    await api.post(`/api/sales/leads/${forSales1}/convert`).set(bearer(s.sales1.token)).send(conversion).expect(200);
    const amOwn = (await newLead(s.am, '03006666662')).body.id;
    await api.post(`/api/sales/leads/${amOwn}/convert`).set(bearer(s.am.token)).send(conversion).expect(200);
    // The lead shows who entered it.
    expect((await get(s.sales1, `leads/${forSales1}`)).body).toMatchObject({ createdById: s.am.user.id, createdByName: s.am.user.fullName });

    // The AM's own view: the salespeople plus themselves (they have a lead of their own); not the Manager.
    const b = (await track(s.am, '&details=true')).body;
    const row = (u: Login) => b.members.find((m: { userId: number }) => m.userId === u.user.id);
    expect(row(s.am)).toMatchObject({ leadsLogged: 1, converted: 1 });
    expect(row(s.sales1)).toMatchObject({ leadsLogged: 1, converted: 1 });
    expect(row(s.manager)).toBeUndefined();
    expect(b.details.converted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: s.sales1.user.id, enteredBy: s.am.user.fullName, convertedBy: s.sales1.user.fullName }),
        expect.objectContaining({ userId: s.am.user.id, enteredBy: s.am.user.fullName, convertedBy: s.am.user.fullName }),
      ]),
    );
    // The Manager sees it all too.
    expect(ids((await track(s.manager)).body)).toEqual(expect.arrayContaining([s.am.user.id, s.sales1.user.id]));
  });
});

const ids = (b: { members: { userId: number }[] }) => b.members.map((m) => m.userId);

describe('quotation for another model than the lead', () => {
  it('quotes the model chosen on the quotation, with a typed variant', async () => {
    const s = await setup();
    const [sonata] = await owner.db.insert(vehicleModel).values({ brand: 'Hyundai', name: 'Sonata' }).returning();
    const id = await lead(s, '03009000001');
    const q = await quote(s.sales1, id, { unitPrice: '9000000', modelId: sonata!.id, variant: '2.5 N Line' });
    expect(q.status, JSON.stringify(q.body)).toBe(201);
    expect(q.body).toMatchObject({ modelId: sonata!.id, variant: '2.5 N Line', variantCode: null });
    // The lead keeps the model it was logged with.
    expect((await get(s.sales1, `leads/${id}`)).body.interestedModelId).toBe(s.modelId);
  });
});

describe('track record groups are the Sales Manager only', () => {
  it('refuses a group to a salesperson or the Assistant Manager (no one else sees the team through it)', async () => {
    const s = await setup();
    const now = new Date(Date.now() + 5 * 3600_000);
    const url = (extra: string) => `/api/sales/team/track-record?dealershipId=${s.d.id}&year=${now.getUTCFullYear()}${extra}`;
    for (const who of [s.sales1, s.am]) {
      expect((await api.get(url('&group=salespeople&details=true')).set(bearer(who.token))).status).toBe(403);
    }
    expect((await api.get(url('&group=salespeople')).set(bearer(s.manager.token))).status).toBe(200);
  });
});

describe('editing a quotation with a typed variant (Hyundai)', () => {
  it('keeps working without a code; removing a code needs a typed variant', async () => {
    const s = await setup();
    await owner.db.update(dealership).set({ brand: 'Hyundai' }).where(eq(dealership.id, s.d.id));
    await api.post('/api/sales/variants/import').set(bearer(s.am.token)).send({ dealershipId: s.d.id, rows: [{ code: 'NX4FL16THAW', description: 'TUCSON HEV 1598CC 6A/T AWD SIGNATURE' }] }).expect(200);
    const id = await lead(s);
    // "Other": a typed variant, no code; editing only the price (the form sends every field) works.
    const typed = await quote(s.sales1, id, { unitPrice: '9000000', variant: 'Tucson Special Edition' });
    expect(typed.status, JSON.stringify(typed.body)).toBe(201);
    expect((await patch(s.sales1, `quotations/${typed.body.id}`, { unitPrice: '9100000', variantCode: null, variant: 'Tucson Special Edition' })).status).toBe(200);
    // A coded quotation: removing the code with a typed variant is fine.
    const coded = (await quote(s.sales1, id, { unitPrice: '9000000', variantCode: 'NX4FL16THAW' })).body;
    expect((await patch(s.sales1, `quotations/${coded.id}`, { variantCode: null, variant: 'Typed instead' })).status).toBe(200);
  });
});
