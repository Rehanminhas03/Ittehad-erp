import { drawIncluded, drawTable, drawWorkshopLetterhead, fieldGrid, M, money as fmt, repairOrderTerms, rs, shortDate, W, type WorkshopBrand, writer } from '@/features/sales/documents/workshopPdf';
import type { Estimate, EstimateLine } from '../../serviceApi';

/** The estimate number as printed: the running number only ("ES-2026-00004" -> "00004"). */
/** Sales tax: 18% on parts, accessories and lubricants (prices are without tax); 5% on the service charges. */
const GOODS_TAX = 18;
const SERVICE_TAX = 5;
const estNumber = (no: string) => no.split('-').pop() ?? no;

/**
 * "REPAIR ESTIMATE": what the work would cost, given to the customer before anything is done (not a repair order, so it
 * is not in the repair order reports). The customer and the car, the parts and lubricants, the services, the total and,
 * on the second page, the terms and the signature lines.
 */
export async function buildEstimatePdf(d: { estimate: Estimate; lines: EstimateLine[]; brand: WorkshopBrand }): Promise<{ doc: import('jspdf').jsPDF; fileName: string }> {
  const { estimate: e, lines, brand } = d;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const text = writer(doc);
  let y = await drawWorkshopLetterhead(doc, brand);

  text('Repair Estimate', 105, y + 4, { bold: true, size: 18, align: 'center' });
  text(`EST NO -${estNumber(e.estimateNo)}`, 105, y + 12, { bold: true, size: 13, color: [120, 120, 120], align: 'center' });
  y += 20;

  y = fieldGrid(doc, y, [
    [['Customer Name :', e.customerName ?? ''], ['Mobile :', e.customerMobile ?? ''], ['Date :', shortDate(e.createdAt)]],
    [['Make Model :', e.vehicleModel ?? e.vehicleLabel ?? ''], ['Reg. No :', e.registrationNo ?? ''], ['Valid until :', e.validUntil ? shortDate(e.validUntil) : '—']],
    [['Variant :', e.vehicleVariant ?? ''], ['VIN / Chassis :', e.vin ?? ''], ['Engine No :', e.engineNo ?? '']],
    [['Colour :', e.color ?? ''], ['Model year :', e.modelYear ? String(e.modelYear) : ''], null],
    [['Advisor :', e.advisorName ?? ''], e.jobCardNo ? ['RO :', e.jobCardNo] : null, null],
  ]);
  y += 5;

  const goodsCols = [
    { h: 'Description', w: 70, a: 'left' as const },
    { h: 'Qty', w: 12, a: 'center' as const },
    { h: 'Unit Rate', w: 26, a: 'right' as const },
    { h: 'Subtotal', w: 26, a: 'right' as const },
    { h: `Sales Tax ${GOODS_TAX}%`, w: 24, a: 'right' as const },
    { h: 'Total', w: 28, a: 'right' as const },
  ];
  const serviceCols = [
    { h: 'Description', w: 70, a: 'left' as const },
    { h: 'Qty', w: 12, a: 'center' as const },
    { h: 'Unit Rate', w: 26, a: 'right' as const },
    { h: 'Charges', w: 26, a: 'right' as const },
    { h: `Sales Tax ${SERVICE_TAX}%`, w: 24, a: 'right' as const },
    { h: 'Total', w: 28, a: 'right' as const },
  ];
  const taxOf = (amount: number, pct: number) => Math.round(amount * pct) / 100;
  let total = 0;
  const block = (title: string, rows: EstimateLine[], label: string, pct: number, cols: typeof goodsCols, included: string[] = []) => {
    if (!rows.length) return;
    text(title, M, y, { bold: true, size: 13 });
    y = drawTable(doc, y + 3, cols, rows.map((l) => [l.description, String(Number(l.quantity)), fmt(Number(l.unitPrice)), fmt(Number(l.amount)), fmt(taxOf(Number(l.amount), pct)), fmt(Number(l.amount) + taxOf(Number(l.amount), pct))])) + 5;
    y = drawIncluded(doc, y, included) + 2;
    const sub = rows.reduce((n, l) => n + Number(l.amount) + taxOf(Number(l.amount), pct), 0);
    total += sub;
    text(label, M + 1, y, { bold: true, size: 11 });
    text(rs(sub), M + W, y, { bold: true, size: 11, align: 'right' });
    y += 10;
  };
  const of = (kinds: string[]) => lines.filter((l) => kinds.includes(l.kind));
  block('Parts', of(['part']), 'Sub-total parts:', GOODS_TAX, goodsCols);
  block('Accessories', of(['accessory']), 'Sub-total accessories:', GOODS_TAX, goodsCols);
  block('Lubricants', of(['lubricant']), 'Sub-total lubricants:', GOODS_TAX, goodsCols);
  // Services: the 5% is its own column, so a "Sales tax" line (added with a periodic service) is not printed as a row.
  block('Services', of(['labour', 'sublet']).filter((l) => !/^sales tax/i.test(l.description) && Number(l.amount) > 0), 'Sub-total services:', SERVICE_TAX, serviceCols, of(['labour', 'sublet']).filter((l) => Number(l.amount) === 0).map((l) => l.description));
  if (!lines.length) {
    text('No parts or services have been added yet.', M, y, { size: 10, color: [120, 120, 120] });
    y += 10;
  }
  text('Grand-Total:', M + 1, y, { bold: true, size: 12 });
  text(rs(total), M + W, y, { bold: true, size: 12, align: 'right' });
  y += 9;
  if (e.notes) {
    const note = doc.splitTextToSize(`Note : ${e.notes}`, W) as string[];
    note.forEach((l, i) => text(l, M, y + i * 4.2, { size: 9 }));
    y += note.length * 4.2 + 3;
  }

  // Page 2: the terms and the signature lines.
  doc.addPage();
  y = 16;
  text('Remarks / Notes / Terms & Conditions:', M, y, { bold: true, size: 8.5 });
  y += 5;
  for (const t of repairOrderTerms(brand.name)) {
    const wrapped = doc.splitTextToSize(t.text, W - (t.sub ? 8 : 0)) as string[];
    wrapped.forEach((l, i) => text(l, M + (t.sub ? 6 : 0), y + i * 3.9, { size: 8.3 }));
    y += wrapped.length * 3.9 + 1.4;
  }
  y += 14;
  const sign = (label: string, x: number, w: number) => {
    doc.setDrawColor(40, 40, 40);
    doc.line(x, y, x + w, y);
    text(label, x, y + 4.5, { size: 9 });
  };
  sign('Serv. Adv Signature', M, 40);
  sign('Customer Signature', M + 70, 40);

  return { doc, fileName: `Repair estimate ${e.estimateNo}.pdf` };
}
