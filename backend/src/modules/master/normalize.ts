/**
 * Canonical forms for identifiers. Duplicate prevention and search compare these, never the raw
 * input, so "0300-1234567", "+92 300 1234567" and "923001234567" are the same customer.
 */

/** Pakistani mobile / phone to E.164 (+92...). Other international numbers keep their digits. Null if unusable. */
export function normalizeMobile(input: string): string | null {
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('0092')) return checkLength(`+92${digits.slice(4)}`);
  if (digits.startsWith('92') && digits.length === 12) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 11) return `+92${digits.slice(1)}`;
  if (digits.startsWith('3') && digits.length === 10) return `+92${digits}`;
  if (trimmed.startsWith('+') || trimmed.startsWith('00')) return checkLength(`+${digits.replace(/^00/, '')}`);
  return null;
}

/**
 * Search term for stored E.164 mobiles (+923001234567). A full number normalizes as usual; a partial
 * one typed any way (0300 123, 0300-123, 300123) becomes digits in international form (92300123),
 * which matches inside the stored value. Anything that is not a phone number is returned unchanged.
 */
export function mobileSearchTerm(q: string): string {
  const full = normalizeMobile(q);
  if (full) return full;
  if (!/^[\d\s()+-]+$/.test(q.trim())) return q;
  const digits = q.replace(/\D/g, '');
  if (digits.length < 3) return q;
  if (digits.startsWith('0092')) return `92${digits.slice(4)}`;
  if (digits.startsWith('0')) return `92${digits.slice(1)}`;
  return digits;
}

function checkLength(e164: string): string | null {
  const n = e164.length - 1;
  return n >= 8 && n <= 15 ? e164 : null;
}

/** CNIC: 13 digits (dashes optional). Null if not a valid CNIC. */
export function normalizeCnic(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  return /^\d{13}$/.test(digits) ? digits : null;
}

export const formatCnic = (d: string) => `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;

/** VIN / chassis, engine number and registration plate: uppercase alphanumerics only. */
export function normalizeIdentifier(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export type QueryKind = 'mobile' | 'cnic' | 'identifier' | 'text';

/** Best guesses for what a unified-search string is, for ranking and exact lookups. */
export function classifyQuery(q: string): { kinds: QueryKind[]; mobile: string | null; cnic: string | null; identifier: string } {
  const cnic = normalizeCnic(q);
  const mobile = normalizeMobile(q);
  const identifier = normalizeIdentifier(q);
  const kinds: QueryKind[] = [];
  if (cnic) kinds.push('cnic');
  if (mobile) kinds.push('mobile');
  if (identifier.length >= 4) kinds.push('identifier');
  if (/[a-z]/i.test(q)) kinds.push('text');
  return { kinds, mobile, cnic, identifier };
}
