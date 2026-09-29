import { formatMoney, formatNumber } from '@/shared/lib';

export type ValueFormat = 'text' | 'number' | 'money' | 'percent' | 'hours';

/** Formats a dashboard value by the format the server declared for it. */
export function formatValue(v: string | number | null | undefined, format: ValueFormat): string {
  if (v === null || v === undefined || v === '') return '—';
  switch (format) {
    case 'money':
      return formatMoney(v);
    case 'percent':
      return `${Number(v).toFixed(1)}%`;
    case 'hours':
      return `${Number(v).toFixed(1)} h`;
    case 'number':
      return formatNumber(Number(v));
    default:
      return String(v);
  }
}
