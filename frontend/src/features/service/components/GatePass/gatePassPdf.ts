import { drawWorkshopLetterhead, M, shortDate, type WorkshopBrand, writer } from '@/features/sales/documents/workshopPdf';

export interface GatePassData {
  gatePassNo: string;
  customerName: string;
  vehicle: string;
  regNo: string;
  roNo: string;
  /** "PAID" once the invoice is paid; "SERVICE COMPLETED" when nothing was charged. */
  status: string;
  brand: WorkshopBrand;
}

/** The vehicle gate pass the customer hands to the guard at the gate: who, which car, the RO, the date and time, and the stamp. */
export async function buildGatePassPdf(d: GatePassData): Promise<{ doc: import('jspdf').jsPDF; fileName: string }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
  const W = 297 - 2 * M;
  const text = writer(doc);
  const y0 = await drawWorkshopLetterhead(doc, d.brand, W);
  let y = Math.max(y0, 62);

  text('VEHICLE GATE PASS', M + W, y, { bold: true, size: 20, align: 'right' });
  text(`GATE PASS NO: ${d.gatePassNo}`, M + W, y + 8, { size: 11, align: 'right', color: [60, 60, 60] });
  y += 22;
  text(d.status, M + W / 2, y, { bold: true, size: 16, align: 'center', color: d.status === 'PAID' ? [22, 120, 60] : [60, 60, 60] });
  y += 14;

  const now = new Date();
  const time = now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const cell = (label: string, value: string, x: number, yy: number, max: number) => {
    text(`${label} :`, x, yy, { bold: true, size: 10 });
    text(value || '—', x + 36, yy, { size: 10, max });
  };
  cell('Customer Name', d.customerName, M, y, 80);
  cell('Date', shortDate(now), M + 150, y, 60);
  y += 9;
  cell('Vehicle', d.vehicle, M, y, 80);
  cell('Reg No', d.regNo, M + 150, y, 60);
  y += 9;
  cell('Time', `${shortDate(now)} ${time}`, M, y, 80);
  cell('RO No', d.roNo, M + 150, y, 60);

  y = 178;
  doc.setDrawColor(40, 40, 40);
  doc.line(M + 5, y, M + 75, y);
  doc.line(M + W - 75, y, M + W - 5, y);
  text('CASHIER / ACCOUNTS', M + 5, y + 5, { size: 10 });
  text('DEALER STAMP', M + W - 75, y + 5, { size: 10 });

  return { doc, fileName: `Gate pass ${d.gatePassNo}.pdf` };
}
