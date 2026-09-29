import { useSearchParams } from 'react-router';
import { usePermission } from '@/shared/hooks';
import { cn, humanize } from '@/shared/lib';
import { LEAD_STATES, showsVisited } from '../../../permissions';
import { type GetLeadSummaryApiArg, useGetLeadSummaryQuery } from '../../../salesApi';

/**
 * Total leads (in your own scope) and how they split by status, above the leads list. The numbers
 * follow the list's period and filters (Activity dates, salesperson, source, sent to AM), so "Today"
 * shows today's leads and "Last 30 days" the last 30 days. Each chip filters the list by status.
 */
export function LeadStatusSummary({ query, periodLabel }: { query: Record<string, unknown>; periodLabel: string }) {
  const [params, setParams] = useSearchParams();
  const perm = usePermission();
  const pick = (k: string) => (typeof query[k] === 'string' && query[k] ? (query[k] as string) : undefined);
  const arg: GetLeadSummaryApiArg = {
    activityFrom: pick('activityFrom'),
    activityTo: pick('activityTo'),
    ownerId: pick('ownerId') ? Number(pick('ownerId')) : undefined,
    source: pick('source') as GetLeadSummaryApiArg['source'],
    escalated: pick('escalated') as GetLeadSummaryApiArg['escalated'],
  };
  const { data: leads } = useGetLeadSummaryQuery(arg);
  if (!leads) return null;
  const active = params.get('status') ?? '';

  // Same period and filters; only the status changes.
  const choose = (status: string | null) => {
    const next = new URLSearchParams(params);
    if (status) next.set('status', status);
    else next.delete('status');
    next.delete('page');
    setParams(next, { replace: true });
  };

  const chip = (selected: boolean) =>
    cn(
      'flex shrink-0 items-baseline gap-1.5 rounded-xl px-3.5 py-2 text-left transition',
      selected ? 'bg-white shadow-sm ring-1 ring-brand-200' : 'hover:bg-white/60',
    );
  const states = LEAD_STATES.filter(
    (s) => (s !== 'visited' || showsVisited(perm)) && ((leads.byStatus[s] ?? 0) > 0 || !['exhausted', 'completed'].includes(s)),
  );

  return (
    <div className="glass-soft scrollbar-thin mb-4 flex items-center gap-1 overflow-x-auto rounded-2xl p-1.5" aria-label="Leads by status">
      <button type="button" onClick={() => choose(null)} className={chip(!active)} aria-pressed={!active}>
        <span className="text-xl font-semibold text-slate-900 tabular-nums">{leads.total.toLocaleString()}</span>
        <span className="text-sm whitespace-nowrap text-slate-600">total leads · {periodLabel}</span>
      </button>
      <span className="mx-1 h-8 w-px shrink-0 bg-slate-300/70" aria-hidden />
      {states.map((s) => {
        const n = leads.byStatus[s] ?? 0;
        return (
          <button key={s} type="button" onClick={() => choose(s)} className={chip(active === s)} aria-pressed={active === s} title={`${n} of ${leads.total} leads`}>
            <span className="text-base font-semibold text-slate-900 tabular-nums">{n}</span>
            <span className="text-sm whitespace-nowrap text-slate-600">{humanize(s)}</span>
            {leads.total > 0 && <span className="text-xs text-slate-500">{Math.round((n / leads.total) * 100)}%</span>}
          </button>
        );
      })}
    </div>
  );
}
