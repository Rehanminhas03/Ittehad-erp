import { eq, sql } from 'drizzle-orm';
import type { Executor } from '../../db/client';
import { dealership, documentSequence } from './models';

/** Document types with a numbering series. Add new series here. */
export const DocType = {
  salesOrder: 'SO',
  quotation: 'QT',
  ppfForm: 'PF',
  delivery: 'DN',
  serviceVisit: 'SV',
  jobCard: 'JC',
  estimate: 'ES',
  purchaseOrder: 'PO',
  goodsReceipt: 'GR',
  partsRequest: 'PR',
  stockTransfer: 'ST',
  stockAdjustment: 'SA',
  journal: 'JV',
  invoice: 'INV',
  receipt: 'RC',
  disbursement: 'PV',
} as const;
export type DocType = (typeof DocType)[keyof typeof DocType];

/**
 * Next number in a dealership's series, e.g. `HYD-ISB-SO-2026-00001`.
 * The counter row is locked until the transaction ends, so numbers are unique and gap-free
 * (a rolled-back document does not consume its number).
 */
export async function nextDocumentNumber(ex: Executor, dealershipId: number, docType: DocType, on = new Date()): Promise<string> {
  const year = on.getFullYear();
  const [row] = await ex
    .insert(documentSequence)
    .values({ dealershipId, docType, year, lastNo: 1 })
    .onConflictDoUpdate({
      target: [documentSequence.dealershipId, documentSequence.docType, documentSequence.year],
      set: { lastNo: sql`${documentSequence.lastNo} + 1` },
    })
    .returning({ lastNo: documentSequence.lastNo });
  const [d] = await ex.select({ code: dealership.code }).from(dealership).where(eq(dealership.id, dealershipId));
  return `${d!.code}-${docType}-${year}-${String(row!.lastNo).padStart(5, '0')}`;
}
