/**
 * Amount boxes: the thousands commas are added while typing ("6674880" -> "6,674,880"), digits and one
 * decimal point only, at most two decimals. The server accepts the commas too.
 */
export function formatAmount(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '');
  const [int = '', ...rest] = cleaned.split('.');
  const dec = rest.join('').slice(0, 2);
  const grouped = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest.length ? `${grouped === '' ? '0' : grouped}.${dec}` : grouped;
}

/** The number in an amount box ("6,674,880" -> 6674880). */
export const amountNumber = (s: string | null | undefined): number => Number((s ?? '').replace(/,/g, '')) || 0;
