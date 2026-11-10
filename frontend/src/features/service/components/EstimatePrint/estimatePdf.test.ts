import { describe, expect, it } from 'vitest';
import type { Estimate, EstimateLine } from '../../serviceApi';
import { buildEstimatePdf } from './estimatePdf';

const estimate = {
  id: 1, estimateNo: 'JET-ITH-ES-2026-00004', dealershipId: 2, branchId: null, jobCardId: null, jobCardNo: null, customerId: null,
  customerName: 'A Customer', customerMobile: '03001234567', vehicleModel: 'Jetour T2', registrationNo: 'APF2026', vehicleLabel: 'Jetour T2 · APF2026',
  advisorName: 'Nouman', advisorId: 27, totalAmount: '0', validUntil: null, notes: 'Brake pads and a service', status: 'draft', createdAt: '2026-11-10T10:00:00+05:00', updatedAt: '2026-11-10T10:00:00+05:00',
} as unknown as Estimate;
const line = (kind: string, description: string, qty: string, price: string): EstimateLine => ({ id: 1, estimateId: 1, kind, description, partNo: null, quantity: qty, unitPrice: price, discountPercent: '0', amount: String(Number(qty) * Number(price)), inspectionItemId: null, sortOrder: 1 }) as unknown as EstimateLine;
const brand = { name: 'Jetour Ittehad', logo: '/logo/missing.png', addressLines: ['Plot 415'], appointmentLine: '+92' };

describe('Repair estimate (without a job card)', () => {
  it('draws the estimate and its terms, with or without lines', async () => {
    const withLines = await buildEstimatePdf({ estimate, lines: [line('part', 'Brake pad set', '1', '12000'), line('labour', 'Fit the pads', '1', '1500'), line('lubricant', 'Brake fluid', '2', '900')], brand });
    expect(withLines.doc.getNumberOfPages()).toBe(2);
    expect(withLines.fileName).toContain('JET-ITH-ES-2026-00004');
    expect((await buildEstimatePdf({ estimate, lines: [], brand })).doc.getNumberOfPages()).toBe(2);
  });
});
