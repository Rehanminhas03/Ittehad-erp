import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { type ActivityEntry, useListMyActivityQuery, useListTeamActivityQuery, useListUsersQuery } from '@/features/admin/adminApi';
import { DateRangePicker, karachiToday, lastDays, type RangePreset, shiftDays } from '@/shared/components';
import { EmptyState, ErrorState, Input, PageHeader, Pagination, Select, Spinner } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { apiErrorMessage, cn } from '@/shared/lib';
import { type ActivityKind, describeActivity } from './describe';

const TEAM = 'core.activity.view_team';
const USERS_VIEW = 'core.users.view';
const PAGE_SIZE = 30;

const CATEGORIES = [
  { value: 'sign_in', label: 'Sign-ins & sign-outs' },
  { value: 'leads', label: 'Leads' },
  { value: 'documents', label: 'Quotations & PPF' },
  { value: 'orders', label: 'Sales orders' },
  { value: 'deliveries', label: 'Deliveries' },
  { value: 'stock', label: 'Stock' },
  { value: 'users', label: 'Users & staff' },
] as const;

const KIND_STYLE: Record<ActivityKind, { chip: string; path: string }> = {
  sign_in: { chip: 'from-[#5b8def] to-[#2a57b8]', path: 'M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8m4-3 3-3-3-3m3 3H8' },
  sign_in_problem: { chip: 'from-[#f07a6a] to-[#c0392b]', path: 'M10 3 2 17h16L10 3Zm0 5v4m0 2.5v.5' },
  lead: { chip: 'from-[#34c796] to-[#128a5f]', path: 'M7 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-5 8c.8-3 2.8-4.5 5-4.5s4.2 1.5 5 4.5m2-9h4m-2-2v4' },
  document: { chip: 'from-[#6b8ff2] to-[#3b4fc4]', path: 'M5.5 2.5h6l3.5 3.5v11.5h-9.5v-15Zm6 0V6h3.5M8 10h5M8 13h5' },
  order: { chip: 'from-[#f59a63] to-[#d9582a]', path: 'M5 2.5h7l3 3v12H5v-15Zm7 0v3h3M8 9.5h4.5M8 12.5h4.5' },
  delivery: { chip: 'from-[#8d7cf0] to-[#4a3aa7]', path: 'M2 5h10v8H2V5Zm10 3h3.5L18 11v2h-6V8ZM5 15.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm9 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z' },
  stock: { chip: 'from-[#5aa9e6] to-[#1f6fb2]', path: 'M3.5 13V9.5l2-4.5h9l2 4.5V13M3.5 13h13M3.5 13v2.5h2V13m9 0v2.5h2V13' },
  user: { chip: 'from-[#94a3b8] to-[#475569]', path: 'M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 8c.9-3.3 3.3-5 6-5s5.1 1.7 6 5' },
  other: { chip: 'from-[#94a3b8] to-[#64748b]', path: 'M4 10h12M10 4v12' },
};

/** Quick date ranges; "Custom" in the picker allows any from / to. */
const RANGES: RangePreset[] = [
  { key: 'all', label: 'All time', range: () => ({}) },
  { key: 'today', label: 'Today', range: () => ({ from: karachiToday(), to: karachiToday() }) },
  { key: 'yesterday', label: 'Yesterday', range: () => ({ from: shiftDays(karachiToday(), -1), to: shiftDays(karachiToday(), -1) }) },
  { key: '7d', label: 'Last 7 days', range: () => lastDays(7) },
  { key: '30d', label: 'Last 30 days', range: () => lastDays(30) },
  { key: 'month', label: 'This month', range: () => ({ from: `${karachiToday().slice(0, 7)}-01`, to: karachiToday() }) },
];

const karachiDay = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
const dayLabel = (day: string) => {
  const t = today();
  const y = new Date(Date.parse(t) - 86400_000).toISOString().slice(0, 10);
  if (day === t) return 'Today';
  if (day === y) return 'Yesterday';
  return new Date(`${day}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' });

/**
 * Activity log. Everyone sees their own (sign-ins and sign-outs, and every change they made);
 * managers with core.activity.view_team also get "Team activity" for their dealership, filterable
 * by person, type and date.
 */
export default function ActivityPage() {
  const perm = usePermission();
  const canTeam = perm.can([TEAM]);
  const [params, setParams] = useSearchParams();
  const view = canTeam && params.get('view') === 'team' ? 'team' : 'mine';
  const page = Number(params.get('page') ?? 1) || 1;
  const category = (params.get('category') ?? '') as (typeof CATEGORIES)[number]['value'] | '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const rangeKey = params.get('range') ?? (from || to ? 'custom' : 'all');
  const actorId = params.get('actorId') ?? '';
  const q = params.get('q') ?? '';

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Debounced person search.
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => update({ q: search || null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const common = { page, pageSize: PAGE_SIZE, category: category || undefined, from: from || undefined, to: to || undefined };
  const mine = useListMyActivityQuery(common, { skip: view !== 'mine', refetchOnMountOrArgChange: true });
  const team = useListTeamActivityQuery(
    { ...common, actorId: actorId ? Number(actorId) : undefined, q: q || undefined },
    { skip: view !== 'team', refetchOnMountOrArgChange: true },
  );
  const people = useListUsersQuery({ pageSize: 100, sort: 'fullName' }, { skip: view !== 'team' || !perm.can([USERS_VIEW]) });
  const result = view === 'team' ? team : mine;
  const items = result.data?.items ?? [];

  // Group by Pakistan calendar day, newest first (the API already sorts).
  const groups: { day: string; items: ActivityEntry[] }[] = [];
  for (const it of items) {
    const day = karachiDay(it.occurredAt);
    const g = groups[groups.length - 1];
    if (g?.day === day) g.items.push(it);
    else groups.push({ day, items: [it] });
  }

  const activeFilters = [category, from || to, actorId, view === 'team' ? q : ''].filter(Boolean).length;
  const control = '!w-auto min-w-36 flex-1 shrink-0 !rounded-xl py-2.5';

  return (
    <div>
      <PageHeader
        title="Activity"
        subtitle={view === 'team' ? 'Everything your team did: sign-ins, leads, orders, deliveries and staff changes.' : 'Everything you did: sign-ins, sign-outs and every change you made.'}
      />

      {canTeam && (
        <div className="glass-soft mb-4 inline-flex rounded-xl p-1" role="tablist" aria-label="Whose activity">
          {(['mine', 'team'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={view === v}
              onClick={() => update({ view: v === 'team' ? 'team' : null, actorId: null, q: null })}
              className={cn('rounded-lg px-4 py-1.5 text-sm font-medium transition', view === v ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
            >
              {v === 'mine' ? 'My activity' : 'Team activity'}
            </button>
          ))}
        </div>
      )}

      {/* Search across the full width (team), every filter on one row beneath it. */}
      <div className="surface mb-4 space-y-3 p-3 sm:p-4">
        {view === 'team' && (
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by person name or email"
            className="h-11 !rounded-xl !text-[15px]"
            aria-label="Search people"
          />
        )}
        <div className="scrollbar-thin -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5">
          {view === 'team' && people.data && (
            <Select value={actorId} onChange={(e) => update({ actorId: e.target.value || null })} className={cn(control, actorId && '!bg-brand-50 !ring-brand-300')} aria-label="Person">
              <option value="">Person: everyone</option>
              {people.data.items.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                  {u.isActive ? '' : ' (inactive)'}
                </option>
              ))}
            </Select>
          )}
          <Select value={category} onChange={(e) => update({ category: e.target.value || null })} className={cn(control, category && '!bg-brand-50 !ring-brand-300')} aria-label="Type">
            <option value="">Type: everything</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
          {activeFilters > 0 && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                update({ category: null, from: null, to: null, range: null, actorId: null, q: null });
              }}
              className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <DateRangePicker
        className="mb-4"
        presets={RANGES}
        value={rangeKey}
        custom={rangeKey === 'custom' ? { from, to } : undefined}
        onChange={(key, r) => update({ range: key === 'all' ? null : key, from: r.from ?? null, to: r.to ?? null })}
      />

      {result.isError ? (
        <ErrorState message={apiErrorMessage(result.error)} onRetry={result.refetch} />
      ) : result.isLoading ? (
        <div className="flex justify-center py-20 text-slate-400">
          <Spinner />
        </div>
      ) : !items.length ? (
        <div className="surface">
          <EmptyState title="No activity found" description={activeFilters ? 'Try widening the filters.' : 'Activity appears here as it happens.'} />
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.day} aria-label={dayLabel(g.day)}>
              <h2 className="mb-2 px-1 text-xs font-semibold tracking-wider text-slate-600 uppercase">{dayLabel(g.day)}</h2>
              <ol className="surface divide-y divide-slate-200/60">
                {g.items.map((it) => {
                  const d = describeActivity(it);
                  const style = KIND_STYLE[d.kind];
                  const canOpen = d.href && d.kind !== 'sign_in' && d.kind !== 'sign_in_problem' && (!d.href.startsWith('/admin') || perm.can([USERS_VIEW]));
                  return (
                    <li key={it.id} className="flex gap-3 px-4 py-3 sm:px-5">
                      <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md', style.chip)}>
                        <svg viewBox="0 0 20 20" className="size-4.5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d={style.path} />
                        </svg>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-900">
                          {view === 'team' && <span className="font-semibold">{it.actorName ?? 'Unknown user'} · </span>}
                          {canOpen ? (
                            <Link to={d.href!} className="font-medium hover:text-brand-700 hover:underline">
                              {d.title}
                            </Link>
                          ) : (
                            <span className="font-medium">{d.title}</span>
                          )}
                        </p>
                        {d.detail && <p className="mt-0.5 text-sm break-words text-slate-600">{d.detail}</p>}
                        <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-slate-500">
                          <time dateTime={it.occurredAt}>{time(it.occurredAt)}</time>
                          {it.dealershipName && <span>· {it.dealershipName}</span>}
                          {it.ip && (d.kind === 'sign_in' || d.kind === 'sign_in_problem') && <span>· IP {it.ip}</span>}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          <Pagination page={page} pageSize={PAGE_SIZE} total={result.data?.total ?? 0} onPage={(p) => update({ page: String(p) })} />
        </div>
      )}
    </div>
  );
}
