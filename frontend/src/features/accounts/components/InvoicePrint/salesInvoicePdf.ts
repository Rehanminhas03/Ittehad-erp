import type { Customer, Vehicle } from '@/features/crm/crmApi';
import { carName, drawIncluded, drawTable, drawWorkshopLetterhead, fieldGrid, M, money, PERIODIC_NOTE, roNumber, rs, shortDate, W, type WorkshopBrand, writer } from '@/features/sales/documents/workshopPdf';
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

  y = fieldGrid(doc, y, [
    [['Customer Name :', inv.customerName ?? ''], ['Vehicle :', carName(car?.modelName, car?.variant) || (d.vehicle ?? '')], ['Date :', shortDate(inv.invoiceDate)]],
    [['Mobile :', customer?.mobile ?? ''], ['Reg No :', car?.registrationNo ?? ''], ['RO No :', roNumber(inv.sourceNo)]],
    [['Address :', [customer?.address, customer?.city].filter(Boolean).join(', ')], ['NTN :', customer?.ntn ?? ''], ['KM :', d.odometerKm != null ? String(d.odometerKm) : '']],
  ]);
  y += 4;

  const colsOf = (taxHeader: string) => [
    { h: 'Description', w: 78, a: 'left' as const },
    { h: 'Qty', w: 12, a: 'center' as const },
    { h: 'Unit Price', w: 24, a: 'right' as const },
    { h: 'Value excl. GST', w: 26, a: 'right' as const },
    { h: taxHeader, w: 20, a: 'right' as const },
    { h: 'Value incl. GST', w: 26, a: 'right' as const },
  ];
  const rowOf = (l: InvoiceLine) => [l.description, String(Number(l.quantity)), money(Number(l.unitPrice)), money(Number(l.amount)), money(Number(l.taxAmount)), money(Number(l.amount) + Number(l.taxAmount))];
  const sum = (rows: InvoiceLine[]) => ({ ex: rows.reduce((n, l) => n + Number(l.amount), 0), tax: rows.reduce((n, l) => n + Number(l.taxAmount), 0) });
  const group = (title: string, rows: InvoiceLine[], label: string, taxHeader = 'Sales Tax 18%', included?: string[]) => {
    text(title, M, y, { bold: true, size: 12 });
    y = drawTable(doc, y + 3, colsOf(taxHeader), rows.map(rowOf)) + 5;
    if (included?.length) y = drawIncluded(doc, y, included);
    const s = sum(rows);
    text(`${label} ${rs(s.ex)}`, M + 1, y, { bold: true, size: 9 });
    text(`GST: ${rs(s.tax)}`, M + 80, y, { bold: true, size: 9 });
    text(`Sub-total with GST: ${rs(s.ex + s.tax)}`, M + W, y, { bold: true, size: 9, align: 'right' });
    y += 9;
    return s;
  };
  // Parts, accessories and lubricants are separate blocks (the last two only when the invoice has them).
  const lubricantRows = lines.filter((l) => l.kind === 'lubricant');
  const accessoryRows = lines.filter((l) => l.kind === 'accessory');
  const parts = group('Parts', lines.filter((l) => l.kind === 'part'), 'Sub-total parts:');
  const accessories = accessoryRows.length ? group('Accessories', accessoryRows, 'Sub-total accessories:') : { ex: 0, tax: 0 };
  const lubricants = lubricantRows.length ? group('Lubricants', lubricantRows, 'Sub-total lubricants:') : { ex: 0, tax: 0 };
  // Services: the 5% is its own column; the "Sales tax" line of the job card and the no-charge checklist tasks are not rows.
  const services = group('Services', lines.filter((l) => !['part', 'lubricant', 'accessory'].includes(l.kind) && !/^sales tax/i.test(l.description) && Number(l.amount) > 0), 'Sub-total services:', 'Sales Tax 5%', lines.filter((l) => !['part', 'lubricant', 'accessory'].includes(l.kind) && Number(l.amount) === 0).map((l) => l.description));
  const ex = parts.ex + accessories.ex + lubricants.ex + services.ex;
  const tax = parts.tax + accessories.tax + lubricants.tax + services.tax;
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
  total('Net Amount:', rs(ex + tax), true);
  y += 2;
  const voice = doc.splitTextToSize(`Voice of Customer : ${d.complaints ?? ''}`, W) as string[];
  voice.forEach((l, i) => text(l, M, y + i * 4.2, { bold: true, size: 9 }));
  y += voice.length * 4.2 + 4;
  text('Dealership Observations:', M, y, { size: 8.5 });
  // Ruled lines to write by hand.
  doc.setDrawColor(90, 90, 90);
  for (let i = 0; i < 2; i++) {
    y += 7;
    doc.line(M, y, M + W, y);
  }
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
