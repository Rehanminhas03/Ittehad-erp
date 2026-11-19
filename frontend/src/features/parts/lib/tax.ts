/** Sales tax on parts (18%). Stock is entered and costed without it; reports show the cost both ways. */
export const PART_TAX = 0.18;
const round2 = (n: number) => Math.round(n * 100) / 100;
/** An amount without sales tax -> with it. */
export const withTax = (v: string | number | null | undefined) => round2(Number(v ?? 0) * (1 + PART_TAX));
/** A price with sales tax -> without it. */
export const withoutTax = (v: string | number | null | undefined) => round2(Number(v ?? 0) / (1 + PART_TAX));
