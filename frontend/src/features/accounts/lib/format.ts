import { formatMoney } from '@/shared/lib';

/** A balance (debit − credit) the way accountants read it: the amount with Dr / Cr. */
export function drCr(v: string | number): string {
  const n = Number(v);
  if (!n) return formatMoney(0);
  return `${formatMoney(Math.abs(n))} ${n > 0 ? 'Dr' : 'Cr'}`;
}

/** Blank for zero, so debit/credit columns read cleanly. */
export const amountOrBlank = (v: string | number) => (Number(v) ? formatMoney(v) : '');
