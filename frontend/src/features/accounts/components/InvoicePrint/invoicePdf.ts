import type { Invoice, InvoiceLine, PaymentAllocation } from '../../accountsApi';

const money = (n: number) => `Rs ${n.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
const day = (v: string | null | undefined) => (v ? new Date(`${v.slice(0, 10)}T00:00:00+05:00`).toLocaleDateString('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric' }) : '—');

export interface InvoiceDocument {
  invoice: Invoice;
  lines: InvoiceLine[];
  payments: PaymentAllocation[];
  dealership: { name: string; address: string | null; city: string | null; phone: string | null } | null;
  /** A service invoice: the car and the km it came in with. */
  vehicle?: string | null;
  odometerKm?: number | null;
  /** The customer's complaints on the visit (Voice of Customer). */
  complaints?: string | null;
}

/**
 * The printable invoice: the dealership, the customer (and the car for a service), the lines with their sales tax and the
 * totals. Once paid, it reads as the receipt: a PAID stamp, the payments, and a place for the customer to sign.
 * (A first layout; the dealership's own format replaces it.)
 */
export async function buildInvoicePdf(d: InvoiceDocument): Promise<{ doc: import('jspdf').jsPDF; fileName: string }> {
  const { jsPDF } = await import('jspdf');
  const { invoice: inv, lines, payments } = d;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const M = 14;
  const W = 210 - 2 * M;
  let y = 16;
  const paid = inv.status === 'paid';
  const text = (s: string, x: number, yy: number, o: { bold?: boolean; size?: number; color?: [number, number, number]; align?: 'left' | 'right' | 'center'; max?: number } = {}) => {
    doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
    doc.setFontSize(o.size ?? 9);
    doc.setTextColor(...(o.color ?? [17, 24, 39]));
    doc.text(s, x, yy, { align: o.align ?? 'left', maxWidth: o.max });
  };

  text(d.dealership?.name ?? 'Invoice', M, y, { bold: true, size: 15, color: [30, 58, 138] });
  text('INVOICE', 210 - M, y, { bold: true, size: 18, align: 'right' });
  y += 5.5;
  for (const l of [[d.dealership?.address, d.dealership?.city].filter(Boolean).join(', '), d.dealership?.phone ? `Tel: ${d.dealership.phone}` : ''].filter(Boolean)) {
    text(l, M, y, { size: 8.5, color: [100, 116, 139] });
    y += 4;
  }
  text(inv.invoiceNo, 210 - M, y - 4, { bold: true, size: 11, align: 'right' });
  y += 2;
  doc.setDrawColor(203, 213, 225);
  doc.line(M, y, 210 - M, y);
  y += 6;

  const field = (label: string, value: string, x: number, yy: number, w: number) => {
    text(label.toUpperCase(), x, yy, { size: 7, color: [100, 116, 139] });
    text(value || '—', x, yy + 4.5, { size: 10, bold: true, max: w });
  };
  const col = W / 3;
  field('Billed to', inv.customerName ?? '', M, y, col - 4);
  field('Invoice date', day(inv.invoiceDate), M + col, y, col - 4);
  field('Due', day(inv.dueDate), M + 2 * col, y, col - 4);
  y += 11;
  field(inv.kind === 'service' ? 'Job card' : 'Sales order', inv.sourceNo ?? '', M, y, col - 4);
  if (d.vehicle) field('Car', d.vehicle, M + col, y, col - 4);
  if (d.odometerKm != null) field('Odometer in', `${d.odometerKm.toLocaleString('en-PK')} km`, M + 2 * col, y, col - 4);
  y += 13;

  const cols = [
    { h: '#', w: 8, a: 'left' as const },
    { h: 'Description', w: 78, a: 'left' as const },
    { h: 'Part no.', w: 28, a: 'left' as const },
    { h: 'Qty', w: 12, a: 'right' as const },
    { h: 'Unit price', w: 28, a: 'right' as const },
    { h: 'Amount', w: 28, a: 'right' as const },
  ];
  const header = () => {
    doc.setFillColor(30, 58, 138);
    doc.rect(M, y, W, 7, 'F');
    let x = M;
    for (const c of cols) {
      text(c.h, c.a === 'right' ? x + c.w - 1.5 : x + 1.5, y + 4.7, { bold: true, size: 8, color: [255, 255, 255], align: c.a });
      x += c.w;
    }
    y += 7;
  };
  header();
  lines.forEach((l, i) => {
    const desc = doc.splitTextToSize(l.description, cols[1]!.w - 3) as string[];
    const h = Math.max(6, desc.length * 4 + 2);
    if (y + h > 255) {
      doc.addPage();
      y = 16;
      header();
    }
    if (i % 2) {
      doc.setFillColor(241, 245, 249);
      doc.rect(M, y, W, h, 'F');
    }
    let x = M;
    [String(i + 1), '', l.partNo ?? '', String(Number(l.quantity)), money(Number(l.unitPrice)), money(Number(l.amount))].forEach((c, k) => {
      if (k === 1) desc.forEach((t, n) => text(t, x + 1.5, y + 4 + n * 4, { size: 8.5 }));
      else text(c, cols[k]!.a === 'right' ? x + cols[k]!.w - 1.5 : x + 1.5, y + 4, { size: 8.5, align: cols[k]!.a });
      x += cols[k]!.w;
    });
    y += h;
  });
  doc.line(M, y, 210 - M, y);
  y += 6;
  if (y > 225) {
    doc.addPage();
    y = 20;
  }

  const total = (label: string, v: number, bold = false, color: [number, number, number] = [17, 24, 39]) => {
    text(label, 210 - M - 40, y, { size: 9, bold, color, align: 'right' });
    text(money(v), 210 - M, y, { size: 9, bold, color, align: 'right' });
    y += 5.5;
  };
  total('Subtotal', Number(inv.subtotal));
  total('Sales tax', Number(inv.taxAmount));
  total('Total', Number(inv.totalAmount), true, [30, 58, 138]);
  total('Paid', Number(inv.amountPaid), false, [6, 95, 70]);
  const balance = Number(inv.totalAmount) - Number(inv.amountPaid);
  if (balance > 0.005 && !['void', 'cancelled'].includes(inv.status)) total('Balance due', balance, true, [185, 28, 28]);

  const live = payments.filter((p) => p.paymentStatus === 'posted');
  if (live.length) {
    y += 2;
    text('PAYMENTS RECEIVED', M, y, { size: 7, color: [100, 116, 139] });
    y += 4.5;
    for (const p of live) {
      text(`${p.paymentNo} · ${day(p.paymentDate)}`, M, y, { size: 8.5 });
      text(money(Number(p.amount)), M + 80, y, { size: 8.5, align: 'right' });
      y += 4.5;
    }
  }
  if (inv.notes) {
    y += 2;
    const notes = doc.splitTextToSize(`Notes: ${inv.notes}`, W) as string[];
    notes.forEach((l) => {
      text(l, M, y, { size: 8.5, color: [100, 116, 139] });
      y += 4;
    });
  }

  // The stamp, and the signatures: the customer signs the paid copy as received.
  if (paid || inv.status === 'void') {
    const tone: [number, number, number] = paid ? [22, 163, 74] : [185, 28, 28];
    doc.setDrawColor(...tone);
    doc.setLineWidth(0.8);
    doc.roundedRect(210 - M - 44, 22, 44, 14, 2, 2);
    doc.setLineWidth(0.25);
    doc.setDrawColor(203, 213, 225);
    text(paid ? 'PAID' : 'VOID', 210 - M - 22, 32, { bold: true, size: 20, color: tone, align: 'center' });
  }
  y = Math.max(y + 16, 258);
  if (y > 278) {
    doc.addPage();
    y = 40;
  }
  doc.line(M, y, M + 60, y);
  doc.line(210 - M - 60, y, 210 - M, y);
  text('Cashier / service advisor', M, y + 4, { size: 8, color: [100, 116, 139] });
  text(paid ? 'Customer signature (received and paid in full)' : 'Customer signature', 210 - M - 60, y + 4, { size: 8, color: [100, 116, 139] });
  text(paid ? 'Thank you for your payment.' : 'Please pay by the due date. A signed copy is printed once the invoice is paid.', 105, 290, { size: 8, color: [100, 116, 139], align: 'center' });

  return { doc, fileName: `Invoice ${inv.invoiceNo}.pdf` };
}
