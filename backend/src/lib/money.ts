/**
 * Exact money arithmetic. Amounts travel as decimal strings ("1250000.00", Postgres numeric) and
 * are computed in integer paisa (bigint), never in floating point.
 */
const MONEY_RE = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

export function toPaisa(amount: string | number): bigint {
  const m = MONEY_RE.exec(String(amount).trim());
  if (!m) throw new Error(`Invalid amount: ${amount}`);
  const paisa = BigInt(m[2]!) * 100n + BigInt((m[3] ?? '').padEnd(2, '0') || '0');
  return m[1] ? -paisa : paisa;
}

export function fromPaisa(paisa: bigint): string {
  const neg = paisa < 0n;
  const abs = neg ? -paisa : paisa;
  return `${neg ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
}

export const addMoney = (...amounts: (string | number)[]) => fromPaisa(amounts.reduce<bigint>((s, a) => s + toPaisa(a), 0n));
export const subMoney = (a: string | number, b: string | number) => fromPaisa(toPaisa(a) - toPaisa(b));
export const mulMoney = (a: string | number, qty: number) => fromPaisa(toPaisa(a) * BigInt(qty));
export const cmpMoney = (a: string | number, b: string | number) => {
  const d = toPaisa(a) - toPaisa(b);
  return d === 0n ? 0 : d > 0n ? 1 : -1;
};

/**
 * Line amount = unit price x quantity (quantity up to 2 decimals, e.g. 1.5 labour hours),
 * rounded half-up to the paisa.
 */
export function lineAmount(unitPrice: string | number, quantity: string | number): string {
  const raw = toPaisa(unitPrice) * toPaisa(quantity); // paisa x hundredths
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const rounded = (abs + 50n) / 100n;
  return fromPaisa(neg ? -rounded : rounded);
}

/** `rate` percent of `amount` (rate up to 2 decimals, e.g. "17.5"), rounded half-up to the paisa. */
export function taxOf(amount: string | number, rate: string | number): string {
  const raw = toPaisa(amount) * toPaisa(rate); // paisa x hundredths of a percent
  const neg = raw < 0n;
  const abs = neg ? -raw : raw;
  const rounded = (abs + 5000n) / 10000n;
  return fromPaisa(neg ? -rounded : rounded);
}

/** `part` as a percentage of `whole`, e.g. discount % of list price (2 decimals). */
export function percentOf(part: string | number, whole: string | number): number {
  const w = toPaisa(whole);
  if (w === 0n) return 0;
  return Number((toPaisa(part) * 10000n) / w) / 100;
}
