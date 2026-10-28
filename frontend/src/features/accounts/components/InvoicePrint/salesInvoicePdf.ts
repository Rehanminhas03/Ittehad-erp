import type { Customer, Vehicle } from '@/features/crm/crmApi';
import { drawTable, drawWorkshopLetterhead, M, money, PERIODIC_NOTE, rs, shortDate, W, type WorkshopBrand, writer } from '@/features/sales/documents/workshopPdf';
import type { InvoiceLine } from '../../accountsApi';
import type { InvoiceDocument } from './invoicePdf';

/**
 * "Sales Invoice" in the dealership's own layout: the customer, the car and the RO on top; the parts & lubricants and the
 * services, each with its value without and with sales tax and a sub-total; then the totals, the customer's signature
 * and "Owners & Operators of".
 */
export async function buildSalesInvoicePdf(d: InvoiceDocument & { customer?: Customer; car?: Vehicle; brand: WorkshopBrand }): Promise<{ doc: import('jspdf').jsPDF; fileName: string }> {
  const { invoice: inv, lines, payments, customer, car, brand } = d;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const text = writer(doc);
  let y = await drawWorkshopLetterhead(doc, brand);

  text('Sales Invoice', M + W, y - 4, { bold: true, size: 14, align: 'right' });
  text(inv.invoiceNo, M + W, y + 2, { bold: true, size: 11, align: 'right', color: [60, 60, 60] });
  y += 10;

  const cell = (label: string, value: string, x: number, yy: number, max: number) => {
    text(label, x, yy, { bold: true, size: 8 });
    text(value || '—', x + 22, yy, { size: 8, max });
  };
  const model = [car?.modelName, car?.variant].filter(Boolean).join(' ') || (d.vehicle ?? '');
  cell('Customer Name :', inv.customerName ?? '', M, y, 44);
  cell('Vehicle :', model, M + 80, y, 34);
  cell('Date :', shortDate(inv.invoiceDate), M + 140, y, 30);
  y += 5.5;
  cell('Mobile :', customer?.mobile ?? '', M, y, 44);
  cell('Reg No :', car?.registrationNo ?? '', M + 80, y, 34);
  cell('RO No :', inv.sourceNo ?? '', M + 140, y, 30);
  y += 5.5;
  const addrLines = (doc.splitTextToSize([customer?.address, customer?.city].filter(Boolean).join(', ') || '—', 44) as string[]).slice(0, 3);
  text('Address :', M, y, { bold: true, size: 8 });
  addrLines.forEach((l, i) => text(l, M + 22, y + i * 4, { size: 8 }));
  cell('NTN :', customer?.ntn ?? '', M + 80, y, 34);
  cell('KM :', d.odometerKm != null ? String(d.odometerKm) : '', M + 140, y, 30);
  y += addrLines.length * 4 + 5;

  const cols = [
    { h: 'Description', w: 78, a: 'left' as const },
    { h: 'Qty', w: 12, a: 'center' as const },
    { h: 'Unit Price', w: 24, a: 'right' as const },
    { h: 'Value excl. GST', w: 26, a: 'right' as const },
    { h: 'Sales Tax', w: 20, a: 'right' as const },
    { h: 'Value incl. GST', w: 26, a: 'right' as const },
  ];
  const rowOf = (l: InvoiceLine) => [l.description, String(Number(l.quantity)), money(Number(l.unitPrice)), money(Number(l.amount)), money(Number(l.taxAmount)), money(Number(l.amount) + Number(l.taxAmount))];
  const sum = (rows: InvoiceLine[]) => ({ ex: rows.reduce((n, l) => n + Number(l.amount), 0), tax: rows.reduce((n, l) => n + Number(l.taxAmount), 0) });
  const group = (title: string, rows: InvoiceLine[], label: string) => {
    text(title, M, y, { bold: true, size: 12 });
    y = drawTable(doc, y + 3, cols, rows.map(rowOf)) + 5;
    const s = sum(rows);
    text(`${label} ${rs(s.ex)}`, M + 1, y, { bold: true, size: 9 });
    text(`GST: ${rs(s.tax)}`, M + 80, y, { bold: true, size: 9 });
    text(`Sub-total with GST: ${rs(s.ex + s.tax)}`, M + W, y, { bold: true, size: 9, align: 'right' });
    y += 9;
    return s;
  };
  const parts = group('Parts & Lubricants', lines.filter((l) => l.kind === 'part'), 'Sub-total parts:');
  const services = group('Services', lines.filter((l) => l.kind !== 'part'), 'Sub-total services:');
  const ex = parts.ex + services.ex;
  const tax = parts.tax + services.tax;
  const total = (label: string, v: string, big = false) => {
    text(label, M + 1, y, { bold: true, size: big ? 12 : 10.5 });
    text(v, M + W, y, { bold: true, size: big ? 12 : 10.5, align: 'right' });
    y += big ? 7 : 6;
  };
  if (y > 235) {
    doc.addPage();
    y = 20;
  }
  total('Total without GST:', rs(ex));
  total('Total GST:', rs(tax));
  total('Total with GST:', rs(ex + tax));
  total('Discount:', rs(0));
  total('Net Amount:', rs(Number(inv.totalAmount)), true);
  y += 2;
  text('Dealership Observations:', M, y, { size: 8.5 });
  y += 8;
  text(`Note : ${PERIODIC_NOTE}`, M, y, { size: 8 });
  y += 6;
  const live = payments.filter((p) => p.paymentStatus === 'posted');
  if (inv.status === 'paid' && live.length) {
    text(`PAID: ${live.map((p) => `${p.paymentNo} (${shortDate(p.paymentDate)})`).join(', ')}`, M, y, { bold: true, size: 9, color: [22, 120, 60] });
    y += 6;
  }
  y = Math.max(y + 14, 252);
  if (y > 275) {
    doc.addPage();
    y = 40;
  }
  doc.setDrawColor(40, 40, 40);
  doc.line(M + 2, y, M + 52, y);
  text('Customer Signature', M + 2, y + 5, { size: 9 });
  text('Owners & Operators of:', M + 110, y + 1, { size: 8, color: [90, 90, 90] });
  text(brand.name, M + 110, y + 6, { bold: true, size: 10 });

  return { doc, fileName: `Invoice ${inv.invoiceNo}.pdf` };
}
