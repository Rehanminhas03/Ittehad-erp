const dateFmt = new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium' });
const dateTimeFmt = new Intl.DateTimeFormat('en-PK', { dateStyle: 'medium', timeStyle: 'short' });
const moneyFmt = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 2 });
const numberFmt = new Intl.NumberFormat('en-PK');

export const formatDate = (v: string | null | undefined) => (v ? dateFmt.format(new Date(v)) : '—');
export const formatDateTime = (v: string | null | undefined) => (v ? dateTimeFmt.format(new Date(v)) : '—');
export const formatMoney = (v: string | number | null | undefined) => (v == null || v === '' ? '—' : moneyFmt.format(Number(v)));
export const formatNumber = (v: number | null | undefined) => (v == null ? '—' : numberFmt.format(v));
export const formatBool = (v: boolean | null | undefined) => (v == null ? '—' : v ? 'Yes' : 'No');

/** 'transition:approve' -> 'Transition: approve', 'role.assign' -> 'Role assign' */
export function humanize(s: string | null | undefined): string {
  if (!s) return '';
  const t = s.replace(/[._:-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
