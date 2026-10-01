import { useState } from 'react';
import { DashboardWidget, DateRangePicker, karachiToday, lastDays, rangeLabel, type DateRange, type RangePreset } from '@/shared/components';
import { Button, ErrorState, Field, PageHeader, Section, Select, Spinner } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { apiErrorMessage } from '@/shared/lib';
import { P } from '../../permissions';
import { type DeliveryReport, useGetDeliveryReportQuery } from '../../salesApi';

const monthStart = () => `${karachiToday().slice(0, 7)}-01`;
const PERIODS: RangePreset[] = [
  { key: 'month', label: 'This month', range: () => ({ from: monthStart(), to: karachiToday() }) },
  { key: '30d', label: 'Last 30 days', range: () => lastDays(30) },
  { key: '90d', label: '3 months', range: () => lastDays(90) },
  { key: 'year', label: 'This year', range: () => ({ from: `${karachiToday().slice(0, 4)}-01-01`, to: karachiToday() }) },
  { key: 'all', label: 'All time', range: () => ({ from: '2000-01-01', to: karachiToday() }) },
];
const days = (v: number | null | undefined) => (v == null ? '—' : `${v} days`);
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

/** A compact figure: small label, the number, an optional one-line note. */
function Stat({ label, value, note, accent }: { label: string; value: string | number; note?: string; accent?: boolean }) {
  return (
    <div className={`surface flex flex-col justify-between px-3.5 py-3 ${accent ? 'ring-1 ring-brand-200' : ''}`}>
      <p className="truncate text-[11px] font-medium tracking-wide text-slate-500 uppercase" title={label}>
        {label}
      </p>
      <p className="mt-1 text-2xl leading-tight font-semibold text-slate-900 tabular-nums">{value}</p>
      {note && (
        <p className="truncate text-[11px] text-slate-500" title={note}>
          {note}
        </p>
      )}
    </div>
  );
}

/** The report as a spreadsheet (per dealership and the total; per model; per month). */
function toCsv(r: DeliveryReport, periodText: string) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    [`Delivery report (as of ${r.asOf})`],
    [],
    ['Dealership', 'This month', 'This year', 'Last 30 days', 'All time', `Period: ${periodText}`, 'Avg days approval to delivery (period)', 'Scheduled (not yet delivered)'],
    ...r.dealerships.map((d) => [d.name, d.thisMonth, d.thisYear, d.last30Days, d.allTime, d.inPeriod, d.avgDaysToDeliver ?? '', d.scheduled]),
    ...(r.dealerships.length > 1 ? [['All dealerships', r.total.thisMonth, r.total.thisYear, r.total.last30Days, r.total.allTime, r.total.inPeriod, r.total.avgDaysToDeliver ?? '', r.total.scheduled]] : []),
    [],
    [`By model (${periodText})`, 'Delivered', 'Avg days approval to delivery'],
    ...r.byModel.map((m) => [`${m.brand} ${m.model}`, m.delivered, m.avgDaysToDeliver ?? '']),
    [],
    [`By month (${periodText})`, 'Orders booked', 'Cars delivered'],
    ...r.byMonth.map((m) => [monthName(m.month), m.booked, m.delivered]),
  ];
  return lines.map((l) => l.map(esc).join(',')).join('\r\n');
}

/**
 * Delivery report (delivery portal, Sales Admin, Assistant Manager, Manager): cars delivered this
 * month, this year, in the last 30 days and all time, and in a chosen period, per dealership and all
 * dealerships together (or one dealership only), with the average days from approval to delivery;
 * by model (with its average) and orders booked vs cars delivered by month. Download as CSV or print.
 */
export default function DeliveryReportPage() {
  const perm = usePermission();
  const dealerships = perm.dealershipsFor(P.deliveriesViewAll);
  const [dealershipId, setDealershipId] = useState<number | undefined>(dealerships.length === 1 ? dealerships[0]!.id : undefined);
  const [periodKey, setPeriodKey] = useState('month');
  const [custom, setCustom] = useState<DateRange>({});
  const range = periodKey === 'custom' ? custom : (PERIODS.find((p) => p.key === periodKey) ?? PERIODS[0]!).range();
  const ready = !!range.from && !!range.to;
  const { data, isFetching, error, refetch } = useGetDeliveryReportQuery({ dealershipId, from: range.from, to: range.to }, { skip: !ready });
  const periodText = periodKey === 'custom' ? (ready ? rangeLabel({ from: range.from!, to: range.to! }) : 'custom dates') : (PERIODS.find((p) => p.key === periodKey)?.label ?? '');
  const scopeName = dealershipId ? (dealerships.find((d) => d.id === dealershipId)?.name ?? '') : 'All dealerships';

  const download = () => {
    if (!data) return;
    const blob = new Blob([`﻿${toCsv(data, periodText)}`], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Delivery report - ${scopeName} - ${data.asOf}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const cell = 'px-3 py-2 text-right tabular-nums';
  const many = (data?.dealerships.length ?? 0) > 1;
  return (
    <div>
      <PageHeader
        title="Delivery report"
        subtitle={`Cars delivered — ${scopeName}${data ? ` · as of ${data.asOf}` : ''}`}
        actions={
          <div className="flex gap-2 print:hidden">
            <Button variant="secondary" onClick={() => window.print()} disabled={!data}>
              Print
            </Button>
            <Button onClick={download} disabled={!data}>
              Download CSV
            </Button>
          </div>
        }
      />
      <div className="mb-6 flex flex-wrap items-end gap-4 print:hidden">
        {dealerships.length > 1 && (
          <Field label="Dealership" htmlFor="dr-dealership">
            <Select id="dr-dealership" value={dealershipId ?? ''} onChange={(e) => setDealershipId(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">All dealerships (combined)</option>
              {dealerships.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-slate-600">Period</span>
          <DateRangePicker
            presets={PERIODS}
            value={periodKey}
            custom={periodKey === 'custom' ? custom : undefined}
            onChange={(key, r) => {
              setPeriodKey(key);
              if (key === 'custom') setCustom(r);
            }}
          />
        </div>
        {isFetching && <Spinner className="mb-2.5 size-4 text-slate-400" />}
      </div>

      {error ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : !data ? null : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            <Stat label="This month" value={data.total.thisMonth} note="Delivered" />
            <Stat label="This year" value={data.total.thisYear} note="Delivered" />
            <Stat label="Last 30 days" value={data.total.last30Days} note="Delivered" />
            <Stat label="All time" value={data.total.allTime} note="Delivered" />
            <Stat label={periodText} value={data.total.inPeriod} note={`${data.period.from} → ${data.period.to}`} accent />
            <Stat label="Scheduled" value={data.total.scheduled} note="Not yet delivered" />
            <Stat label="Avg delivery time" value={days(data.total.avgDaysToDeliver)} note="Approval → delivery" />
          </div>

          <Section title={many ? 'By dealership' : scopeName} className="mb-6">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs tracking-wide text-slate-500 uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Dealership</th>
                    <th className={cell}>This month</th>
                    <th className={cell}>This year</th>
                    <th className={cell}>Last 30 days</th>
                    <th className={cell}>All time</th>
                    <th className={cell}>Period: {periodText}</th>
                    <th className={cell}>Avg days to deliver</th>
                    <th className={cell}>Scheduled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.dealerships.map((d) => (
                    <tr key={d.id}>
                      <td className="px-3 py-2 font-medium text-slate-900">{d.name}</td>
                      <td className={cell}>{d.thisMonth}</td>
                      <td className={cell}>{d.thisYear}</td>
                      <td className={cell}>{d.last30Days}</td>
                      <td className={cell}>{d.allTime}</td>
                      <td className={`${cell} font-semibold`}>{d.inPeriod}</td>
                      <td className={cell}>{days(d.avgDaysToDeliver)}</td>
                      <td className={cell}>{d.scheduled}</td>
                    </tr>
                  ))}
                  {many && (
                    <tr className="bg-slate-50/70 font-semibold">
                      <td className="px-3 py-2 text-slate-900">All dealerships</td>
                      <td className={cell}>{data.total.thisMonth}</td>
                      <td className={cell}>{data.total.thisYear}</td>
                      <td className={cell}>{data.total.last30Days}</td>
                      <td className={cell}>{data.total.allTime}</td>
                      <td className={cell}>{data.total.inPeriod}</td>
                      <td className={cell}>{days(data.total.avgDaysToDeliver)}</td>
                      <td className={cell}>{data.total.scheduled}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="grid gap-6 lg:grid-cols-2">
            <DashboardWidget
              kind="table"
              title={`By model · ${periodText}`}
              columns={[
                { key: 'model', header: 'Model' },
                { key: 'delivered', header: 'Delivered', align: 'right' },
                { key: 'avg', header: 'Avg days to deliver', align: 'right' },
              ]}
              rows={data.byModel.map((m) => ({ model: `${m.brand} ${m.model}`, delivered: m.delivered, avg: days(m.avgDaysToDeliver) }))}
              empty="No cars delivered in this period"
            />
            <DashboardWidget
              kind="table"
              title={`Booked vs delivered · ${periodText}`}
              columns={[
                { key: 'month', header: 'Month' },
                { key: 'booked', header: 'Orders booked', align: 'right' },
                { key: 'delivered', header: 'Cars delivered', align: 'right' },
              ]}
              rows={data.byMonth.map((m) => ({ month: monthName(m.month), booked: m.booked, delivered: m.delivered }))}
              empty="No orders booked or delivered in this period"
            />
          </div>
        </>
      )}
    </div>
  );
}
