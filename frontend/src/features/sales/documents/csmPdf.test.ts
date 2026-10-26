import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { QuotationDocument } from '../salesApi';
import { buildQuotationPdf } from './pdf';

const template = {
  companyName: 'Capital Smart Motors', refPrefix: null, tagline: null, address: 'Plot # 415, Islamabad', phone: '0330-9138842', email: 'sales1@ittehadmotors.com',
  deliveryNotes: ['The vehicle delivery time is {deliveryPeriod} from the date of Advance Payment Clearing.', 'The remaining balance payment shall be due 30 days before the tentative delivery month.'],
  deliveryStation: 'CSM', defaultPaymentMode: 'Rs. Advance payment/ ({advance}) in favor of M/S CAPITAL SMART MOTORS (PRIVATE) LIMITED', defaultValidityDays: 7, defaultDeliveryDays: null,
  highlightLine: null, standardEquipment: null,
  terms: [
    'Prices prevailing at the time of delivery will apply.',
    'It is hereby confirmed that as per provision of sub-section 5 (a) of section 153 of the Income Tax Ordinance, 2001 (ITO, 2001), tax is not deductible against supply of {vehicle} Advance.',
    'Pay order in favor of Capital Smart Motors (Pvt.) Ltd. {advancePercent}% Advance payment and {balancePercent}% 30 days before vehicle delivery.',
  ],
  closingLines: [], signOff: [], title: null, fieldLabels: {}, hiddenFields: [], customFields: [], stampImage: null, signatureImage: null, isDefault: true, updatedAt: null, updatedByName: null, dealershipId: 3, kind: 'quotation',
};
const quotation = {
  quotationNo: 'CSM-ITH-QT-2026-00001', variantCode: 'EV3-PREMIUM', validUntil: '2026-07-14', billTo: 'New Airport City Housing', deliveryDays: null, deliveryPeriod: '60 to 90 days', paymentMode: null,
  specs: 'Battery Capacity: 30.24 kWh\nMaximum Torque (N m): 125', template, issuedAt: '2026-07-07T09:00:00+05:00', updatedAt: '2026-07-07T09:00:00+05:00',
  dealership: { name: 'CSM Ittehad', code: 'CSM-ITH', brand: 'Capital Smart Motors', address: null, city: null, phone: null },
  customer: { name: 'New Airport City Housing', mobile: '03001234567', email: null }, salesperson: { name: 'Sales One', phone: null, email: '' },
  vehicle: { model: 'JMEV EV3', variant: 'JMEV EV3 Premium', color: null, vin: null, engineNo: null }, orderNo: null, createdByName: null, updatedByName: null, notes: null,
  pricing: { quantity: 1, unitPrice: '4999999', discount: '0', freightInsurance: null, cvt: '0', withholdingTax: null, taxStatus: 'filer', withholdingTaxNonFiler: null, total: '4999999', bookingAmount: '1500000' },
} as unknown as QuotationDocument;

describe('CSM quotation PDF', () => {
  it('draws on one page', async () => {
    const built = await buildQuotationPdf(quotation);
    expect(built.doc.getNumberOfPages()).toBe(1);
    if (process.env.CSM_PDF_OUT) writeFileSync(process.env.CSM_PDF_OUT, Buffer.from(built.doc.output('arraybuffer')));
  });
  it('also with CVT 1%, a discount and more lines', async () => {
    const q = { ...quotation, pricing: { ...quotation.pricing, unitPrice: '17990000', cvt: '179900', discount: '100000', total: '18069900', bookingAmount: '3598000' } } as QuotationDocument;
    const built = await buildQuotationPdf(q);
    expect(built.doc.getNumberOfPages()).toBe(1);
    if (process.env.CSM_PDF_OUT2) writeFileSync(process.env.CSM_PDF_OUT2, Buffer.from(built.doc.output('arraybuffer')));
  });
});
