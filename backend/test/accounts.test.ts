import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { account, invoice, journalEntry, journalLine } from '../src/modules/accounts/models';
import { customer, vehicle, vehicleModel } from '../src/modules/master/models';
import { part } from '../src/modules/parts/models';
import { salesOrder } from '../src/modules/sales/models';
import { jobCard, jobCardLine, visit } from '../src/modules/service/models';
import { api, bearer, createBranch, createDealership, createUser, owner, useTestDb } from './helpers';

useTestDb();

const ACCOUNTANT = [
  'accounts.chart.view', 'accounts.chart.manage', 'accounts.journals.view', 'accounts.journals.post',
  'accounts.invoices.view', 'accounts.invoices.create', 'accounts.invoices.issue', 'accounts.invoices.void',
  'accounts.payments.view', 'accounts.payments.create', 'accounts.payments.void', 'accounts.reports.view',
];
const PARTS = [
  'parts.catalog.view', 'parts.suppliers.view', 'parts.suppliers.create', 'parts.purchase_orders.view', 'parts.purchase_orders.create',
  'parts.purchase_orders.update', 'parts.purchase_orders.submit', 'parts.purchase_orders.approve', 'parts.receipts.view', 'parts.receipts.create',
  'parts.stock.view', 'parts.adjustments.view', 'parts.adjustments.create', 'parts.adjustments.approve',
];

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
let mobileSeq = 0;

async function setup() {
  const d = await createDealership('HYD');
  const other = await createDealership('JET');
  const main = await createBranch(d.id, 'MAIN');
  const accountant = await createUser([{ permissions: ACCOUNTANT, dealershipId: d.id }]);
  const outsider = await createUser([{ permissions: ACCOUNTANT, dealershipId: other.id }]);
  const [m] = await owner.db.insert(vehicleModel).values({ brand: 'Hyundai', name: 'Tucson' }).returning();
  return { d, other, main, accountant, outsider, modelId: m!.id };
}
type S = Awaited<ReturnType<typeof setup>>;

async function newCustomer(dealershipId: number, name = 'Ayesha Khan') {
  mobileSeq += 1;
  const n = String(mobileSeq).padStart(7, '0');
  const [c] = await owner.db.insert(customer).values({ dealershipId, fullName: name, mobile: `0300-${n}`, mobileNormalized: `+92300${n}` }).returning();
  return c!.id;
}

/** A completed job card with labour, a part and a free (non-billable) line. */
async function completedJobCard(s: S, customerId: number) {
  const [v] = await owner.db.insert(vehicle).values({ vin: `ACCVIN${++mobileSeq}`, modelId: s.modelId }).returning();
  const [vis] = await owner.db
    .insert(visit)
    .values({
      dealershipId: s.d.id, branchId: s.main.id, visitNo: `V-${mobileSeq}`, vehicleId: v!.id, customerId, advisorId: s.accountant.user.id,
      visitType: 'repair', visitSequence: 1, odometerKm: 12000, warrantyValid: false, freeService: false, status: 'ready',
    })
    .returning();
  const [jc] = await owner.db
    .insert(jobCard)
    .values({ dealershipId: s.d.id, branchId: s.main.id, jobCardNo: `JC-${mobileSeq}`, visitId: vis!.id, vehicleId: v!.id, advisorId: s.accountant.user.id, status: 'completed' })
    .returning();
  await owner.db.insert(jobCardLine).values([
    { dealershipId: s.d.id, jobCardId: jc!.id, kind: 'labour', description: 'Brake service', quantity: '1.5', unitPrice: '3000.00', amount: '4500.00', status: 'done' },
    { dealershipId: s.d.id, jobCardId: jc!.id, kind: 'part', description: 'Front brake pads', partNo: 'BP-FRONT', quantity: '1', unitPrice: '14500.00', amount: '14500.00', status: 'done' },
    { dealershipId: s.d.id, jobCardId: jc!.id, kind: 'labour', description: 'Free wash', quantity: '1', unitPrice: '500.00', amount: '500.00', billable: false, status: 'done' },
  ]);
  return jc!.id;
}

async function approvedOrder(s: S, customerId: number, total = '9000000.00') {
  const [o] = await owner.db
    .insert(salesOrder)
    .values({
      dealershipId: s.d.id, branchId: s.main.id, orderNo: `SO-${++mobileSeq}`, customerId, salespersonId: s.accountant.user.id, modelId: s.modelId,
      variant: 'Ultimate', color: 'White', unitPrice: total, totalAmount: total, status: 'approved',
    })
    .returning();
  return o!.id;
}

const as = (u: { token: string }) => bearer(u.token);

async function issuedInvoice(s: S, body: { sourceType: string; sourceId: number }) {
  const inv = await api.post('/api/accounts/invoices').set(as(s.accountant)).send(body).expect(201);
  const issued = await api.post(`/api/accounts/invoices/${inv.body.id}/transitions`).set(as(s.accountant)).send({ action: 'issue' }).expect(200);
  return issued.body as { id: number; totalAmount: string; journalEntryId: number; status: string; invoiceNo: string };
}

async function trialBalance(s: S, dealershipId = s.d.id) {
  const res = await api.get(`/api/accounts/reports/trial-balance?dealershipId=${dealershipId}`).set(as(s.accountant)).expect(200);
  const byCode = Object.fromEntries((res.body.rows as { code: string; balance: string }[]).map((r) => [r.code, r.balance]));
  return { ...res.body, byCode } as { balanced: boolean; totalDebit: string; totalCredit: string; byCode: Record<string, string> };
}

describe('general journal (database guarantees)', () => {
  it('rejects unbalanced entries at commit and is append-only', async () => {
    const s = await setup();
    // Adding the first custom account provisions the standard chart.
    await api.post('/api/accounts/chart').set(as(s.accountant)).send({ dealershipId: s.d.id, code: '6100', name: 'Utilities', type: 'expense' }).expect(201);
    const accs = await owner.db.select().from(account).where(eq(account.dealershipId, s.d.id));
    const cash = accs.find((a) => a.role === 'cash')!;
    const equity = accs.find((a) => a.code === '3000')!;
    const insertUnbalanced = owner.db.transaction(async (tx) => {
      const [e] = await tx
        .insert(journalEntry)
        .values({ dealershipId: s.d.id, entryNo: 'X-1', entryDate: today(), source: 'manual', memo: 'bad', totalAmount: '100', postedById: s.accountant.user.id })
        .returning();
      await tx.insert(journalLine).values([
        { dealershipId: s.d.id, journalEntryId: e!.id, accountId: cash.id, debit: '100' },
        { dealershipId: s.d.id, journalEntryId: e!.id, accountId: equity.id, credit: '90' },
      ]);
    });
    await expect(insertUnbalanced).rejects.toThrow();

    const ok = await api
      .post('/api/accounts/journals')
      .set(as(s.accountant))
      .send({ dealershipId: s.d.id, memo: 'Opening cash', lines: [{ accountId: cash.id, debit: '50000' }, { accountId: equity.id, credit: '50000' }] });
    expect(ok.status).toBe(201);
    expect(ok.body.entryNo).toMatch(/^HYD-JV-/);
    await expect(owner.db.update(journalLine).set({ debit: '1' }).where(eq(journalLine.journalEntryId, ok.body.id))).rejects.toThrow();
    await expect(owner.db.delete(journalEntry).where(eq(journalEntry.id, ok.body.id))).rejects.toThrow();
  });

  it('manual entries must balance, reverse once, and automatic entries cannot be reversed directly', async () => {
    const s = await setup();
    const cust = await newCustomer(s.d.id);
    const inv = await issuedInvoice(s, { sourceType: 'sales_order', sourceId: await approvedOrder(s, cust, '100.00') });
    const accs = await owner.db.select().from(account).where(eq(account.dealershipId, s.d.id));
    const cash = accs.find((a) => a.role === 'cash')!.id;
    const expense = accs.find((a) => a.code === '6000')!.id;

    const bad = await api.post('/api/accounts/journals').set(as(s.accountant)).send({ dealershipId: s.d.id, memo: 'Rent', lines: [{ accountId: expense, debit: '10' }, { accountId: cash, credit: '9' }] });
    expect(bad.status).toBe(422);
    const both = await api.post('/api/accounts/journals').set(as(s.accountant)).send({ dealershipId: s.d.id, memo: 'Rent', lines: [{ accountId: expense, debit: '10', credit: '10' }, { accountId: cash, credit: '10' }] });
    expect(both.status).toBe(422);

    const rent = await api.post('/api/accounts/journals').set(as(s.accountant)).send({ dealershipId: s.d.id, memo: 'Rent', lines: [{ accountId: expense, debit: '1000' }, { accountId: cash, credit: '1000' }] }).expect(201);
    const rev = await api.post(`/api/accounts/journals/${rent.body.id}/reverse`).set(as(s.accountant)).send({ memo: 'Posted twice' });
    expect(rev.status, JSON.stringify(rev.body)).toBe(201);
    expect(rev.body).toMatchObject({ source: 'reversal', reversalOfId: rent.body.id, totalAmount: '1000.00' });
    expect((await api.get(`/api/accounts/journals/${rent.body.id}`).set(as(s.accountant))).body.reversedById).toBe(rev.body.id);
    expect((await api.post(`/api/accounts/journals/${rent.body.id}/reverse`).set(as(s.accountant)).send({ memo: 'again' })).status).toBe(409);
    expect((await api.post(`/api/accounts/journals/${inv.journalEntryId}/reverse`).set(as(s.accountant)).send({ memo: 'nope' })).status).toBe(409);

    const lines = await api.get(`/api/accounts/journals/${rev.body.id}/lines`).set(as(s.accountant)).expect(200);
    expect(lines.body.map((l: { accountCode: string; debit: string; credit: string }) => [l.accountCode, l.debit, l.credit])).toEqual([
      ['6000', '0.00', '1000.00'],
      ['1000', '1000.00', '0.00'],
    ]);
    expect((await trialBalance(s)).byCode['6000']).toBe('0.00');
  });
});

describe('invoices', () => {
  it('drafts from a completed job card: billable lines only, tax by line kind, one live invoice per source', async () => {
    const s = await setup();
    const cust = await newCustomer(s.d.id);
    const jc = await completedJobCard(s, cust);
    const draft = await api.post('/api/accounts/invoices').set(as(s.accountant)).send({ sourceType: 'job_card', sourceId: jc });
    expect(draft.status).toBe(201);
    // Labour 4,500 @16% = 720; parts 14,500 @18% = 2,610.
    expect(draft.body).toMatchObject({ kind: 'service', status: 'draft', subtotal: '19000.00', taxAmount: '3330.00', totalAmount: '22330.00', customerName: 'Ayesha Khan' });
    expect(draft.body.invoiceNo).toMatch(/^HYD-INV-/);
    const lines = await api.get(`/api/accounts/invoices/${draft.body.id}/lines`).set(as(s.accountant)).expect(200);
    expect(lines.body).toHaveLength(2);
    expect((await api.post('/api/accounts/invoices').set(as(s.accountant)).send({ sourceType: 'job_card', sourceId: jc })).status).toBe(409);

    // Extra charge while draft.
    await api.post(`/api/accounts/invoices/${draft.body.id}/lines`).set(as(s.accountant)).send({ kind: 'other', description: 'Towing', quantity: '1', unitPrice: '2000' }).expect(201);
    expect((await api.get(`/api/accounts/invoices/${draft.body.id}`).set(as(s.accountant))).body.totalAmount).toBe('24330.00');

    const issued = await api.post(`/api/accounts/invoices/${draft.body.id}/transitions`).set(as(s.accountant)).send({ action: 'issue' });
    expect(issued.body.status).toBe('issued');
    expect((await api.post(`/api/accounts/invoices/${draft.body.id}/lines`).set(as(s.accountant)).send({ kind: 'other', description: 'Late', quantity: '1', unitPrice: '1' })).status).toBe(409);

    const je = await api.get(`/api/accounts/journals/${issued.body.journalEntryId}/lines`).set(as(s.accountant));
    expect(je.body.map((l: { accountCode: string; debit: string; credit: string }) => [l.accountCode, l.debit, l.credit])).toEqual([
      ['1100', '24330.00', '0.00'],
      ['4100', '0.00', '4500.00'],
      ['4200', '0.00', '14500.00'],
      ['4900', '0.00', '2000.00'],
      ['2100', '0.00', '3330.00'],
    ]);
    const tb = await trialBalance(s);
    expect(tb.balanced).toBe(true);
    expect(tb.byCode['1100']).toBe('24330.00');
  });

  it('vehicle sales: approved orders only, cancel a draft to re-invoice, void reverses the posting', async () => {
    const s = await setup();
    const cust = await newCustomer(s.d.id);
    const orderId = await approvedOrder(s, cust, '9000000.00');
    await owner.db.update(salesOrder).set({ status: 'submitted' }).where(eq(salesOrder.id, orderId));
    expect((await api.post('/api/accounts/invoices').set(as(s.accountant)).send({ sourceType: 'sales_order', sourceId: orderId })).status).toBe(409);
    await owner.db.update(salesOrder).set({ status: 'approved' }).where(eq(salesOrder.id, orderId));

    const first = await api.post('/api/accounts/invoices').set(as(s.accountant)).send({ sourceType: 'sales_order', sourceId: orderId }).expect(201);
    expect(first.body).toMatchObject({ kind: 'vehicle_sale', taxAmount: '0.00', totalAmount: '9000000.00' });
    expect((await api.post(`/api/accounts/invoices/${first.body.id}/transitions`).set(as(s.accountant)).send({ action: 'cancel' })).status).toBe(422);
    await api.post(`/api/accounts/invoices/${first.body.id}/transitions`).set(as(s.accountant)).send({ action: 'cancel', comment: 'Wrong price' }).expect(200);

    const inv = await issuedInvoice(s, { sourceType: 'sales_order', sourceId: orderId });
    expect((await trialBalance(s)).byCode['4000']).toBe('-9000000.00');
    const voided = await api.post(`/api/accounts/invoices/${inv.id}/transitions`).set(as(s.accountant)).send({ action: 'void', comment: 'Customer withdrew' });
    expect(voided.body.status).toBe('void');
    const tb = await trialBalance(s);
    expect(tb.byCode['4000']).toBe('0.00');
    expect(tb.byCode['1100']).toBe('0.00');
    expect(tb.balanced).toBe(true);
  });

  it('refuses to issue when the source is no longer valid', async () => {
    const s = await setup();
    const orderId = await approvedOrder(s, await newCustomer(s.d.id));
    const draft = await api.post('/api/accounts/invoices').set(as(s.accountant)).send({ sourceType: 'sales_order', sourceId: orderId }).expect(201);
    await owner.db.update(salesOrder).set({ status: 'cancelled' }).where(eq(salesOrder.id, orderId));
    expect((await api.post(`/api/accounts/invoices/${draft.body.id}/transitions`).set(as(s.accountant)).send({ action: 'issue' })).status).toBe(409);
  });
});

describe('payments', () => {
  it('settles invoices partially then fully, never over-allocates, and voiding restores the balance', async () => {
    const s = await setup();
    const cust = await newCustomer(s.d.id);
    const inv = await issuedInvoice(s, { sourceType: 'job_card', sourceId: await completedJobCard(s, cust) }); // 22,330.00
    const pay = (amount: string, alloc: string, method = 'cash') =>
      api.post('/api/accounts/payments').set(as(s.accountant)).send({ dealershipId: s.d.id, direction: 'receipt', customerId: cust, method, amount, allocations: [{ invoiceId: inv.id, amount: alloc }] });

    expect((await pay('100', '200')).status).toBe(422); // allocation > amount
    expect((await pay('30000', '30000')).status).toBe(422); // > outstanding
    const r1 = await pay('10000', '10000');
    expect(r1.status).toBe(201);
    expect(r1.body.paymentNo).toMatch(/^HYD-RC-/);
    expect((await api.get(`/api/accounts/invoices/${inv.id}`).set(as(s.accountant))).body).toMatchObject({ status: 'partially_paid', amountPaid: '10000.00' });
    const r2 = await pay('12330', '12330', 'bank_transfer');
    expect((await api.get(`/api/accounts/invoices/${inv.id}`).set(as(s.accountant))).body.status).toBe('paid');

    let tb = await trialBalance(s);
    expect(tb.byCode).toMatchObject({ '1000': '10000.00', '1010': '12330.00', '1100': '0.00' });
    expect((await api.post(`/api/accounts/invoices/${inv.id}/transitions`).set(as(s.accountant)).send({ action: 'void', comment: 'x' })).status).toBe(409);

    await api.post(`/api/accounts/payments/${r2.body.id}/transitions`).set(as(s.accountant)).send({ action: 'void', comment: 'Bounced' }).expect(200);
    expect((await api.get(`/api/accounts/invoices/${inv.id}`).set(as(s.accountant))).body).toMatchObject({ status: 'partially_paid', amountPaid: '10000.00' });
    tb = await trialBalance(s);
    expect(tb.byCode).toMatchObject({ '1010': '0.00', '1100': '12330.00' });
    expect(tb.balanced).toBe(true);

    const allocs = await api.get(`/api/accounts/invoices/${inv.id}/payments`).set(as(s.accountant)).expect(200);
    expect(allocs.body.map((a: { paymentStatus: string; amount: string }) => [a.paymentStatus, a.amount])).toEqual([
      ['posted', '10000.00'],
      ['void', '12330.00'],
    ]);
  });

  it("only allocates to the same customer's open invoices", async () => {
    const s = await setup();
    const a = await newCustomer(s.d.id, 'A');
    const b = await newCustomer(s.d.id, 'B');
    const inv = await issuedInvoice(s, { sourceType: 'sales_order', sourceId: await approvedOrder(s, a, '500.00') });
    const res = await api.post('/api/accounts/payments').set(as(s.accountant)).send({ dealershipId: s.d.id, direction: 'receipt', customerId: b, method: 'cash', amount: '100', allocations: [{ invoiceId: inv.id, amount: '100' }] });
    expect(res.status).toBe(422);
    const supplierAsCustomer = await api.post('/api/accounts/payments').set(as(s.accountant)).send({ dealershipId: s.d.id, direction: 'disbursement', customerId: a, method: 'cash', amount: '100' });
    expect(supplierAsCustomer.status).toBe(422);
  });

  it('applies a receipt held as customer credit to a later invoice, without a new posting', async () => {
    const s = await setup();
    const cust = await newCustomer(s.d.id);
    // A deposit received before any invoice exists: fully unallocated.
    const deposit = await api.post('/api/accounts/payments').set(as(s.accountant)).send({ dealershipId: s.d.id, direction: 'receipt', customerId: cust, method: 'cash', amount: '5000', allocations: [] });
    expect(deposit.status).toBe(201);

    const inv = await issuedInvoice(s, { sourceType: 'sales_order', sourceId: await approvedOrder(s, cust, '3000.00') });
    const other = await newCustomer(s.d.id, 'Other');
    const otherInv = await issuedInvoice(s, { sourceType: 'sales_order', sourceId: await approvedOrder(s, other, '1000.00') });
    // Applying the credit only matches it to the invoice; the books are already settled.
    const before = await trialBalance(s);

    expect((await api.post(`/api/accounts/payments/${deposit.body.id}/allocations`).set(as(s.accountant)).send({ invoiceId: otherInv.id, amount: '100' })).status).toBe(422);
    expect((await api.post(`/api/accounts/payments/${deposit.body.id}/allocations`).set(as(s.accountant)).send({ invoiceId: inv.id, amount: '5001' })).status).toBe(422);

    const applied = await api.post(`/api/accounts/payments/${deposit.body.id}/allocations`).set(as(s.accountant)).send({ invoiceId: inv.id, amount: '3000' });
    expect(applied.status).toBe(200);
    expect(applied.body).toEqual([{ id: expect.any(Number), paymentId: deposit.body.id, paymentNo: deposit.body.paymentNo, paymentDate: deposit.body.paymentDate, paymentStatus: 'posted', invoiceId: inv.id, invoiceNo: inv.invoiceNo, amount: '3000.00' }]);
    expect((await api.get(`/api/accounts/invoices/${inv.id}`).set(as(s.accountant))).body).toMatchObject({ status: 'paid', amountPaid: '3000.00' });
    // The deposit's own receivables posting already covered this; matching it to an invoice posts nothing new.
    expect(await trialBalance(s)).toEqual(before);

    // The remaining 2,000 credit cannot be over-applied.
    expect((await api.post(`/api/accounts/payments/${deposit.body.id}/allocations`).set(as(s.accountant)).send({ invoiceId: inv.id, amount: '1' })).status).toBe(422);
    const outsider = await createUser([{ permissions: ACCOUNTANT, dealershipId: s.other.id }]);
    expect((await api.post(`/api/accounts/payments/${deposit.body.id}/allocations`).set(bearer(outsider.token)).send({ invoiceId: inv.id, amount: '1' })).status).toBe(404);
  });
});

describe('operational postings', () => {
  it('goods received credit the supplier, adjustments hit stock adjustments, supplier payments clear payables', async () => {
    const s = await setup();
    const parts = await createUser([{ permissions: PARTS, dealershipId: s.d.id }]);
    const approver = await createUser([{ permissions: PARTS, dealershipId: s.d.id }]);
    await owner.db.insert(part).values({ partNo: 'BP-FRONT', description: 'Front brake pads', sellingPrice: '14500.00' });
    const sup = await api.post('/api/parts/suppliers').set(as(parts)).send({ dealershipId: s.d.id, code: 'HMP', name: 'Hyundai Motor Parts' }).expect(201);
    const po = await api.post('/api/parts/purchase-orders').set(as(parts)).send({ dealershipId: s.d.id, branchId: s.main.id, supplierId: sup.body.id });
    await api.post(`/api/parts/purchase-orders/${po.body.id}/lines`).set(as(parts)).send({ partNo: 'BP-FRONT', quantity: '4', unitPrice: '9000' }).expect(201);
    await api.post(`/api/parts/purchase-orders/${po.body.id}/transitions`).set(as(parts)).send({ action: 'submit' }).expect(200);
    await api.post(`/api/parts/purchase-orders/${po.body.id}/transitions`).set(as(approver)).send({ action: 'approve' }).expect(200);
    const [line] = (await api.get(`/api/parts/purchase-orders/${po.body.id}/lines`).set(as(parts))).body;
    await api.post(`/api/parts/purchase-orders/${po.body.id}/receipts`).set(as(parts)).send({ lines: [{ lineId: line.id, quantity: '4' }] }).expect(201);

    let tb = await trialBalance(s);
    expect(tb.byCode).toMatchObject({ '1200': '36000.00', '2000': '-36000.00' });
    const payables = await api.get(`/api/accounts/reports/payables?dealershipId=${s.d.id}`).set(as(s.accountant)).expect(200);
    expect(payables.body.items).toEqual([{ supplierId: sup.body.id, supplierName: 'Hyundai Motor Parts', billed: '36000.00', paid: '0.00', balance: '36000.00' }]);

    // Count finds one damaged: -1 at average cost 9,000.
    const adj = await api.post('/api/parts/adjustments').set(as(parts)).send({ dealershipId: s.d.id, branchId: s.main.id, reason: 'damage' });
    await api.post(`/api/parts/adjustments/${adj.body.id}/lines`).set(as(parts)).send({ partNo: 'BP-FRONT', quantity: '-1' }).expect(201);
    await api.post(`/api/parts/adjustments/${adj.body.id}/transitions`).set(as(parts)).send({ action: 'submit' }).expect(200);
    await api.post(`/api/parts/adjustments/${adj.body.id}/transitions`).set(as(approver)).send({ action: 'approve' }).expect(200);
    tb = await trialBalance(s);
    expect(tb.byCode).toMatchObject({ '1200': '27000.00', '5200': '9000.00' });

    await api.post('/api/accounts/payments').set(as(s.accountant)).send({ dealershipId: s.d.id, direction: 'disbursement', supplierId: sup.body.id, method: 'cheque', reference: 'CHQ-1', amount: '20000' }).expect(201);
    const after = await api.get(`/api/accounts/reports/payables?dealershipId=${s.d.id}`).set(as(s.accountant));
    expect(after.body.items[0]).toMatchObject({ paid: '20000.00', balance: '16000.00' });
    tb = await trialBalance(s);
    expect(tb.balanced).toBe(true);
    expect(tb.byCode['1010']).toBe('-20000.00');

    // Ledger: running balance on inventory.
    const inventory = (await owner.db.select().from(account).where(eq(account.code, '1200'))).find((a) => a.dealershipId === s.d.id)!;
    const ledger = await api.get(`/api/accounts/reports/ledger?accountId=${inventory.id}`).set(as(s.accountant)).expect(200);
    expect(ledger.body.items.map((r: { debit: string; credit: string; balance: string }) => [r.debit, r.credit, r.balance])).toEqual([
      ['36000.00', '0.00', '36000.00'],
      ['0.00', '9000.00', '27000.00'],
    ]);
  });
});

describe('reports and isolation', () => {
  it('ages receivables by days past due', async () => {
    const s = await setup();
    const a = await newCustomer(s.d.id, 'Aged');
    const i1 = await issuedInvoice(s, { sourceType: 'sales_order', sourceId: await approvedOrder(s, a, '1000.00') });
    const i2 = await issuedInvoice(s, { sourceType: 'sales_order', sourceId: await approvedOrder(s, a, '2000.00') });
    await issuedInvoice(s, { sourceType: 'sales_order', sourceId: await approvedOrder(s, a, '4000.00') });
    await owner.db.update(invoice).set({ dueDate: daysAgo(45) }).where(eq(invoice.id, i1.id));
    await owner.db.update(invoice).set({ dueDate: daysAgo(120) }).where(eq(invoice.id, i2.id));
    const res = await api.get(`/api/accounts/reports/receivables?dealershipId=${s.d.id}`).set(as(s.accountant)).expect(200);
    expect(res.body.items).toEqual([
      { customerId: a, customerName: 'Aged', current: '4000.00', days1to30: '0.00', days31to60: '1000.00', days61to90: '0.00', over90: '2000.00', total: '7000.00' },
    ]);
  });

  it("keeps each dealership's books private", async () => {
    const s = await setup();
    const inv = await issuedInvoice(s, { sourceType: 'sales_order', sourceId: await approvedOrder(s, await newCustomer(s.d.id)) });
    expect((await api.get(`/api/accounts/invoices/${inv.id}`).set(as(s.outsider))).status).toBe(404);
    expect((await api.get(`/api/accounts/journals/${inv.journalEntryId}/lines`).set(as(s.outsider))).status).toBe(404);
    expect((await api.get(`/api/accounts/reports/trial-balance?dealershipId=${s.d.id}`).set(as(s.outsider))).status).toBe(403);
    expect((await api.get('/api/accounts/invoices').set(as(s.outsider))).body.total).toBe(0);
    // Invoicing another dealership's order is refused.
    const foreign = await approvedOrder(s, await newCustomer(s.d.id));
    expect((await api.post('/api/accounts/invoices').set(as(s.outsider)).send({ sourceType: 'sales_order', sourceId: foreign })).status).toBeGreaterThanOrEqual(403);
    // RLS: the outsider's own trial balance never sees the other books.
    const tb = await api.get(`/api/accounts/reports/trial-balance?dealershipId=${s.other.id}`).set(as(s.outsider)).expect(200);
    expect(tb.body.totalDebit).toBe('0.00');
    const count = await owner.db.execute(sql`select count(*)::int as n from accounts.journal_entry where dealership_id = ${s.other.id}`);
    expect((count.rows[0] as { n: number }).n).toBe(0);
  });

  it('keeps role accounts active', async () => {
    const s = await setup();
    await api.post('/api/accounts/chart').set(as(s.accountant)).send({ dealershipId: s.d.id, code: '6100', name: 'Utilities', type: 'expense' }).expect(201);
    const list = await api.get(`/api/accounts/chart?dealershipId=${s.d.id}&pageSize=100`).set(as(s.accountant)).expect(200);
    expect(list.body.total).toBe(16);
    const cash = list.body.items.find((a: { role: string | null }) => a.role === 'cash');
    expect((await api.patch(`/api/accounts/chart/${cash.id}`).set(as(s.accountant)).send({ isActive: false })).status).toBe(409);
    expect((await api.post('/api/accounts/chart').set(as(s.accountant)).send({ dealershipId: s.d.id, code: '1000', name: 'Dup', type: 'asset' })).status).toBe(409);
  });
});
