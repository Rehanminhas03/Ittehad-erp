import { drawTable, drawWorkshopLetterhead, M, money, rs, shortDate, W, type WorkshopBrand, writer } from '@/features/sales/documents/workshopPdf';
import type { GoodsReceipt, GoodsReceiptLine } from '../../partsApi';

export interface GoodsReceiptDocument {
  grn: GoodsReceipt;
  lines: GoodsReceiptLine[];
  dealershipName: string;
  brand: WorkshopBrand | null;
}

const dateTime = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Karachi' });

/** The goods receipt (GRN): what came in against a purchase order, with the date and time it was received. The format will be replaced by the dealership's own. */
export async function buildGoodsReceiptPdf(d: GoodsReceiptDocument): Promise<{ doc: import('jspdf').jsPDF; fileName: string }> {
  const { grn, lines, brand } = d;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const text = writer(doc);
  let y: number;
  if (brand) y = await drawWorkshopLetterhead(doc, brand);
  else {
    text(d.dealershipName, M, 20, { bold: true, size: 18 });
    y = 30;
  }
  text('GOODS RECEIPT', M + W, y - 4, { bold: true, size: 16, align: 'right' });
  text(grn.grnNo, M + W, y + 3, { bold: true, size: 11, align: 'right', color: [60, 60, 60] });
  y += 12;

  const left = (label: string, value: string, yy: number) => {
    text(label, M, yy, { bold: true, size: 9.5 });
    text(value || '—', M + 34, yy, { size: 9.5, max: 70 });
  };
  const right = (label: string, value: string, yy: number) => {
    text(label, M + 108, yy, { bold: true, size: 9.5 });
    text(value || '—', M + 134, yy, { size: 9.5, max: 52 });
  };
  left('Supplier :', grn.supplierName ?? '', y);
  right('Received :', dateTime(grn.createdAt), y);
  y += 6;
  left('Purchase order :', grn.poNo ?? 'None (straight from head office)', y);
  right('Received by :', grn.receivedByName ?? '', y);
  y += 6;
  left('Supplier invoice :', grn.supplierInvoiceNo ?? '', y);
  right('Date :', shortDate(grn.receivedDate), y);
  y += 10;

  const cols = [
    { h: '#', w: 10, a: 'center' as const },
    { h: 'Part no.', w: 38, a: 'left' as const },
    { h: 'Description', w: 68, a: 'left' as const },
    { h: 'Qty', w: 16, a: 'center' as const },
    { h: 'Unit cost', w: 26, a: 'right' as const },
    { h: 'Amount', w: 28, a: 'right' as const },
  ];
  y = drawTable(doc, y, cols, lines.map((l, i) => [String(i + 1), l.partNo, l.description, String(Number(l.quantity)), money(Number(l.unitCost)), money(Number(l.amount))])) + 6;
  text(`${lines.length} items · ${lines.reduce((n, l) => n + Number(l.quantity), 0)} pieces`, M + 1, y, { size: 9.5 });
  text('Total:', M + W - 60, y, { bold: true, size: 12 });
  text(rs(Number(grn.totalCost)), M + W, y, { bold: true, size: 12, align: 'right' });
  y += 10;
  if (grn.notes) {
    const note = doc.splitTextToSize(`Notes : ${grn.notes}`, W) as string[];
    note.forEach((l, i) => text(l, M, y + i * 4.2, { size: 9 }));
    y += note.length * 4.2 + 6;
  }
  y = Math.max(y + 14, 250);
  doc.setDrawColor(40, 40, 40);
  doc.line(M, y, M + 60, y);
  doc.line(M + W - 60, y, M + W, y);
  text('RECEIVED BY (STORE)', M, y + 5, { size: 9 });
  text('CHECKED BY', M + W - 60, y + 5, { size: 9 });
  return { doc, fileName: `${grn.grnNo}.pdf` };
}
