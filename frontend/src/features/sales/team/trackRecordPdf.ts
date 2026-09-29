import { humanize } from '@/shared/lib';
import { PPF_COVERAGES } from '../documents/labels';
import type { BuiltPdf } from '../documents/pdf';
import { labelOf, LEAD_SOURCES } from '../permissions';
import type { TrackRecord } from '../salesApi';

type Counts = TrackRecord['totals'];

const COLUMNS: { key: keyof Counts; label: string; money?: boolean }[] = [
  { key: 'leadsLogged', label: 'Leads' },
  { key: 'converted', label: 'Converted' },
  { key: 'carsBooked', label: 'Cars booked' },
  { key: 'carsDelivered', label: 'Delivered' },
  { key: 'ppfSold', label: 'PPF sold' },
  { key: 'ppfAmount', label: 'PPF amount', money: true },
  { key: 'ppfAdvance', label: 'Advance', money: true },
  { key: 'quotations', label: 'Quotations' },
];
const num = (v: string | number) => Number(v).toLocaleString('en-PK', { maximumFractionDigits: 0 });
const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long' });

/**
 * The track record as a landscape A4 PDF: who and which period, the totals and one row per person,
 * plus the twelve months for a whole-year view, then per salesperson the customers behind the figures:
 * leads logged, converted leads and PPF customers. Built from the figures on screen (same people,
 * period and filter), so it holds only the chosen period.
 */
export async function buildTrackRecordPdf(input: {
  data: TrackRecord;
  dealershipName: string;
  periodLabel: string;
  /** "Everyone", "All salespeople", a person's name, or the signed-in salesperson. */
  whoLabel: string;
  preparedBy: string;
  /** Whole-year view: add the twelve months. A month or custom period shows only that period. */
  showMonths: boolean;
}): Promise<BuiltPdf> {
  const details = input.data.details;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
  const W = 297;
  const M = 14;
  const ink = [17, 24, 39] as const;
  const muted = [100, 116, 139] as const;
  const band = [239, 245, 255] as const;
  let y = 16;

  // ---- Title ----------------------------------------------------------------------------------------
  doc.setTextColor(...ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Track record — ${input.dealershipName}`, M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  y += 6;
  doc.text(`${input.whoLabel}  ·  ${input.periodLabel}`, M, y);
  const printed = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  doc.text(`Prepared by ${input.preparedBy} · ${printed}`, W - M, y, { align: 'right' });
  y += 8;

  // ---- Totals -------------------------------------------------------------------------------------------
  const boxW = (W - 2 * M - 7 * 3) / 8;
  COLUMNS.forEach((c, i) => {
    const x = M + i * (boxW + 3);
    doc.setFillColor(...band);
    doc.roundedRect(x, y, boxW, 16, 2, 2, 'F');
    doc.setFontSize(8);
    doc.setTextColor(...muted);
    doc.text(c.label, x + 3, y + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...ink);
    const v = input.data.totals[c.key];
    doc.text(c.money ? `Rs ${num(v)}` : num(v), x + 3, y + 12);
    doc.setFont('helvetica', 'normal');
  });
  y += 24;

  // ---- Tables ---------------------------------------------------------------------------------------------
  const firstW = 70;
  const colW = (W - 2 * M - firstW) / COLUMNS.length;
  const header = (first: string) => {
    doc.setFillColor(...band);
    doc.rect(M, y - 5, W - 2 * M, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...ink);
    doc.text(first, M + 2, y);
    COLUMNS.forEach((c, i) => doc.text(c.label, M + firstW + (i + 1) * colW - 2, y, { align: 'right' }));
    doc.setFont('helvetica', 'normal');
    y += 7;
  };
  const row = (first: string, r: Counts, bold = false) => {
    if (y > 196) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...ink);
    doc.text(doc.splitTextToSize(first, firstW - 4)[0] as string, M + 2, y);
    COLUMNS.forEach((c, i) => {
      const v = r[c.key];
      doc.text(c.money ? num(v) : num(v), M + firstW + (i + 1) * colW - 2, y, { align: 'right' });
    });
    doc.setDrawColor(226, 232, 240);
    doc.line(M, y + 2.5, W - M, y + 2.5);
    y += 7;
  };
  const section = (title: string) => {
    if (y > 180) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...ink);
    doc.text(title, M, y);
    y += 7;
  };

  section(input.data.members.length === 1 ? 'Record' : 'Per salesperson');
  header('Salesperson');
  for (const m of input.data.members) row(`${m.fullName}${m.isActive ? '' : ' (left)'}`, m);
  if (input.data.members.length > 1) row('Total', input.data.totals, true);

  if (input.showMonths) {
    y += 5;
    section(`Month by month · ${input.data.year}`);
    header('Month');
    for (const m of input.data.months) row(monthName(m.month), m);
  }

  // ---- Per salesperson: the customers behind the figures ---------------------------------------------------------
  type Col = { label: string; w: number; right?: boolean };
  /** A titled table; long lists continue on the next page with the column headings repeated. */
  const table = (title: string, cols: Col[], rows: (string | null)[][]) => {
    if (y > 184) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...ink);
    doc.text(`${title} (${rows.length})`, M, y);
    y += 5;
    if (!rows.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(...muted);
      doc.text('None in this period.', M + 2, y);
      y += 7;
      return;
    }
    const scale = (W - 2 * M) / cols.reduce((n, c) => n + c.w, 0);
    const xs = cols.reduce<number[]>((a, c, i) => [...a, a[i]! + c.w * scale], [M]);
    const head = () => {
      doc.setFillColor(...band);
      doc.rect(M, y - 4, W - 2 * M, 6.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(...ink);
      cols.forEach((c, i) => doc.text(c.label, c.right ? xs[i + 1]! - 2 : xs[i]! + 2, y, { align: c.right ? 'right' : 'left' }));
      y += 6;
    };
    head();
    doc.setFont('helvetica', 'normal');
    for (const r of rows) {
      if (y > 198) {
        doc.addPage();
        y = 18;
        head();
        doc.setFont('helvetica', 'normal');
      }
      doc.setFontSize(8.5);
      doc.setTextColor(...ink);
      cols.forEach((c, i) => {
        const text = (doc.splitTextToSize(r[i] ?? '', c.w * scale - 4) as string[])[0] ?? '';
        doc.text(text, c.right ? xs[i + 1]! - 2 : xs[i]! + 2, y, { align: c.right ? 'right' : 'left' });
      });
      doc.setDrawColor(236, 240, 245);
      doc.line(M, y + 2, W - M, y + 2);
      y += 5.8;
    }
    y += 4;
  };
  const date = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

  if (details) {
    for (const m of input.data.members) {
      const leads = details.leads.filter((r) => r.userId === m.userId);
      const converted = details.converted.filter((r) => r.userId === m.userId);
      const ppf = details.ppf.filter((r) => r.userId === m.userId);
      // Each salesperson starts on a new page: heading, their summary, then the customers.
      doc.addPage();
      y = 18;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(...ink);
      doc.text(`${m.fullName}${m.isActive ? '' : ' (left)'}`, M, y);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(...muted);
      y += 6;
      doc.text(
        [
          `Leads ${num(m.leadsLogged)}`,
          `Converted ${num(m.converted)}`,
          `Cars booked ${num(m.carsBooked)}`,
          `Delivered ${num(m.carsDelivered)}`,
          `PPF sold ${num(m.ppfSold)} (Rs ${num(m.ppfAmount)})`,
          `Quotations ${num(m.quotations)}`,
        ].join('   ·   ') + `   ·   ${input.periodLabel}`,
        M,
        y,
      );
      y += 9;
      table(
        'Leads logged',
        [
          { label: 'Customer', w: 38 },
          { label: 'Phone', w: 26 },
          { label: 'Interested in', w: 34 },
          { label: 'Source', w: 20 },
          { label: 'Status', w: 20 },
          { label: 'Entered by', w: 30 },
          { label: 'Logged', w: 22 },
          { label: 'Converted by', w: 30 },
          { label: 'Converted', w: 22 },
        ],
        leads.map((r) => [
          r.customer,
          r.phone,
          r.vehicle ?? '—',
          labelOf(LEAD_SOURCES, r.source),
          humanize(r.status),
          r.enteredBy ?? '—',
          date(r.loggedOn),
          r.convertedBy ?? '—',
          date(r.convertedOn),
        ]),
      );
      table(
        'Converted leads',
        [
          { label: 'Customer', w: 40 },
          { label: 'Phone', w: 26 },
          { label: 'Vehicle', w: 38 },
          { label: 'Status', w: 22 },
          { label: 'Entered by', w: 32 },
          { label: 'Logged', w: 22 },
          { label: 'Converted by', w: 32 },
          { label: 'Converted', w: 22 },
        ],
        converted.map((r) => [r.customer, r.phone, r.vehicle ?? '—', humanize(r.status), r.enteredBy ?? '—', date(r.loggedOn), r.convertedBy ?? '—', date(r.convertedOn)]),
      );
      table(
        'PPF customers',
        [
          { label: 'Voucher', w: 36 },
          { label: 'Customer', w: 40 },
          { label: 'Phone', w: 27 },
          { label: 'Date', w: 22 },
          { label: 'Coverage', w: 28 },
          { label: 'Price (Rs)', w: 22, right: true },
          { label: 'Paid (Rs)', w: 22, right: true },
          { label: 'Un-paid (Rs)', w: 22, right: true },
        ],
        ppf.map((r) => [r.formNo, r.customer, r.phone, date(r.soldOn), (labelOf(PPF_COVERAGES as unknown as { value: string; label: string }[], r.coverage) ?? r.coverage).replace(/ \(.*\)$/, ''), num(r.price), num(r.paid), num(r.unpaid)]),
      );
    }
  }

  // ---- Footer -------------------------------------------------------------------------------------------------
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(...muted);
    doc.text(`Ittehad Motors · ${input.dealershipName} · Track record${pages > 1 ? ` · Page ${i} of ${pages}` : ''}`, W / 2, 204, { align: 'center' });
  }
  doc.setProperties({ title: `Track record ${input.whoLabel} ${input.periodLabel}` });
  const fileName = `Track record - ${input.whoLabel} - ${input.periodLabel}.pdf`.replace(/[\\/:*?"<>|]/g, '');
  return { doc, fileName };
}
