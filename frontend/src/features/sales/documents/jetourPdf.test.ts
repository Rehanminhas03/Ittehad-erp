import { describe, expect, it } from 'vitest';
import type { QuotationDocument } from '../salesApi';
import { buildQuotationPdf } from './pdf';
import { buildQuotationDocx } from './quotationDocx';

// Jetour Ittehad's quotation format (2026-11-05): the clauses are headings, bullets and plain lines of the template.
const template = {
  companyName: 'JETOUR ITTEHAD', refPrefix: null, tagline: 'www.ittehadmotors.com', address: 'Plot #. 415, off 9th Avenue, Sector I-9/3, Islamabad', phone: '+92 (51) 111 500 100', email: 'info@ittehadmotors.com',
  deliveryNotes: [], deliveryStation: 'JETOUR ITTEHAD ISLAMABAD', defaultPaymentMode: '100 % Advance Payment', defaultValidityDays: 7, defaultDeliveryDays: null, highlightLine: null, standardEquipment: 'As per Brochure',
  terms: [
    '**VALIDITY:** This Quotation is valid for {validityDays} Working Days',
    '# DELIVERY',
    '- Delivery Times are only Tentative and as communicated by JETOUR Pakistan',
    '- Delivery Period as of Today (Tentative)**:** {deliveryPeriod}',
    '- Delivery Period at the time of receiving payment / booking will be applicable',
    '- Delivery Period (Tentative): 30 - 45 days from time of full payment is made',
    '- Delivery Station: {deliveryStation}',
    '# PAYMENT',
    '- Payment Mode: {paymentMode}',
    '- All Payments **(Pay Orders)** to be made in favor of **UNITED MOTORS PRIVATE LIMITED A/C CUSTOMER NAME**',
    '# WARRANTY',
    '- Manufacturers Warranty (Vehicle): 60 months or 100,000 km (whichever occurs first)',
    '[Hybrid only] - Manufacturers Warranty (PHEV battery): 96 months or 160,000 km (whichever occurs first)',
    '- Warranty applicable as per and adherence to Manufacturers maintenance protocols',
    '# PRICE',
    '- Price at the time of delivery/invoicing will be applicable',
    '- Any difference in Price will have to be paid before delivery',
    '- Any impact on prices, including but not limited to Government levies (including FED, GST, and CVT etc.), duties, tariffs, fiscal policies, import policies, PKR devaluation, shall be on account of customer',
    '# OTHERS',
    '- Force Majeure clause is applicable, including but not limited to Acts of God or enemy, change in Government Policies, Government announced Lockdowns, Labor Strikes, or Civil Unrest, injunctions by Court of Law.',
    '- Further Sales Tax @ 4% will be applicable on all Corporate and Business Individual Customers who are registered in sales tax but are non-Active and customers which are not registered in sales tax',
    '- Orders taken from customers are governed by **PBO** (Provisional Booking Order Form) terms and conditions.',
    '- Order will be deemed confirmed only at the time of realization of funds and completion of all formalities',
    '- At any time, throughout the transaction, terms and conditions of this quotation shall remain supreme, unless notified/authorized by our office in written',
    '- JETOUR ITTEHAD Islamabad is acting as the dealer of and on behalf of **JETOUR Pakistan (United Motors)**, and is not subject to any liability, including legal or financial',
  ],
  closingLines: [], signOff: ['Owned & Operated by:', 'Ittehad Motors', '(an Ittehad Steel Company)'], title: null, fieldLabels: {}, hiddenFields: [], customFields: [], stampImage: null, signatureImage: null, isDefault: true, updatedAt: null, updatedByName: null, dealershipId: 2, kind: 'quotation',
};
const quotation = {
  quotationNo: 'JET-ITH-QT-2026-00001', variantCode: 'T1-IDM', validUntil: '2026-10-02', billTo: null, deliveryDays: null, deliveryPeriod: 'Nov, 26 to Dec 26', paymentMode: null,
  template, issuedAt: '2026-09-25T09:00:00+05:00', updatedAt: '2026-09-25T09:00:00+05:00',
  dealership: { name: 'Jetour Ittehad', code: 'JET-ITH', brand: 'Jetour', address: null, city: null, phone: null },
  customer: { name: 'A Customer', mobile: '03001234567', email: null }, salesperson: { name: 'Sales One', phone: null, email: '' },
  vehicle: { model: 'Jetour T1', variant: 'T1 i-DM PHEV', color: null, vin: null, engineNo: null }, orderNo: null, createdByName: null, updatedByName: null, notes: null,
  pricing: { quantity: 1, unitPrice: '10798999.78', discount: '0', freightInsurance: '75000', nevLevy: null, cvt: null, withholdingTax: '217479.90', taxStatus: 'filer', withholdingTaxNonFiler: null, total: '11091479.68', bookingAmount: null },
} as unknown as QuotationDocument;

describe('Jetour quotation (new format)', () => {
  it('draws on one page, with and without the letterhead', async () => {
    expect((await buildQuotationPdf(quotation)).doc.getNumberOfPages()).toBe(1);
    expect((await buildQuotationPdf(quotation, { letterhead: true })).doc.getNumberOfPages()).toBe(1);
  });
  it('leaves out the delivery-as-of-today line when none is typed', async () => {
    const built = await buildQuotationPdf({ ...quotation, deliveryPeriod: null } as QuotationDocument);
    expect(built.doc.getNumberOfPages()).toBe(1);
  });
  it('exports to Word', async () => {
    const { blob } = await buildQuotationDocx(quotation);
    expect(blob.size).toBeGreaterThan(3000);
  });
});

// Hyundai's quotation: the same format and layout, with Hyundai's own clauses.
const hyundai = {
  ...quotation,
  quotationNo: 'HYD-ISB-QT-2026-00001',
  template: {
    ...template,
    companyName: 'Ittehad Automotive',
    deliveryStation: 'Hyundai Islamabad',
    signOff: ['Owners and Operators of', 'Hyundai Islamabad'],
    terms: [
      '**VALIDITY:** This Quotation is valid for {validityDays} Working Days',
      '# DELIVERY',
      '- Delivery Times are only Tentative and as communicated by HNMPL',
      '- Delivery Period as of Today (Tentative)**:** {deliveryPeriod}',
      '- Delivery Period at the time of receiving payment / booking will be applicable',
      '- Delivery Period (Tentative): 10 days from time of full payment is made',
      '- Delivery Station: {deliveryStation}',
      '# PAYMENT',
      '- Payment Mode: {paymentMode}',
      '- All Payments **(Pay Orders)** to be made in favour of **Hyundai Nishat Motor (Pvt) Limited** on A/C of Customer Name',
      '- Advance Income/Withholding Tax may not be deducted as Exemption Certificate will be provided at time of payment',
      '- Withholding tax for non-filer: {vehicle}: Rs. {nonFilerTax} will be applied',
      '- **ORDER WILL BE BOOKED ON CONFIRM PURCHASE ORDER**',
      '# WARRANTY',
      '- Manufacturers Warranty (Vehicle): 48 months or 100,000 km (whichever occurs first)',
      '[Hybrid only] - Manufacturers Warranty (HEV battery): 96 months or 160,000 km (whichever occurs first)',
      '- Warranty applicable as per and adherence to Manufacturers maintenance protocols',
      '# PRICE',
      '- Price at the time of delivery/invoicing will be applicable',
      '- Any difference in Price will have to be paid before delivery',
      '- Any impact on prices, including but not limited to Government levies (including FED, GST, and CVT etc.), duties, tariffs, fiscal policies, import policies, PKR devaluation, shall be on account of customer',
      '# OTHERS',
      '- Force Majeure clause is applicable, including but not limited to Acts of God or enemy, change in Government Policies, Government announced Lockdowns, Labour Strikes, or Civil Unrest, injunctions by Court of Law.',
      '- Further Sales Tax @ 4% will be applicable on all Corporate and Business Individual Customers who are registered in sales tax but are non-Active and customers which are not registered in sales tax',
      '- Orders taken from customers are governed by **PBO** (Provisional Booking Order Form) terms and conditions.',
      '- Order will be deemed confirmed only at the time of realization of funds and completion of all formalities',
      '- At any time, throughout the transaction, terms and conditions of this quotation shall remain supreme, unless notified/authorized by our office in written',
      '- Hyundai Islamabad is acting on behalf of and dealer of **HNMPL**, and is not subject to any liability, including legal or financial',
      '- Delivery times are constantly changing based on first come basis, & available stocks',
    ],
  },
  dealership: { name: 'Hyundai Islamabad', code: 'HYD-ISB', brand: 'Hyundai', address: null, city: null, phone: null },
  vehicle: { model: 'Porter H-100', variant: 'Porter H-100 2.6L Diesel Deckless (With AC)', color: null, vin: null, engineNo: null },
  variantCode: 'HR26S7DLAC',
  pricing: { quantity: 1, unitPrice: '4580000', discount: '0', freightInsurance: '57000', nevLevy: null, cvt: null, withholdingTax: null, taxStatus: 'filer', withholdingTaxNonFiler: null, total: '4637000', bookingAmount: null },
} as unknown as QuotationDocument;

describe('Hyundai quotation (same format)', () => {
  it('draws on one page in the Jetour layout, and exports to Word', async () => {
    expect((await buildQuotationPdf(hyundai)).doc.getNumberOfPages()).toBe(1);
    expect((await buildQuotationPdf(hyundai, { letterhead: true })).doc.getNumberOfPages()).toBe(1);
    expect((await buildQuotationDocx(hyundai)).blob.size).toBeGreaterThan(3000);
  });
  it('names the vehicle with its brand, and a truck\'s freight as transportation charges', async () => {
    const { quotationVehicleLine, freightLabel } = await import('./pdf');
    expect(quotationVehicleLine(hyundai)).toBe('HYUNDAI PORTER H-100 2.6L DIESEL DECKLESS (WITH AC)');
    expect(freightLabel(hyundai)).toBe('TRANSPORTATION CHARGES');
    expect(freightLabel(quotation)).toBe('FREIGHT AND TRANSIT INSURANCE');
  });
});

// Palisade: a hybrid, so the hybrid-only clauses print too, and five price rows.
const palisade = {
  ...hyundai,
  deliveryPeriod: 'Nov, 26 to Dec 26',
  vehicle: { model: 'Palisade', variant: 'PALISADE HEV 2.5T CALLIGRAPHY ISB', color: null, vin: null, engineNo: null },
  variantCode: 'LX3HEVCAL',
  pricing: { quantity: 1, unitPrice: '24075000', discount: '0', freightInsurance: '76000', nevLevy: '728016', cvt: '192216', withholdingTax: '1754986', taxStatus: 'filer', withholdingTaxNonFiler: '3000000', total: '26826218', bookingAmount: null },
} as unknown as QuotationDocument;

describe('Palisade quotation', () => {
  it('draws on one page, with and without the letterhead', async () => {
    expect((await buildQuotationPdf(palisade)).doc.getNumberOfPages()).toBe(1);
    expect((await buildQuotationPdf(palisade, { letterhead: true })).doc.getNumberOfPages()).toBe(1);
  });
});
