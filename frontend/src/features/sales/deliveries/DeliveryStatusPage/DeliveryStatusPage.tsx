import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { DateRangePicker, karachiToday, LIST_RANGES, rangeLabel, shiftDays } from '@/shared/components';
import { EmptyState, ErrorState, Input, PageHeader, Pagination, Select, Spinner } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { apiErrorMessage, cn, formatDate } from '@/shared/lib';
import { DeliveryNoteButton } from '../../documents/DocumentPreview';
import { formatExpectedDelivery } from '../../orders/components/ExpectedDelivery';
import { P } from '../../permissions';
import { type DeliveryPipeline, useGetDeliveryPipelineQuery } from '../../salesApi';

type Row = DeliveryPipeline['items'][number];
type Stage = DeliveryPipeline['stage'];

const STAGES: { key: Stage; label: string; hint: string }[] = [
  { key: 'waiting', label: 'Waiting for car', hint: 'Booked; the car is not dispatched yet (oldest first)' },
  { key: 'in_transit', label: 'In transit', hint: 'Dispatched from the plant / head office' },
  { key: 'received', label: 'Received', hint: 'At the dealership; schedule the delivery' },
  { key: 'scheduled', label: 'Scheduled', hint: 'Delivery date set' },
  { key: 'delivered', label: 'Delivered', hint: 'Handed over (latest first)' },
];
const PAGE_SIZE = 25;
const DEFAULT_RANGE = '30d';

/** Scheduled deliveries by day: overdue, today, tomorrow, the next 7 days, later. */
function scheduleGroups(rows: Row[]) {
  const today = karachiToday();
  const tomorrow = shiftDays(today, 1);
  const week = shiftDays(today, 7);
  const groups: { key: string; label: string; rows: Row[]; urgent?: boolean }[] = [
    { key: 'overdue', label: 'Overdue', rows: [], urgent: true },
    { key: 'today', label: 'Today', rows: [] },
    { key: 'tomorrow', label: 'Tomorrow', rows: [] },
    { key: 'week', label: 'This week', rows: [] },
    { key: 'later', label: 'Later', rows: [] },
  ];
  for (const r of rows) {
    const d = r.scheduledDate ?? '';
    const g = d < today ? 0 : d === today ? 1 : d === tomorrow ? 2 : d <= week ? 3 : 4;
    groups[g]!.rows.push(r);
  }
  return groups.filter((g) => g.rows.length);
}

/**
 * Deliveries: every booked order until its car is delivered, one tab per stage with a count. The
 * Delivery Team, Sales Admin, Assistant Manager and Manager see their dealerships' orders (a row
 * opens the order); a salesperson sees their own customers' cars (a row opens the lead). The
 * Scheduled tab is grouped by day; "Overdue only" shows orders past their expected delivery.
 */
export default function DeliveryStatusPage() {
  const perm = usePermission();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const stage = (STAGES.find((s) => s.key === params.get('stage'))?.key ?? 'waiting') as Stage;
  const dealershipId = Number(params.get('dealershipId')) || undefined;
  const overdue = params.get('overdue') === 'true';
  const page = Number(params.get('page')) || 1;
  const q = params.get('q') ?? '';
  const [search, setSearch] = useState(q);
  const staffDealers = [P.ordersViewAll, P.deliveriesViewAll].flatMap((c) => perm.dealershipsFor(c)).filter((d, i, all) => all.findIndex((x) => x.id === d.id) === i);
  const staff = staffDealers.length > 0;
  // The period: booked then (delivered cars: delivered then). The last 30 days unless another range,
  // or custom dates, are picked; links for work to do (dashboard, action needed) open "All time".
  const rangeKey = params.get('range') ?? (params.get('from') ? 'custom' : DEFAULT_RANGE);
  const period =
    rangeKey === 'custom'
      ? { from: params.get('from') ?? undefined, to: params.get('to') ?? undefined }
      : (LIST_RANGES.find((r) => r.key === rangeKey) ?? LIST_RANGES[LIST_RANGES.length - 1]!).range();
  const periodText =
    rangeKey === 'custom' ? rangeLabel({ from: period.from, to: period.to }) || 'the chosen dates' : (LIST_RANGES.find((r) => r.key === rangeKey)?.label.toLowerCase() ?? '');

  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  useEffect(() => setSearch(q), [q]);
  useEffect(() => {
    if (search === q) return;
    const t = setTimeout(() => update({ q: search || null, page: null }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const { data, isLoading, isFetching, error, refetch } = useGetDeliveryPipelineQuery({
    stage,
    dealershipId,
    q: q || undefined,
    overdue: overdue ? 'true' : undefined,
    from: period.from,
    to: period.to,
    page,
    pageSize: PAGE_SIZE,
  });
  const today = karachiToday();
  const open = (r: Row) => {
    if (perm.canIn(P.ordersViewAll, r.dealershipId)) navigate(`/sales/orders/${r.orderId}`);
    else if (r.leadId) navigate(`/sales/leads/${r.leadId}`);
  };
  // The delivery note: for scheduled and delivered cars, to whoever can open deliveries.
  const canNote = (stage === 'scheduled' || stage === 'delivered') && perm.can([P.deliveriesViewAll, P.deliveriesViewOwn]);
  const late = (r: Row) => !!r.expectedDeliveryDate && r.expectedDeliveryDate < today && r.stage !== 'delivered' && r.stage !== 'received' && r.stage !== 'scheduled';

  const table = (rows: Row[]) => (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-xs tracking-wide text-slate-500 uppercase">
          <tr>
            <th className="px-3 py-2 text-left">Order</th>
            <th className="px-3 py-2 text-left">Customer</th>
            <th className="px-3 py-2 text-left">Vehicle</th>
            {staffDealers.length > 1 && !dealershipId && <th className="px-3 py-2 text-left">Dealership</th>}
            {staff && <th className="px-3 py-2 text-left">Salesperson</th>}
            <th className="px-3 py-2 text-left">Chassis</th>
            <th className="px-3 py-2 text-left">Expected delivery</th>
            <th className="px-3 py-2 text-left">{stage === 'scheduled' ? 'Delivery date' : stage === 'delivered' ? 'Delivered on' : 'Approved'}</th>
            {canNote && <th className="px-3 py-2" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.orderId} onClick={() => open(r)} className="cursor-pointer hover:bg-brand-50/40">
              <td className="px-3 py-2 font-mono text-xs text-slate-800">
                {r.orderNo}
                {r.pboNo && <div className="text-slate-500">PBO {r.pboNo}</div>}
              </td>
              <td className="px-3 py-2 font-medium text-slate-900">{r.customerName ?? '—'}</td>
              <td className="px-3 py-2 text-slate-700">
                {[r.model, r.variant].filter(Boolean).join(' · ') || '—'}
                {r.color && <span className="text-slate-500"> · {r.color}</span>}
                {r.vehicleStatus === 'hold' && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">On hold</span>}
              </td>
              {staffDealers.length > 1 && !dealershipId && <td className="px-3 py-2 text-slate-600">{r.dealershipName}</td>}
              {staff && <td className="px-3 py-2 text-slate-600">{r.salespersonName ?? '—'}</td>}
              <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.chassisNo ?? <span className="text-slate-400">No car yet</span>}</td>
              <td className={cn('px-3 py-2', late(r) ? 'font-semibold text-red-700' : 'text-slate-700')}>
                {formatExpectedDelivery(r.expectedDeliveryDate, r.expectedDeliveryByMonth) ?? '—'}
                {late(r) && <span className="ml-1 text-xs">(overdue)</span>}
              </td>
              <td className="px-3 py-2 text-slate-700">
                {stage === 'scheduled'
                  ? formatDate(r.scheduledDate)
                  : stage === 'delivered'
                    ? formatDate(r.deliveredOn)
                    : r.approvedAt
                      ? formatDate(r.approvedAt)
                      : <span className="text-amber-700">{r.orderStatus === 'draft' ? 'Draft' : 'Awaiting approval'}</span>}
              </td>
              {canNote && <td className="px-3 py-2 text-right">{r.deliveryId && <DeliveryNoteButton deliveryId={r.deliveryId} label="Note" />}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Deliveries"
        subtitle={staff ? 'Every booked order until its car is delivered, by stage.' : "Your customers' cars: where each one is, from booking to delivery."}
      />
      <div className="surface mb-4 space-y-3 p-4">
        <div role="tablist" className="flex flex-wrap gap-1.5">
          {STAGES.map((s) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={s.key === stage}
              title={s.hint}
              onClick={() => update({ stage: s.key === 'waiting' ? null : s.key, page: null, overdue: null })}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition',
                s.key === stage ? 'bg-brand-600 text-white shadow-sm' : 'bg-white/70 text-slate-700 ring-1 ring-slate-200 hover:bg-white',
              )}
            >
              {s.label}
              <span className={cn('rounded-full px-2 py-0.5 text-xs tabular-nums', s.key === stage ? 'bg-white/20' : 'bg-slate-100 text-slate-600')}>{data?.counts[s.key] ?? '·'}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order or PBO no., customer, chassis or engine no." className="w-full sm:max-w-sm" aria-label="Search" />
          {staffDealers.length > 1 && (
            <Select value={dealershipId ?? ''} onChange={(e) => update({ dealershipId: e.target.value || null, page: null })} className="w-auto" aria-label="Dealership">
              <option value="">All dealerships</option>
              {staffDealers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          )}
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-600" title="Booked in this period; on the Delivered tab, delivered in it">
              {stage === 'delivered' ? 'Delivered' : 'Booked'}
            </span>
            <DateRangePicker
              presets={LIST_RANGES}
              value={rangeKey}
              custom={rangeKey === 'custom' ? period : undefined}
              onChange={(key, r) =>
                update({
                  range: key === DEFAULT_RANGE ? null : key,
                  from: key === 'custom' ? (r.from ?? null) : null,
                  to: key === 'custom' ? (r.to ?? null) : null,
                  page: null,
                })
              }
            />
          </div>
          {(stage === 'waiting' || stage === 'in_transit') && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={overdue} onChange={(e) => update({ overdue: e.target.checked ? 'true' : null, page: null })} />
              Overdue only (past the expected delivery)
            </label>
          )}
          {isFetching && <Spinner className="size-4 text-slate-400" />}
        </div>
      </div>

      {error ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : isLoading || !data ? (
        <div className="flex justify-center py-12">
          <Spinner className="size-6 text-slate-400" />
        </div>
      ) : !data.items.length ? (
        <div className="surface p-8">
          <EmptyState
            title={overdue ? 'Nothing overdue here' : `No orders ${STAGES.find((s) => s.key === stage)!.label.toLowerCase()}`}
            description={rangeKey === 'all' ? STAGES.find((s) => s.key === stage)!.hint : `${stage === 'delivered' ? 'Delivered' : 'Booked'}: ${periodText}.`}
          />
          {rangeKey !== 'all' && (
            <div className="mt-2 flex justify-center">
              <button type="button" onClick={() => update({ range: 'all', from: null, to: null, page: null })} className="rounded-lg px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">
                Show all time
              </button>
            </div>
          )}
        </div>
      ) : stage === 'scheduled' ? (
        <div className="space-y-4">
          {scheduleGroups(data.items).map((g) => (
            <div key={g.key} className="surface p-4">
              <h2 className={cn('mb-2 text-sm font-semibold', g.urgent ? 'text-red-700' : 'text-slate-900')}>
                {g.label} <span className="font-normal text-slate-500">({g.rows.length})</span>
              </h2>
              {table(g.rows)}
            </div>
          ))}
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => update({ page: p === 1 ? null : String(p) })} />
        </div>
      ) : (
        <div className="surface p-4">
          {table(data.items)}
          <div className="mt-3">
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => update({ page: p === 1 ? null : String(p) })} />
          </div>
        </div>
      )}
    </div>
  );
}
