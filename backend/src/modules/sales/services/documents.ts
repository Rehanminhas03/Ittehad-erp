/**
 * Customer documents issued from a lead:
 *   - Vehicle quotation (e.g. HYD-ISB-QT-2026-00001): the model and the quoted price.
 *   - Paint Protection Film form (e.g. HYD-ISB-PF-2026-00001): filled in when the customer agrees to PPF.
 * Both are stored, so they can be corrected later (salesperson / Assistant Manager) and viewed,
 * downloaded and printed by the Manager and the Admin. The PDF is drawn by the browser from the
 * document endpoints below; every create and change is in the record's history and the activity log.
 */
import type { EntityCtx, Row } from '../../../entity/types';
import { forbidden, validationError } from '../../../lib/errors';
import { subMoney } from '../../../lib/money';
import type { z } from '../../../lib/zod';
import { DocType, nextDocumentNumber } from '../../core/documents';
import { assertActiveModel } from '../../master/entities';
import { assertVariantCodeGiven, leads, money2, ppfForms, pricePpf, priceQuotation, quotations, resolveVariant } from '../entities';
import { SalesPerm as P } from '../permissions';
import type { PpfFormCreate, QuotationCreate } from '../schemas';
import { loadTemplate } from './templates';
import { pakistanToday } from '../../../lib/dates';

const karachiDay = (plusDays = 0) => pakistanToday(plusDays);

/**
 * The lead a document is issued from. Its salesperson issues documents for their own leads; someone
 * with the edit-all right (the Assistant Manager) for any lead they can open.
 */
async function issuingLead(ctx: EntityCtx, leadId: number, editAll: string) {
  const l = await leads.findVisible(ctx, leadId);
  const target = { dealershipId: l.dealershipId as number, branchId: (l.branchId as number | null) ?? null };
  if (l.ownerId !== ctx.access.userId && !ctx.access.canIn(editAll, target)) {
    throw forbidden("Only the lead's salesperson or the Assistant Manager can issue its documents");
  }
  return { l, target };
}

/**
 * What the PPF voucher can take from the lead's sales order once it is raised (processing, vehicle
 * received, delivered): the PBO / order number, chassis and engine. Nulls are entered by hand.
 */
export async function leadOrderVehicle(ctx: EntityCtx, leadId: number) {
  const l = await leads.findVisible(ctx, leadId);
  const order = await leadOrder(ctx, l);
  const v = order?.vehicleId ? await ctx.tx.vehicle.findUnique({ where: { id: order.vehicleId }, select: { vin: true, engineNo: true } }) : null;
  return { orderNo: order?.orderNo ?? null, pboNo: order?.pboNo ?? null, chassisNo: v?.vin ?? null, engineNo: v?.engineNo ?? null };
}

async function leadOrder(ctx: EntityCtx, l: Record<string, unknown>) {
  if (!l.salesOrderId) return undefined;
  const o = await ctx.tx.salesOrder.findUnique({
    where: { id: l.salesOrderId as number },
    select: { orderNo: true, pboNo: true, unitPrice: true, discount: true, bookingAmount: true, vehicleId: true, modelId: true },
  });
  return o ?? undefined;
}

export async function createQuotation(ctx: EntityCtx, leadId: number, input: z.output<typeof QuotationCreate>) {
  const { l, target } = await issuingLead(ctx, leadId, P.quotationsUpdate);
  // The vehicle quoted: a picked variant code's model, else the model chosen on the quotation (the
  // customer may now want another model), else the lead's. A picked code also sets the printed
  // description and goes in the Ref.
  const picked = input.variantCode ? await resolveVariant(ctx, target.dealershipId, input.variantCode) : { variantCode: null };
  if (input.modelId) await assertActiveModel(ctx, input.modelId);
  const modelId = ('modelId' in picked ? picked.modelId : null) ?? input.modelId ?? (l.interestedModelId as number | null);
  if (!modelId) throw validationError([{ in: 'body', path: 'modelId', message: 'Choose the model' }]);
  // Hyundai (Ref prefix): a code, unless the model has none or the variant is typed ("Other"; the Ref
  // is then the quotation number).
  if (!picked.variantCode && !input.variant) await assertVariantCodeGiven(ctx, target.dealershipId, null, modelId);
  // Once the Admin has raised the order, its price is the default.
  const order = await leadOrder(ctx, l);
  const unitPrice = input.unitPrice ?? order?.unitPrice;
  if (!unitPrice) throw validationError([{ in: 'body', path: 'unitPrice', message: 'Enter the price to quote' }]);
  const discount = input.discount ?? order?.discount ?? '0';
  const priced = priceQuotation({
    unitPrice: money2(unitPrice),
    discount: money2(discount),
    quantity: input.quantity,
    freightInsurance: money2(input.freightInsurance),
    withholdingTax: money2(input.withholdingTax),
  });
  const booking = input.bookingAmount !== undefined ? input.bookingAmount : (order?.bookingAmount ?? ((l.paymentAmount as string | null) ?? null));

  return quotations.create(ctx, {
    ...target,
    ...priced,
    quotationNo: await nextDocumentNumber(ctx.tx, target.dealershipId, DocType.quotation),
    leadId,
    ownerId: l.ownerId,
    modelId,
    // A typed variant belongs to the quoted model; the lead's variant only when the model is the lead's.
    variant: ('variant' in picked ? picked.variant : null) ?? input.variant ?? (modelId === l.interestedModelId ? l.variant : null) ?? null,
    variantCode: picked.variantCode,
    color: input.color ?? l.preferredColor ?? null,
    bookingAmount: booking == null ? null : money2(booking),
    validUntil: karachiDay(input.validDays),
    notes: input.notes ?? null,
    billTo: input.billTo ?? null,
    withholdingTaxNonFiler: input.withholdingTaxNonFiler == null ? null : money2(input.withholdingTaxNonFiler),
    deliveryDays: input.deliveryDays ?? null,
    deliveryPeriod: input.deliveryPeriod ?? null,
    paymentMode: input.paymentMode ?? null,
  });
}

export async function createPpfForm(ctx: EntityCtx, leadId: number, input: z.output<typeof PpfFormCreate>) {
  const { l, target } = await issuingLead(ctx, leadId, P.ppfUpdate);
  // PBO, chassis and engine: typed on the voucher, or taken from the lead's sales order. Required
  // once the lead has an order; before that they may be blank (the voucher shows the order's numbers
  // as soon as it exists).
  const order = await leadOrderVehicle(ctx, leadId);
  const pboNo = input.pboNo || order.pboNo || order.orderNo;
  const chassisNo = input.chassisNo || order.chassisNo;
  const engineNo = input.engineNo || order.engineNo;
  const missing = !l.salesOrderId ? [] : [
    !pboNo && { in: 'body' as const, path: 'pboNo', message: 'Enter the PBO number' },
    !chassisNo && { in: 'body' as const, path: 'chassisNo', message: 'Enter the chassis number' },
    !engineNo && { in: 'body' as const, path: 'engineNo', message: 'Enter the engine number' },
  ].filter((x) => !!x);
  if (missing.length) throw validationError(missing);
  const priced = pricePpf({ amount: money2(input.amount), discount: money2(input.discount), advancePaid: money2(input.advancePaid) });
  return ppfForms.create(ctx, {
    ...target,
    ...priced,
    formNo: await nextDocumentNumber(ctx.tx, target.dealershipId, DocType.ppfForm),
    leadId,
    ownerId: l.ownerId,
    pboNo,
    chassisNo,
    engineNo,
    coverage: input.coverage,
    coverageDetails: input.coverageDetails ?? null,
    filmBrand: input.filmBrand ?? null,
    finish: input.finish,
    warrantyYears: input.warrantyYears ?? null,
    installationDate: input.installationDate ?? null,
    notes: input.notes ?? null,
    extraFields: cleanExtraFields(input.extraFields),
  });
}

/** The dealership's own voucher fields: filled-in values only. */
export function cleanExtraFields(values: Record<string, string> | undefined) {
  return Object.fromEntries(Object.entries(values ?? {}).filter(([k, v]) => k.trim() && v.trim()));
}

/** Dealership, customer (as on the lead), salesperson and vehicle printed on a document. */
async function parties(ctx: EntityCtx, doc: Row, modelId: number | null) {
  const lr = await ctx.tx.lead.findUnique({
    where: { id: doc.leadId as number },
    select: { prospectName: true, prospectMobile: true, email: true, variant: true, preferredColor: true, interestedModelId: true, salesOrderId: true },
  });
  const l = lr
    ? { name: lr.prospectName, mobile: lr.prospectMobile, email: lr.email, variant: lr.variant, color: lr.preferredColor, modelId: lr.interestedModelId, salesOrderId: lr.salesOrderId }
    : undefined;
  const order = l?.salesOrderId ? await leadOrder(ctx, { salesOrderId: l.salesOrderId }) : undefined;
  const d = await ctx.tx.dealership.findUnique({
    where: { id: doc.dealershipId as number },
    select: { name: true, code: true, brand: true, address: true, city: true, phone: true },
  });
  const spr = await ctx.tx.user.findUnique({ where: { id: doc.ownerId as number }, select: { fullName: true, phone: true, email: true } });
  const sp = spr ? { name: spr.fullName, phone: spr.phone, email: spr.email } : undefined;
  const mId = modelId ?? order?.modelId ?? l?.modelId ?? null;
  const mr = mId ? await ctx.tx.vehicleModel.findUnique({ where: { id: mId }, select: { brand: true, name: true } }) : null;
  const m = mr ? { name: `${mr.brand} ${mr.name}` } : undefined;
  const v = order?.vehicleId ? await ctx.tx.vehicle.findUnique({ where: { id: order.vehicleId }, select: { vin: true, engineNo: true } }) : null;
  return {
    issuedAt: doc.createdAt as Date,
    updatedAt: doc.updatedAt as Date,
    dealership: d!,
    customer: { name: l?.name ?? '', mobile: l?.mobile ?? '', email: l?.email ?? null },
    salesperson: sp!,
    vehicle: {
      model: m?.name ?? 'Vehicle',
      variant: ((doc.variant as string | null | undefined) ?? l?.variant) || null,
      color: ((doc.color as string | null | undefined) ?? l?.color) || null,
      vin: v?.vin ?? null,
      engineNo: v?.engineNo ?? null,
    },
    orderNo: order?.orderNo ?? null,
    createdByName: (doc.createdByName as string | null) ?? null,
    updatedByName: (doc.updatedByName as string | null) ?? null,
    notes: (doc.notes as string | null) ?? null,
  };
}

/** Everything the quotation PDF shows (the caller must be able to view the quotation). */
export async function quotationDocument(ctx: EntityCtx, id: number) {
  const q = await quotations.get(ctx, id);
  return {
    quotationNo: q.quotationNo as string,
    validUntil: q.validUntil as string,
    variantCode: (q.variantCode as string | null) ?? null,
    billTo: (q.billTo as string | null) ?? null,
    deliveryDays: (q.deliveryDays as number | null) ?? null,
    deliveryPeriod: (q.deliveryPeriod as string | null) ?? null,
    paymentMode: (q.paymentMode as string | null) ?? null,
    // Always the dealership's current format, so an edited format shows on every quotation.
    template: await loadTemplate(ctx, q.dealershipId as number, 'quotation'),
    ...(await parties(ctx, q, q.modelId as number)),
    pricing: {
      quantity: q.quantity as number,
      unitPrice: q.unitPrice as string,
      discount: q.discount as string,
      freightInsurance: q.freightInsurance as string,
      withholdingTax: q.withholdingTax as string,
      withholdingTaxNonFiler: (q.withholdingTaxNonFiler as string | null) ?? null,
      total: q.totalAmount as string,
      bookingAmount: (q.bookingAmount as string | null) ?? null,
    },
  };
}

/** Everything the PPF form PDF shows (the caller must be able to view the form). */
export async function ppfDocument(ctx: EntityCtx, id: number) {
  const f = await ppfForms.get(ctx, id);
  const total = f.totalAmount as string;
  const p = await parties(ctx, f, null);
  return {
    formNo: f.formNo as string,
    pboNo: (f.pboNo as string | null) || p.orderNo,
    template: await loadTemplate(ctx, f.dealershipId as number, 'quotation'),
    ppfTemplate: await loadTemplate(ctx, f.dealershipId as number, 'ppf'),
    extraFields: (f.extraFields as Record<string, string> | null) ?? {},
    ...p,
    // Written on the voucher, else the allocated vehicle's.
    vehicle: { ...p.vehicle, vin: (f.chassisNo as string | null) || p.vehicle.vin, engineNo: (f.engineNo as string | null) || p.vehicle.engineNo },
    coverage: f.coverage as 'full_body',
    coverageDetails: (f.coverageDetails as string | null) ?? null,
    filmBrand: (f.filmBrand as string | null) ?? null,
    finish: f.finish as 'gloss',
    warrantyYears: (f.warrantyYears as number | null) ?? null,
    installationDate: (f.installationDate as string | null) ?? null,
    pricing: {
      amount: f.amount as string,
      discount: f.discount as string,
      total,
      advancePaid: f.advancePaid as string,
      balance: subMoney(total, f.advancePaid as string),
    },
  };
}
