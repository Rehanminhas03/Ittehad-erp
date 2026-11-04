import { drawTable, drawWorkshopLetterhead, M, money, rs, shortDate, W, type WorkshopBrand, writer } from '@/features/sales/documents/workshopPdf';
import { ITEM_TYPES } from '../../lib/itemType';
import type { PurchaseOrder, PurchaseOrderLine, Supplier } from '../../partsApi';

export interface PurchaseOrderDocument {
  po: PurchaseOrder;
  lines: PurchaseOrderLine[];
  supplier?: Supplier;
  dealershipName: string;
  brand: WorkshopBrand | null;
}

/** The purchase order as it is sent to the supplier (the company the parts and lubricants are ordered from). */
export async function buildPurchaseOrderPdf(d: PurchaseOrderDocument): Promise<{ doc: import('jspdf').jsPDF; fileName: string }> {
  const { po, lines, supplier, brand } = d;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const text = writer(doc);
  let y: number;
  if (brand) {
    y = await drawWorkshopLetterhead(doc, brand);
  } else {
    text(d.dealershipName, M, 20, { bold: true, size: 18 });
    y = 30;
  }

  text('PURCHASE ORDER', M + W, y - 4, { bold: true, size: 16, align: 'right' });
  text(po.poNo, M + W, y + 3, { bold: true, size: 11, align: 'right', color: [60, 60, 60] });
  y += 12;

  const left = (label: string, value: string, yy: number) => {
    text(label, M, yy, { bold: true, size: 9.5 });
    text(value || '—', M + 30, yy, { size: 9.5, max: 70 });
  };
  const right = (label: string, value: string, yy: number) => {
    text(label, M + 108, yy, { bold: true, size: 9.5 });
    text(value || '—', M + 140, yy, { size: 9.5, max: 46 });
  };
  left('Supplier :', supplier?.name ?? po.supplierName ?? '', y);
  right('Order date :', shortDate(po.orderDate), y);
  y += 6;
  left('Address :', supplier?.address ?? '', y);
  right('Expected :', po.expectedDate ? shortDate(po.expectedDate) : '', y);
  y += 6;
  left('Phone :', supplier?.phone ?? '', y);
  right('Deliver to :', [d.dealershipName, po.branchName].filter(Boolean).join(' · '), y);
  y += 6;
  left('Email :', supplier?.email ?? '', y);
  right('Payment :', supplier ? `${supplier.paymentTermsDays} days` : '', y);
  y += 10;

  const cols = [
    { h: '#', w: 10, a: 'center' as const },
    { h: 'Part no.', w: 36, a: 'left' as const },
    { h: 'Description', w: 62, a: 'left' as const },
    { h: 'Qty', w: 16, a: 'center' as const },
    { h: 'Unit cost', w: 30, a: 'right' as const },
    { h: 'Amount', w: 32, a: 'right' as const },
  ];
  // Parts, accessories and lubricants each have their own block (a block only when the order has it).
  const plural: Record<string, string> = { part: 'Parts', accessory: 'Accessories', lubricant: 'Lubricants' };
  for (const t of ITEM_TYPES) {
    const of = lines.filter((l) => l.itemType === t.value);
    if (!of.length) continue;
    text(plural[t.value]!, M, y, { bold: true, size: 11 });
    y = drawTable(doc, y + 3, cols, of.map((l, i) => [String(i + 1), l.partNo, l.description, String(Number(l.quantity)), money(Number(l.unitPrice)), money(Number(l.amount))])) + 3;
    text(`Sub-total ${plural[t.value]!.toLowerCase()}: ${rs(of.reduce((n, l) => n + Number(l.amount), 0))}`, M + W, y + 1, { bold: true, size: 9, align: 'right' });
    y += 9;
  }
  text('Total:', M + 1, y, { bold: true, size: 12 });
  text(rs(Number(po.totalAmount)), M + W, y, { bold: true, size: 12, align: 'right' });
  y += 10;
  if (po.notes) {
    const note = doc.splitTextToSize(`Notes : ${po.notes}`, W) as string[];
    note.forEach((l, i) => text(l, M, y + i * 4.2, { size: 9 }));
    y += note.length * 4.2 + 6;
  }
  y = Math.max(y + 14, 250);
  doc.setDrawColor(40, 40, 40);
  doc.line(M, y, M + 60, y);
  doc.line(M + W - 60, y, M + W, y);
  text('PREPARED BY (STORE)', M, y + 5, { size: 9 });
  text('APPROVED BY (ACCOUNTS)', M + W - 60, y + 5, { size: 9 });
  return { doc, fileName: `${po.poNo}.pdf` };
}
