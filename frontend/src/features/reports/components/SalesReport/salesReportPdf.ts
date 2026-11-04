import { drawTable, drawWorkshopLetterhead, M, money, rs, W, type WorkshopBrand, writer } from '@/features/sales/documents/workshopPdf';

export interface ReportColumn {
  header: string;
  /** Share of the page width. */
  w: number;
  right?: boolean;
  value: (r: Record<string, unknown>) => string | number | null | undefined;
}

export interface SalesReportDocument {
  dealershipName: string;
  brand: WorkshopBrand | null;
  /** "2026-11-03" or "2026-11-01 to 2026-11-03". */
  period: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  totalRow: Record<string, unknown>;
  stats: [string, number][];
}

/** The sales report as a printable page: the letterhead, the period, one row per customer bill, the totals and what each part of the business made. */
export async function buildSalesReportPdf(d: SalesReportDocument): Promise<{ doc: import('jspdf').jsPDF; fileName: string }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const text = writer(doc);
  let y: number;
  if (d.brand) {
    y = await drawWorkshopLetterhead(doc, d.brand);
  } else {
    text(d.dealershipName, M, 20, { bold: true, size: 18 });
    y = 30;
  }
  text('SALES REPORT', M + W, y - 4, { bold: true, size: 16, align: 'right' });
  text(d.period, M + W, y + 3, { bold: true, size: 11, align: 'right', color: [60, 60, 60] });
  y += 12;

  const weight = d.columns.reduce((n, c) => n + c.w, 0);
  const cols = d.columns.map((c) => ({ h: c.header, w: Math.round((c.w / weight) * W * 10) / 10, a: c.right ? ('right' as const) : ('left' as const) }));
  const cell = (c: ReportColumn, r: Record<string, unknown>) => {
    const v = c.value(r);
    return c.right ? (Number(v) ? money(Number(v)) : '-') : String(v ?? '');
  };
  const body = [...d.rows, d.totalRow].map((r) => d.columns.map((c) => cell(c, r)));
  // The last row is the total line.
  y = drawTable(doc, y, cols, body) + 8;

  if (y > 235) {
    doc.addPage();
    y = 20;
  }
  text('Summary', M, y, { bold: true, size: 12 });
  y += 7;
  for (const [label, value] of d.stats) {
    text(`${label}:`, M + 1, y, { size: 10.5 });
    text(rs(value), M + 80, y, { bold: true, size: 10.5, align: 'right' });
    y += 6;
  }
  y += 6;
  text(`${d.rows.length} bill${d.rows.length === 1 ? '' : 's'} · ${d.dealershipName}`, M, y, { size: 8.5, color: [100, 116, 139] });
  return { doc, fileName: `Sales report ${d.period}.pdf` };
}
