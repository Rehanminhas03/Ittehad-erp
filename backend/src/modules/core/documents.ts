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
  lead: 'LD',
  receipt: 'RC',
  disbursement: 'PV',
} as const;
export type DocType = (typeof DocType)[keyof typeof DocType];

/**
 * Series that restart every month: sales orders and leads. The number is the month and the month's counter, e.g.
 * `JET-ITH-SO-2026-11007` (the 7th of November) and `JET-ITH-SO-2026-12001` (the first of December). The counter of a month is
 * kept under the year-and-month (202611) in the sequence table.
 */
const MONTHLY: readonly DocType[] = [DocType.salesOrder, DocType.lead];

/** Year and month of a moment, in Pakistan time. */
const pakistanYearMonth = (on: Date) => {
  const [y, m] = on.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }).split('-');
  return { year: Number(y), month: Number(m) };
};

/**
 * Next number in a dealership's series, e.g. `HYD-ISB-SO-2026-00001`.
 * The counter row is locked until the transaction ends, so numbers are unique and gap-free
 * (a rolled-back document does not consume its number).
 */
export async function nextDocumentNumber(ex: Executor, dealershipId: number, docType: DocType, on = new Date()): Promise<string> {
  const monthly = MONTHLY.includes(docType);
  const ym = pakistanYearMonth(on);
  const year = monthly ? ym.year * 100 + ym.month : on.getFullYear();
  const [row] = await query<{ lastNo: number }>(
    ex,
    sql`insert into ${documentSequence} (dealership_id, doc_type, year, last_no)
        values (${dealershipId}, ${docType}, ${year}, 1)
        on conflict (dealership_id, doc_type, year) do update set last_no = ${documentSequence.lastNo} + 1
        returning last_no as "lastNo"`,
  );
  const d = await ex.dealership.findFirst({ where: { id: dealershipId }, select: { code: true } });
  if (monthly) return `${d!.code}-${docType}-${ym.year}-${String(ym.month).padStart(2, '0')}${String(row!.lastNo).padStart(3, '0')}`;
  return `${d!.code}-${docType}-${year}-${String(row!.lastNo).padStart(5, '0')}`;
}
