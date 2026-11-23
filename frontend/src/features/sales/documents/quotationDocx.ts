import type { QuotationDocument } from '../salesApi';
import { fillTemplateLine, freightLabel, hasSectionedTerms, quotationColourLine, quotationEmployeeLine, quotationVehicleLine, standardEquipmentInTable, type TemplateContext } from './pdf';

const num = (v: string | number | null | undefined) => Number(v ?? 0).toLocaleString('en-PK', { maximumFractionDigits: 2 });
const longDate = (d: string | Date) => {
  const [y, m, day] = new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }).split('-');
  return `${day}-${m}-${y}`;
};

/**
 * The quotation as an editable Word document (.docx), for printing on the dealership's own letterhead: no letterhead
 * (header) and no sign-off block (footer), with the paper's blank header (about 41 mm) and footer (about 23 mm) space left empty, only QUOTATION with the date, the price table (the bill-to name heads it),
 * the terms and conditions and the stamp & signature line. The dealership's own terms; edit it in Word before printing.
 */
export async function buildQuotationDocx(q: QuotationDocument): Promise<{ blob: Blob; fileName: string }> {
  const { AlignmentType, BorderStyle, Document, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, VerticalAlign, WidthType } = await import('docx');
  const t = q.template;
  // Jetour's and Hyundai's quotations are in the same format: the clauses are sections of the template.

  const FONT = 'Arial';
  const run = (text: string, o: { bold?: boolean; size?: number; italics?: boolean; color?: string; underline?: boolean } = {}) => new TextRun({ text, font: FONT, size: (o.size ?? 10) * 2, bold: o.bold, italics: o.italics, color: o.color, underline: o.underline ? {} : undefined });
  const para = (children: InstanceType<typeof TextRun>[], o: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; after?: number; before?: number; indent?: number } = {}) =>
    new Paragraph({ children, alignment: o.align, spacing: { after: o.after ?? 60, before: o.before ?? 0 }, indent: o.indent ? { left: o.indent } : undefined });
  const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
  const noBorders = { top: none, bottom: none, left: none, right: none };
  const line = { style: BorderStyle.SINGLE, size: 6, color: '000000' };
  const boxBorders = { top: line, bottom: line, left: line, right: line };

  // Price lines
  const sectioned = hasSectionedTerms(q);
  const vehicleLine = quotationVehicleLine(q);
  const qty = q.pricing.quantity;
  const items: { label: string; unit: number; sub?: string }[] = [{ label: vehicleLine, unit: Number(q.pricing.unitPrice), sub: [quotationColourLine(q), quotationColourLine(q) && standardEquipmentInTable(q) && t.standardEquipment ? `Standard Equipment: ${t.standardEquipment}` : null, 'EX FACTORY'].filter(Boolean).join('\n') }];
  if (Number(q.pricing.discount) > 0) items.push({ label: 'LESS: DISCOUNT', unit: -Number(q.pricing.discount) });
  const has = (v: string | null | undefined) => v != null && v !== '';
  if (has(q.pricing.freightInsurance)) items.push({ label: freightLabel(q), unit: Number(q.pricing.freightInsurance) });
  if (has(q.pricing.nevLevy)) items.push({ label: 'NEV LEVY', unit: Number(q.pricing.nevLevy) });
  if (has(q.pricing.withholdingTax)) items.push({ label: sectioned ? (q.pricing.taxStatus === 'non_filer' ? `WITH HOLDING TAX (Non-Filer)${q.taxPaidByCustomer ? ' Will be paid by customer' : ''}` : `WITH HOLDING TAX (Filer)${q.taxPaidByCustomer ? ' Will be paid by customer' : ''}`) : q.pricing.taxStatus === 'non_filer' ? 'Withholding Tax (Non-Filer)' : 'Withholding Tax (Filer)', unit: Number(q.pricing.withholdingTax) });
  if (has(q.pricing.cvt)) items.push({ label: 'CVT (1%)', unit: Number(q.pricing.cvt) });

  const widths = [800, 4800, 800, 1900, 1900];
  const cell = (children: InstanceType<typeof Paragraph>[], i: number, o: { shade?: boolean } = {}) =>
    new TableCell({
      width: { size: widths[i]!, type: WidthType.DXA },
      borders: boxBorders,
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 80, bottom: 80, left: 80, right: 80 },
      shading: o.shade ? { type: ShadingType.CLEAR, fill: 'F2F2F2' } : undefined,
      children,
    });
  const centred = (text: string, o: { bold?: boolean; size?: number } = {}) => para([run(text, { bold: o.bold, size: o.size ?? 9.5 })], { align: AlignmentType.CENTER, after: 0 });
  // These table changes are Jetour's only (Hyundai's quotation keeps its layout).
  const jet = q.dealership.brand === 'Jetour' || q.dealership.code.startsWith('JET');
  const leftAligned = (text: string) => (jet ? para([run(text, { size: 9.5 })], { align: AlignmentType.LEFT, after: 0 }) : centred(text));
  const rows: InstanceType<typeof TableRow>[] = [
    new TableRow({
      tableHeader: true,
      children: [
        cell([centred('SR', { bold: true, size: 9 })], 0, { shade: true }),
        cell([centred(jet ? 'VEHICLE DESCRIPTION' : q.billTo || q.customer.name, { bold: true, size: jet ? 9 : 10 })], 1, { shade: true }),
        cell([centred('QTY', { bold: true, size: 9 })], 2, { shade: true }),
        cell([centred('UNIT PRICE (Rs.)', { bold: true, size: 9 })], 3, { shade: true }),
        cell([centred('TOTAL PRICE (Rs.)', { bold: true, size: 9 })], 4, { shade: true }),
      ],
    }),
    ...items.map(
      (it, i) =>
        new TableRow({ cantSplit: true,
          children: [
            cell([centred(String(i + 1))], 0),
            cell([leftAligned(it.label), ...(it.sub ? it.sub.split('\n').map((s) => leftAligned(s)) : [])], 1),
            cell([centred(String(qty))], 2),
            cell([centred(num(it.unit)), ...(jet && i === 0 ? [para([run('(ex factory)', { size: 7, color: '666666' })], { align: AlignmentType.CENTER, after: 0 })] : [])], 3),
            cell([centred(num(it.unit * qty)), ...(jet && i === 0 ? [para([run('(ex factory)', { size: 7, color: '666666' })], { align: AlignmentType.CENTER, after: 0 })] : [])], 4),
          ],
        }),
    ),
    ...(q.pricing.bookingAmount && Number(q.pricing.bookingAmount) > 0
      ? [new TableRow({ children: [cell([centred('')], 0), cell([centred(`Booking Price (${num(q.pricing.bookingAmount)})`, { bold: true, size: 10 })], 1), cell([centred('')], 2), cell([centred('')], 3), cell([centred('')], 4)] })]
      : []),
    new TableRow({
      children: [
        cell([centred('')], 0),
        cell([centred('TOTAL', { bold: true, size: 10 })], 1),
        cell([centred('')], 2),
        cell([centred(num(items.reduce((s, it) => s + it.unit, 0)), { bold: true, size: 10 })], 3),
        cell([centred(num(q.pricing.total), { bold: true, size: 10 })], 4),
      ],
    }),
  ];
  const priceTable = new Table({ width: { size: 10200, type: WidthType.DXA }, columnWidths: widths, rows });

  // Terms and conditions (the dealership's own, filled for this quotation)
  const issued = new Date(q.issuedAt);
  const validityDays = Math.max(1, Math.round((Date.parse(`${q.validUntil}T00:00:00+05:00`) - Date.parse(`${issued.toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' })}T00:00:00+05:00`)) / 86400_000));
  const ctx: TemplateContext = {
    vehicle: vehicleLine,
    nonFilerTax: q.pricing.withholdingTaxNonFiler ? num(q.pricing.withholdingTaxNonFiler) : null,
    validityDays,
    deliveryStation: t.deliveryStation ?? q.dealership.name,
    dealership: q.dealership.name,
    hybrid: /PHEV|\bi-DM\b|HYBRID|\bHEV\b/i.test(`${q.vehicle.model} ${q.vehicle.variant ?? ''}`),
  };
  const bold = (text: string, indent = 60) => para([run(text, { bold: true, size: 9.5 })], { indent, after: 40 });
  // A template line with **bold** runs.
  const rich = (text: string, o: { size?: number; baseBold?: boolean } = {}) => text.split('**').map((part, i) => run(part, { size: o.size ?? 9, bold: (o.baseBold ?? false) !== (i % 2 === 1) }));
  const terms: InstanceType<typeof Paragraph>[] = [];
  if (sectioned) {
    // The new format: "# Heading", "- bullet" and plain lines of the template, all from the dealership's format.
    ctx.paymentMode = (q.paymentMode || t.defaultPaymentMode || '').trim();
    ctx.deliveryPeriod = q.deliveryPeriod?.trim() || undefined;
    terms.push(para([run('TERMS & CONDITIONS:', { bold: true, size: 9.5 })], { indent: 60, after: 60 }));
    for (const raw of t.terms) {
      if (raw.includes('{deliveryPeriod}') && !ctx.deliveryPeriod) continue;
      const text = fillTemplateLine(raw, ctx);
      if (!text) continue;
      if (text.startsWith('# ')) terms.push(para(rich(text.slice(2), { size: 9.5, baseBold: true }), { indent: 200, before: 60, after: 20 }));
      else if (text.startsWith('- ')) terms.push(new Paragraph({ children: rich(text.slice(2)), bullet: { level: 0 }, spacing: { after: 20 }, indent: { left: 900, hanging: 260 } }));
      else terms.push(para(rich(text, { size: 9.5 }), { indent: 200, after: 40 }));
    }
  } else {
    if (t.standardEquipment) terms.push(bold(`Standard Equipment: ${t.standardEquipment}`));
    terms.push(bold('TERMS & CONDITIONS:'));
    const deliveryDays = q.deliveryDays ?? t.defaultDeliveryDays;
    const period = q.deliveryPeriod?.trim() || (deliveryDays != null ? `${deliveryDays} DAYS` : null);
    if (period) terms.push(bold(`Tentative Delivery Period: ${period}`));
    for (const l of t.deliveryNotes) {
      const text = fillTemplateLine(l, ctx);
      if (text) terms.push(para([run(text, { size: 9 })], { indent: 500, after: 30 }));
    }
    for (const l of [`Validity of Quotation: ${String(validityDays).padStart(2, '0')} Days`, ctx.deliveryStation && `Delivery Station: ${ctx.deliveryStation}`, (q.paymentMode || t.defaultPaymentMode) && `Payment Mode: ${q.paymentMode || t.defaultPaymentMode}`, t.highlightLine].filter(Boolean) as string[]) {
      terms.push(bold(l, 120));
    }
    for (const l of t.terms) {
      const text = fillTemplateLine(l, ctx);
      if (text) terms.push(para([run(text, { size: 9 })], { indent: 120, after: 70 }));
    }
    for (const l of t.closingLines) {
      const text = fillTemplateLine(l, ctx);
      if (text) terms.push(bold(text, 120));
    }
  }

  const sign = new Table({
    width: { size: 10200, type: WidthType.DXA },
    columnWidths: [5100, 5100],
    borders: { ...noBorders, insideHorizontal: none, insideVertical: none },
    rows: [
      new TableRow({ cantSplit: true,
        children: [
          new TableCell({ width: { size: 5100, type: WidthType.DXA }, borders: noBorders, children: [new Paragraph({ children: [] })] }),
          new TableCell({ width: { size: 5100, type: WidthType.DXA }, borders: noBorders, verticalAlign: VerticalAlign.BOTTOM, children: [para([run('STAMP & SIGNATURE', { size: 12 })], { align: AlignmentType.RIGHT, before: 360, after: 0 })] }),
        ],
      }),
    ],
  });

  const doc = new Document({
    creator: t.companyName,
    title: `Quotation ${q.quotationNo}`,
    description: `${vehicleLine} for ${q.billTo || q.customer.name}`,
    styles: { default: { document: { run: { font: FONT, size: 20 } } } },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 2350, bottom: 1300, left: 850, right: 850 } } },
        children: [
          para([run('QUOTATION', { bold: true, size: 16 })], { align: AlignmentType.CENTER, after: 80 }),
          para([run(`Date: ${longDate(q.issuedAt)}`, { bold: true, size: 9 })], { align: AlignmentType.RIGHT, after: 60 }),
          ...(jet ? [para([run('Customer Name: ', { bold: true, size: 10.5, color: '555555' }), run(q.customer.name, { bold: true, size: 10.5, underline: true })], { after: q.billTo && q.billTo.trim() !== q.customer.name.trim() ? 0 : 60 })] : []),
          ...(jet && q.billTo && q.billTo.trim() && q.billTo.trim() !== q.customer.name.trim() ? [para([run('Quotation required for: ', { bold: true, size: 10.5, color: '555555' }), run(q.billTo.trim(), { bold: true, size: 10.5 })], { after: 60 })] : []),
          ...(q.notes ? [para([run(`Note: ${q.notes}`, { size: 11 })], { align: AlignmentType.CENTER, before: 80, after: 120 })] : [new Paragraph({ spacing: { after: 60 }, children: [] })]),
          priceTable,
          ...(quotationEmployeeLine(q) ? [para([run(quotationEmployeeLine(q)!, { bold: true, size: 9 })], { before: 80, after: 40 })] : []),
          ...(sectioned && t.standardEquipment && !standardEquipmentInTable(q) ? [para([run(`*Standard Equipment: ${t.standardEquipment}`, { bold: true, size: 9 })], { align: AlignmentType.RIGHT, before: 80, after: 160 })] : [new Paragraph({ spacing: { after: 60 }, children: [] })]),
          ...terms,
          new Paragraph({ spacing: { after: 60 }, children: [] }),
          sign,
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  return { blob, fileName: `Quotation ${q.quotationNo} - ${q.customer.name}.docx`.replace(/[\\/:*?"<>|]/g, '') };
}
