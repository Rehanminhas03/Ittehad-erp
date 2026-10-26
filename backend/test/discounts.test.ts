import { describe, expect, it } from 'vitest';
import { lessPercent } from '../src/lib/money';
import { api, bearer, createBranch, createDealership, createUser, owner, useTestDb } from './helpers';

useTestDb();

describe('lessPercent', () => {
  it('takes a percentage off an amount, rounded half-up to the paisa', () => {
    expect(lessPercent('1000.00', '2')).toBe('980.00');
    expect(lessPercent('1999.99', '2.5')).toBe('1949.99');
    expect(lessPercent('100', '100')).toBe('0.00');
    expect(lessPercent('100', '0')).toBe('100.00');
    expect(lessPercent('0.05', '50')).toBe('0.03');
  });
});

describe('discounts on the store issue', () => {
  it('records the price list price and the discount, takes the revenue net of it, and keeps the received price', async () => {
    const d = await createDealership('JET');
    const b = await createBranch(d.id, 'MAIN');
    await owner.db.supplier.create({ data: { dealershipId: d.id, code: 'HO', name: 'Head office' } });
    const sup = await owner.db.supplier.findFirst({ where: { dealershipId: d.id } });
    const part = await owner.db.part.create({ data: { partNo: 'DSC1', description: 'Discount test part', brand: 'TestBrand', sellingPrice: '1000' } });
    const keeper = await createUser([{ permissions: ['parts.receipts.create', 'parts.receipts.view', 'parts.issues.create', 'parts.stock.view', 'parts.catalog.view'], dealershipId: d.id }]);

    await api.post('/api/parts/store/receive').set(bearer(keeper.token)).send({ dealershipId: d.id, branchId: b.id, supplierId: sup!.id, lines: [{ partNo: 'DSC1', quantity: '10', unitCost: '700' }] }).expect(201);
    // The price received from the company is the last price paid.
    expect(Number((await owner.db.part.findFirst({ where: { id: part!.id } }))!.purchasePrice)).toBe(700);

    const issue = await api.post('/api/parts/store/issue').set(bearer(keeper.token)).send({
      dealershipId: d.id, branchId: b.id, kind: 'issue', referenceNo: 'RO-1', lines: [{ partNo: 'DSC1', quantity: '2', discountPercent: '5' }],
    });
    expect(issue.status).toBe(201);
    expect(issue.body.lines[0]).toMatchObject({ unitPrice: '1000.00', discountPercent: '5', netAmount: '1900.00' });
    expect((await api.post('/api/parts/store/issue').set(bearer(keeper.token)).send({ dealershipId: d.id, branchId: b.id, kind: 'issue', referenceNo: 'RO-2', lines: [{ partNo: 'DSC1', quantity: '1', discountPercent: '101' }] })).status).toBe(422);

    // The sale report and the monthly revenue are net of the discount.
    const sale = await api.get('/api/parts/store/sale-report').set(bearer(keeper.token));
    expect(sale.body).toHaveLength(1);
    expect(sale.body[0]).toMatchObject({ roNo: 'RO-1', quantity: '2.00', unitPrice: '1000.00', discountPercent: '5.00', totalPrice: '1900.00' });
    const month = await api.get('/api/parts/store/monthly-report').set(bearer(keeper.token));
    expect(month.body.totals).toMatchObject({ issuedSales: '1900.00', netSales: '1900.00' });
  });
});
