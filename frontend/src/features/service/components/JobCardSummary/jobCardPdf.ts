import type { Customer, Vehicle } from '@/features/crm/crmApi';
import { carName, drawTable, drawWorkshopLetterhead, fieldGrid, M, money as fmt, PERIODIC_NOTE, repairOrderTerms, rs, shortDate, W, type WorkshopBrand, writer } from '@/features/sales/documents/workshopPdf';
import type { JobCard, JobCardLine, Visit } from '../../serviceApi';

const money = (n: number) => `Rs ${n.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
const date = (v: string | null | undefined) => (v ? new Date(v).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

/** The printable job card: the customer and the car, the complaints, every line (charged or free) and the totals, with signature lines. */
export async function buildJobCardPdf(
  jc: JobCard,
  visit: Visit,
  lines: JobCardLine[],
  t: { parts: number; labour: number; free: number; payable: number; discount: number },
): Promise<{ doc: import('jspdf').jsPDF; fileName: string }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const M = 14;
  const W = 210 - 2 * M;
  let y = 16;
  const text = (s: string, x: number, yy: number, o: { bold?: boolean; size?: number; color?: [number, number, number]; align?: 'left' | 'right'; max?: number } = {}) => {
    doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
    doc.setFontSize(o.size ?? 9);
    doc.setTextColor(...(o.color ?? [17, 24, 39]));
    doc.text(s, x, yy, { align: o.align ?? 'left', maxWidth: o.max });
  };

  text('JOB CARD', M, y, { bold: true, size: 18, color: [30, 58, 138] });
  text(jc.jobCardNo, 210 - M, y, { bold: true, size: 14, align: 'right' });
  y += 6;
  text(`Visit ${visit.visitNo} · ${visit.serviceName ?? visit.visitType.replace(/_/g, ' ')} · opened ${date(jc.createdAt)}`, M, y, { color: [100, 116, 139] });
  y += 3;
  doc.setDrawColor(203, 213, 225);
  doc.line(M, y, 210 - M, y);
  y += 6;

  const field = (label: string, value: string, x: number, yy: number, w: number) => {
    text(label.toUpperCase(), x, yy, { size: 7, color: [100, 116, 139] });
    text(value || '—', x, yy + 4.5, { size: 10, bold: true, max: w });
  };
  const col = W / 3;
  field('Customer', visit.customerName ?? '', M, y, col - 4);
  field('Car', jc.vehicleLabel ?? visit.vehicleLabel ?? '', M + col, y, col - 4);
  field('Odometer in', `${visit.odometerKm.toLocaleString('en-PK')} km`, M + 2 * col, y, col - 4);
  y += 11;
  field('Advisor', jc.advisorName ?? '', M, y, col - 4);
  field('Technician', jc.technicianName ?? 'Not assigned', M + col, y, col - 4);
  field('Warranty', visit.warrantyValid ? 'Valid' : 'Not covered', M + 2 * col, y, col - 4);
  y += 11;
  text('CUSTOMER COMPLAINTS / REQUESTS', M, y, { size: 7, color: [100, 116, 139] });
  const complaints = doc.splitTextToSize(visit.complaints || '—', W) as string[];
  complaints.forEach((l, i) => text(l, M, y + 4.5 + i * 4.2, { size: 9 }));
  y += 6 + complaints.length * 4.2;
  if (visit.freeService) {
    doc.setFillColor(236, 253, 245);
    doc.rect(M, y, W, 7, 'F');
    text('Free scheduled service: labour and services are free. Parts and oil are charged to the customer.', M + 2, y + 4.6, { size: 8.5, color: [6, 95, 70] });
    y += 10;
  }

  // lines
  const cols = [
    { h: '#', w: 8, a: 'left' as const },
    { h: 'Description', w: 72, a: 'left' as const },
    { h: 'Part no.', w: 28, a: 'left' as const },
    { h: 'Qty', w: 12, a: 'right' as const },
    { h: 'Unit price', w: 22, a: 'right' as const },
    { h: 'Disc.', w: 10, a: 'right' as const },
    { h: 'Amount', w: 22, a: 'right' as const },
    { h: 'Charge', w: 8, a: 'left' as const },
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
    if (y + h > 262) {
      doc.addPage();
      y = 16;
      header();
    }
    if (i % 2) {
      doc.setFillColor(241, 245, 249);
      doc.rect(M, y, W, h, 'F');
    }
    let x = M;
    const cells = [String(i + 1), '', l.partNo ?? '', String(Number(l.quantity)), money(Number(l.unitPrice)), Number(l.discountPercent) > 0 ? `${Number(l.discountPercent)}%` : '', money(Number(l.amount)), l.billable ? 'Pay' : 'Free'];
    cells.forEach((c, k) => {
      if (k === 1) desc.forEach((d, n) => text(d, x + 1.5, y + 4 + n * 4, { size: 8.5 }));
      else text(c, cols[k]!.a === 'right' ? x + cols[k]!.w - 1.5 : x + 1.5, y + 4, { size: 8.5, align: cols[k]!.a, color: k === 7 && !l.billable ? [6, 95, 70] : [17, 24, 39] });
      x += cols[k]!.w;
    });
    y += h;
  });
  doc.line(M, y, 210 - M, y);
  y += 6;

  // totals
  const total = (label: string, v: number, bold = false, color: [number, number, number] = [17, 24, 39]) => {
    text(label, 210 - M - 40, y, { size: 9, bold, color, align: 'right' });
    text(money(v), 210 - M, y, { size: 9, bold, color, align: 'right' });
    y += 5.5;
  };
  total('Parts and oil (charged)', t.parts);
  total('Labour (charged)', t.labour);
  total('Free of charge', t.free, false, [6, 95, 70]);
  if (t.discount > 0.005) total('Discount given (already deducted)', t.discount, false, [146, 64, 14]);
  total('Customer pays', t.payable, true, [30, 58, 138]);

  // signatures
  y = Math.max(y + 14, 255);
  if (y > 275) {
    doc.addPage();
    y = 40;
  }
  doc.line(M, y, M + 55, y);
  doc.line(210 - M - 55, y, 210 - M, y);
  text('Service advisor', M, y + 4, { size: 8, color: [100, 116, 139] });
  text('Customer signature', 210 - M - 55, y + 4, { size: 8, color: [100, 116, 139] });

  return { doc, fileName: `Job card ${jc.jobCardNo}.pdf` };
}

// ---- The repair order (job card) in the dealership's own layout ---------------------------------------------------

const WORK_TYPE: Record<string, string> = { scheduled: 'PM', periodic_maintenance: 'PM', general_repair: 'GR' };

/**
 * "REPAIR ESTIMATE / CONTRACT": the RO number, the customer and the car, the parts and lubricants, the services, the
 * totals, the customer's voice and, on the second page, the terms and the signature lines.
 */
export async function buildRepairOrderPdf(d: { jobCard: JobCard; visit: Visit; lines: JobCardLine[]; vehicle?: Vehicle; customer?: Customer; brand: WorkshopBrand }): Promise<{ doc: import('jspdf').jsPDF; fileName: string }> {
  const { jobCard: jc, visit, lines, vehicle, customer, brand } = d;
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const text = writer(doc);
  let y = await drawWorkshopLetterhead(doc, brand);

  text('REPAIR ESTIMATE / CONTRACT', 105, y + 4, { bold: true, size: 18, align: 'center' });
  text(`RO NO -${jc.jobCardNo}`, 105, y + 12, { bold: true, size: 13, color: [120, 120, 120], align: 'center' });
  y += 20;

  const model = carName(vehicle?.modelName, vehicle?.variant) || (jc.vehicleLabel ?? visit.vehicleLabel ?? '');
  const work = WORK_TYPE[visit.visitType] ?? visitTypeText(visit.visitType);
  y = fieldGrid(doc, y, [
    [['RO Type :', 'MECHANICAL'], ['Payment :', '—'], ['Date :', shortDate(jc.createdAt)]],
    [['Customer Name :', visit.customerName ?? ''], ['Mobile :', customer?.mobile ?? vehicle?.currentOwner?.mobile ?? ''], ['Work Type :', work]],
    [['Make Model :', model], ['VIN :', vehicle?.vin ?? ''], ['ODOM-IN :', String(visit.odometerKm)]],
    [['Engine No :', vehicle?.engineNo ?? ''], ['Reg. No :', vehicle?.registrationNo ?? ''], ['ODOM-OUT :', '—']],
    [['Color :', vehicle?.color ?? ''], null, null],
  ]);
  y += 5;

  const amountOf = (l: JobCardLine) => (l.billable ? Number(l.amount) : 0);
  const cols = [
    { h: 'Description', w: 110, a: 'left' as const },
    { h: 'Qty', w: 16, a: 'center' as const },
    { h: 'Unit Rate', w: 30, a: 'right' as const },
    { h: 'Subtotal', w: 30, a: 'right' as const },
  ];
  const rowOf = (l: JobCardLine) => [l.description, String(Number(l.quantity)), fmt(Number(l.unitPrice)), l.billable ? fmt(Number(l.amount)) : 'Free'];
  const group = (title: string, kinds: string[], label: string) => {
    text(title, M, y, { bold: true, size: 13 });
    const rows = lines.filter((l) => kinds.includes(l.kind));
    y = drawTable(doc, y + 3, cols, rows.map(rowOf)) + 7;
    const sub = rows.reduce((n, l) => n + amountOf(l), 0);
    text(label, M + 1, y, { bold: true, size: 11 });
    text(rs(sub), M + W, y, { bold: true, size: 11, align: 'right' });
    y += 10;
    return sub;
  };
  const parts = group('Parts & Lubricants', ['part', 'lubricant'], 'Sub-total parts:');
  const services = group('Services', ['labour', 'sublet'], 'Sub-total services:');
  text('Grand-Total:', M + 1, y, { bold: true, size: 12 });
  text(rs(parts + services), M + W, y, { bold: true, size: 12, align: 'right' });
  y += 9;
  const voice = doc.splitTextToSize(`Voice of Customer : ${visit.complaints ?? ''}`.toUpperCase().replace('VOICE OF CUSTOMER', 'Voice of Customer'), W) as string[];
  voice.forEach((l, i) => text(l, M, y + i * 4.2, { bold: true, size: 9 }));
  y += voice.length * 4.2 + 3;
  text(`Note : ${PERIODIC_NOTE}`, M, y, { size: 8.5 });

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
  sign('Serv. Adv Signature', M, 34);
  sign('Customer Signature', M + 44, 34);
  sign('Mechanic Name', M + 88, 34);
  sign('Jobs', M + 130, 14);
  sign('Workshop Controller', M + 152, 34);

  return { doc, fileName: `Job card ${jc.jobCardNo}.pdf` };
}

const visitTypeText = (v: string) => v.replace(/_/g, ' ').toUpperCase();
