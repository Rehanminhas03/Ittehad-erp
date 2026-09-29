import { useState } from 'react';
import { DateRangePicker, type DateRange, lastDays, rangeLabel } from '@/shared/components';
import { Select, StatusBadge } from '@/shared/components/ui';
import { useAuth, usePermission } from '@/shared/hooks';
import { formatDate, formatMoney, humanize } from '@/shared/lib';
import { labelOf, LEAD_SOURCES, LEAD_STATES, ORDER_STATES, P, showsVisited } from '../permissions';
import {
  type Lead,
  type SalesOrder,
  useGetSalesDashboardQuery,
  useGetSalesTeamReportQuery,
  useListLeadsQuery,
  useListSalesOrdersQuery,
} from '../salesApi';
import { BarList } from './charts/BarList';
import { TrendChart } from './charts/TrendChart';
import { Panel, RecordsTable, StatTile, type TileIcon, type TileTone } from './components';
import { MonthRecord } from './MonthRecord';
import { useSalespersonOptions } from '../team/useSalespersonOptions';
import { ActionNeeded } from '../actions';

// Validated categorical slots (dataviz reference palette): slot 1 blue, slot 2 orange.
const SERIES_LOGGED = { key: 'logged', label: 'Leads logged', color: '#2a78d6' };
const SERIES_CONVERTED = { key: 'converted', label: 'Converted', color: '#eb6834' };

/** Quick ranges; "Custom" in the picker allows any from / to (up to 92 days). */
const PERIODS = [7, 14, 30].map((n) => ({ key: String(n), label: `${n} days`, range: () => lastDays(n) }));
const STOCK_STAGES = ['available', 'booked', 'in_transit', 'received', 'ready_for_delivery', 'hold'] as const;

type Layout = 'manager' | 'admin' | 'delivery' | 'am' | 'sales';

/** Which home dashboard fits the user, decided from permissions (never role names). */
function useLayout(): Layout {
  const perm = usePermission();
  if (perm.can([P.reportsView])) return 'manager';
  if (perm.can([P.ordersCreate])) return 'admin';
  if (perm.can([P.ordersAllocate])) return 'delivery';
  if (perm.can([P.leadsConvertEscalated])) return 'am';
  return 'sales';
}

const SUBTITLES: Record<Layout, string> = {
  manager: 'Your sales department at a glance.',
  admin: 'Converted leads waiting for a sales order, and your orders.',
  delivery: 'Open stock, the delivery queue and hand-overs.',
  am: "Your dealership's leads, and duplicate customers sent to you.",
  sales: 'Your leads, follow-ups and conversions.',
};

const greeting = () => {
  const h = Number(new Date().toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Karachi' }));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};


const leadColumns = [
  { header: 'Customer', render: (l: Lead) => l.prospectName },
  { header: 'Phone', render: (l: Lead) => <span className="text-slate-600 tabular-nums">{l.prospectMobile}</span> },
  { header: 'Interested in', render: (l: Lead) => <span className="text-slate-600">{l.modelName ?? '—'}</span>, hideOnMobile: true },
  { header: 'Source', render: (l: Lead) => <span className="text-slate-600">{labelOf(LEAD_SOURCES, l.source)}</span>, hideOnMobile: true },
  { header: 'Status', render: (l: Lead) => <StatusBadge status={l.status} /> },
  { header: 'Logged', render: (l: Lead) => <span className="text-slate-500">{formatDate(l.createdAt)}</span>, hideOnMobile: true },
];

const orderColumns = [
  { header: 'Order', render: (o: SalesOrder) => <span className="font-mono text-xs">{o.orderNo}</span> },
  { header: 'Customer', render: (o: SalesOrder) => o.customerName },
  { header: 'Model', render: (o: SalesOrder) => <span className="text-slate-600">{o.modelName}</span>, hideOnMobile: true },
  { header: 'Vehicle', render: (o: SalesOrder) => (o.vehicleStatus ? <StatusBadge status={o.vehicleStatus} /> : <span className="text-amber-700">Pending</span>) },
  { header: 'Total', render: (o: SalesOrder) => <span className="tabular-nums">{formatMoney(o.totalAmount)}</span>, className: 'text-right', hideOnMobile: true },
  { header: 'Status', render: (o: SalesOrder) => <StatusBadge status={o.status} /> },
];

/**
 * The home page of every sales role, in glass: four KPI tiles, a trend chart, a breakdown and the
 * latest records. All figures come from the server within the user's own scope.
 */
export function SalesDashboard() {
  const { user } = useAuth();
  const perm = usePermission();
  const layout = useLayout();
  const [period, setPeriod] = useState<{ key: string; range: DateRange }>({ key: '14', range: lastDays(14) });
  const custom = period.key === 'custom';
  // Team views (Manager, Assistant Manager, Admin): every figure and list for one salesperson.
  const personOptions = useSalespersonOptions();
  const canPickPerson = (layout === 'manager' || layout === 'am' || layout === 'admin') && personOptions.length > 0;
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const person = canPickPerson ? ownerId : null;
  const personName = personOptions.find((o) => Number(o.value) === person)?.label;
  const { data, isLoading, isFetching } = useGetSalesDashboardQuery({
    ...(custom ? { from: period.range.from, to: period.range.to } : { days: Number(period.key) }),
    ownerId: person ?? undefined,
  });

  const reportDealership = perm.dealershipsFor(P.reportsView)[0]?.id;
  const team = useGetSalesTeamReportQuery(
    { dealershipId: reportDealership!, from: data?.period.from, to: data?.period.to },
    { skip: layout !== 'manager' || !reportDealership || !data },
  );

  const canLeads = !!data?.leads;
  const recordsLeads = useListLeadsQuery(
    { ...(layout === 'admin' ? { pageSize: 6, status: 'converted', sort: '-convertedAt' } : layout === 'am' ? { pageSize: 6, escalated: 'true' } : { pageSize: 6 }), ownerId: person ?? undefined },
    { skip: layout === 'delivery' || layout === 'manager' || (!!data && !canLeads) },
  );
  const recordsOrders = useListSalesOrdersQuery(
    { ...(layout === 'delivery' ? { pageSize: 6, live: 'true' as const, sort: 'createdAt' } : { pageSize: 6, awaitingApproval: 'true' as const, sort: 'createdAt' }), salespersonId: person ?? undefined },
    { skip: layout !== 'delivery' && layout !== 'manager' },
  );

  const leads = data?.leads;
  const orders = data?.orders;
  const stock = data?.stock;
  const convertedInPeriod = leads?.daily.reduce((n, d) => n + d.converted, 0) ?? 0;
  const loggedInPeriod = leads?.daily.reduce((n, d) => n + d.logged, 0) ?? 0;
  const periodLabel = custom ? rangeLabel(period.range) : `last ${period.key} days`;

  // Each tile opens exactly what it counts: same period, same person.
  const who = person ? `&ownerId=${person}` : '';
  const todayPk = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
  const inPeriod = data ? `convertedFrom=${data.period.from}&convertedTo=${data.period.to}` : '';
  const links = {
    open: `/sales/leads?open=true&range=all${who}`,
    today: `/sales/leads?createdOn=${todayPk}&range=all${who}`,
    converted: `/sales/leads?${inPeriod}&range=all${who}`,
    delivered: data ? `/sales/deliveries?status=delivered&deliveredFrom=${data.period.from}&deliveredTo=${data.period.to}` : '/sales/deliveries?status=delivered',
  };

  type Tile = { label: string; value: number | undefined; icon: TileIcon; tone: TileTone; to?: string; hint?: string };
  const byLayout: Record<Layout, Tile[]> = {
    sales: [
      { label: 'Open leads', value: leads?.open, icon: 'leads', tone: 'blue', to: links.open, hint: `of ${leads?.total ?? 0} total leads` },
      { label: 'Follow-ups today', value: leads?.myFollowUpsToday, icon: 'phone', tone: 'aqua', hint: 'Recorded by you' },
      { label: 'Converted', value: convertedInPeriod, icon: 'check', tone: 'orange', to: links.converted, hint: periodLabel },
      { label: 'Processing', value: leads?.byStatus.processing ?? 0, icon: 'clock', tone: 'violet', to: '/sales/leads?status=processing&range=all', hint: 'Sales order raised' },
    ],
    am: [
      { label: 'Leads today', value: leads?.loggedToday, icon: 'today', tone: 'blue', to: links.today, hint: 'Logged today' },
      { label: 'Open leads', value: leads?.open, icon: 'leads', tone: 'aqua', to: links.open, hint: `of ${leads?.total ?? 0} total leads` },
      { label: 'Duplicate customers', value: leads?.escalatedOpen, icon: 'alert', tone: 'orange', to: '/sales/leads?escalated=true&open=true&range=all', hint: 'Sent to you by salespeople' },
      { label: 'Converted', value: convertedInPeriod, icon: 'check', tone: 'violet', to: links.converted, hint: periodLabel },
    ],
    manager: [
      { label: 'Leads today', value: leads?.loggedToday, icon: 'today', tone: 'blue', to: links.today, hint: 'Logged today' },
      { label: 'Open leads', value: leads?.open, icon: 'leads', tone: 'aqua', to: links.open, hint: `of ${leads?.total ?? 0} total leads` },
      { label: 'Awaiting your approval', value: (orders?.byStatus.submitted ?? 0) + (orders?.byStatus.draft ?? 0), icon: 'order', tone: 'orange', to: '/sales/orders?awaitingApproval=true', hint: 'Draft or submitted' },
      { label: 'Delivered', value: data?.deliveries?.deliveredInPeriod, icon: 'truck', tone: 'violet', to: links.delivered, hint: periodLabel },
    ],
    admin: [
      { label: 'Leads to order', value: leads?.byStatus.converted ?? 0, icon: 'check', tone: 'blue', to: '/sales/leads?status=converted&range=all', hint: 'Converted, no order yet' },
      { label: 'Draft orders', value: orders?.byStatus.draft ?? 0, icon: 'order', tone: 'aqua', to: '/sales/orders?status=draft' },
      { label: 'Awaiting approval', value: orders?.byStatus.submitted ?? 0, icon: 'clock', tone: 'orange', to: '/sales/orders?status=submitted' },
      { label: 'Approved', value: orders?.byStatus.approved ?? 0, icon: 'car', tone: 'violet', to: '/sales/orders?status=approved' },
    ],
    delivery: [
      { label: 'Waiting for a vehicle', value: orders?.awaitingVehicle, icon: 'order', tone: 'orange', to: '/sales/orders?live=true&hasVehicle=false', hint: 'Booked, no car yet' },
      { label: 'Free stock', value: stock?.free, icon: 'car', tone: 'blue', to: '/sales/stock?allocated=false' },
      { label: 'Ready for delivery', value: stock?.byStatus.ready_for_delivery ?? 0, icon: 'check', tone: 'aqua', to: '/sales/stock?status=ready_for_delivery' },
      { label: 'Deliveries scheduled', value: data?.deliveries?.scheduled, icon: 'truck', tone: 'violet', to: '/sales/deliveries?status=scheduled' },
    ],
  };
  const tiles = byLayout[layout];

  const leadsByStatus = LEAD_STATES.filter(
    (s) => (s !== 'exhausted' || (leads?.byStatus.exhausted ?? 0) > 0) && (s !== 'visited' || showsVisited(perm)),
  ).map((s) => ({
    label: humanize(s),
    value: leads?.byStatus[s] ?? 0,
    to: `/sales/leads?status=${s}&range=all`,
  }));
  const ordersByStatus = ORDER_STATES.map((s) => ({ label: humanize(s), value: orders?.byStatus[s] ?? 0, to: `/sales/orders?status=${s}` }));
  const stockByStage = STOCK_STAGES.map((s) => ({ label: humanize(s), value: stock?.byStatus[s] ?? 0, to: `/sales/stock?status=${s}` }));

  const trend =
    layout === 'admin'
      ? { title: 'Leads converted per day', series: [SERIES_CONVERTED] }
      : { title: layout === 'sales' ? 'My leads per day' : 'Leads per day', series: [SERIES_LOGGED, SERIES_CONVERTED] };

  return (
    <div className="space-y-5">
      {/* Header + the one row of filters above the charts */}
      <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px]">
            {greeting()}, {user?.fullName}
          </h1>
          <p className="mt-1 text-sm text-slate-600">{personName ? `Showing ${personName} only.` : SUBTITLES[layout]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canPickPerson && (
            <Select
              aria-label="Salesperson"
              value={person ?? ''}
              onChange={(e) => setOwnerId(e.target.value ? Number(e.target.value) : null)}
              className={person ? '!bg-brand-50 !ring-brand-300' : undefined}
            >
              <option value="">{layout === 'manager' ? 'Everyone' : 'All salespeople'}</option>
              {personOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          )}
        {layout !== 'delivery' && (
          <DateRangePicker
            presets={PERIODS}
            value={period.key}
            custom={custom ? period.range : undefined}
            onChange={(key, range) => setPeriod({ key, range })}
            maxDays={92}
          />
        )}
        </div>
      </div>

      {/* What is waiting for you (approvals, cars to hand over…), with a pop-up when something is new. */}
      <ActionNeeded />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {tiles.map((t) => (
          <StatTile key={t.label} {...t} loading={isLoading} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {layout === 'delivery' ? (
          <Panel title="Open stock by stage" subtitle="Undelivered vehicles at your dealership" to="/sales/stock" className="lg:col-span-2">
            <BarList items={stockByStage} empty="No vehicles in stock yet." />
          </Panel>
        ) : (
          <Panel
            title={trend.title}
            subtitle={`${loggedInPeriod} logged · ${convertedInPeriod} converted · ${periodLabel}${isFetching && !isLoading ? ' · updating…' : ''}`}
            to="/sales/leads"
            className="lg:col-span-2"
          >
            {leads ? <TrendChart data={leads.daily} series={trend.series} /> : <div className="h-60" />}
          </Panel>
        )}

        {layout === 'manager' ? (
          <Panel title="Orders by salesperson" subtitle={`Orders raised, ${periodLabel}`} to="/sales/team" toLabel="Team report">
            <BarList
              items={(team.data?.members ?? [])
                .filter((m) => m.leads > 0 || m.ordersRaised > 0)
                .map((m) => ({ label: m.fullName, value: m.ordersRaised }))
                .slice(0, 8)}
              empty="No orders raised yet."
            />
          </Panel>
        ) : layout === 'admin' || layout === 'delivery' ? (
          <Panel title="Sales orders by status" to="/sales/orders">
            <BarList items={ordersByStatus} color="#2a78d6" empty="No sales orders yet." />
          </Panel>
        ) : (
          <Panel title={layout === 'sales' ? 'My leads by status' : 'Leads by status'} to="/sales/leads">
            <div className="mb-4 flex items-baseline gap-2 border-b border-slate-200/70 pb-3">
              <span className="text-3xl font-semibold tracking-tight text-slate-900">{(leads?.total ?? 0).toLocaleString()}</span>
              <span className="text-sm text-slate-600">total leads</span>
              <span className="ml-auto text-xs text-slate-500">{leads?.loggedInPeriod ?? 0} logged, {periodLabel}</span>
            </div>
            <BarList items={leadsByStatus} total={leads?.total} empty="No leads yet." />
          </Panel>
        )}
      </div>

      {/* This month: cars booked / delivered, PPF sold and for how much, quotations. */}
      {layout !== 'delivery' && <MonthRecord userId={person} />}

      {layout === 'manager' || layout === 'delivery' ? (
        <Panel
          title={layout === 'delivery' ? 'Delivery queue' : 'Orders awaiting your approval'}
          subtitle={layout === 'delivery' ? 'Booked orders, oldest first' : 'Draft or submitted, oldest first; the Vehicle column shows when the car is ready'}
          to={layout === 'delivery' ? '/sales/orders?live=true' : '/sales/orders?awaitingApproval=true'}
        >
          <RecordsTable
            rows={recordsOrders.data?.items}
            columns={orderColumns}
            href={(o) => `/sales/orders/${o.id}`}
            loading={recordsOrders.isLoading}
            empty={layout === 'delivery' ? 'No booked orders waiting.' : 'Nothing waiting for approval.'}
          />
        </Panel>
      ) : (
        <Panel
          title={layout === 'admin' ? 'Converted leads waiting for an order' : layout === 'am' ? 'Duplicate customers sent to you' : 'Latest leads'}
          to={layout === 'admin' ? '/sales/leads?status=converted&range=all' : layout === 'am' ? '/sales/leads?escalated=true&range=all' : '/sales/leads'}
        >
          <RecordsTable
            rows={recordsLeads.data?.items}
            columns={leadColumns}
            href={(l) => `/sales/leads/${l.id}`}
            loading={recordsLeads.isLoading}
            empty={layout === 'admin' ? 'No converted leads waiting.' : layout === 'am' ? 'No duplicate customers sent to you.' : 'No leads yet — log your first walk-in.'}
          />
        </Panel>
      )}
    </div>
  );
}
