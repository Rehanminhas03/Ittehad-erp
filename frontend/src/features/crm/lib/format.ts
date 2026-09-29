/** 3520212345671 -> 35202-1234567-1 */
export function formatCnic(cnic: string | null | undefined): string {
  if (!cnic) return '—';
  return /^\d{13}$/.test(cnic) ? `${cnic.slice(0, 5)}-${cnic.slice(5, 12)}-${cnic.slice(12)}` : cnic;
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
