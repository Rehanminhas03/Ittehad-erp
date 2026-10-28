import type { jsPDF } from 'jspdf';
import { loadImage } from './pdf';

/**
 * The workshop documents (the repair order / job card and the sales invoice) in the dealership's own layout, from
 * Hyundai Islamabad's: "Ittehad Automotive (An Ittehad Steel Company)" with the address on the left and the brand logo on
 * the right. Jetour Ittehad has it now; the terms below are Hyundai's with the dealership's name, to be changed later.
 */
export interface WorkshopBrand {
  /** The dealership as the terms name it, e.g. "Jetour Ittehad". */
  name: string;
  logo: string;
  addressLines: string[];
  appointmentLine: string;
}

const BRANDS: [prefix: string, brand: WorkshopBrand][] = [
  [
    'JET',
    {
      name: 'Jetour Ittehad',
      logo: '/logo/jetour-ittehad-logo.png',
      addressLines: ['Plot # 415, off 9th Avenue, Sector I-9/3 Islamabad', 'UAN: +92 (51) 111 500 100', 'Email: info@ittehadmotors.com', 'www.ittehadmotors.com'],
      appointmentLine: '+92 (51) 111 500 100',
    },
  ],
];

/** The dealership's workshop format, or null (those dealerships keep the plain layout for now). */
export const workshopBrand = (dealershipCode: string | undefined | null) => BRANDS.find(([prefix]) => (dealershipCode ?? '').startsWith(prefix))?.[1] ?? null;

/** Remarks / Notes / Terms & Conditions of the repair order (Hyundai's, with the dealership's name). */
export const repairOrderTerms = (name: string): { text: string; sub?: boolean }[] => [
  { text: '1. All estimate(s) is valid for ONE Week only.' },
  { text: '2. In case of non-agreement, dismantled parts will be handed over, as they cannot be reassembled.' },
  { text: '3. Non agreement shall be notified within 2 working days of the Estimate.' },
  { text: '4. In case the owner resorts to not getting the work done as per Estimate, and/or move the vehicle, 5.0 % of the total estimate amount will have to be paid by the customer before taking delivery of the vehicle.' },
  { text: `5. Outside Parts, not from ${name}, are not allowed.` },
  { text: `6. Customer confirms that any personal belongings have been taken out before handing over vehicle to ${name}. ${name} will not be responsible for any personal items left in the vehicle before handing over vehicle to us.` },
  { text: `7. Customer confirms the vehicle is insured for the length of the stay and or work being carried out at ${name}.` },
  { text: `8. At all times while vehicle is at ${name}, vehicle will remain at the owner’s risk, including but not limited to while being parked, driven with in the premises, road tests, during works, and/or storage. Insurance of vehicles is the responsibility of the customer for the entire length of the time the vehicle is at ${name}. ${name} will not be responsible for any damage caused to the vehicle during the time at ${name}, including but not limited to Acts of God, occurrences/accidents beyond our control and others.` },
  { text: `9. ${name} will charge Storage charges @ Rs. 750/day, to be paid before taking delivery, for any vehicle left at, or not collected from ${name} past 2 days of:` },
  { text: 'a. Estimate Issued, and no Work Order or action taken, and/or', sub: true },
  { text: 'b. Work completed, and/or', sub: true },
  { text: `c. For vehicle(s) received by ${name}, and no further instruction is passed regarding works related to it`, sub: true },
  { text: '10. In case there is change in prices of parts or labor after Estimate has been provided, customer will have to pay the difference. Any such change(s) will be notified to customer. Prices at the time of handing over of vehicle shall be deemed final.' },
  { text: `11. Customer/Insurance Company/Surveyor is responsible to collect all salvage parts within one week of delivery of vehicle, after which ${name} will not be responsible for the said parts.` },
  { text: '12. Customer confirms the vehicle has not been involved in any illegal activity that has resulted in it being brought to us.' },
  { text: '13. No claim of unsatisfactory work will be entertained after 3 calendar days of taking delivery of vehicle.' },
];

export const PERIODIC_NOTE = 'Periodic Maintenance as per Manual / Warranty Book is mandatory for initiating any warranty claim.';

export const M = 12;
export const W = 186;
export type Rgb = [number, number, number];
const INK: Rgb = [17, 17, 17];

export const money = (n: number) => n.toLocaleString('en-PK', { maximumFractionDigits: 2 });
export const rs = (n: number) => `Rs.${money(n)}`;
export const shortDate = (v: string | Date) => new Date(v).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

export function writer(doc: jsPDF) {
  return (s: string, x: number, y: number, o: { bold?: boolean; size?: number; color?: Rgb; align?: 'left' | 'right' | 'center'; max?: number } = {}) => {
    doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
    doc.setFontSize(o.size ?? 9);
    doc.setTextColor(...(o.color ?? INK));
    doc.text(s, x, y, { align: o.align ?? 'left', maxWidth: o.max });
  };
}
export type Writer = ReturnType<typeof writer>;

/** "Ittehad Automotive (An Ittehad Steel Company)", the address block and the brand logo on the right. Returns the next y. */
export async function drawWorkshopLetterhead(doc: jsPDF, brand: WorkshopBrand, width = W): Promise<number> {
  const text = writer(doc);
  const logo = await loadImage(brand.logo);
  text('Ittehad Automotive', M, 20, { bold: true, size: 21 });
  text('(An Ittehad Steel Company)', M, 28, { bold: true, size: 13 });
  let y = 36;
  for (const l of brand.addressLines) {
    text(l, M, y, { size: 8.5 });
    y += 4;
  }
  y += 3;
  text('For service appointments, please call', M, y, { bold: true, size: 8.5 });
  text(brand.appointmentLine, M, y + 4, { bold: true, size: 8.5 });
  if (logo) {
    const w = 70;
    const h = Math.min((logo.h / logo.w) * w, 22);
    const iw = (logo.w / logo.h) * h;
    doc.addImage(logo.data, 'JPEG', M + width - iw, 12, iw, h);
  }
  return y + 12;
}

export interface Col {
  h: string;
  w: number;
  a: 'left' | 'right' | 'center';
}

/** A bordered table with a grey header row; returns the y under it. `rows` are plain cells (the first column wraps). */
export function drawTable(doc: jsPDF, y: number, cols: Col[], rows: string[][], opts: { pageTop?: number; bottom?: number } = {}): number {
  const text = writer(doc);
  const bottom = opts.bottom ?? 280;
  const top = opts.pageTop ?? 16;
  doc.setDrawColor(150, 150, 150);
  doc.setLineWidth(0.2);
  const header = () => {
    doc.setFillColor(238, 238, 238);
    doc.rect(M, y, W, 6, 'FD');
    let x = M;
    for (const c of cols) {
      text(c.h, c.a === 'right' ? x + c.w - 1.5 : c.a === 'center' ? x + c.w / 2 : x + 1.5, y + 4.2, { bold: true, size: 8.5, align: c.a });
      x += c.w;
    }
    y += 6;
  };
  header();
  for (const r of rows) {
    const first = doc.splitTextToSize(r[0] ?? '', cols[0]!.w - 3) as string[];
    const h = Math.max(5.2, first.length * 3.9 + 1.6);
    if (y + h > bottom) {
      doc.addPage();
      y = top;
      header();
    }
    let x = M;
    cols.forEach((c, i) => {
      doc.rect(x, y, c.w, h);
      if (i === 0) first.forEach((l, n) => text(l, x + 1.5, y + 3.8 + n * 3.9, { size: 8.5 }));
      else text(r[i] ?? '', c.a === 'right' ? x + c.w - 1.5 : c.a === 'center' ? x + c.w / 2 : x + 1.5, y + 3.8, { size: 8.5, align: c.a });
      x += c.w;
    });
    y += h;
  }
  if (!rows.length) {
    doc.rect(M, y, W, 5.2);
    text('None', M + 1.5, y + 3.8, { size: 8.5, color: [120, 120, 120] });
    y += 5.2;
  }
  return y;
}
