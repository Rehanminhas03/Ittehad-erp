import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { EntityViewConfig } from '@/shared/entity';
import { usePermission } from '@/shared/hooks';
import { apiErrorMessage, cn } from '@/shared/lib';
import { DateRangePicker, LIST_RANGES as RANGES, rangeLabel } from '../DateRangePicker';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  PageHeader,
  Pagination,
  Select,
  Spinner,
} from '@/shared/components/ui';

const PAGE_SIZE = 25;

/** Options of a filter loaded from the API (its own component so the hook runs unconditionally). */
function RemoteOptions({ useOptions }: { useOptions: () => { value: string; label: string }[] }) {
  return (
    <>
      {useOptions().map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </>
  );
}

/** How many dealerships the user can see this entity in (a dealership filter needs at least two). */
function viewDealershipsCount<T extends { id: number }>(config: EntityViewConfig<T>, perm: ReturnType<typeof usePermission>) {
  return new Set(config.permissions.view.flatMap((c) => perm.dealershipsFor(c)).map((d) => d.id)).size;
}

/**
 * Config-driven list screen: server-side pagination, search, sort and filters, all kept in the
 * URL. The server returns only rows inside the caller's scope; this component never filters.
 */
export function EntityListView<T extends { id: number }>({ config }: { config: EntityViewConfig<T> }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const perm = usePermission();
  const { list } = config;

  const page = Number(params.get('page') ?? 1) || 1;
  const sort = params.get('sort') ?? list.defaultSort;
  const q = params.get('q') ?? '';
  const filterValues = Object.fromEntries((list.filters ?? []).map((f) => [f.param, params.get(f.param) ?? '']));
  // Date filter: a quick range (re-evaluated, so "today" stays today) or custom dates from the URL.
  const dr = list.dateRange;
  const rangeKey = dr ? (params.get('range') ?? (params.get(dr.fromParam) ? 'custom' : (dr.defaultPreset ?? 'all'))) : 'all';
  const dateRange = !dr
    ? {}
    : rangeKey === 'custom'
      ? { from: params.get(dr.fromParam) ?? undefined, to: params.get(dr.toParam) ?? undefined }
      : (RANGES.find((r) => r.key === rangeKey) ?? RANGES[RANGES.length - 1]!).range();

  // Debounced search box -> URL
  const [search, setSearch] = useState(q);
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => update({ q: search || null, page: null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function update(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  }

  const queryArg = useMemo(() => {
    const arg: Record<string, unknown> = { page, pageSize: PAGE_SIZE, sort };
    if (q) arg.q = q;
    for (const [k, v] of Object.entries(filterValues)) if (v) arg[k] = v;
    if (dr && dateRange.from) arg[dr.fromParam] = dateRange.from;
    if (dr && dateRange.to) arg[dr.toParam] = dateRange.to;
    return arg;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sort, q, JSON.stringify(filterValues), dateRange.from, dateRange.to]);

  // "Last 30 days", "All time", or the custom dates: what the list (and its header) covers.
  const periodLabel =
    rangeKey === 'custom'
      ? dateRange.from && dateRange.to
        ? rangeLabel({ from: dateRange.from, to: dateRange.to })
        : 'custom dates'
      : (RANGES.find((r) => r.key === rangeKey) ?? RANGES[RANGES.length - 1]!).label.toLowerCase();

  const { data, isLoading, isFetching, isError, error, refetch } = config.api.useList(queryArg);
  const canCreate = !!config.permissions.create && (!!config.api.create || !!list.createPath) && perm.can(config.permissions.create);

  const columns = list.columns.filter((c) => !c.visible || c.visible(perm));
  // A dealership filter is pointless for someone who works at only one dealership.
  const visibleFilters = (list.filters ?? []).filter(
    (f) => f.type !== 'hidden' && (f.type !== 'dealership' || viewDealershipsCount(config, perm) > 1) && (!f.visible || f.visible(perm)),
  );
  // Filters set by a link (no dropdown), shown as removable chips.
  const linkFilters = (list.filters ?? []).filter((f) => f.type === 'hidden' && filterValues[f.param]);
  const activeFilters =
    visibleFilters.filter((f) => filterValues[f.param]).length + linkFilters.length + (dr && rangeKey !== (dr.defaultPreset ?? 'all') ? 1 : 0);
  const toggleSort = (key: string) => update({ sort: sort === key ? `-${key}` : key, page: null });
  // Dealerships where the user can see any of this entity's records (all or own).
  const viewDealerships = [...new Map(config.permissions.view.flatMap((c) => perm.dealershipsFor(c)).map((d) => [d.id, d])).values()];

  return (
    <div>
      <PageHeader
        title={config.plural}
        actions={
          canCreate && (
            <Link to={list.createPath ?? `${config.basePath}/new`}>
              <Button>
                <PlusIcon />
                {list.createLabel ?? `New ${config.singular.toLowerCase()}`}
              </Button>
            </Link>
          )
        }
      />

      {list.header?.({ query: queryArg, periodLabel })}

      {/* Search across the full width; every filter on one row beneath it (scrolls sideways on narrow phones).
          Raised above the table (z-20): glass panels are separate layers, and the date pop-up must open over the table, not under it. */}
      <div className="surface relative z-20 mb-4 space-y-3 p-3 sm:p-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-slate-400" />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={list.searchPlaceholder ?? 'Search…'}
            className="h-11 !rounded-xl pr-10 pl-10 !text-[15px]"
            aria-label="Search"
          />
          {isFetching && !isLoading && <Spinner className="absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-slate-400" />}
        </div>
        {visibleFilters.length > 0 && (
          <div className="scrollbar-thin -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-0.5">
            {visibleFilters.map((f) => (
              <Select
                key={f.param}
                value={filterValues[f.param]}
                onChange={(e) => update({ [f.param]: e.target.value || null, page: null })}
                className={cn(
                  '!w-auto min-w-36 flex-1 shrink-0 !rounded-xl py-2.5',
                  filterValues[f.param] && '!bg-brand-50 font-medium text-brand-800 !ring-brand-300',
                )}
                aria-label={f.label}
              >
                <option value="">{f.label}: all</option>
                {f.type === 'boolean' && (
                  <>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </>
                )}
                {f.type === 'dealership' &&
                  viewDealerships.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                {f.type === 'select' && f.useOptions && <RemoteOptions useOptions={f.useOptions} />}
                {f.type === 'select' &&
                  f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
              </Select>
            ))}
            {activeFilters > 0 && (
              <button
                type="button"
                onClick={() => update({ ...Object.fromEntries((list.filters ?? []).map((f) => [f.param, null])), ...(dr ? { range: null, [dr.fromParam]: null, [dr.toParam]: null } : {}), page: null })}
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
              >
                Clear
              </button>
            )}
          </div>
        )}
        {linkFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" aria-label="Also filtered by">
            {linkFilters.map((f) => (
              <span key={f.param} className="inline-flex items-center gap-1 rounded-full bg-brand-50 py-1 pr-1 pl-3 text-sm font-medium text-brand-800 ring-1 ring-brand-200">
                {f.chip ? f.chip(filterValues[f.param]!) : f.label}
                <button
                  type="button"
                  onClick={() => update({ [f.param]: null, page: null })}
                  className="rounded-full px-1.5 text-brand-600 hover:bg-brand-100"
                  aria-label={`Remove filter: ${f.label}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {dr && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-600">{dr.label}</span>
            <DateRangePicker
              presets={RANGES}
              value={rangeKey}
              custom={rangeKey === 'custom' ? dateRange : undefined}
              onChange={(key, r) =>
                update({
                  range: key === (dr.defaultPreset ?? 'all') ? null : key,
                  [dr.fromParam]: key === 'custom' ? (r.from ?? null) : null,
                  [dr.toParam]: key === 'custom' ? (r.to ?? null) : null,
                  page: null,
                })
              }
            />
          </div>
        )}
      </div>

      <div className="surface overflow-hidden">
        {isError ? (
          <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
        ) : isLoading ? (
          <div className="flex justify-center py-20 text-slate-400">
            <Spinner />
          </div>
        ) : !data?.items.length ? (
          <div>
            <EmptyState
              title={`No ${config.plural.toLowerCase()} found`}
              description={
                dr && rangeKey !== 'all'
                  ? `Nothing with ${dr.label.toLowerCase()} ${rangeKey === 'custom' ? rangeLabel(dateRange) : (RANGES.find((r) => r.key === rangeKey)?.label.toLowerCase() ?? '')}.`
                  : q
                    ? 'Try a different search.'
                    : undefined
              }
            />
            {dr && rangeKey !== 'all' && (
              <div className="-mt-6 pb-8 text-center">
                <button type="button" onClick={() => update({ range: 'all', [dr.fromParam]: null, [dr.toParam]: null, page: null })} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                  Show all time
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-left text-xs font-medium tracking-wide text-slate-500">
                    {columns.map((c) => (
                      <th key={c.key} className={cn('px-4 py-2.5 font-medium whitespace-nowrap', c.className)} scope="col">
                        {c.sortKey ? (
                          <button type="button" onClick={() => toggleSort(c.sortKey!)} className="inline-flex items-center gap-1 hover:text-slate-800">
                            {c.header}
                            {sort.replace(/^-/, '') === c.sortKey && (
                              <SortIcon down={sort.startsWith('-')} className="size-3 text-brand-600" />
                            )}
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.items.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer transition-colors hover:bg-brand-50/40"
                      onClick={() => navigate(`${config.basePath}/${row.id}`)}
                    >
                      {columns.map((c) => (
                        <td key={c.key} className={cn('px-4 py-3 whitespace-nowrap text-slate-700', c.className)}>
                          {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 px-4">
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => update({ page: p > 1 ? String(p) : null })} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden>
      <path d="M10 4.5v11M4.5 10h11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden>
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.75" />
      <path d="m17 17-3.5-3.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function SortIcon({ down, className }: { down: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 12 12" className={cn(className, 'transition-transform', down && 'rotate-180')} fill="none" aria-hidden>
      <path d="M6 2.5v7M2.5 6 6 9.5 9.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
