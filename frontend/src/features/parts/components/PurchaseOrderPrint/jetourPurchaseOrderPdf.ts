import { loadImage } from '@/features/sales/documents/pdf';
import { M, money, shortDate, W, type WorkshopBrand, writer } from '@/features/sales/documents/workshopPdf';
import { ITEM_TYPES } from '../../lib/itemType';
import type { PurchaseOrderDocument } from './purchaseOrderPdf';

/** Sales tax on what is bought from the company (parts, accessories and lubricants). */
export const PO_TAX_PERCENT = 18;
const CATEGORY: Record<string, string> = { part: 'Company Parts', accessory: 'Accessories', lubricant: 'Lubricants' };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** One row of the purchase order, as the Jetour format has it (the discount and the withholding tax are not entered on the order yet, so they are 0). */
export function poRows(d: PurchaseOrderDocument) {
  const order = (t: string) => ITEM_TYPES.findIndex((x) => x.value === t);
  const lines = [...d.lines].sort((a, b) => order(a.itemType) - order(b.itemType) || a.id - b.id);
  return lines.map((l, i) => {
    const qty = Number(l.quantity);
    const unit = Number(l.unitPrice);
    const base = r2(qty * unit);
    const tax = r2((base * PO_TAX_PERCENT) / 100);
    const discount = 0;
    const wh = 0;
    return { sr: i + 1, category: CATEGORY[l.itemType] ?? 'Company Parts', description: l.description, partNo: l.partNo, uom: 'Each', qty, mrp: 0, unit, base, taxPercent: PO_TAX_PERCENT, tax, wh, discount, net: r2(base + tax - discount + wh) };
  });
}

export function poTotals(rows: ReturnType<typeof poRows>) {
  const sum = (k: 'base' | 'tax' | 'wh' | 'discount' | 'net' | 'qty') => r2(rows.reduce((n, r) => n + r[k], 0));
  return { qty: sum('qty'), base: sum('base'), tax: sum('tax'), wh: sum('wh'), discount: sum('discount'), net: sum('net') };
}

const HEAD = ['Sr#', 'Item Category', 'Description', 'UOM', 'Qty', 'MRP', 'Unit Price', 'Base Amount', 'Sales Tax %', 'S. Tax Amount', 'WH Tax Amount', 'Discount Amount', 'Net Ordered Amount'];

/** The same table as Excel (CSV): what the Jetour purchase order shows, with its totals. */
export function poCsvRows(d: PurchaseOrderDocument): (string | number)[][] {
  const rows = poRows(d);
  const t = poTotals(rows);
  return [
    ['PURCHASE ORDER', d.po.poNo],
    ['Vendor', d.supplier?.name ?? d.po.supplierName ?? '', 'Vendor code', d.supplier?.code ?? ''],
    ['PO date', shortDate(d.po.orderDate), 'Remarks', d.po.notes ?? ''],
    [],
    HEAD,
    ...rows.map((r) => [r.sr, r.category, `${r.description} ${r.partNo}`, r.uom, r.qty, r.mrp, r.unit, r.base, r.taxPercent, r.tax, r.wh, r.discount, r.net]),
    ['Total', '', '', '', t.qty, '', '', t.base, '', t.tax, t.wh, t.discount, t.net],
    [],
    ['Value Excl. GST', t.base],
    ['Sales Tax (%)', t.tax],
    ['Trade Discount', t.discount],
    ['WH Tax Amount', t.wh],
    ['Grand Total', t.net],
  ];
}

/** The purchase order in the Jetour Ittehad format: boxed heading, vendor and PO details, the item table, the totals box and the three signature lines. */
export async function buildJetourPurchaseOrderPdf(d: PurchaseOrderDocument & { brand: WorkshopBrand }): Promise<{ doc: import('jspdf').jsPDF; fileName: string }> {
  const { po, supplier, brand } = d;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const text = writer(doc);
  const rows = poRows(d);
  const totals = poTotals(rows);
  const cx = M + W / 2;

  // Heading box
  doc.setDrawColor(90, 90, 90);
  doc.setLineWidth(0.3);
  doc.rect(M, 14, W, 32);
  const logo = await loadImage(brand.logo);
  if (logo) {
    const lw = 34;
    const lh = Math.min((logo.h / logo.w) * lw, 12);
    doc.addImage(logo.data, 'JPEG', M + 3, 17, (logo.w / logo.h) * lh, lh);
  }
  text('PURCHASE ORDER', cx, 25, { bold: true, size: 17, align: 'center' });
  text(`${brand.name} Motors`, cx, 32, { bold: true, size: 10.5, align: 'center' });
  text(`Address: ${brand.addressLines[0] ?? ''}`, cx, 37.5, { size: 7.5, align: 'center', color: [70, 70, 70] });
  text(`Phone: ${brand.appointmentLine}`, cx, 42, { size: 7.5, align: 'center', color: [70, 70, 70] });

  // Vendor and order details
  let y = 52;
  doc.rect(M, y, W, 17);
  text('Vendor Name:', M + 3, y + 5.5, { bold: true, size: 8 });
  text(supplier?.name ?? po.supplierName ?? '', M + 28, y + 5.5, { size: 8.5, max: 64 });
  text('Remarks:', M + 3, y + 11.5, { bold: true, size: 8 });
  text(po.notes ?? '', M + 28, y + 11.5, { size: 8, max: 64 });
  text(supplier?.code ?? '', M + 100, y + 5.5, { size: 8.5, align: 'center' });
  text('Purchase Order No.:', M + 118, y + 5.5, { bold: true, size: 8 });
  text(po.poNo, M + W - 3, y + 5.5, { size: 8.5, align: 'right' });
  text('PO Date:', M + 118, y + 11.5, { bold: true, size: 8 });
  text(shortDate(po.orderDate), M + W - 3, y + 11.5, { size: 8.5, align: 'right' });
  y += 23;

  // The table (compact: thirteen columns)
  const weights = [6, 15, 44, 9, 7, 9, 15, 17, 10, 15, 12, 13, 18];
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((w) => (w / sum) * W);
  const aligns: ('left' | 'center' | 'right')[] = ['center', 'left', 'left', 'center', 'center', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right'];
  const top = 16;
  const bottom = 270;
  doc.setLineWidth(0.2);
  doc.setDrawColor(130, 130, 130);
  const header = () => {
    doc.setFillColor(238, 238, 238);
    doc.rect(M, y, W, 9, 'FD');
    let x = M;
    HEAD.forEach((h, i) => {
      const lines = doc.splitTextToSize(h, widths[i]! - 1.6) as string[];
      lines.slice(0, 2).forEach((ln, k) => text(ln, aligns[i] === 'right' ? x + widths[i]! - 1 : aligns[i] === 'center' ? x + widths[i]! / 2 : x + 1, y + 3.8 + k * 3, { bold: true, size: 6, align: aligns[i] }));
      x += widths[i]!;
    });
    y += 9;
  };
  const drawRow = (cells: string[], opts: { bold?: boolean; second?: string } = {}) => {
    const h = opts.second ? 8 : 5.5;
    if (y + h > bottom) {
      doc.addPage();
      y = top;
      header();
    }
    doc.rect(M, y, W, h);
    let x = M;
    cells.forEach((c, i) => {
      if (i) doc.line(x, y, x, y + h);
      const tx = aligns[i] === 'right' ? x + widths[i]! - 1 : aligns[i] === 'center' ? x + widths[i]! / 2 : x + 1;
      if (i === 2 && opts.second) {
        text(c, tx, y + 3.2, { size: 6, max: widths[i]! - 2, align: aligns[i] });
        text(opts.second, tx, y + 6.2, { size: 6, max: widths[i]! - 2, align: aligns[i], color: [70, 70, 70] });
      } else {
        text(c, tx, y + (opts.second ? 4.7 : 3.8), { bold: opts.bold, size: 6, max: widths[i]! - 1.5, align: aligns[i] });
      }
      x += widths[i]!;
    });
    y += h;
  };
  header();
  for (const r of rows) {
    drawRow([String(r.sr), r.category, r.description, r.uom, String(r.qty), money(r.mrp), money(r.unit), money(r.base), money(r.taxPercent), money(r.tax), money(r.wh), money(r.discount ? -r.discount : 0), money(r.net)], { second: r.partNo });
  }
  drawRow(['Total', '', '', '', String(totals.qty), '', '', money(totals.base), '', money(totals.tax), money(totals.wh), money(totals.discount ? -totals.discount : 0), money(totals.net)], { bold: true });
  y += 8;

  // Totals box
  if (y > 225) {
    doc.addPage();
    y = top;
  }
  const bx = M + W - 78;
  doc.setLineWidth(0.3);
  doc.rect(bx, y, 78, 30);
  const line = (label: string, value: number, yy: number, bold = false) => {
    text(label, bx + 3, yy, { bold, size: 8 });
    text(money(value), bx + 75, yy, { bold, size: 8.5, align: 'right' });
  };
  line('Value Excl. GST', totals.base, y + 6);
  line(`Sales Tax (${PO_TAX_PERCENT}%)`, totals.tax, y + 11.5);
  line('Trade Discount', totals.discount ? -totals.discount : 0, y + 17);
  line('WH Tax Amount', totals.wh, y + 22.5);
  doc.line(bx + 2, y + 24.5, bx + 76, y + 24.5);
  line('Grand Total :', totals.net, y + 28.5, true);

  // Signatures
  const sy = Math.max(y + 55, 245);
  doc.setLineWidth(0.3);
  doc.setDrawColor(40, 40, 40);
  const sig = (label: string, x: number) => {
    doc.line(x, sy, x + 55, sy);
    text(label, x + 27.5, sy + 5, { size: 8, align: 'center' });
  };
  sig('CHECKED BY', M);
  sig('APPROVED BY', M + 66);
  sig('USER SIGNATURE', M + 131);
  text(shortDate(new Date()), M + W, sy + 18, { size: 7.5, align: 'right', color: [100, 116, 139] });
  return { doc, fileName: `${po.poNo}.pdf` };
}
