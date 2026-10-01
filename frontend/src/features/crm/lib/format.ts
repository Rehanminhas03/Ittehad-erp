/** 3520212345671 -> 35202-1234567-1 */
export function formatCnic(cnic: string | null | undefined): string {
  if (!cnic) return '—';
  return /^\d{13}$/.test(cnic) ? `${cnic.slice(0, 5)}-${cnic.slice(5, 12)}-${cnic.slice(12)}` : cnic;
}

/**
 * A CNIC as it is typed: digits only, formatted 14301-5305891-1 (5 - 7 - 1) as they come in.
 * Also formats a stored 13-digit CNIC for an edit form.
 */
export function maskCnic(input: string | null | undefined): string {
  const d = (input ?? '').replace(/\D/g, '').slice(0, 13);
  if (d.length > 12) return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Best guess at what a search string is, to prefill "create" forms from a search with no results. */
export function prefillFromQuery(q: string): { customer: Record<string, string>; vehicle: Record<string, string> } {
  const trimmed = q.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (/^\d{5}-?\d{7}-?\d$/.test(trimmed)) return { customer: { cnic: trimmed }, vehicle: {} };
  if (digits.length >= 10 && digits.length === trimmed.replace(/[\s+-]/g, '').length) return { customer: { mobile: trimmed }, vehicle: {} };
  if (/\d/.test(trimmed) && /[a-z]/i.test(trimmed)) {
    const compact = trimmed.replace(/[^a-z0-9]/gi, '');
    return { customer: {}, vehicle: compact.length >= 10 ? { vin: trimmed } : { registrationNo: trimmed } };
  }
  return { customer: { fullName: trimmed }, vehicle: {} };
}
