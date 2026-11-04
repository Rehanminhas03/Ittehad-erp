/**
 * Lubricants (engine oil, gear oil, ATF, coolant, brake fluid, grease ...) and accessories are billed on their own blocks of the
 * job card and the invoice, apart from the other parts. A part is a lubricant when it is sold by the litre, its name is an oil
 * grade (5W-30) or an oil / fluid product by itself, or its category is "Lubricants"; an accessory when its category is
 * "Accessories". The "Oils & fluids" category of the Jetour catalogue is not used: it holds parts too (oil module, filler box).
 */
const CATEGORY = /^lubricants?$/i;
const ACCESSORY = /^accessor(y|ies)$/i;
const UOM = /^(l|lt|ltr|litre|litres|liter|liters)$/i;
const GRADE = /\b\d{1,2}w[- ]?\d{2}\b/i;
const OIL = /\b(engine|gear|motor|transmission|differential)\s+oil\b|\bATF\b|\bCVT\s+(oil|fluid)\b/i;
const PRODUCT = /^\s*(engine\s+)?(coolant|antifreeze|brake\s+fluid|power\s+steering\s+fluid|grease|wind\s*screen\s+washer|washer\s+fluid)(\s+(dot\s*\d|[\d./]+)\s*(l|ml|ltr|litre|kg|g)?)*\s*$/i;

type PartLike = { category?: string | null; uom?: string | null; description?: string | null };

export function isLubricant(p: PartLike): boolean {
  const d = p.description ?? '';
  return CATEGORY.test((p.category ?? '').trim()) || UOM.test((p.uom ?? '').trim()) || GRADE.test(d) || OIL.test(d) || PRODUCT.test(d);
}

export const ITEM_TYPES = ['part', 'accessory', 'lubricant'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/** Whether a part is a part, an accessory or a lubricant. */
export function itemTypeOf(p: PartLike): ItemType {
  if (ACCESSORY.test((p.category ?? '').trim())) return 'accessory';
  return isLubricant(p) ? 'lubricant' : 'part';
}

/** The category a new part of that type is filed under (so it is recognised again), or null for an ordinary part. */
export const categoryOfType = (t: ItemType | undefined) => (t === 'lubricant' ? 'Lubricants' : t === 'accessory' ? 'Accessories' : null);

/** The job card / invoice line kind of a part. */
export const partLineKind = itemTypeOf;
