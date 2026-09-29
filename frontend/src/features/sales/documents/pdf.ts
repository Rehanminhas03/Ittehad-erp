import type { jsPDF } from 'jspdf';
import type { DocumentTemplate, PpfDocument, QuotationDocument } from '../salesApi';
import { PPF_COVERAGES, PPF_FINISHES, PPF_VOUCHER_FIELDS, type PpfVoucherField } from './labels';

/** Dealership brand logos (public/logo), by dealership code prefix. */
const BRAND_LOGOS: [prefix: string, file: string][] = [
  ['HYD', '/logo/Hyundai-logo.png'],
  ['JET', '/logo/jetour-logo.png'],
  ['CSM', '/logo/CSM-Logo.png'],
];
/** The group's logo, top right on every document. */
const GROUP_LOGO = '/logo/Ittehadmotors-logo.png';

/** 12240000 -> "12,240,000"; paisa only when there are any. */
const num = (v: string | number | null | undefined) => Number(v ?? 0).toLocaleString('en-PK', { maximumFractionDigits: 2 });
const pkr = (v: string | number | null | undefined) => `PKR ${num(v)}`;
/** dd-mm-yy, as on the dealership's forms (Pakistan time). */
const shortDate = (d: string | Date) => {
  const date = typeof d === 'string' && d.length === 10 ? new Date(`${d}T00:00:00+05:00`) : new Date(d);
  const [y, m, day] = date.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }).split('-');
  return `${day}-${m}-${y!.slice(2)}`;
};
const labelOf = (list: readonly { value: string; label: string }[], v: string) => list.find((o) => o.value === v)?.label ?? v;

// ---- Amount in words, Pakistani style (lakh / crore) ---------------------------------------
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function below100(n: number) {
  return n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`;
}
function below1000(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : '', r ? below100(r) : ''].filter(Boolean).join(' ');
}
/** 9,350,000 -> "Ninety Three Lakh Fifty Thousand Rupees Only". */
export function amountInWords(amount: string | number): string {
  let rupees = Math.floor(Number(amount));
  const paisa = Math.round((Number(amount) - rupees) * 100);
  if (!rupees && !paisa) return 'Zero Rupees Only';
  const parts: string[] = [];
  for (const [size, name] of [
    [10_000_000, 'Crore'],
    [100_000, 'Lakh'],
    [1_000, 'Thousand'],
  ] as const) {
    const q = Math.floor(rupees / size);
    if (q) parts.push(`${q >= 100 ? amountInWords(q).replace(' Rupees Only', '') : below100(q)} ${name}`);
    rupees %= size;
  }
  if (rupees) parts.push(below1000(rupees));
  return `${parts.join(' ')} Rupees${paisa ? ` and ${below100(paisa)} Paisa` : ''} Only`;
}

// ---- Template text: **bold**, placeholders, "[Hybrid only]" lines ---------------------------------
export interface TemplateContext {
  vehicle: string;
  nonFilerTax: string | null;
  validityDays: number;
  deliveryStation: string;
  dealership: string;
  hybrid: boolean;
}
const HYBRID_ONLY = /^\[hybrid only\]\s*/i;
/**
 * A template line ready to print, or null when it does not apply: "[Hybrid only]" lines for other
 * vehicles, and lines quoting {nonFilerTax} when no non-filer amount is set.
 */
export function fillTemplateLine(line: string, c: TemplateContext): string | null {
  if (HYBRID_ONLY.test(line) && !c.hybrid) return null;
  if (line.includes('{nonFilerTax}') && !c.nonFilerTax) return null;
  return line
    .replace(HYBRID_ONLY, '')
    .replaceAll('{vehicle}', c.vehicle)
    .replaceAll('{nonFilerTax}', c.nonFilerTax ?? '')
    .replaceAll('{validityDays}', String(c.validityDays).padStart(2, '0'))
    .replaceAll('{deliveryStation}', c.deliveryStation)
    .replaceAll('{dealership}', c.dealership);
}

type Img = { data: string; w: number; h: number };
/**
 * A logo ready for the PDF: scaled down to print size and flattened onto white as a JPEG, so
 * documents stay small (tens of KB) for WhatsApp / email. Null if the file is missing.
 */
async function loadImage(src: string): Promise<Img | null> {
  try {
    const blob = await (await fetch(src)).blob();
    if (!blob.type.startsWith('image/')) return null;
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = url;
      });
      const scale = Math.min(1, 360 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext('2d')!;
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      g.drawImage(img, 0, 0, w, h);
      return { data: canvas.toDataURL('image/jpeg', 0.9), w, h };
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

const W = 210;
const M = 14; // page margin
const CW = W - 2 * M;
const ink = [17, 24, 39] as const;
const muted = [100, 116, 139] as const;
const rule = [120, 120, 120] as const;

/** A drawn document: its jsPDF and the file name to save it as. */
export interface BuiltPdf {
  doc: jsPDF;
  fileName: string;
}
const fileNameOf = (kind: string, no: string, customer: string) => `${kind} ${no} - ${customer}.pdf`.replace(/[\\/:*?"<>|]/g, '');

/** A page with a running cursor, a page-break helper and **bold** rich text. */
async function newPage() {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setTextColor(...ink);
  doc.setLineWidth(0.25);
  const page = {
    doc,
    y: 0,
    ensure(h: number) {
      if (page.y + h > 284) {
        doc.addPage();
        page.y = 16;
      }
    },
    font(size: number, style: 'normal' | 'bold' | 'italic' = 'normal') {
      doc.setFont('helvetica', style);
      doc.setFontSize(size);
    },
    /** Wraps text with **bold** runs to `width`; returns the height used. */
    rich(text: string, x: number, width: number, size: number, lineH: number, baseBold = false) {
      const words: { t: string; b: boolean }[] = [];
      text.split('**').forEach((part, i) => {
        const b = baseBold !== (i % 2 === 1);
        for (const w of part.split(/\s+/).filter(Boolean)) words.push({ t: w, b });
      });
      const lines: { t: string; b: boolean }[][] = [[]];
      let lineW = 0;
      for (const w of words) {
        page.font(size, w.b ? 'bold' : 'normal');
        const ww = doc.getTextWidth(`${w.t} `);
        if (lineW + ww > width && lines.at(-1)!.length) {
          lines.push([]);
          lineW = 0;
        }
        lines.at(-1)!.push(w);
        lineW += ww;
      }
      for (const line of lines) {
        page.ensure(lineH);
        let cx = x;
        for (const w of line) {
          page.font(size, w.b ? 'bold' : 'normal');
          doc.text(w.t, cx, page.y);
          cx += doc.getTextWidth(`${w.t} `);
        }
        page.y += lineH;
      }
    },
  };
  return page;
}
type Page = Awaited<ReturnType<typeof newPage>>;

/**
 * The dealership's brand logo top left with the company name under it; the Ittehad logo top right
 * with the tagline and address under it (the dealership's format).
 */
async function letterhead(p: Page, code: string, t: DocumentTemplate) {
  const { doc } = p;
  const file = BRAND_LOGOS.find(([prefix]) => code.startsWith(prefix))?.[1];
  const [logo, group] = await Promise.all([file ? loadImage(file) : null, loadImage(GROUP_LOGO)]);
  if (logo) {
    const s = Math.min(50 / logo.w, 14 / logo.h);
    doc.addImage(logo.data, 'JPEG', M, 8 + (14 - logo.h * s) / 2, logo.w * s, logo.h * s);
  }
  if (group) {
    const s = Math.min(44 / group.w, 14 / group.h);
    doc.addImage(group.data, 'JPEG', W - M - group.w * s, 8 + (14 - group.h * s) / 2, group.w * s, group.h * s);
  }
  p.font(13, 'bold');
  doc.text(t.companyName, M, 30);
  const x = 120;
  let y = group ? 27 : 20;
  if (t.tagline) {
    p.font(12);
    doc.text(t.tagline, x, y);
    y += 5;
  }
  p.font(8);
  for (const l of [t.address, t.phone && `Tel: ${t.phone}`, t.email && `E-mail: ${t.email}`].filter(Boolean) as string[]) {
    for (const part of doc.splitTextToSize(l, W - M - x) as string[]) {
      doc.text(part, x + 2, y);
      y += 3.8;
    }
  }
  p.y = Math.max(38, y + 2);
}

/** Small reference and page numbers at the foot of every page. */
function footer(p: Page, ref: string) {
  const pages = p.doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    p.doc.setPage(i);
    p.font(7);
    p.doc.setTextColor(...muted);
    p.doc.text(`${ref}${pages > 1 ? `   ·   Page ${i} of ${pages}` : ''}`, W / 2, 292, { align: 'center' });
    p.doc.setTextColor(...ink);
  }
}

/**
 * The Ref on the quotation: Hyundai's "HI/<variant code>/<dd-mm-yy>" when the format has a Ref prefix
 * and a variant code was picked; otherwise the quotation number.
 */
export function quotationRef(q: Pick<QuotationDocument, 'template' | 'variantCode' | 'issuedAt' | 'quotationNo'>) {
  const prefix = q.template.refPrefix?.trim();
  return prefix && q.variantCode ? `${prefix}/${q.variantCode}/${shortDate(q.issuedAt)}` : q.quotationNo;
}

/**
 * Hyundai's quotation layout, used by every dealership with its own logo and format. Always one page,
 * like the dealership's own quotation: when a format has more terms than fit, the terms text is set
 * a little smaller until it does.
 */
export async function buildQuotationPdf(q: QuotationDocument): Promise<BuiltPdf> {
  let built: BuiltPdf | null = null;
  for (const k of [1, 0.94, 0.88, 0.82, 0.76, 0.7]) {
    built = await drawQuotation(q, k);
    if (built.doc.getNumberOfPages() === 1) break;
  }
  return built!;
}

/** Draws the quotation; `k` scales the terms text (1 = normal size). */
async function drawQuotation(q: QuotationDocument, k: number): Promise<BuiltPdf> {
  const p = await newPage();
  const { doc } = p;
  const t = q.template;
  await letterhead(p, q.dealership.code, t);

  const modelName = q.vehicle.model.replace(new RegExp(`^${q.dealership.brand}\\s+`, 'i'), '');
  // A variant code's description is already the full vehicle line (e.g. "TUCSON HEV 1598CC 6A/T AWD SIGNATURE").
  const description = q.variantCode && q.vehicle.variant ? q.vehicle.variant : [modelName, q.vehicle.variant].filter(Boolean).join(' ').toUpperCase();
  const issued = new Date(q.issuedAt);
  const validityDays = Math.max(1, Math.round((Date.parse(`${q.validUntil}T00:00:00+05:00`) - Date.parse(`${issued.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' })}T00:00:00+05:00`)) / 86400_000));
  const ctx: TemplateContext = {
    vehicle: description,
    nonFilerTax: q.pricing.withholdingTaxNonFiler ? num(q.pricing.withholdingTaxNonFiler) : null,
    validityDays,
    deliveryStation: t.deliveryStation ?? q.dealership.name,
    dealership: q.dealership.name,
    hybrid: /HYBRID|\bHEV\b/i.test(`${q.vehicle.model} ${q.vehicle.variant ?? ''}`),
  };

  // ---- Title row and table -----------------------------------------------------------------------
  const cols = [16, 86, 18, 31, 31];
  const xs = cols.reduce<number[]>((a, w, i) => [...a, a[i]! + w], [M]);
  p.y = Math.max(p.y, 40);
  doc.rect(M, p.y, CW, 8);
  p.font(14, 'bold');
  doc.text('QUOTATION', W / 2, p.y + 5.9, { align: 'center' });
  p.font(9, 'bold');
  doc.text(`Date: ${shortDate(q.issuedAt)}`, W - M - 3, p.y + 5.7, { align: 'right' });
  p.y += 8;

  const centre = (text: string, col: number, y: number, span = 1) => doc.text(text, (xs[col]! + xs[col + span]!) / 2, y, { align: 'center' });
  const rowBox = (h: number, merge: number[] = []) => {
    doc.rect(M, p.y, CW, h);
    for (let i = 1; i < cols.length; i++) if (!merge.includes(i)) doc.line(xs[i]!, p.y, xs[i]!, p.y + h);
  };

  // To / Ref
  p.font(10, 'bold');
  const toLines = doc.splitTextToSize(q.billTo || q.customer.name, cols[1]! - 4) as string[];
  const toH = Math.max(11, 4 + toLines.length * 4.6);
  rowBox(toH, [4]);
  p.font(8);
  doc.text('To:', xs[0]! + 2, p.y + toH - 3);
  doc.text('Ref:', xs[2]! + 2, p.y + toH - 3);
  p.font(10, 'bold');
  toLines.forEach((l, i) => centre(l, 1, p.y + (toH - toLines.length * 4.6) / 2 + 3.6 + i * 4.6));
  p.font(8.5, 'bold');
  doc.text(quotationRef(q), W - M - 2, p.y + toH - 3, { align: 'right' });
  p.y += toH;

  // Header
  rowBox(7);
  p.font(7.5, 'bold');
  ['SR', 'VEHICLE DESCRIPTION', 'QTY', 'UNIT PRICE (Rs.)', 'TOTAL PRICE (Rs.)'].forEach((h, i) => centre(h, i, p.y + 4.8));
  p.y += 7;

  // Items: the vehicle, then discount / freight / withholding tax when quoted.
  const qty = q.pricing.quantity;
  const items: [string, number][] = [[description, Number(q.pricing.unitPrice)]];
  if (Number(q.pricing.discount) > 0) items.push(['LESS: DISCOUNT', -Number(q.pricing.discount)]);
  if (Number(q.pricing.freightInsurance) > 0) items.push(['FREIGHT AND TRANSIT INSURANCE', Number(q.pricing.freightInsurance)]);
  if (Number(q.pricing.withholdingTax) > 0) items.push(['Withholding Tax (Filer)', Number(q.pricing.withholdingTax)]);
  items.forEach(([label, unit], i) => {
    p.font(8.5);
    const lines = doc.splitTextToSize(label, cols[1]! - 4) as string[];
    const sub = i === 0 && q.vehicle.color ? `Colour: ${q.vehicle.color}` : null;
    const h = Math.max(8.5, 3.5 + (lines.length + (sub ? 1 : 0)) * 4);
    rowBox(h);
    const mid = p.y + h / 2 + 1.2;
    centre(String(i + 1), 0, mid);
    lines.forEach((l, k) => centre(l, 1, mid - ((lines.length + (sub ? 1 : 0) - 1) * 4) / 2 + k * 4));
    if (sub) {
      p.font(7.5);
      doc.setTextColor(...muted);
      centre(sub, 1, mid - ((lines.length) * 4) / 2 + lines.length * 4);
      doc.setTextColor(...ink);
      p.font(8.5);
    }
    centre(String(qty), 2, mid);
    centre(num(unit), 3, mid);
    centre(num(unit * qty), 4, mid);
    p.y += h;
  });
  rowBox(8);
  p.font(9, 'bold');
  centre('TOTAL', 1, p.y + 5.4);
  centre(num(items.reduce((s, [, u]) => s + u, 0)), 3, p.y + 5.4);
  centre(num(q.pricing.total), 4, p.y + 5.4);
  p.y += 8;
  if (t.standardEquipment) {
    p.font(8, 'bold');
    doc.text(`Standard Equipment: ${t.standardEquipment}`, W - M, p.y + 4, { align: 'right' });
  }
  p.y += 8;

  // ---- Terms & conditions ------------------------------------------------------------------------
  p.font(8.5 * k, 'bold');
  doc.text('TERMS & CONDITIONS:', M, p.y);
  p.y += 4.4 * k;
  const deliveryDays = q.deliveryDays ?? t.defaultDeliveryDays;
  if (deliveryDays != null) {
    doc.text(`Tentative Delivery Period: ${deliveryDays} Days`, M, p.y);
    p.y += 4 * k;
  }
  for (const l of t.deliveryNotes) {
    const line = fillTemplateLine(l, ctx);
    if (line) p.rich(line, M + 10, CW - 10, 7.8 * k, 3.6 * k);
  }
  const boldLines = [
    `Validity of Quotation: ${String(validityDays).padStart(2, '0')} Calendar days`,
    ctx.deliveryStation && `Delivery Station: ${ctx.deliveryStation}`,
    (q.paymentMode || t.defaultPaymentMode) && `Payment Mode: ${q.paymentMode || t.defaultPaymentMode}`,
    t.highlightLine,
  ].filter(Boolean) as string[];
  for (const l of boldLines) p.rich(l, M + 3, CW - 3, 8.3 * k, 4.1 * k, true);
  p.y += 0.6 * k;

  const bullet = (text: string, bold = false) => {
    p.ensure(4);
    p.font(8 * k, 'bold');
    doc.text('•', M + 1, p.y);
    p.rich(text, M + 5, CW - 5, (bold ? 8.3 : 7.5) * k, (bold ? 4 : 3.35) * k, bold);
    p.y += 0.45 * k;
  };
  for (const l of t.terms) {
    const line = fillTemplateLine(l, ctx);
    if (line) bullet(line);
  }
  if (q.notes) bullet(`**Note:** ${q.notes}`);
  for (const l of t.closingLines) {
    const line = fillTemplateLine(l, ctx);
    if (line) bullet(line, true);
  }

  // ---- Sign-off (and who prepared it) -------------------------------------------------------------
  p.y += 4.5;
  p.ensure(12);
  const top = p.y;
  t.signOff.forEach((l, i) => {
    p.font(i === 0 ? 9 : 10, i === 0 ? 'normal' : 'bold');
    doc.text(l, M, p.y);
    p.y += 4.5;
  });
  p.font(8);
  doc.setTextColor(...muted);
  doc.text(`Prepared by: ${q.salesperson.name}${q.salesperson.phone ? `  ·  ${q.salesperson.phone}` : ''}`, W - M, top, { align: 'right' });
  if (q.orderNo) doc.text(`Order: ${q.orderNo}`, W - M, top + 4.5, { align: 'right' });
  doc.setTextColor(...ink);

  footer(p, q.quotationNo);
  doc.setProperties({ title: `Quotation ${q.quotationNo}`, subject: `${description} for ${q.billTo || q.customer.name}`, author: t.companyName });
  return { doc, fileName: fileNameOf('Quotation', q.quotationNo, q.customer.name) };
}

/** The PPF voucher: customer, vehicle, sales executive, promise date, price / paid / un-paid, manager sign. */
export async function buildPpfPdf(f: PpfDocument): Promise<BuiltPdf> {
  const p = await newPage();
  const { doc } = p;
  await letterhead(p, f.dealership.code, f.template);

  // The voucher's own format: title, labels, fields left off, the dealership's own fields, sign lines.
  const t = f.ppfTemplate;
  const title = t.title || 'PPF Voucher';
  const hidden = new Set<string>(t.hiddenFields ?? []);
  const label = (key: PpfVoucherField) => t.fieldLabels?.[key] || PPF_VOUCHER_FIELDS.find((x) => x.key === key)!.label;

  p.y = Math.max(p.y, 46) + 4;
  p.font(18, 'bold');
  doc.text(title, W / 2, p.y, { align: 'center' });
  p.font(8.5);
  doc.setTextColor(...muted);
  doc.text(`Voucher No: ${f.formNo}`, M, p.y + 7);
  doc.text(`Date: ${shortDate(f.issuedAt)}`, W - M, p.y + 7, { align: 'right' });
  doc.setTextColor(...ink);
  p.y += 18;

  const film = [
    labelOf(PPF_COVERAGES, f.coverage).replace(/ \(.*\)$/, ''),
    f.coverageDetails,
    labelOf(PPF_FINISHES, f.finish),
    f.filmBrand,
    f.warrantyYears ? `${f.warrantyYears} year${f.warrantyYears > 1 ? 's' : ''} warranty` : null,
  ].filter(Boolean).join(' · ');
  const discount = Number(f.pricing.discount) > 0 ? `   (${pkr(f.pricing.amount)} less discount ${pkr(f.pricing.discount)})` : '';
  const values: Record<PpfVoucherField, [string | null, boolean?]> = {
    pbo: [f.pboNo],
    customerName: [f.customer.name],
    email: [f.customer.email],
    phone: [f.customer.mobile],
    chassis: [f.vehicle.vin],
    engine: [f.vehicle.engineNo],
    vehicle: [[f.vehicle.model, f.vehicle.variant, f.vehicle.color].filter(Boolean).join(' · ')],
    salesExecutive: [[f.salesperson.name, f.salesperson.phone].filter(Boolean).join('  ·  ')],
    promiseDate: [f.installationDate ? shortDate(f.installationDate) : null],
    ppf: [film],
    price: [`${pkr(f.pricing.total)}${discount}`, true],
    paid: [pkr(f.pricing.advancePaid)],
    unpaid: [pkr(f.pricing.balance), true],
    notes: [f.notes],
  };
  // Rows in print order; the dealership's own fields come after the PPF details, before the amounts.
  const rows: { label: string; value: string | null; bold?: boolean; gapBefore?: number }[] = [];
  for (const { key } of PPF_VOUCHER_FIELDS) {
    if (hidden.has(key) || (key === 'notes' && !f.notes)) continue;
    if (key === 'price') for (const name of t.customFields ?? []) rows.push({ label: name, value: f.extraFields[name] ?? null });
    const [value, bold] = values[key];
    rows.push({ label: label(key), value, bold, gapBefore: key === 'customerName' ? 2 : key === 'price' ? 3 : 0 });
  }
  // Many fields: tighter rows, so the voucher stays on one page.
  const step = rows.length + t.signOff.length > 17 ? 6.6 : 8.5;

  const labelW = 46;
  const field = (text: string, value: string | null | undefined, bold = false) => {
    p.ensure(11);
    p.font(10.5, 'bold');
    const labelLines = doc.splitTextToSize(text, labelW - 3) as string[];
    doc.text(labelLines[0] ?? '', M, p.y);
    p.font(10.5, bold ? 'bold' : 'normal');
    const lines = (value ? doc.splitTextToSize(value, CW - labelW - 2) : ['']) as string[];
    lines.forEach((l, i) => doc.text(l, M + labelW + 1, p.y + i * 5));
    const bottom = p.y + (lines.length - 1) * 5 + 1.8;
    doc.setDrawColor(...rule);
    doc.line(M + labelW, bottom, W - M, bottom);
    p.y = bottom + step;
  };
  for (const r of rows) {
    p.y += r.gapBefore ?? 0;
    field(r.label, r.value, r.bold);
  }

  // Notes / terms of the format, then the signature lines at the foot.
  if (t.terms.length) {
    p.y += 2;
    for (const line of t.terms) p.rich(line, M, CW, 8.5, 4.2);
  }
  p.y = Math.max(p.y + 10, 284 - t.signOff.length * (step + 3));
  for (const sign of t.signOff) field(sign, null);

  footer(p, f.formNo);
  doc.setProperties({ title: `${title} ${f.formNo}`, subject: `Paint Protection Film for ${f.customer.name}`, author: f.template.companyName });
  return { doc, fileName: fileNameOf('PPF Voucher', f.formNo, f.customer.name) };
}
