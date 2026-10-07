/**
 * Document formats: each dealership's quotation letterhead, delivery lines, terms and conditions,
 * closing lines and sign-off. The Assistant Manager / Sales Manager edit them; every quotation of the
 * dealership prints with the current format. Until edited, a built-in default applies: Hyundai
 * Islamabad's own quotation, Jetour Ittehad's own quotation, and the Hyundai format with its own name for CSM.
 */
import type { EntityCtx } from '../../../entity/types';
import { forbidden, notFound } from '../../../lib/errors';
import type { z } from '../../../lib/zod';
import { diffChanges } from '../../core/audit';
import type { Prisma } from '../../../generated/prisma/client';
import type { DOCUMENT_KINDS } from '../models';
import { SalesPerm as P } from '../permissions';
import type { DocumentTemplateBody } from '../schemas';

type Kind = (typeof DOCUMENT_KINDS)[number];
type Fields = Omit<z.output<typeof DocumentTemplateBody>, 'dealershipId'>;
type Dealer = { name: string; code: string; brand: string; address: string | null; city: string | null; phone: string | null };

/** Hyundai Islamabad's quotation, as used by the dealership (typos corrected). */
const HYUNDAI_QUOTATION: Fields = {
  companyName: 'Ittehad Automotive',
  refPrefix: 'HI',
  tagline: '(An Ittehad Steel Company)',
  address: 'Plot # 422, 9th Avenue, I-9/3 Islamabad',
  phone: '111-500-200, 4435400',
  email: 'info@hyundai-islamabad.com',
  deliveryNotes: [
    'Delivery Period at the time of receiving payment/booking will be applicable',
    'Delivery Times are as per current prevailing conditions',
    'Delivery Times are communicated as per instructions by HNMPL',
  ],
  deliveryStation: 'Hyundai Islamabad',
  defaultPaymentMode: '100% Advance Payment.',
  defaultValidityDays: 7,
  defaultDeliveryDays: 10,
  highlightLine: 'ORDER WILL BE BOOKED ON CONFIRM PURCHASE ORDER',
  standardEquipment: 'As per Brochure',
  terms: [
    'All Payments **(Pay Orders)** to be made in favour of **Hyundai Nishat Motor (Pvt) Limited** on A/C of Customer Name.',
    'Any impact on prices, including but not limited to Government levies (including FED, GST, and CVT etc.), duties, tariffs, fiscal policies, import policies, PKR devaluation, shall be on account of customer.',
    'Force Majeure clause is applicable, including but not limited to Acts of God or enemy, change in Government Policies, Government announced Lockdowns, Labour Strikes, or Civil Unrest, injunctions by Court of Law.',
    'Vehicle is covered by manufacturer’s warranty of 48 months or 100,000 km, whichever occurs first.',
    'Advance Income/Withholding Tax may not be deducted as Exemption Certificate will be provided at time of payment.',
    'Withholding tax for non-filer: {vehicle}: Rs. {nonFilerTax} will be applied.',
    'Price(s) at the time of delivery will be applicable',
    'Any difference in Price will have to be paid before delivery',
    'Further Sales Tax @ 4% will be applicable on all Corporate and Business Individual Customers who are registered in sales tax but are non-Active and customers which are not registered in sales tax.',
    'Orders taken from customers are governed by **PBO** (Provisional Booking Order Form) and are under its terms and conditions.',
    'Order will be deemed confirmed only at the time of realization of funds and completion of all formalities',
    'At any time, throughout the transaction, terms and conditions of this quotation shall remain supreme, even if any document received by us, unless notified/authorized by our office in written.',
    'Hyundai Islamabad is acting on behalf of and dealer of **HNMPL**, and is not subject to any liability, including legal or financial.',
    'Delivery times are constantly changing based on first come basis, & available stocks.',
  ],
  closingLines: ['[Hybrid only] 4 YEARS WARRANTY FOR ENGINE AND 8 YEARS FOR HYBRID BATTERY.', 'FIRST 3 SERVICES LABOUR COST FREE.'],
  signOff: ['Owners and Operators of', 'Hyundai Islamabad'],
  title: null,
  fieldLabels: {},
  hiddenFields: [],
  customFields: [],
};

/**
 * Jetour / CSM: the same format as Hyundai (the group's standard), with the dealership's own name and
 * contact details; brand-specific clauses are worded generally until the managers adjust them.
 */
function groupQuotation(d: Dealer): Fields {
  const name = (s: string) =>
    s
      .replace('Hyundai Nishat Motor (Pvt) Limited', d.name)
      .replaceAll('Hyundai Islamabad', d.name)
      .replaceAll('HNMPL', 'the manufacturer')
      .replace('manufacturer’s warranty of 48 months or 100,000 km, whichever occurs first', 'manufacturer’s warranty as per the manufacturer’s warranty policy');
  return {
    ...HYUNDAI_QUOTATION,
    // Hyundai's Ref format (HI/<code>/<date>) is not used by Jetour / CSM: the quotation number is the Ref.
    refPrefix: null,
    address: [d.address, d.city].filter(Boolean).join(', ') || null,
    phone: d.phone,
    email: null,
    deliveryNotes: HYUNDAI_QUOTATION.deliveryNotes.map(name),
    deliveryStation: d.name,
    terms: HYUNDAI_QUOTATION.terms.map(name),
    closingLines: [],
    signOff: ['Owners and Operators of', d.name],
  };
}

/**
 * Jetour Ittehad's quotation (2026-09-30, from its Dashing / X70 and T2 i-DM quotations; one format
 * for every Jetour model). Printed with Jetour's own layout (frontend pdf.ts). The tagline is the
 * website line under the contact details. The battery warranty line prints only for the i-DM PHEV.
 */
const JETOUR_QUOTATION: Fields = {
  companyName: 'JETOUR ITTEHAD',
  refPrefix: null,
  tagline: 'www.ittehadmotors.com',
  address: 'Plot #. 415, off 9th Avenue, Sector I-9/3, Islamabad',
  phone: '+92 (51) 111 500 100',
  email: 'info@ittehadmotors.com',
  deliveryNotes: [
    'Delivery Period at the time of receiving payment/booking will be applicable',
    'Delivery Times are as per current prevailing conditions',
    'Delivery Times are communicated as per instructions by JETOUR',
  ],
  deliveryStation: 'JETOUR ITTEHAD ISLAMABAD',
  defaultPaymentMode: '100% Advance Payment.',
  defaultValidityDays: 7,
  defaultDeliveryDays: null,
  highlightLine: null,
  standardEquipment: 'As per Brochure',
  terms: [
    'All Payments **(Pay Orders)** to be made in favor of **UNITED MOTORS PVT LTD NTN # 7154939-2.**',
    'Any impact on prices, including but not limited to Government levies (including FED, GST, and CVT etc.), duties, tariffs, fiscal policies, import policies, PKR devaluation, shall be on account of customer.',
    'Force Majeure clause is applicable, including but not limited to Acts of God or enemy, change in Government Policies, Government announced Lockdowns, Labor Strikes, or Civil Unrest, injunctions by Court of Law.',
    'Vehicle is covered by manufacturer’s warranty of **60 months** or **150,000 km,** whichever occurs first.',
    '[Hybrid only] Battery Warranty is **96 months** or **160,000 km,** whichever occurs first.',
    'Any difference in Price will have to be paid before delivery.',
    'Further Sales Tax @ 4% will be applicable on all Corporate and Business Individual Customers who are registered in sales tax but are non-Active and customers which are not registered in sales tax.',
    'Orders taken from customers are governed by **PBO** (Provisional Booking Order Form) and are under its terms and conditions. Order will be deemed confirmed only at the time of realization of funds and completion of all formalities.',
    'At any time, throughout the transaction, terms and conditions of this quotation shall remain supreme, even if any document received by us, unless notified/authorized by our office in written form.',
    'JETOUR ITTEHAD Islamabad is acting on behalf of the dealer of **JETOUR,** and is not subject to any liability, including legal or financial. Delivery times are constantly changing based on first come basis, & available stocks.',
  ],
  closingLines: [],
  signOff: ['Owned & Operated by:', 'Ittehad Motors', '(an Ittehad Steel Company)'],
  title: null,
  fieldLabels: {},
  hiddenFields: [],
  customFields: [],
};

const quotationDefaults = (d: Dealer): Fields =>
  d.code.startsWith('HYD') || d.brand === 'Hyundai' ? HYUNDAI_QUOTATION : d.brand === 'Jetour' ? JETOUR_QUOTATION : groupQuotation(d);

/** The PPF voucher as the dealership uses it: the fields it asked for and a manager's signature. */
function ppfDefaults(d: Dealer): Fields {
  return {
    ...quotationDefaults(d),
    deliveryNotes: [],
    highlightLine: null,
    terms: [],
    closingLines: [],
    signOff: ['Manager Sign'],
    title: 'PPF Voucher',
    fieldLabels: {},
    hiddenFields: [],
    customFields: [],
  };
}
/**
 * The leave application form as the dealership prints it: its name as the heading, "APPLICATION FORM",
 * the rules (English in `terms`, Urdu in `closingLines`) and the signature lines.
 */
function leaveDefaults(d: Dealer): Fields {
  return {
    ...quotationDefaults(d),
    companyName: d.name.toUpperCase(),
    deliveryNotes: [],
    highlightLine: null,
    terms: [
      'A legitimate emergency qualifies for a day off. Examples include illness, illness of a family member, childbirth, or other genuine emergencies.',
      'Anyone found abusing the system will receive an immediate warning. There will be no second warning.',
    ],
    closingLines: [
      'ایک حقیقی اور جائز ایمرجنسی کی صورت میں ایک دن کی چھٹی قابل قبول ہوگی۔ اس میں بیماری، خاندان کے کسی فرد کی بیماری، بچے کی پیدائش، یا دیگر حقیقی ہنگامی حالات شامل ہیں۔',
      'جو شخص اس سہولت کا غلط استعمال کرتے ہوئے پایا گیا، اسے صرف ایک مرتبہ تنبیہ کی جائے گی۔ دوسری مرتبہ کوئی تنبیہ نہیں دی جائے گی۔',
    ],
    signOff: ["Applicant's Signature", 'Department Head', 'Manager'],
    title: 'APPLICATION FORM',
    fieldLabels: {},
    hiddenFields: [],
    customFields: [],
  };
}
const defaultsFor = (d: Dealer, kind: Kind): Fields => (kind === 'ppf' ? ppfDefaults(d) : kind === 'leave' ? leaveDefaults(d) : quotationDefaults(d));

async function dealer(ctx: EntityCtx, dealershipId: number): Promise<Dealer> {
  const d = await ctx.tx.dealership.findUnique({
    where: { id: dealershipId },
    select: { name: true, code: true, brand: true, address: true, city: true, phone: true },
  });
  if (!d) throw notFound('Dealership');
  return d;
}

const pickFields = (r: Record<string, unknown>): Fields => ({
  companyName: r.companyName as string,
  refPrefix: (r.refPrefix as string | null) ?? null,
  tagline: (r.tagline as string | null) ?? null,
  address: (r.address as string | null) ?? null,
  phone: (r.phone as string | null) ?? null,
  email: (r.email as string | null) ?? null,
  deliveryNotes: (r.deliveryNotes as string[]) ?? [],
  deliveryStation: (r.deliveryStation as string | null) ?? null,
  defaultPaymentMode: (r.defaultPaymentMode as string | null) ?? null,
  defaultValidityDays: r.defaultValidityDays as number,
  defaultDeliveryDays: (r.defaultDeliveryDays as number | null) ?? null,
  highlightLine: (r.highlightLine as string | null) ?? null,
  standardEquipment: (r.standardEquipment as string | null) ?? null,
  terms: (r.terms as string[]) ?? [],
  closingLines: (r.closingLines as string[]) ?? [],
  signOff: (r.signOff as string[]) ?? [],
  title: (r.title as string | null) ?? null,
  fieldLabels: (r.fieldLabels as Record<string, string>) ?? {},
  hiddenFields: ((r.hiddenFields as string[]) ?? []) as Fields['hiddenFields'],
  customFields: (r.customFields as string[]) ?? [],
});

/** The dealership's current format (saved, or the built-in default). Server-internal: no permission check. */
export async function loadTemplate(ctx: EntityCtx, dealershipId: number, kind: Kind = 'quotation') {
  const row = await ctx.tx.documentTemplate.findUnique({ where: { dealershipId_kind: { dealershipId, kind } } });
  if (!row) return { dealershipId, kind, ...defaultsFor(await dealer(ctx, dealershipId), kind), isDefault: true, updatedAt: null, updatedByName: null };
  const u = row.updatedById ? await ctx.tx.user.findUnique({ where: { id: row.updatedById }, select: { fullName: true } }) : null;
  return { dealershipId, kind, ...pickFields(row), isDefault: false, updatedAt: row.updatedAt, updatedByName: u?.fullName ?? null };
}

/** Anyone who issues or reads the dealership's documents may read its format (the forms use its defaults). */
export async function getTemplate(ctx: EntityCtx, kind: Kind, dealershipId: number) {
  const readers = [P.templatesManage, P.quotationsCreate, P.quotationsViewAll, P.quotationsViewOwn, P.ppfCreate, P.ppfViewAll, P.ppfViewOwn, P.leaveApply, P.leaveApprove];
  if (!readers.some((c) => ctx.access.canIn(c, { dealershipId }))) throw forbidden();
  return loadTemplate(ctx, dealershipId, kind);
}

/** Assistant Manager / Sales Manager: save the format; every change is audited with before / after. */
export async function saveTemplate(ctx: EntityCtx, kind: Kind, input: z.output<typeof DocumentTemplateBody>) {
  const { dealershipId, ...fields } = input;
  if (!ctx.access.canIn(P.templatesManage, { dealershipId })) throw forbidden('Only the Assistant Manager or Sales Manager can change the formats');
  const before = await loadTemplate(ctx, dealershipId, kind);
  const values: Fields = pickFields({ ...fields });
  const { fieldLabels, ...rest } = values;
  const data = { ...rest, fieldLabels: fieldLabels as Prisma.InputJsonValue };
  const row = await ctx.tx.documentTemplate.upsert({
    where: { dealershipId_kind: { dealershipId, kind } },
    create: { dealershipId, kind, ...data, createdById: ctx.access.userId, updatedById: ctx.access.userId },
    update: { ...data, updatedById: ctx.access.userId, updatedAt: new Date() },
    select: { id: true },
  });
  const changes = diffChanges(pickFields(before), values);
  if (Object.keys(changes).length) {
    await ctx.audit({ entityType: 'sales.document_template', entityId: row.id, action: before.isDefault ? 'create' : 'update', dealershipId, branchId: null, changes });
  }
  return loadTemplate(ctx, dealershipId, kind);
}
