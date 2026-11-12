/** The store has four part categories only. */
export const PART_CATEGORIES = ['Lubricants', 'Mechanical', 'Body shop', 'Accessories'] as const;
export type PartCategory = (typeof PART_CATEGORIES)[number];
/** A part with no category is a mechanical one. */
export const DEFAULT_PART_CATEGORY: PartCategory = 'Mechanical';
