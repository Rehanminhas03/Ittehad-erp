export type ItemType = 'part' | 'accessory' | 'lubricant';

export const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: 'part', label: 'Part' },
  { value: 'accessory', label: 'Accessory' },
  { value: 'lubricant', label: 'Lubricant' },
];
export const itemTypeLabel = (t: string) => ITEM_TYPES.find((x) => x.value === t)?.label ?? t;

/** Same rule as the server (backend/src/modules/parts/lubricant.ts): a part picked from the catalogue gets its type from it. */
export function itemTypeOf(p: { category?: string | null; uom?: string | null; description?: string | null }): ItemType {
  const d = p.description ?? '';
  if (/^accessor(y|ies)$/i.test((p.category ?? '').trim())) return 'accessory';
  const lubricant =
    /^lubricants?$/i.test((p.category ?? '').trim()) ||
    /^(l|lt|ltr|litre|litres|liter|liters)$/i.test((p.uom ?? '').trim()) ||
    /\b\d{1,2}w[- ]?\d{2}\b/i.test(d) ||
    /\b(engine|gear|motor|transmission|differential)\s+oil\b|\bATF\b|\bCVT\s+(oil|fluid)\b/i.test(d) ||
    /^\s*(engine\s+)?(coolant|antifreeze|brake\s+fluid|power\s+steering\s+fluid|grease|wind\s*screen\s+washer|washer\s+fluid)(\s+(dot\s*\d|[\d./]+)\s*(l|ml|ltr|litre|kg|g)?)*\s*$/i.test(d);
  return lubricant ? 'lubricant' : 'part';
}
