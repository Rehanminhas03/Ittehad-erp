/**
 * Exports of the sales orders and the leads: a CSV file (opens in Excel; every detail, one named
 * column each) and a PDF table (the main columns, landscape). Built in the browser from the export
 * endpoints, which return every row of the chosen period within the user's own scope.
 */
type Row = Record<string, unknown>;
export type Column = { header: string; value: (r: Row) => string | number | null | undefined };

const LABELS: Record<string, string> = {
  pay_order: 'Pay order',
  bank_draft: 'Bank draft',
  cheque: 'Cheque',
  online_transfer: 'Online transfer',
  cash: 'Cash',
  booking: 'Booking',
  partial: 'Partial payment',
  final: 'Final payment',
  full: 'Full payment',
  individual: 'Individual',
  corporate: 'Corporate',
};
const label = (v: unknown) => (typeof v === 'string' ? (LABELS[v] ?? v.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())) : v == null ? '' : String(v));
const money = (v: unknown) => (v == null || v === '' ? '' : Number(v).toLocaleString('en-PK', { maximumFractionDigits: 2 }));
const date = (v: unknown) => {
  if (typeof v !== 'string' || !v) return '';
  const d = new Date(v.length === 10 ? `${v}T12:00:00+05:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }).replace(/ /g, '-');
};
const cnic = (v: unknown) => (typeof v === 'string' && v.length === 13 ? `${v.slice(0, 5)}-${v.slice(5, 12)}-${v.slice(12)}` : (v as string) ?? '');

type Payment = { kind: string; amount: string; instrument: string; reference: string | null; bank: string | null; receivedOn: string };
const paymentsText = (r: Row) =>
  ((r.payments as Payment[]) ?? [])
    .map((p) => `${date(p.receivedOn)}: Rs ${money(p.amount)} ${label(p.kind)} (${[label(p.instrument), p.reference, p.bank].filter(Boolean).join(' / ')})`)
    .join('; ');

/** Every column of a sales order (CSV). */
export const ORDER_COLUMNS: Column[] = [
  { header: 'PBO No.', value: (r) => r.pboNo as string },
  { header: 'Order No.', value: (r) => r.orderNo as string },
  { header: 'Order type', value: (r) => r.orderType as string },
  { header: 'Dealership', value: (r) => r.dealership as string },
  { header: 'Booked on', value: (r) => date(r.bookedOn) },
  { header: 'Order status', value: (r) => label(r.status) },
  { header: 'Customer name', value: (r) => r.customerName as string },
  { header: 'Phone', value: (r) => r.phone as string },
  { header: 'Email', value: (r) => r.email as string },
  { header: 'CNIC', value: (r) => cnic(r.cnic) },
  { header: 'Address', value: (r) => r.address as string },
  { header: 'Customer type', value: (r) => label(r.customerType ?? 'individual') },
  { header: 'Company', value: (r) => r.companyName as string },
  { header: 'Contact designation', value: (r) => r.contactDesignation as string },
  { header: 'Purchase order No.', value: (r) => r.purchaseOrderNo as string },
  { header: 'Brand', value: (r) => r.brand as string },
  { header: 'Car (model)', value: (r) => r.model as string },
  { header: 'Variant', value: (r) => r.variant as string },
  { header: 'Colour', value: (r) => r.color as string },
  { header: 'Chassis No.', value: (r) => r.chassisNo as string },
  { header: 'Engine No.', value: (r) => r.engineNo as string },
  { header: 'Car status', value: (r) => label(r.carStatus) },
  { header: 'Salesperson', value: (r) => r.salesperson as string },
  { header: 'Price (PKR)', value: (r) => money(r.price) },
  { header: 'Discount (PKR)', value: (r) => money(r.discount) },
  { header: 'Total (PKR)', value: (r) => money(r.total) },
  { header: 'Payment type', value: (r) => label(r.paymentType) },
  { header: 'Received (PKR)', value: (r) => money(r.received) },
  { header: 'Balance (PKR)', value: (r) => money(r.balance) },
  { header: 'Payments (date: amount, kind, instrument)', value: paymentsText },
  { header: 'Expected delivery', value: (r) => (r.expectedDeliveryByMonth ? new Date(`${r.expectedDelivery}T12:00:00+05:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : date(r.expectedDelivery)) },
  { header: 'Delivery clearance', value: (r) => label(r.clearance) },
  { header: 'Delivery scheduled', value: (r) => date(r.deliveryScheduled) },
  { header: 'Delivered on', value: (r) => date(r.deliveredOn) },
  { header: 'Notes', value: (r) => r.notes as string },
];
/** The PDF's columns (a page is narrower than a spreadsheet). */
export const ORDER_PDF_COLUMNS: Column[] = [
  { header: 'PBO / Order', value: (r) => [r.pboNo, r.orderNo].filter(Boolean).join('\n') },
  { header: 'Booked', value: (r) => date(r.bookedOn) },
  { header: 'Customer', value: (r) => [r.companyName, r.customerName, r.phone].filter(Boolean).join('\n') },
  { header: 'Car', value: (r) => [r.model, r.variant, r.color].filter(Boolean).join('\n') },
  { header: 'Chassis / Engine', value: (r) => [r.chassisNo, r.engineNo].filter(Boolean).join('\n') },
  { header: 'Salesperson', value: (r) => r.salesperson as string },
  { header: 'Total', value: (r) => money(r.total) },
  { header: 'Received', value: (r) => money(r.received) },
  { header: 'Balance', value: (r) => money(r.balance) },
  { header: 'Status', value: (r) => [label(r.status), r.deliveredOn ? `Delivered ${date(r.deliveredOn)}` : ''].filter(Boolean).join('\n') },
];

/** Every column of a lead (CSV). */
export const LEAD_COLUMNS: Column[] = [
  { header: 'Lead ID', value: (r) => r.leadId as number },
  { header: 'Dealership', value: (r) => r.dealership as string },
  { header: 'Logged on', value: (r) => date(r.loggedOn) },
  { header: 'Status', value: (r) => label(r.status) },
  { header: 'Source', value: (r) => label(r.source) },
  { header: 'Customer name', value: (r) => r.customerName as string },
  { header: 'Phone', value: (r) => r.phone as string },
  { header: 'Email', value: (r) => r.email as string },
  { header: 'Address', value: (r) => r.address as string },
  { header: 'CNIC', value: (r) => cnic(r.cnic) },
  { header: 'Customer type', value: (r) => label(r.customerType ?? 'individual') },
  { header: 'Company', value: (r) => r.companyName as string },
  { header: 'Contact designation', value: (r) => r.contactDesignation as string },
  { header: 'Car (model)', value: (r) => r.model as string },
  { header: 'Variant', value: (r) => r.variant as string },
  { header: 'Colour', value: (r) => r.color as string },
  { header: 'Salesperson', value: (r) => r.salesperson as string },
  { header: 'Logged by', value: (r) => r.loggedBy as string },
  { header: 'Follow-ups', value: (r) => r.followUps as number },
  { header: 'Last follow-up', value: (r) => date(r.lastFollowUp) },
  { header: 'Appointment', value: (r) => (r.appointment ? new Date(r.appointment as string).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' }) : '') },
  { header: 'Converted on', value: (r) => date(r.convertedOn) },
  { header: 'Payment type', value: (r) => label(r.paymentType) },
  { header: 'Amount paid (PKR)', value: (r) => money(r.amountPaid) },
  { header: 'Car total (PKR)', value: (r) => money(r.carPrice) },
  { header: 'Instrument', value: (r) => label(r.instrument) },
  { header: 'Instrument No.', value: (r) => r.instrumentNo as string },
  { header: 'Bank', value: (r) => r.bank as string },
  { header: 'Order No.', value: (r) => r.orderNo as string },
  { header: 'PBO No.', value: (r) => r.pboNo as string },
  { header: 'Lost on', value: (r) => date(r.lostOn) },
  { header: 'Lost reason', value: (r) => r.lostReason as string },
  { header: 'Notes', value: (r) => r.notes as string },
];
export const LEAD_PDF_COLUMNS: Column[] = [
  { header: 'Logged', value: (r) => date(r.loggedOn) },
  { header: 'Customer', value: (r) => [r.companyName, r.customerName, r.phone].filter(Boolean).join('\n') },
  { header: 'Car', value: (r) => [r.model, r.variant, r.color].filter(Boolean).join('\n') },
  { header: 'Source', value: (r) => label(r.source) },
  { header: 'Salesperson', value: (r) => r.salesperson as string },
  { header: 'Follow-ups', value: (r) => r.followUps as number },
  { header: 'Status', value: (r) => label(r.status) },
  { header: 'Payment', value: (r) => (r.paymentType ? `${label(r.paymentType)}\nRs ${money(r.amountPaid)}` : '') },
  { header: 'Order / PBO', value: (r) => [r.orderNo, r.pboNo].filter(Boolean).join('\n') },
];

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Downloads the rows as a CSV file (with a byte-order mark so Excel reads Urdu / special characters). */
export function downloadCsv(fileName: string, columns: Column[], rows: Row[]) {
  const lines = [columns.map((c) => csvCell(c.header)).join(','), ...rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(','))];
  const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** A landscape PDF table: title, period, the rows (wrapped, repeated header on each page), a total line. */
export async function downloadTablePdf(fileName: string, title: string, subtitle: string, columns: Column[], rows: Row[], footnote?: string) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
  const W = 297;
  const M = 10;
  const CW = W - 2 * M;
  const colW = CW / columns.length;
  let y = 14;
  const header = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setFillColor(30, 58, 138);
    doc.setTextColor(255, 255, 255);
    doc.rect(M, y, CW, 7, 'F');
    columns.forEach((c, i) => doc.text(c.header, M + i * colW + 1.5, y + 4.7, { maxWidth: colW - 3 }));
    doc.setTextColor(17, 24, 39);
    y += 7;
  };
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(subtitle, M, y + 5.5);
  doc.setTextColor(17, 24, 39);
  y += 10;
  header();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  rows.forEach((r, n) => {
    const cells = columns.map((c) => doc.splitTextToSize(String(c.value(r) ?? ''), colW - 3) as string[]);
    const h = Math.max(...cells.map((l) => l.length)) * 3.4 + 2.6;
    if (y + h > 200) {
      doc.addPage();
      y = 12;
      header();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
    }
    if (n % 2) {
      doc.setFillColor(241, 245, 249);
      doc.rect(M, y, CW, h, 'F');
    }
    cells.forEach((lines, i) => lines.forEach((l, k) => doc.text(l, M + i * colW + 1.5, y + 3.8 + k * 3.4)));
    y += h;
  });
  if (footnote) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    if (y + 8 > 200) {
      doc.addPage();
      y = 12;
    }
    doc.text(footnote, M, y + 6);
  }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`${title} · Page ${i} of ${pages}`, W - M, 205, { align: 'right' });
  }
  doc.save(fileName.endsWith('.pdf') ? fileName : `${fileName}.pdf`);
}
