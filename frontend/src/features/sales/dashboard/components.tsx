import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Spinner } from '@/shared/components/ui';
import { cn } from '@/shared/lib';

// ---- Icons (decorative; every tile also has a text label) ------------------------------------
const paths: Record<string, ReactNode> = {
  leads: <path d="M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm6.5 0a2.5 2.5 0 1 0 0-5M2 17c.8-3 2.8-4.5 5-4.5s4.2 1.5 5 4.5m1.5-4.3c1.8.3 3.3 1.8 4 4.3" />,
  phone: <path d="M4 3h3l1.5 4-2 1.3a9 9 0 0 0 5.2 5.2l1.3-2L17 13v3a1.5 1.5 0 0 1-1.6 1.5A14 14 0 0 1 2.5 4.6 1.5 1.5 0 0 1 4 3Z" />,
  check: <path d="M4 10.5 8 14.5 16 5.5" />,
  clock: <path d="M10 17.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Zm0-11.5v4l2.5 2" />,
  alert: <path d="M10 3 2 17h16L10 3Zm0 5v4m0 2.5v.5" />,
  order: <path d="M5 2.5h7l3 3v12H5v-15Zm7 0v3h3M8 9.5h4.5M8 12.5h4.5" />,
  car: <path d="M3.5 13V9.5l2-4.5h9l2 4.5V13M3.5 13h13M3.5 13v2.5h2V13m9 0v2.5h2V13M6 10h.5m7 0h.5" />,
  truck: <path d="M2 5h10v8H2V5Zm10 3h3.5L18 11v2h-6V8ZM5 15.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm9 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />,
  today: <path d="M3.5 5h13v11.5h-13V5Zm0 3.5h13M7 3v3.5M13 3v3.5M7 12h2" />,
};
export type TileIcon = keyof typeof paths;

const TONES = {
  blue: 'from-[#5b8def] to-[#2a57b8] shadow-[#2a57b8]/30',
  aqua: 'from-[#34c796] to-[#128a5f] shadow-[#128a5f]/30',
  orange: 'from-[#f59a63] to-[#d9582a] shadow-[#d9582a]/30',
  violet: 'from-[#8d7cf0] to-[#4a3aa7] shadow-[#4a3aa7]/30',
} as const;
export type TileTone = keyof typeof TONES;

/**
 * KPI tile: coloured icon chip, label, one big number, optional hint; links to its records.
 * `compact`: for rows of six (e.g. the track record) — small icon beside the label, number below.
 */
export function StatTile({
  label,
  value,
  hint,
  icon,
  tone,
  to,
  loading,
  compact = false,
}: {
  label: string;
  value: number | undefined;
  hint?: ReactNode;
  icon: TileIcon;
  tone: TileTone;
  to?: string;
  loading?: boolean;
  compact?: boolean;
}) {
  const number = loading ? (
    <Spinner className="mt-2 size-4 text-slate-400" />
  ) : (
    <p className={cn('leading-none font-semibold tracking-tight text-slate-900', compact ? 'text-2xl' : 'mt-0.5 text-[28px]')}>{(value ?? 0).toLocaleString()}</p>
  );
  const chip = (size: string, iconSize: string) => (
    <span className={cn('flex shrink-0 items-center justify-center bg-gradient-to-br text-white shadow-lg', size, TONES[tone])}>
      <svg viewBox="0 0 20 20" className={iconSize} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {paths[icon]}
      </svg>
    </span>
  );
  const body = compact ? (
    <>
      <div className="flex items-center gap-2">
        {chip('size-8 rounded-xl', 'size-4')}
        <p className="text-[13px] leading-tight font-medium text-slate-600">{label}</p>
      </div>
      {number}
      {hint && <p className="truncate text-xs text-slate-500">{hint}</p>}
    </>
  ) : (
    <>
      {chip('size-11 rounded-2xl', 'size-5')}
      <div className="min-w-0">
        <p className="text-[13px] leading-snug font-medium text-slate-600">{label}</p>
        {number}
        {hint && <p className="mt-1.5 text-xs leading-snug text-slate-500">{hint}</p>}
      </div>
    </>
  );
  const cls = compact ? 'surface flex min-w-0 flex-col gap-2 p-3.5' : 'surface flex items-center gap-4 p-4 sm:p-5';
  return to ? (
    <Link to={to} className={cn(cls, 'transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none')}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A dashboard card: title, optional subtitle and "View all" link. */
export function Panel({
  title,
  subtitle,
  to,
  toLabel = 'View all',
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  to?: string;
  toLabel?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('surface p-4 sm:p-5', className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {to && (
          <Link to={to} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50">
            {toLabel} →
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

export interface RecordColumn<R> {
  header: string;
  render: (row: R) => ReactNode;
  className?: string;
  /** Hide on small screens to keep the table readable on phones. */
  hideOnMobile?: boolean;
}

/** Latest records, each row opening the record. Scrolls sideways on narrow screens if needed. */
export function RecordsTable<R extends { id: number }>({
  rows,
  columns,
  href,
  loading,
  empty,
}: {
  rows: R[] | undefined;
  columns: RecordColumn<R>[];
  href: (row: R) => string;
  loading?: boolean;
  empty: string;
}) {
  if (loading) return <Spinner className="mx-auto my-8 size-5 text-slate-400" />;
  if (!rows?.length) return <p className="py-8 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <div className="-mx-4 overflow-x-auto sm:-mx-5">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200/80 text-left text-xs font-medium text-slate-500">
            {columns.map((c) => (
              <th key={c.header} scope="col" className={cn('px-4 py-2 font-medium first:pl-4 sm:first:pl-5 last:pr-4 sm:last:pr-5', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200/60">
          {rows.map((r) => (
            <tr key={r.id} className="group">
              {columns.map((c, i) => (
                <td
                  key={c.header}
                  className={cn('px-4 py-2.5 whitespace-nowrap first:pl-4 sm:first:pl-5 last:pr-4 sm:last:pr-5', c.hideOnMobile && 'hidden md:table-cell', c.className)}
                >
                  {i === 0 ? (
                    <Link to={href(r)} className="font-medium text-slate-900 group-hover:text-brand-700">
                      {c.render(r)}
                    </Link>
                  ) : (
                    c.render(r)
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
