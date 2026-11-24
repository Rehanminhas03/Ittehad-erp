import type { AcceptanceNote } from '../salesApi';
import { type BuiltPdf, loadImage } from './pdf';

/**
 * The Vehicle Delivery Acceptance Note (Jetour): the sheet the customer's receiver signs when the car is handed over.
 * Everything starts from the order, the car and the customer; the receiver's name, CNIC and contact and the user's name
 * are typed when it is printed (or left to write by hand), and any value can be corrected.
 */
export type AcceptanceForm = {
  date: string;
  time: string;
  invoiceNo: string;
  orderNo: string;
  make: string;
  model: string;
  variant: string;
  year: string;
  chassis: string;
  engine: string;
  color: string;
  regNo: string;
  owner: string;
  receiverName: string;
  receiverContact: string;
  receiverCnic: string;
  userName: string;
  /** The customer's contact (from the order). */
  contact: string;
  address: string;
  /** The Delivery Note's back page: Authority Letter & CNIC (yes / no / na) and Invoice Attached (yes / undertaking); empty: ticked by hand. */
  authority: string;
  invoiceAttached: string;
};

/** 24-NOV-2026, Pakistan date. */
export const noteDate = (d = new Date()) => d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' }).replace(/ /g, '-').toUpperCase();

/** An empty note for typing everything by hand (no order or lead): today's date, Jetour and this year. */
export function blankAcceptanceForm(): AcceptanceForm {
  return {
    date: noteDate(),
    time: '',
    invoiceNo: '',
    orderNo: '',
    make: 'JETOUR',
    model: '',
    variant: '',
    year: String(new Date().getFullYear()),
    chassis: '',
    engine: '',
    color: '',
    regNo: '',
    owner: '',
    receiverName: '',
    receiverContact: '',
    receiverCnic: '',
    userName: '',
    contact: '',
    address: '',
    authority: '',
    invoiceAttached: '',
  };
}

/** The form's starting values, from what the order knows. The receiver and the user are left empty. */
export function acceptanceFormFrom(n: AcceptanceNote): AcceptanceForm {
  return {
    date: noteDate(),
    time: '',
    invoiceNo: n.invoiceNo ?? '',
    orderNo: n.pboNo ?? n.orderNo ?? '',
    make: (n.vehicle.make ?? '').toUpperCase(),
    model: n.vehicle.model?.replace(new RegExp(`^${n.vehicle.make ?? ''}\\s+`, 'i'), '') ?? '',
    variant: n.vehicle.variant ?? '',
    year: n.vehicle.year ? String(n.vehicle.year) : String(new Date().getFullYear()),
    chassis: n.vehicle.chassisNo ?? '',
    engine: n.vehicle.engineNo ?? '',
    color: n.vehicle.color ?? '',
    regNo: n.vehicle.registrationNo ?? '',
    owner: n.owner ?? '',
    receiverName: '',
    receiverContact: '',
    receiverCnic: '',
    userName: '',
    contact: n.ownerContact ?? '',
    address: n.address ?? '',
    authority: '',
    // The vehicle invoice is attached once it is recorded on the order.
    invoiceAttached: n.invoiceNo ? 'yes' : '',
  };
}

/** Drawing into an existing document (to print several documents as one): the pages follow the ones already there. */
export type BuildOpts = { into?: import('jspdf').jsPDF; newPage?: boolean };

const LOGO = '/logo/jetour-logo.png';
/** The wordmark sits in the middle of a square, mostly empty picture: only the letters are used. */
const LOGO_CROP = { x: 0.05, y: 0.435, w: 0.8875, h: 0.115 };
const GREY: [number, number, number] = [217, 217, 217];

const CHECKS = [
  'Interior and Exterior lights (Head lamp, fog lamp, room lights, reverse light etc.)',
  'All doors Operations (from outside / inside & from driver)',
  'Sunroof Operation',
  'Seat Operation (Auto or Manual / Front & Rear)',
  'AC Functioning',
  'USB slots',
  'Android / Apple Car Play',
  'Spare Tyre position & speed limit',
  'Seat Belts & Air Bag awareness (Safety Features)',
  'PHEV / Charging System Demonstration',
];

export async function buildAcceptanceNotePdf(f: AcceptanceForm, fileLabel: string, opts?: BuildOpts): Promise<BuiltPdf> {
  const { jsPDF } = await import('jspdf');
  const doc = opts?.into ?? new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  if (opts?.into && opts.newPage) doc.addPage();
  const W = 210;
  const L = 12;
  const R = W - 12;
  const font = (size: number, style: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal') => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
  };
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);

  // ---- Logos ----
  const logo = await loadImage(LOGO, LOGO_CROP);
  if (logo) {
    const lw = 44;
    const lh = (logo.h * lw) / logo.w;
    doc.addImage(logo.data, 'JPEG', L + 1, 11, lw, lh);
    // The tagline under it, centred on the wordmark, between two short rules.
    font(6.2, 'bold');
    const tag = 'Drive Your Future';
    const cx = L + 1 + lw / 2;
    const ty = 11 + lh + 3.6;
    doc.text(tag, cx, ty, { align: 'center' });
    const tw = doc.getTextWidth(tag);
    doc.setLineWidth(0.3);
    doc.line(cx - tw / 2 - 8, ty - 0.9, cx - tw / 2 - 1.5, ty - 0.9);
    doc.line(cx + tw / 2 + 1.5, ty - 0.9, cx + tw / 2 + 8, ty - 0.9);
  }
  // ITTEHAD, bold, on the right.
  font(24, 'bold');
  doc.text('ITTEHAD', R, 21, { align: 'right' });

  // ---- The details table ----
  let y = 32;
  const x1 = L + 38;
  const x2 = x1 + 62;
  const x3 = x2 + 40;
  const RH = 6.3;
  const bar = (text: string, h = 6.8, heavy = false) => {
    doc.setFillColor(...GREY);
    doc.setLineWidth(heavy ? 0.6 : 0.3);
    doc.rect(L, y, R - L, h, 'FD');
    doc.setLineWidth(0.3);
    font(heavy ? 9.5 : 10.5, 'bold');
    doc.text(text, W / 2, y + h / 2 + 1.4, { align: 'center' });
    y += h;
  };
  /** A value written centred in a cell, set smaller to fit and in capitals. */
  const value = (text: string, x: number, w: number, top: number, h: number) => {
    const v = text.trim().toUpperCase();
    if (!v) return;
    let size = 9;
    font(size);
    while (size > 5.5 && doc.getTextWidth(v) > w - 3) font((size -= 0.4));
    doc.text(v, x + w / 2, top + h / 2 + 1.2, { align: 'center' });
  };
  const label = (text: string, x: number, w: number, top: number, h: number) => {
    font(9.2, 'bold');
    doc.text(text, x + w / 2, top + h / 2 + 1.2, { align: 'center' });
  };
  bar('Vehicle Delivery Acceptance Note', 7.4);
  const rows: [string, string, string, string][] = [
    ['Date:', f.date, 'Time:', f.time],
    ['Invoice No:', f.invoiceNo, 'Order No:', f.orderNo],
    ['Make:', f.make, 'Model:', f.model],
    ['Variant:', f.variant, 'Year:', f.year],
    ['Chassis:', f.chassis, 'Engine No:', f.engine],
    ['Color:', f.color, 'Reg no:', f.regNo],
    ['Owner:', f.owner, "Receiver's Name:", f.receiverName],
    ['Receiver Contact:', f.receiverContact, 'Receiver CNIC:', f.receiverCnic],
    // The user of the car is the receiver unless another name is typed.
    ['User Name:', f.userName.trim() || f.receiverName, 'Contact:', f.contact],
  ];
  for (const [l1, v1, l2, v2] of rows) {
    doc.rect(L, y, R - L, RH);
    doc.line(x1, y, x1, y + RH);
    doc.line(x2, y, x2, y + RH);
    doc.line(x3, y, x3, y + RH);
    label(l1, L, 38, y, RH);
    value(v1, x1, x2 - x1, y, RH);
    label(l2, x2, 40, y, RH);
    value(v2, x3, R - x3, y, RH);
    y += RH;
  }
  // Address: two lines.
  doc.rect(L, y, R - L, RH * 2);
  doc.line(x1, y, x1, y + RH * 2);
  doc.line(x1, y + RH, R, y + RH);
  label('Address:', L, 38, y, RH);
  const addr = f.address.trim().toUpperCase();
  if (addr) {
    font(8.6);
    const lines = doc.splitTextToSize(addr, R - x1 - 4) as string[];
    lines.slice(0, 2).forEach((l, i) => doc.text(l, x1 + (R - x1) / 2, y + RH * i + RH / 2 + 1.2, { align: 'center' }));
  }
  y += RH * 2;

  // ---- How-to-use checklist ----
  bar('Explanation of Vehicles Control / Features (How to use / operate)', 6.8);
  y += 3.5;
  font(9.2, 'bold');
  CHECKS.forEach((text, i) => {
    doc.text(i === 9 ? '10)' : `${i + 1})`, L + 1, y + 4.4);
    doc.text(text, i === 9 ? L + 13 : L + 6.5, y + 4.4);
    doc.rect(R - 15, y, 6.4, 6.4);
    y += 8.6;
  });

  // ---- Items handed over ----
  y += 7;
  bar('Delivered above said vehicle to the Authorized Receiver along with the following items', 7, true);
  y += 3.5;
  font(9.2);
  const boxAt = (x: number, top: number, text: string) => {
    doc.rect(x, top, 5.6, 5.6);
    doc.text(text, x + 10, top + 4);
  };
  boxAt(L + 32, y, 'Spare Wheel');
  boxAt(L + 84, y, 'Tool Kit with Jack');
  boxAt(L + 128, y, 'Warranty Book');
  y += 8;
  boxAt(L + 32, y, 'Owner Manual');
  boxAt(L + 84, y, 'Floor Mats');
  doc.rect(L + 128, y, 5.6, 5.6);
  doc.text('Keys (QTY)', L + 138, y + 4);
  doc.line(L + 158, y + 4.6, L + 172, y + 4.6);
  y += 14;

  // ---- Remarks ----
  doc.setLineWidth(0.3);
  doc.rect(L, y, R - L, 13);
  doc.line(L + 50, y, L + 50, y + 13);
  doc.line(L + 50, y + 6.5, R, y + 6.5);
  font(8.8, 'bold');
  doc.text('Additional Remarks (If Any):', L + 1.5, y + 4.4);
  y += 13;

  // ---- Acknowledgement and signatures ----
  y += 7;
  font(8.8, 'bolditalic');
  doc.text('I hereby, acknowledge that I have taken the delivery of the said Vehicle with all relevant information documents &', W / 2, y, { align: 'center' });
  doc.text('accessories.', W / 2, y + 4.6, { align: 'center' });
  y += 20;
  doc.line(L, y, L + 58, y);
  doc.line(R - 62, y, R, y);
  font(9.2, 'bolditalic');
  doc.text('Sales Consultant', L + 10, y + 5.6);
  doc.text('Receiver Signature', R - 48, y + 5.6);

  // ---- Footer ----
  const fy = Math.max(y + 16, 276);
  doc.setLineWidth(0.5);
  doc.line(L, fy, R, fy);
  font(8.6);
  doc.text('Plot # 415, 9th Avenue, Sector I-9/3, Islamabad, Pakistan', L + 1, fy + 8);
  doc.text('UAN +92 (51) 111 500 100', R, fy + 8, { align: 'right' });

  return { doc, fileName: `Vehicle Delivery Acceptance Note - ${fileLabel}.pdf`.replace(/[\\/:*?"<>|]/g, '') };
}

/**
 * The Delivery Note, front and back (printed on both sides of one sheet). Front: the receiver certifies the inspection and the
 * delivery of the car (name, CNIC, PBO, car details, the customer's phone as Misc). Back: Authority Letter & CNIC and Invoice
 * Attached, and the Sales, Finance and Service managers' sign-off lines.
 */
export async function buildDeliveryNoteSheetPdf(f: AcceptanceForm, fileLabel: string, opts?: BuildOpts): Promise<BuiltPdf> {
  const { jsPDF } = await import('jspdf');
  const doc = opts?.into ?? new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  if (opts?.into && opts.newPage) doc.addPage();
  const W = 210;
  const L = 18;
  const R = W - 18;
  const font = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal') => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
  };
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  /** Text at x; returns where it ends (plus a gap). */
  const say = (text: string, x: number, y: number, style: 'normal' | 'bold' = 'normal', size = 10.5) => {
    font(size, style);
    doc.text(text, x, y);
    return x + doc.getTextWidth(text) + 2;
  };
  /** A fill-in line from x to x + w with the value (if any) written on it in bold, set smaller to fit. */
  const blank = (x: number, y: number, w: number, value?: string | null) => {
    doc.line(x, y + 1.2, x + w, y + 1.2);
    const v = (value ?? '').trim();
    if (!v) return;
    let size = 10;
    font(size, 'bold');
    while (size > 6.5 && doc.getTextWidth(v) > w - 3) font((size -= 0.5), 'bold');
    doc.text(v, x + 1.5, y);
  };

  // ---- Front ----
  font(16, 'bold');
  doc.text('Delivery Note', W / 2, 40, { align: 'center' });
  const tw = doc.getTextWidth('Delivery Note');
  doc.setLineWidth(0.5);
  doc.line(W / 2 - tw / 2, 41.6, W / 2 + tw / 2, 41.6);
  doc.setLineWidth(0.25);

  const receiver = f.receiverName.trim();
  // He takes it on behalf of the owner when someone else is receiving.
  const onBehalf = receiver && f.owner.trim() && receiver.toLowerCase() !== f.owner.trim().toLowerCase() ? f.owner.trim() : '';
  let y = 56;
  let x = say('This is to certify that', L, y);
  blank(x, y, 74, receiver);
  x = say('CNIC #', x + 76, y);
  blank(x, y, R - x, f.receiverCnic);
  y += 9;
  x = say('have thoroughly inspected and taken delivery of the vehicle against PBO #', L, y);
  blank(x, y, R - x, f.orderNo);
  y += 9;
  x = say('on behalf of', L, y);
  blank(x, y, 62, onBehalf);
  say('of the following vehicle:', x + 66, y);

  y += 14;
  const col2 = W / 2 + 4;
  const pair = (l1: string, v1: string, l2: string, v2: string) => {
    let a = say(l1, L, y);
    blank(a, y, col2 - a - 6, v1);
    a = say(l2, col2, y);
    blank(a, y, R - a, v2);
    y += 10;
  };
  pair('Model:', f.model, 'Variant:', f.variant);
  pair('Engine #:', f.engine, 'Chassis #:', f.chassis);
  pair('Color:', f.color, 'Misc:', (f.receiverContact || f.contact).trim());

  y += 4;
  const bullets = [
    'I hereby confirm that I have found the above vehicle and the accessories etc in proper order in all aspects.',
    'Customer has inspected that the car charging system and the battery is functioning properly. A demonstration of the car being placed on charge, and the battery charging properly was also given to customer. Charger should only be installed on a connection that has an earth installed and also a circuit breaker/surge protector installed. Customer understands that Improper installation or using the charger at improper power outlet may result in defects that are not covered under warranty.',
    'Dealership will not be responsible for any claims once the vehicle leaves Jetour Ittehad Motors Premises',
  ];
  font(10.5);
  for (const b of bullets) {
    doc.circle(L + 6, y - 1.2, 0.6, 'F');
    for (const part of doc.splitTextToSize(b, R - L - 14) as string[]) {
      doc.text(part, L + 12, y);
      y += 5;
    }
    y += 1;
  }
  y += 10;
  // The date is today's; the time only when typed (otherwise written by hand on the line).
  x = say('Date & Time:', L, y, 'bold');
  const when = [f.date, f.time].map((v) => v.trim()).filter(Boolean).join('   ');
  font(10.5, 'bold');
  doc.text(when, x + 1.5, y);
  doc.line(x, y + 1.2, x + doc.getTextWidth(when) + 3, y + 1.2);
  // The receiver signs under it.
  y += 22;
  x = say('Signature:', L, y, 'bold');
  doc.line(x, y + 1.2, x + 70, y + 1.2);

  // ---- Back ----
  doc.addPage();
  y = 40;
  const tick = (cx: number, top: number) => {
    doc.setLineWidth(0.7);
    doc.line(cx - 2.6, top + 1.6, cx - 0.9, top + 3.4);
    doc.line(cx - 0.9, top + 3.4, cx + 2.8, top - 1.6);
    doc.setLineWidth(0.25);
  };
  const choice = (label: string, opts: [value: string, text: string, x: number][], chosen: string) => {
    font(11);
    doc.text(label, L, y);
    opts.forEach(([value, text, ox], i) => {
      font(11);
      doc.text(text, ox, y);
      if (i < opts.length - 1) doc.text('/', ox + doc.getTextWidth(text) + 11, y);
      if (value === chosen) tick(ox + doc.getTextWidth(text) / 2, y - 7);
    });
    y += 11;
  };
  choice('Authority Letter & CNIC:', [['yes', 'YES', 88], ['no', 'NO', 126], ['na', 'NA', 156]], f.authority);
  choice('Invoice Attached:', [['yes', 'YES', 88], ['undertaking', 'Undertaking', 126]], f.invoiceAttached);
  y += 6;
  for (const who of ['Sales Manager:', 'Finance Manager:', 'Service Manager:']) {
    font(11);
    doc.text(who, L, y);
    doc.line(L + 36, y + 1.2, L + 62, y + 1.2);
    doc.text('Date:', L + 68, y);
    doc.line(L + 80, y + 1.2, L + 117, y + 1.2);
    doc.text('Time:', L + 122, y);
    doc.line(L + 135, y + 1.2, R, y + 1.2);
    y += 9;
  }
  return { doc, fileName: `Delivery Note - ${fileLabel}.pdf`.replace(/[\\/:*?"<>|]/g, '') };
}

/**
 * The two undertakings on one page (print, then cut the page in two): the undertaking about the issuance of the invoice
 * (with the PBO and today's date) and the undertaking to take the car without the sales tax invoice and certificate
 * (with the customer's name and the date and time).
 */
export async function buildUndertakingsPdf(f: AcceptanceForm, fileLabel: string, opts?: BuildOpts): Promise<BuiltPdf> {
  const { jsPDF } = await import('jspdf');
  const doc = opts?.into ?? new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  if (opts?.into && opts.newPage) doc.addPage();
  const W = 210;
  const L = 20;
  const R = W - 20;
  const font = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal') => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
  };
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.25);
  /** Wrapped text with **bold** runs; returns the y after it. */
  const rich = (text: string, x: number, y: number, width: number, size = 10.5, lineH = 5.2): number => {
    const words: { t: string; b: boolean }[] = [];
    text.split('**').forEach((part, i) => {
      for (const w of part.split(/\s+/).filter(Boolean)) words.push({ t: w, b: i % 2 === 1 });
    });
    const lines: { t: string; b: boolean }[][] = [[]];
    let lineW = 0;
    for (const w of words) {
      font(size, w.b ? 'bold' : 'normal');
      const ww = doc.getTextWidth(`${w.t} `);
      if (lineW + ww > width && lines.at(-1)!.length) {
        lines.push([]);
        lineW = 0;
      }
      lines.at(-1)!.push(w);
      lineW += ww;
    }
    for (const line of lines) {
      let cx = x;
      for (const w of line) {
        font(size, w.b ? 'bold' : 'normal');
        doc.text(w.t, cx, y);
        cx += doc.getTextWidth(`${w.t} `);
      }
      y += lineH;
    }
    return y;
  };
  const title = (text: string, y: number) => {
    font(14, 'bold');
    doc.text(text, W / 2, y, { align: 'center' });
    const tw = doc.getTextWidth(text);
    doc.setLineWidth(0.5);
    doc.line(W / 2 - tw / 2, y + 1.6, W / 2 + tw / 2, y + 1.6);
    doc.setLineWidth(0.25);
  };
  /** A fill-in line with its bold value on it. */
  const blank = (x: number, y: number, w: number, value?: string) => {
    doc.line(x, y + 1.2, x + w, y + 1.2);
    const v = (value ?? '').trim();
    if (!v) return;
    let size = 10.5;
    font(size, 'bold');
    while (size > 6.5 && doc.getTextWidth(v) > w - 3) font((size -= 0.5), 'bold');
    doc.text(v, x + 1.5, y);
  };
  const dateTime = [f.date, f.time].map((v) => v.trim()).filter(Boolean).join('   ');

  // ---- 1. Undertaking regarding the issuance of the invoice (upper half) ----
  title('UNDERTAKING', 22);
  font(10.5, 'bold');
  doc.text('Date:', R - 52, 32);
  blank(R - 42, 32, 42, f.date);
  font(10.5, 'bold');
  const sub = 'Undertaking Regarding Issuance of invoice';
  doc.text(sub, W / 2, 43, { align: 'center' });
  doc.line(W / 2 - doc.getTextWidth(sub) / 2, 44.3, W / 2 + doc.getTextWidth(sub) / 2, 44.3);
  let y = 52;
  y = rich('I, the undersigned, hereby solemnly state and undertake as follows:', L, y, R - L);
  y += 1.5;
  const pbo = f.orderNo.trim() || '______________';
  const items = [
    `I request to issue my invoice against my vehicle booking # **${pbo}**.`,
    'Even though I know a new Auto Policy proposal is made, regardless of what the new Policy may be, we request to issue our invoice.',
    'I understand that once the invoice is issued, even if same date as the SRO that may follow, no change will be made.',
  ];
  items.forEach((t, i) => {
    font(10.5);
    doc.text(`${i + 1}.`, L + 4, y);
    y = rich(t, L + 11, y, R - L - 13);
    y += 0.8;
  });
  y += 1.5;
  y = rich('Jetour Ittehad Motors is acting only as a dealership and is merely facilitating this process. It is not legally or financially responsible.', L, y, R - L);
  y += 9;
  font(10.5, 'bold');
  doc.text('Signature:', R - 78, y);
  doc.line(R - 59, y + 1.2, R, y + 1.2);

  // The second undertaking starts in the lower half of the page (no line is printed: cut the page by hand).
  const cut = 150;

  // ---- 2. Undertaking to take the car without the invoice and certificate (lower half) ----
  title('UNDERTAKING', cut + 18);
  y = cut + 30;
  y = rich(
    'Even though we have been advised by Jetour Ittehad Motors to **not take possession and delivery** of the vehicle with out the Sales Tax Invoice and Sales Certificate (which may be required for Registration and/or Insurance), we are willing to take delivery/possession of the vehicle at our own risk and cost. The said documents/invoices usually take 20 to 30 days.',
    L,
    y,
    R - L,
  );
  y += 2.5;
  y = rich('Jetour Ittehad Motors shall not be liable to/for any claims of any kind once the vehicle leaves the premises.', L, y, R - L);
  y += 14;
  doc.line(L, y, L + 70, y);
  font(10.5, 'bold');
  let x = L;
  y += 7;
  doc.text('Name of Customer:', x, y);
  x += doc.getTextWidth('Name of Customer:') + 2;
  font(10.5, 'bold');
  doc.text(f.owner.trim(), x + 1.5, y);
  if (f.owner.trim()) doc.line(x, y + 1.2, x + doc.getTextWidth(f.owner.trim()) + 3, y + 1.2);
  y += 8;
  doc.text('Date & Time:', L, y);
  x = L + doc.getTextWidth('Date & Time:') + 2;
  doc.text(dateTime, x + 1.5, y);
  if (dateTime) doc.line(x, y + 1.2, x + doc.getTextWidth(dateTime) + 3, y + 1.2);

  return { doc, fileName: `Undertakings - ${fileLabel}.pdf`.replace(/[\/:*?"<>|]/g, '') };
}

/** All the delivery documents as one PDF, to print in one go: the Acceptance Note, the Delivery Note (front and back) and the undertakings. */
export async function buildAllDocumentsPdf(f: AcceptanceForm, fileLabel: string): Promise<BuiltPdf> {
  const { jsPDF } = await import('jspdf');
  const into = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  await buildAcceptanceNotePdf(f, fileLabel, { into });
  await buildDeliveryNoteSheetPdf(f, fileLabel, { into, newPage: true });
  await buildUndertakingsPdf(f, fileLabel, { into, newPage: true });
  return { doc: into, fileName: `Delivery documents - ${fileLabel}.pdf`.replace(/[\\/:*?"<>|]/g, '') };
}
