import { describe, expect, it } from 'vitest';
import { buildSalesInvoicePdf } from '@/features/accounts/components/InvoicePrint/salesInvoicePdf';
import { buildRepairOrderPdf } from '@/features/service/components/JobCardSummary/jobCardPdf';
import { repairOrderTerms, workshopBrand } from './workshopPdf';

const brand = workshopBrand('JET-ITH')!;

describe('workshop documents', () => {
  it('Jetour Ittehad has the format, others do not yet', () => {
    expect(brand.name).toBe('Jetour Ittehad');
    expect(workshopBrand('CSM-ITH')).toBeNull();
  });

  it('the terms carry the dealership name, not Hyundai', () => {
    const all = repairOrderTerms(brand.name).map((t) => t.text).join(' ');
    expect(all).toContain('Jetour Ittehad');
    expect(all).not.toMatch(/Hyundai/);
  });

  it('draws the repair order on two pages and the invoice on one', async () => {
    const line = (kind: string, description: string, amount: string) => ({ id: 1, kind, description, partNo: null, quantity: '1', unitPrice: amount, amount, billable: true, status: 'done', source: 'manual' });
    const ro = await buildRepairOrderPdf({
      jobCard: { jobCardNo: 'JET-ITH-JC-2026-00002', createdAt: '2026-10-28T07:00:00Z' } as never,
      visit: { odometerKm: 41441, customerName: 'A Customer', visitType: 'periodic_maintenance', complaints: 'Noise' } as never,
      lines: [line('part', 'Oil filter', '2100'), line('labour', 'Service', '9000')] as never,
      brand,
    });
    expect(ro.doc.getNumberOfPages()).toBe(2);
    const inv = await buildSalesInvoicePdf({
      invoice: { invoiceNo: 'JET-ITH-INV-2026-00003', invoiceDate: '2026-10-28', customerName: 'A Customer', sourceNo: 'JET-ITH-JC-2026-00002', totalAmount: '12000', status: 'issued' } as never,
      lines: [{ ...line('part', 'Oil filter', '2100'), taxAmount: '378' }, { ...line('labour', 'Service', '9000'), taxAmount: '1440' }] as never,
      payments: [],
      dealership: null,
      brand,
    });
    expect(inv.doc.getNumberOfPages()).toBe(1);
  });
});
