import { type ReactNode, useState } from 'react';
import { Button, Dialog } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { useLazyExportSalesOrdersQuery, useLazyExportStockSheetQuery } from '../salesApi';
import { P } from '../permissions';
import { reportLetterhead } from './exporters';

/**
 * The bookings report: one row per sales order with the same columns as the dealership's booking sheet
 * (SR NO, PBO No., Customer Name … Vehicle Delivered Date). It opens as a preview first; from there it is printed
 * or downloaded as a PDF (A3, landscape, every column on one wide page) or as an Excel file (.xlsx) with proper column widths.
 */
export type Row = Record<string, unknown>;
/** Draws what opens a report (default: a small button); the reports page draws a card. */
export type ReportTrigger = (open: () => void, loading: boolean) => ReactNode;
/** `w`: the column's relative width (PDF) and its width in characters (Excel). */
export type Col = { header: string; value: (r: Row) => string | number; w: number; num?: boolean; /** Never wraps onto a second line (a number like the PBO). */ nowrap?: boolean };

const date = (v: unknown) => {
  if (typeof v !== 'string' || !v) return '';
  const d = new Date(v.length === 10 ? `${v}T12:00:00+05:00` : v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }).replace(/ /g, '-');
};
const text = (v: unknown) => (v == null ? '' : String(v));
const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v));
const month = (r: Row) => {
  const d = text(r.expectedDelivery);
  return d ? new Date(`${d}T12:00:00+05:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }).replace(' ', '-').toUpperCase() : '';
};
type Payment = { kind: string; amount: string; receivedOn: string };
const paymentsOf = (r: Row) => (r.payments as Payment[] | undefined) ?? [];
const money = (v: unknown) => Number(v ?? 0).toLocaleString('en-PK', { maximumFractionDigits: 0 });
/** What came after the booking: one line per payment, "date — amount" (several payments: several lines). */
const balancePaid = (r: Row) =>
  paymentsOf(r)
    .filter((p) => p.kind !== 'booking')
    .map((p) => `${date(p.receivedOn)} — ${money(p.amount)}`)
    .join('\n');
/** Delivered / cancelled, else booked (part paid) or ordered (all paid). */
const state = (r: Row) => (r.status === 'delivered' ? 'DELIVERED' : r.status === 'cancelled' ? 'CANCELLED' : num(r.received) > 0 && num(r.balance) <= 0 ? 'ORDERED' : 'BOOKED');

export const BOOKING_COLUMNS: Col[] = [
  { header: 'SR NO', value: (r) => num(r.sr), w: 6, num: true },
  { header: 'PBO No.', value: (r) => text(r.pboNo), w: 24, nowrap: true },
  { header: 'Customer Name', value: (r) => text(r.customerName), w: 30 },
  { header: 'Model', value: (r) => [r.model, r.variant].filter(Boolean).join(' '), w: 22 },
  { header: 'Color', value: (r) => text(r.color), w: 18 },
  { header: 'CONTACT INFO', value: (r) => text(r.phone), w: 15 },
  { header: 'EMAIL ID', value: (r) => text(r.email), w: 26 },
  { header: 'Booking Date', value: (r) => date(r.bookedOn), w: 13 },
  { header: 'Allocation Month', value: month, w: 12 },
  // Everything the customer has paid so far (booking, part and full payments); what is still due; and the balance payments with their dates.
  { header: 'Payment', value: (r) => num(r.received), w: 14, num: true },
  { header: 'BALANCE PAYMENT', value: (r) => num(r.balance), w: 15, num: true },
  { header: 'BALANCE PAID (date — amount)', value: balancePaid, w: 22 },
  { header: 'SALES PERSON', value: (r) => text(r.salesperson), w: 16 },
  { header: 'Reference', value: (r) => text(r.referredBy), w: 16 },
  { header: 'Remarks', value: (r) => text(r.notes), w: 24 },
  { header: 'Status', value: state, w: 12 },
  { header: 'Profession', value: (r) => text(r.occupation), w: 16 },
  { header: 'Keys Received', value: () => '', w: 11 },
  { header: 'Invoice NO', value: (r) => text(r.invoiceNo), w: 13 },
  { header: 'Invoice Date', value: (r) => date(r.invoiceDate), w: 13 },
  { header: 'Invoices Received', value: (r) => (r.invoiceNo ? 'RECEIVED' : ''), w: 13 },
  { header: 'ENGINE#', value: (r) => text(r.engineNo), w: 22 },
  { header: 'CHASSIS #', value: (r) => text(r.chassisNo), w: 22 },
  { header: 'Vehicle Delivered Date', value: (r) => date(r.deliveredOn), w: 14 },
];

export const isAmount = (c: Col) => !!c.num && c.header !== 'SR NO';
export const fmt = (c: Col, r: Row) => {
  const v = c.value(r);
  return isAmount(c) ? Number(v).toLocaleString('en-PK', { maximumFractionDigits: 0 }) : String(v);
};

// ---- Excel (.xlsx), written by hand: widths, a styled header, borders, a filter and a frozen header row ----
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i: number) => String.fromCharCode(65 + i);

export async function buildBookingsXlsx(rows: Row[], cols: Col[] = BOOKING_COLUMNS, sheetName = 'Bookings') {
  const { default: JSZip } = await import('jszip');
  const last = `${colName(cols.length - 1)}${rows.length + 1}`;
  const cell = (c: Col, i: number, r: number, row: Row) => {
    const ref = `${colName(i)}${r}`;
    const v = c.value(row);
    if (c.num) return `<c r="${ref}" s="${isAmount(c) ? 3 : 4}"><v>${Number(v)}</v></c>`;
    return `<c r="${ref}" s="2" t="inlineStr"><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`;
  };
  const head = `<row r="1" ht="30" customHeight="1">${cols.map((c, i) => `<c r="${colName(i)}1" s="1" t="inlineStr"><is><t>${xml(c.header)}</t></is></c>`).join('')}</row>`;
  const merges: string[] = [];
  const body = rows
    .map((row, n) => {
      if (row.__group) {
        merges.push(`<mergeCell ref="A${n + 2}:${colName(cols.length - 1)}${n + 2}"/>`);
        return `<row r="${n + 2}" ht="22" customHeight="1"><c r="A${n + 2}" s="5" t="inlineStr"><is><t>${xml(String(row.__group))}</t></is></c>${cols.slice(1).map((_, i) => `<c r="${colName(i + 1)}${n + 2}" s="5"/>`).join('')}</row>`;
      }
      return `<row r="${n + 2}">${cols.map((c, i) => cell(c, i, n + 2, row)).join('')}</row>`;
    })
    .join('');
  const sheet =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="18"/>' +
    `<cols>${cols.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.w + 2}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${head}${body}</sheetData><autoFilter ref="A1:${last}"/>` +
    (merges.length ? `<mergeCells count="${merges.length}">${merges.join('')}</mergeCells>` : '') +
    '<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="8" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';
  const align = (h: string) => `<alignment horizontal="${h}" vertical="center" wrapText="1"/>`;
  const styles =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF6FA8DC"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF00FF00"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF999999"/></left><right style="thin"><color rgb="FF999999"/></right><top style="thin"><color rgb="FF999999"/></top><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${align('center')}</xf>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">${align('center')}</xf>` +
    `<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">${align('right')}</xf>` +
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">${align('center')}</xf>` +
    `<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${align('center')}</xf></cellXfs></styleSheet>`;
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  );
  zip.file(
    'xl/workbook.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${sheetName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  );
  zip.file('xl/styles.xml', styles);
  zip.file('xl/worksheets/sheet1.xml', sheet);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---- PDF: A3 landscape, so all 23 columns fit on a wide page ----
export async function buildBookingsPdf(title: string, subtitle: string, rows: Row[], cols: Col[] = BOOKING_COLUMNS, format: 'a3' | 'a4' = 'a3') {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format, orientation: 'landscape', compress: true });
  const W = format === 'a3' ? 420 : 297;
  const H = format === 'a3' ? 297 : 210;
  const M = 8;
  const CW = W - 2 * M;
  const total = cols.reduce((n, c) => n + c.w, 0);
  const ws = cols.map((c) => (CW * c.w) / total);
  const xs = ws.map((_, i) => M + ws.slice(0, i).reduce((a, b) => a + b, 0));
  let y = await reportLetterhead(doc, W, M);
  doc.setTextColor(17, 24, 39);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, M, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(subtitle, M, y + 5.5);
  doc.setTextColor(17, 24, 39);
  y += 10;
  const LH = 3.3;
  const head = () => {
    doc.setFillColor(111, 168, 220);
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.2);
    doc.rect(M, y, CW, 8.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    cols.forEach((c, i) => {
      if (i) doc.line(xs[i]!, y, xs[i]!, y + 8.5);
      const lines = doc.splitTextToSize(c.header, ws[i]! - 2) as string[];
      lines.slice(0, 2).forEach((l, k) => doc.text(l, xs[i]! + ws[i]! / 2, y + (lines.length > 1 ? 3.4 : 5.3) + k * LH, { align: 'center' }));
    });
    y += 8.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
  };
  head();
  rows.forEach((r) => {
    if (r.__group) {
      if (y + 7 > H - 12) {
        doc.addPage();
        y = 10;
        head();
      }
      doc.setFillColor(0, 230, 0);
      doc.rect(M, y, CW, 6.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text(String(r.__group), M + CW / 2, y + 4.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      y += 6.5;
      return;
    }
    const cells = cols.map((c, i) => doc.splitTextToSize(fmt(c, r), ws[i]! - 2) as string[]);
    const h = Math.max(...cells.map((l) => l.length)) * LH + 2.4;
    if (y + h > H - 12) {
      doc.addPage();
      y = 10;
      head();
    }
    doc.rect(M, y, CW, h);
    cells.forEach((lines, i) => {
      if (i) doc.line(xs[i]!, y, xs[i]!, y + h);
      const right = isAmount(cols[i]!);
      lines.forEach((l, k) => doc.text(l, right ? xs[i]! + ws[i]! - 1 : xs[i]! + ws[i]! / 2, y + 3.5 + k * LH, { align: right ? 'right' : 'center' }));
    });
    y += h;
  });
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`${title} · Page ${i} of ${pages}`, W - M, H - 5, { align: 'right' });
  }
  return doc;
}

/**
 * A report preview: the table to look over, then Print, Download PDF or Download Excel (.xlsx). Used by the bookings report
 * and the delivered-cars report.
 */
export function ReportDialog({
  title,
  periodLabel,
  rows,
  cols,
  format,
  sheetName,
  summary,
  onClose,
}: {
  title: string;
  periodLabel: string;
  rows: Row[];
  cols: Col[];
  format: 'a3' | 'a4';
  sheetName: string;
  summary: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<'pdf' | 'print' | 'xlsx' | null>(null);
  const count = rows.filter((x) => !x.__group).length;
  const subtitle = `${count} ${title.toLowerCase().includes('stock') ? 'cars' : title.toLowerCase().includes('invoice') ? 'invoices received' : title.toLowerCase().includes('deliver') ? 'cars delivered' : 'orders booked'} ${periodLabel}`;
  const file = `${title} - ${periodLabel} - ${new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' })}`.replace(/[\\/:*?"<>|]/g, '');
  const pdf = async (print: boolean) => {
    setBusy(print ? 'print' : 'pdf');
    try {
      const doc = await buildBookingsPdf(title, subtitle, rows, cols, format);
      if (print) {
        doc.autoPrint();
        window.open(doc.output('bloburl') as unknown as string, '_blank');
      } else doc.save(`${file}.pdf`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };
  const xlsx = async () => {
    setBusy('xlsx');
    try {
      const blob = await buildBookingsXlsx(rows, cols, sheetName);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${file}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      size="full"
      title={`${title} — ${periodLabel}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" loading={busy === 'print'} onClick={() => void pdf(true)}>
            Print
          </Button>
          <Button variant="secondary" loading={busy === 'pdf'} onClick={() => void pdf(false)}>
            Download PDF
          </Button>
          <Button loading={busy === 'xlsx'} onClick={() => void xlsx()}>
            Download Excel
          </Button>
        </>
      }
    >
      <p className="mb-2 text-xs text-slate-500">{summary} Look it over, then print or download.</p>
      <div className="overflow-auto rounded-lg ring-1 ring-slate-300" style={{ maxHeight: 'calc(100vh - 240px)' }}>
        <table className="min-w-full border-collapse text-xs">
          <thead className="sticky top-0">
            <tr>
              {cols.map((c) => (
                <th key={c.header} style={{ minWidth: `${c.w * 6 + 16}px` }} className="border border-slate-400 bg-sky-300 px-2 py-1.5 text-center font-semibold whitespace-nowrap text-slate-900">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) =>
              r.__group ? (
                <tr key={i}>
                  <td colSpan={cols.length} className="border border-slate-400 bg-lime-400 px-2 py-1 text-center text-sm font-bold text-slate-900">
                    {String(r.__group)}
                  </td>
                </tr>
              ) : (
              <tr key={i} className={r.status === 'cancelled' ? 'bg-red-100' : ''}>
                {cols.map((c) => (
                  <td key={c.header} className={`border border-slate-300 px-2 py-1 align-middle ${c.nowrap ? 'whitespace-nowrap' : 'whitespace-pre-line'} text-slate-800 ${isAmount(c) ? 'text-right tabular-nums' : 'text-center'}`}>
                    {fmt(c, r)}
                  </td>
                ))}
              </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </Dialog>
  );
}

export function BookingsReportButton({ query, periodLabel, trigger }: { query: { from?: string; to?: string; dealershipId?: number; status?: string }; periodLabel: string; trigger?: ReportTrigger }) {
  const perm = usePermission();
  const toast = useToast();
  const [load, { isFetching }] = useLazyExportSalesOrdersQuery();
  const [rows, setRows] = useState<Row[] | null>(null);
  if (!perm.can([P.ordersViewAll])) return null;
  const open = async () => {
    try {
      const data = (await load(query).unwrap()) as Row[];
      if (!data.length) return toast.error(`No orders booked ${periodLabel}`);
      setRows(data.map((r, i) => ({ ...r, sr: i + 1 })));
    } catch (e) {
      toast.error(e);
    }
  };
  const paid = rows?.reduce((n, r) => n + num(r.received), 0) ?? 0;
  const due = rows?.reduce((n, r) => n + num(r.balance), 0) ?? 0;
  return (
    <>
      {trigger ? (
        trigger(() => void open(), isFetching)
      ) : (
        <Button size="sm" variant="secondary" loading={isFetching} onClick={() => void open()} title="The booking sheet: one row per order, to view, print or download">
          Bookings report
        </Button>
      )}
      {rows && (
        <ReportDialog
          title="Bookings report"
          periodLabel={periodLabel}
          rows={rows}
          cols={BOOKING_COLUMNS}
          format="a3"
          sheetName="Bookings"
          summary={`${rows.length} orders · Payment received Rs ${paid.toLocaleString('en-PK')} · Balance Rs ${due.toLocaleString('en-PK')}.`}
          onClose={() => setRows(null)}
        />
      )}
    </>
  );
}

// ---- The delivered cars (the "VEHICLE DELIVERED" sheet) ----
export const DELIVERED_COLUMNS: Col[] = [
  { header: 'SR NO', value: (r) => num(r.sr), w: 6, num: true },
  { header: 'PBO No.', value: (r) => text(r.pboNo), w: 24, nowrap: true },
  { header: 'Customer Name', value: (r) => text(r.customerName), w: 30 },
  { header: 'Model', value: (r) => [r.model, r.variant].filter(Boolean).join(' '), w: 22 },
  { header: 'Color', value: (r) => text(r.color), w: 18 },
  { header: 'Contact', value: (r) => text(r.phone), w: 15 },
  { header: 'Booking Date', value: (r) => date(r.bookedOn), w: 13 },
  { header: 'Allocation Month', value: month, w: 12 },
  { header: 'Payment', value: (r) => num(r.received), w: 14, num: true },
  { header: 'CHASSIS #', value: (r) => text(r.chassisNo), w: 22 },
  { header: 'Vehicle received date', value: (r) => date(r.receivedOn), w: 15 },
  { header: 'Vehicle delivered date', value: (r) => date(r.deliveredOn), w: 15 },
];

// ---- The invoices received (the "INVOICE" sheet) ----
export const INVOICE_COLUMNS: Col[] = [
  { header: 'Sr No.', value: (r) => num(r.sr), w: 6, num: true },
  { header: 'PBO NO', value: (r) => text(r.pboNo), w: 24, nowrap: true },
  { header: 'Customer Name', value: (r) => text(r.customerName), w: 30 },
  { header: 'Model', value: (r) => [r.model, r.variant].filter(Boolean).join(' '), w: 22 },
  { header: 'Color', value: (r) => text(r.color), w: 16 },
  { header: 'Engine No', value: (r) => text(r.engineNo), w: 22 },
  { header: 'Chasis No', value: (r) => text(r.chassisNo), w: 22 },
  { header: 'Invoice No', value: (r) => text(r.invoiceNo), w: 13 },
  { header: 'Invoices date', value: (r) => date(r.invoiceDate), w: 13 },
  { header: 'Invoice Received', value: (r) => date(r.invoiceReceivedOn), w: 13 },
  { header: 'Invoice Delivered To customer', value: (r) => (r.invoiceDeliveredAt ? ['DELIVERED', text(r.invoiceDeliveredAt), r.invoiceTakenByName ? `Taken by ${text(r.invoiceTakenByName)}${r.invoiceTakenByContact ? `, ${text(r.invoiceTakenByContact)}` : ''}${r.invoiceTakenByCnic ? `, CNIC ${text(r.invoiceTakenByCnic)}` : ''}` : 'Taken by the customer'].join('\n') : ''), w: 18 },
  { header: 'Remarks', value: (r) => text(r.invoiceNotes), w: 28 },
];

/** "Invoices received report" for the Invoices received page: the cars whose invoice is recorded, in the order the invoices arrived. */
export function InvoiceReportButton({ period, periodLabel, dealershipId, trigger }: { period: { from?: string; to?: string }; periodLabel: string; dealershipId?: number; trigger?: ReportTrigger }) {
  const perm = usePermission();
  const toast = useToast();
  const [load, { isFetching }] = useLazyExportSalesOrdersQuery();
  const [rows, setRows] = useState<Row[] | null>(null);
  if (!perm.can([P.ordersViewAll])) return null;
  const open = async () => {
    try {
      const all = (await load({ from: period.from, to: period.to, dealershipId }).unwrap()) as Row[];
      const got = all.filter((r) => !!text(r.invoiceNo)).sort((a, b) => text(a.invoiceReceivedOn).localeCompare(text(b.invoiceReceivedOn)));
      if (!got.length) return toast.error(`No invoices received ${periodLabel}`);
      setRows(got.map((r, i) => ({ ...r, sr: i + 1 })));
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <>
      {trigger ? (
        trigger(() => void open(), isFetching)
      ) : (
        <Button size="sm" variant="secondary" loading={isFetching} onClick={() => void open()} title="The invoices received: to view, print or download">
          Invoices received report
        </Button>
      )}
      {rows && (
        <ReportDialog
          title="Invoices received report"
          periodLabel={periodLabel}
          rows={rows}
          cols={INVOICE_COLUMNS}
          format="a4"
          sheetName="Invoice"
          summary={`${rows.length} invoices received.`}
          onClose={() => setRows(null)}
        />
      )}
    </>
  );
}

/** "Delivered cars report" for the Deliveries page: only delivered cars, narrowed to the page's period (delivered then). */
export function DeliveredReportButton({ period, periodLabel, dealershipId, by = 'deliveredOn', trigger }: {
  trigger?: ReportTrigger; period: { from?: string; to?: string }; periodLabel: string; dealershipId?: number; /** The date the period applies to: when the car was delivered (default), or when the order was booked. */ by?: 'deliveredOn' | 'bookedOn' }) {
  const perm = usePermission();
  const toast = useToast();
  const [load, { isFetching }] = useLazyExportSalesOrdersQuery();
  const [rows, setRows] = useState<Row[] | null>(null);
  if (!perm.can([P.ordersViewAll])) return null;
  const open = async () => {
    try {
      const all = (await load({ status: 'delivered', dealershipId }).unwrap()) as Row[];
      const inPeriod = all
        .filter((r) => {
          const d = text(r[by]);
          return !!d && !!text(r.deliveredOn) && (!period.from || d >= period.from) && (!period.to || d <= period.to);
        })
        .sort((a, b) => text(a.deliveredOn).localeCompare(text(b.deliveredOn)));
      if (!inPeriod.length) return toast.error(`No cars delivered ${periodLabel}`);
      setRows(inPeriod.map((r, i) => ({ ...r, sr: i + 1 })));
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <>
      {trigger ? (
        trigger(() => void open(), isFetching)
      ) : (
        <Button size="sm" variant="secondary" loading={isFetching} onClick={() => void open()} title="Only the delivered cars: to view, print or download">
          Delivered cars report
        </Button>
      )}
      {rows && (
        <ReportDialog
          title="Delivered cars report"
          periodLabel={periodLabel}
          rows={rows}
          cols={DELIVERED_COLUMNS}
          format="a4"
          sheetName="Vehicle delivered"
          summary={`${rows.length} cars delivered.`}
          onClose={() => setRows(null)}
        />
      )}
    </>
  );
}

// ---- The stock sheets (the "OPEN STOCK SHEET": the cars grouped under their model) ----
const lime = (name: string): Row => ({ __group: name });
/** The sheet's lines: each model's name over its cars, numbered from 1 under every model. */
const withModels = (cars: Row[]): Row[] => {
  const out: Row[] = [];
  let model = '';
  let n = 0;
  for (const c of cars) {
    const m = text(c.model).toUpperCase();
    if (m !== model) {
      model = m;
      n = 0;
      out.push(lime(m));
    }
    out.push({ ...c, sr: ++n });
  }
  return out;
};
/** "OPEN STOCK" for a free car, "OPEN STOCK (HOLD)" when it is on hold, else who holds it: customer / PBO. */
const stockStatus = (r: Row) => (r.orderId ? [r.customerName, r.pboNo ?? r.orderNo].filter(Boolean).join(' / ') : r.status === 'hold' ? 'OPEN STOCK (HOLD)' : 'OPEN STOCK');
export const STOCK_COLUMNS: Col[] = [
  { header: 'SR NO', value: (r) => num(r.sr), w: 6, num: true },
  { header: 'VEHICLE DESCRIPTION', value: (r) => [r.model, r.variant].filter(Boolean).join(' ').toUpperCase(), w: 28 },
  { header: 'VEHICLE COLOUR', value: (r) => text(r.color).toUpperCase(), w: 20 },
  { header: 'ENGINE NO.', value: (r) => text(r.engineNo), w: 24 },
  { header: 'CHASSIS NO.', value: (r) => text(r.chassisNo), w: 24 },
  { header: 'STATUS', value: stockStatus, w: 34 },
  { header: 'RECEIVING DATE', value: (r) => date(r.receivedOn), w: 15 },
];

/**
 * The two stock reports on the Open stock page: "Open stock sheet" (the free cars) and "Stock sheet" (every car that has
 * been received and not delivered, also those already held by a customer's order).
 */
export function StockSheetButton({ which, dealershipId, trigger }: { which: 'open' | 'all'; dealershipId?: number; trigger?: ReportTrigger }) {
  const toast = useToast();
  const [load, { isFetching }] = useLazyExportStockSheetQuery();
  const [report, setReport] = useState<{ title: string; rows: Row[]; cars: number } | null>(null);
  const open = async () => {
    try {
      const all = (await load({ dealershipId }).unwrap()) as Row[];
      // A car is here once it is received (or registered as stock); booked / in-transit cars are still on their way.
      const here = all.filter((c) => !['booked', 'in_transit', 'delivered'].includes(text(c.status)));
      const cars = which === 'open' ? here.filter((c) => !c.orderId) : here;
      const title = which === 'open' ? 'Open stock sheet' : 'Stock sheet';
      if (!cars.length) return toast.error(which === 'open' ? 'No open stock right now' : 'No cars received and not delivered');
      setReport({ title, rows: withModels(cars), cars: cars.length });
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <>
      {trigger ? (
        trigger(() => void open(), isFetching)
      ) : (
        <Button
          size="sm"
          variant="secondary"
          loading={isFetching}
          onClick={() => void open()}
          title={which === 'open' ? 'The free cars, grouped by model' : 'Every car received and not delivered, with the customer holding it'}
        >
          {which === 'open' ? 'Open stock sheet' : 'Stock sheet'}
        </Button>
      )}
      {report && (
        <ReportDialog
          title={report.title}
          periodLabel={`as on ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }).replace(/ /g, '-')}`}
          rows={report.rows}
          cols={STOCK_COLUMNS}
          format="a4"
          sheetName={report.title}
          summary={`${report.cars} cars.`}
          onClose={() => setReport(null)}
        />
      )}
    </>
  );
}

/** The two stock reports on the Open stock page. */
export function StockReportButtons({ dealershipId }: { dealershipId?: number }) {
  return (
    <>
      <StockSheetButton which="open" dealershipId={dealershipId} />
      <StockSheetButton which="all" dealershipId={dealershipId} />
    </>
  );
}
