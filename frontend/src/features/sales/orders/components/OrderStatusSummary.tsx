import { useSearchParams } from 'react-router';
import { cn } from '@/shared/lib';
import { useGetOrderSummaryQuery } from '../../salesApi';

/** The strip's chips: Processing (raised, not yet delivered, as the lead shows it), then each status. */
const CHIPS = [
  { key: 'processing', label: 'Processing', hint: 'Raised and not yet delivered (draft, submitted or approved)' },
  { key: 'draft', label: 'Draft', hint: 'Raised by the Admin, not yet submitted' },
  { key: 'submitted', label: 'Awaiting approval', hint: "Submitted for the Manager's approval" },
  { key: 'approved', label: 'Approved', hint: 'Approved by the Manager: the car is on its way to delivery' },
  { key: 'delivered', label: 'Delivered', hint: 'Handed over to the customer' },
  { key: 'cancelled', label: 'Cancelled', hint: 'Cancelled orders' },
] as const;

/**
 * Total orders (in your own scope) booked in the list's period and how they split, above the sales
 * orders list. Each chip filters the list: Processing by "open" orders, the others by status.
 */
export function OrderStatusSummary({ query, periodLabel }: { query: Record<string, unknown>; periodLabel: string }) {
  const [params, setParams] = useSearchParams();
  const pick = (k: string) => (typeof query[k] === 'string' && query[k] ? (query[k] as string) : undefined);
  const { data } = useGetOrderSummaryQuery({
    bookedFrom: pick('bookedFrom'),
    bookedTo: pick('bookedTo'),
    dealershipId: pick('dealershipId') ? Number(pick('dealershipId')) : undefined,
  });
  if (!data) return null;
  const active = params.get('live') === 'true' && !params.get('status') ? 'processing' : (params.get('status') ?? '');

  // Same period and filters; only the status changes.
  const choose = (key: string | null) => {
    const next = new URLSearchParams(params);
    next.delete('status');
    next.delete('live');
    next.delete('page');
    if (key === 'processing') next.set('live', 'true');
    else if (key) next.set('status', key);
    setParams(next, { replace: true });
  };

  const chip = (selected: boolean) =>
    cn(
      'flex shrink-0 items-baseline gap-1.5 rounded-xl px-3.5 py-2 text-left transition',
      selected ? 'bg-white shadow-sm ring-1 ring-brand-200' : 'hover:bg-white/60',
    );

  return (
    <div className="glass-soft scrollbar-thin mb-4 flex items-center gap-1 overflow-x-auto rounded-2xl p-1.5" aria-label="Orders by status">
      <button type="button" onClick={() => choose(null)} className={chip(!active)} aria-pressed={!active}>
        <span className="text-xl font-semibold text-slate-900 tabular-nums">{data.total.toLocaleString()}</span>
        <span className="text-sm whitespace-nowrap text-slate-600">total orders · {periodLabel}</span>
      </button>
      <span className="mx-1 h-8 w-px shrink-0 bg-slate-300/70" aria-hidden />
      {CHIPS.filter((c) => c.key === 'processing' || c.key === 'submitted' || c.key === 'approved' || (data.byStatus[c.key] ?? 0) > 0).map((c) => {
        const n = c.key === 'processing' ? data.processing : (data.byStatus[c.key] ?? 0);
        return (
          <button key={c.key} type="button" onClick={() => choose(c.key)} className={chip(active === c.key)} aria-pressed={active === c.key} title={c.hint}>
            <span className={cn('text-base font-semibold tabular-nums', c.key === 'processing' ? 'text-amber-700' : 'text-slate-900')}>{n}</span>
            <span className="text-sm whitespace-nowrap text-slate-600">{c.label}</span>
            {data.total > 0 && <span className="text-xs text-slate-500">{Math.round((n / data.total) * 100)}%</span>}
          </button>
        );
      })}
    </div>
  );
}
