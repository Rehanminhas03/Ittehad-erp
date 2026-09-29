import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { cn, formatNumber } from '@/shared/lib';
import { Spinner } from '@/shared/components/ui';

interface Base {
  title: string;
  loading?: boolean;
  error?: string;
  /** Optional drill-down link. */
  to?: string;
  className?: string;
}

export interface KpiWidget extends Base {
  kind: 'kpi';
  value: number | string | null | undefined;
  hint?: ReactNode;
}

export interface TableWidget<R = Record<string, unknown>> extends Base {
  kind: 'table';
  columns: { key: string; header: string; render?: (row: R) => ReactNode; align?: 'right' }[];
  rows: R[];
  empty?: string;
}

export interface ChartWidget extends Base {
  kind: 'chart';
  /** Horizontal bar chart: simple, readable, no chart library. */
  data: { label: string; value: number }[];
  format?: (v: number) => string;
}

export type DashboardWidgetProps = KpiWidget | TableWidget | ChartWidget;

const ArrowIcon = () => (
  <svg viewBox="0 0 16 16" className="size-3.5 transition-transform group-hover:translate-x-0.5" fill="none" aria-hidden>
    <path d="M3 8h10m0 0L9 4m4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The card's content; shared by the linked (Link) and plain (div) wrapper below. */
function WidgetInner(props: DashboardWidgetProps) {
  return (
    <>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium tracking-wide text-slate-500">{props.title}</h3>
        {props.to && (
          <span className="flex items-center gap-0.5 text-xs font-medium text-brand-600 opacity-0 transition-opacity group-hover:opacity-100">
            View <ArrowIcon />
          </span>
        )}
      </header>
      {props.loading ? (
        <Spinner className="size-4 text-slate-300" />
      ) : props.error ? (
        <p className="text-sm text-red-600">{props.error}</p>
      ) : (
        <Body {...props} />
      )}
    </>
  );
}

/**
 * The single building block of every role dashboard: KPI card, table or chart. Dashboards
 * are arrangements of these, each gated by the same permission system as the rest of the app.
 */
export function DashboardWidget(props: DashboardWidgetProps) {
  const className = cn('surface group flex h-full flex-col p-5', props.to && 'transition-shadow hover:shadow-md hover:ring-1 hover:ring-brand-200', props.className);
  if (props.to) {
    return (
      <Link to={props.to} className={className}>
        <WidgetInner {...props} />
      </Link>
    );
  }
  return (
    <div className={className}>
      <WidgetInner {...props} />
    </div>
  );
}

function Body(props: DashboardWidgetProps) {
  switch (props.kind) {
    case 'kpi':
      return (
        <div className="mt-auto">
          <p className="text-3xl font-semibold tracking-tight tabular-nums text-slate-900">
            {typeof props.value === 'number' ? formatNumber(props.value) : (props.value ?? '—')}
          </p>
          {props.hint && <p className="mt-1.5 text-xs text-slate-500">{props.hint}</p>}
        </div>
      );
    case 'table':
      if (!props.rows.length) return <p className="text-sm text-slate-500">{props.empty ?? 'Nothing to show.'}</p>;
      return (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              {props.columns.map((c) => (
                <th key={c.key} className={cn('pb-2 font-medium', c.align === 'right' && 'text-right')}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {props.rows.map((r, i) => (
              <tr key={i}>
                {props.columns.map((c) => (
                  <td key={c.key} className={cn('py-2 text-slate-700', c.align === 'right' && 'text-right tabular-nums')}>
                    {c.render ? c.render(r) : String(r[c.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'chart': {
      const max = Math.max(1, ...props.data.map((d) => d.value));
      if (!props.data.length) return <p className="text-sm text-slate-500">No data.</p>;
      return (
        <ul className="space-y-2.5" role="list">
          {props.data.map((d) => (
            <li key={d.label} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 text-xs sm:grid-cols-[8rem_1fr_auto]">
              <span className="truncate text-slate-600" title={d.label}>
                {d.label}
              </span>
              <span className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                <span className="block h-2 rounded-full bg-brand-500 transition-all" style={{ width: `${(d.value / max) * 100}%` }} />
              </span>
              <span className="tabular-nums font-medium text-slate-700">{props.format ? props.format(d.value) : formatNumber(d.value)}</span>
            </li>
          ))}
        </ul>
      );
    }
  }
}
