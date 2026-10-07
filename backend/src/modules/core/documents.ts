import { type Executor, query } from '../../db/client';
import { sql } from '../../db/sql';
import { documentSequence } from './models';

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
  leaveApplication: 'LV',
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
  const [row] = await query<{ lastNo: number }>(
    ex,
    sql`insert into ${documentSequence} (dealership_id, doc_type, year, last_no)
        values (${dealershipId}, ${docType}, ${year}, 1)
        on conflict (dealership_id, doc_type, year) do update set last_no = ${documentSequence.lastNo} + 1
        returning last_no as "lastNo"`,
  );
  const d = await ex.dealership.findFirst({ where: { id: dealershipId }, select: { code: true } });
  return `${d!.code}-${docType}-${year}-${String(row!.lastNo).padStart(5, '0')}`;
}
