import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { DateRangePicker, type DateRange, rangeLabel } from '@/shared/components';
import { Button, ErrorState, Field, PageHeader, Select, Spinner } from '@/shared/components/ui';
import { useAuth, usePermission } from '@/shared/hooks';
import { apiErrorMessage, formatMoney } from '@/shared/lib';
import { DownloadIcon, PdfDialog, usePdf } from '../documents/DocumentPreview';
import { buildTrackRecordPdf } from './trackRecordPdf';
import { compactPkr, MonthlyBars } from '../dashboard/charts/MonthlyBars';
import { Panel, StatTile } from '../dashboard/components';
import { P } from '../permissions';
import { useGetSalesTrackRecordQuery, useLazyGetSalesTrackRecordQuery } from '../salesApi';

const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: new Date(2000, i, 1).toLocaleDateString('en-GB', { month: 'long' }) }));
const nowPk = () => new Date(Date.now() + 5 * 3600_000);
// Validated categorical slots (dataviz palette): each stage keeps its colour; converted is slot 3 (aqua).
const CARS = [
  { key: 'converted', label: 'Converted', color: '#1baf7a' },
  { key: 'carsBooked', label: 'Cars booked', color: '#2a78d6' },
  { key: 'carsDelivered', label: 'Cars delivered', color: '#eb6834' },
];
const PPF_AMOUNT = [{ key: 'ppfAmountN', label: 'PPF sold (PKR)', color: '#4a3aa7' }];

/** First and last day of a month / the year, for links to the matching records. */
function periodOf(year: number, month: number | null) {
  if (!month) return { from: `${year}-01-01`, to: `${year}-12-31` };
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, '0');
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${last}` };
}

/** The person picker, grouped. */
const PERSON_GROUPS = [
  { kind: 'salesperson', label: 'Salespersons' },
  { kind: 'cro', label: 'CROs' },
  { kind: 'leader', label: 'Team leaders (with leads of their own)' },
] as const;

/**
 * Track record: leads, conversions, cars booked and delivered, PPF sold (how many and for how much)
 * and quotations, month by month and per salesperson. The Sales Manager sees everyone, the Assistant
 * Manager / Sales Admin the salespeople (plus team leaders who logged or converted leads of their own),
 * a salesperson their own; team views filter to one person.
 */
export default function TrackRecordPage() {
  const perm = usePermission();
  const dealerships = useMemo(() => {
    const all = [P.ppfViewAll, P.reportsView, P.ppfViewOwn].flatMap((c) => perm.dealershipsFor(c));
    return all.filter((d, i) => all.findIndex((x) => x.id === d.id) === i);
  }, [perm]);
  const [dealershipId, setDealershipId] = useState<number | undefined>(dealerships[0]?.id);
  const [year, setYear] = useState(nowPk().getUTCFullYear());
  const [month, setMonth] = useState<number | null>(nowPk().getUTCMonth() + 1);
  const [userId, setUserId] = useState<number | null>(null);
  // Sales Manager: all Salespersons together, or all CROs together.
  const [group, setGroup] = useState<'salespeople' | 'cros' | null>(null);
  // A custom period instead of the month (the chart keeps showing the year).
  const [range, setRange] = useState<DateRange | null>(null);
  const args = { dealershipId: dealershipId!, year, month: range ? undefined : (month ?? undefined), from: range?.from, to: range?.to, userId: userId ?? undefined, group: group ?? undefined };
  const { data, isFetching, error, refetch } = useGetSalesTrackRecordQuery(args, { skip: !dealershipId, refetchOnMountOrArgChange: true });
  // The report also lists the customers behind the figures (fetched only when downloading).
  const [fetchWithDetails] = useLazyGetSalesTrackRecordQuery();

  const period = range ?? periodOf(year, month);
  const periodLabel = range ? rangeLabel(range) : month ? `${MONTHS[month - 1]!.label} ${year}` : String(year);
  // A team view (everyone or the salespeople), not narrowed to one person.
  const teamScope = !!data && data.scope !== 'own';
  const team = teamScope && !userId;
  const personName = data?.people.find((p) => p.userId === userId)?.fullName;
  const months = useMemo(() => (data?.months ?? []).map((m) => ({ ...m, ppfAmountN: Number(m.ppfAmount) })), [data]);
  const selectedMonth = !range && month ? `${year}-${String(month).padStart(2, '0')}` : null;
  const pick = (m: string) => {
    setRange(null);
    setMonth((cur) => (cur === Number(m.slice(5)) ? null : Number(m.slice(5))));
  };
  const ppfLink = (ownerId?: number) =>
    `/sales/ppf-forms?createdFrom=${period.from}&createdTo=${period.to}${ownerId ? `&ownerId=${ownerId}` : ''}`;
  const years = Array.from({ length: 4 }, (_, i) => nowPk().getUTCFullYear() - i);

  // PDF of what is on screen: the same people, period and figures.
  const { user } = useAuth();
  const [pdfOpen, setPdfOpen] = useState(false);
  const groupLabel = group === 'salespeople' ? 'All salespersons' : group === 'cros' ? 'All CROs' : null;
  const whoLabel =
    data?.scope === 'own' ? (user?.fullName ?? 'My record') : userId ? (personName ?? 'Salesperson') : (groupLabel ?? (data?.scope === 'salespeople' ? 'All salespeople' : 'Everyone'));
  const dealershipName = dealerships.find((d) => d.id === dealershipId)?.name ?? '';
  const build = useMemo(
    () =>
      pdfOpen && data
        ? async () => {
            const full = await fetchWithDetails({ ...args, details: 'true' }).unwrap();
            return buildTrackRecordPdf({ data: full, dealershipName, periodLabel, whoLabel, preparedBy: user?.fullName ?? '', showMonths: !range && !month });
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pdfOpen, data, dealershipName, periodLabel, whoLabel, user, range, month],
  );
  const pdf = usePdf(build);

  return (
    <div>
      <PageHeader
        title="Track record"
        subtitle={
          data?.scope === 'own'
            ? 'Your leads, conversions, cars and PPF, month by month.'
            : data?.scope === 'salespeople'
              ? 'The salespeople (and team leaders with leads of their own): leads, conversions, cars and PPF, month by month.'
              : 'The whole sales team: leads, conversions, cars and PPF, month by month.'
        }
      />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        {dealerships.length > 1 && (
          <Field label="Dealership" htmlFor="trk-dealership">
            <Select id="trk-dealership" value={dealershipId ?? ''} onChange={(e) => setDealershipId(Number(e.target.value))}>
              {dealerships.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {teamScope && (
          <Field label="Show" htmlFor="trk-person">
            <Select
              id="trk-person"
              value={userId ? String(userId) : group ? `g:${group}` : ''}
              onChange={(e) => {
                const v = e.target.value;
                setGroup(v.startsWith('g:') ? (v.slice(2) as 'salespeople' | 'cros') : null);
                setUserId(v && !v.startsWith('g:') ? Number(v) : null);
              }}
            >
              <option value="">{data?.scope === 'salespeople' ? 'All salespeople' : 'Everyone'}</option>
              {/* The Manager sees Salespersons and CROs, each together or one by one. */}
              {data?.scope === 'team' && (
                <>
                  <option value="g:salespeople">All salespersons</option>
                  <option value="g:cros">All CROs</option>
                </>
              )}
              {PERSON_GROUPS.map(({ kind, label }) => {
                const people = (data?.people ?? []).filter((p) => p.kind === kind);
                return people.length ? (
                  <optgroup key={kind} label={label}>
                    {people.map((p) => (
                      <option key={p.userId} value={p.userId}>
                        {p.fullName}
                      </option>
                    ))}
                  </optgroup>
                ) : null;
              })}
            </Select>
          </Field>
        )}
        <Field label="Year" htmlFor="trk-year">
          <Select id="trk-year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Month" htmlFor="trk-month">
          <Select
            id="trk-month"
            value={range ? '' : (month ?? '')}
            onChange={(e) => {
              setRange(null);
              setMonth(e.target.value ? Number(e.target.value) : null);
            }}
          >
            <option value="">Whole year</option>
            {MONTHS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Custom dates</p>
          <div className="flex items-center gap-2">
            <DateRangePicker presets={[]} value={range ? 'custom' : ''} custom={range ?? undefined} onChange={(_k, r) => setRange(r)} maxDays={366} />
            {range && (
              <button type="button" onClick={() => setRange(null)} className="text-sm font-medium text-brand-700 hover:underline">
                Clear
              </button>
            )}
          </div>
        </div>
        {isFetching && <Spinner className="mb-2.5 size-4 text-slate-400" />}
        <Button className="ml-auto" disabled={!data} onClick={() => setPdfOpen(true)}>
          <DownloadIcon className="size-4" />
          Download PDF
        </Button>
      </div>
      {pdfOpen && <PdfDialog open onClose={() => setPdfOpen(false)} title={`Track record — ${whoLabel} · ${periodLabel}`} pdf={pdf} loading={!pdf} />}

      {error ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : !data ? (
        <Spinner className="mx-auto my-10 size-6 text-slate-400" />
      ) : (
        <>
          <p className="mb-2 text-sm text-slate-600">
            <span className="font-medium text-slate-800">{periodLabel}</span>
            {userId && personName ? ` · ${personName}` : ''}
          </p>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <StatTile compact label="Leads logged" value={data.totals.leadsLogged} icon="phone" tone="violet" />
            <StatTile compact label="Converted" value={data.totals.converted} icon="check" tone="aqua" />
            <StatTile compact label="Cars booked" value={data.totals.carsBooked} hint="Orders raised" icon="order" tone="blue" />
            <StatTile compact label="Cars delivered" value={data.totals.carsDelivered} icon="car" tone="orange" />
            <StatTile compact label="PPF sold" value={data.totals.ppfSold} icon="today" tone="violet" to={ppfLink(team ? undefined : (userId ?? perm.userId ?? undefined))} />
            <StatTile compact label="Quotations" value={data.totals.quotations} icon="leads" tone="blue" to="/sales/quotations" />
          </div>

          <div className="mb-6 grid gap-4 lg:grid-cols-2">
            <Panel title={`Converted and cars per month · ${year}`} subtitle="Click a month to see it per salesperson">
              <MonthlyBars data={months} series={CARS} selected={selectedMonth} onSelect={pick} />
            </Panel>
            <Panel title={`PPF sales per month · ${year}`} subtitle="Total PPF amount sold (after discount)">
              <MonthlyBars data={months} series={PPF_AMOUNT} selected={selectedMonth} onSelect={pick} format={(v) => formatMoney(String(v))} axisFormat={compactPkr} />
            </Panel>
          </div>

          <Panel title={team ? `${groupLabel ?? 'Per salesperson'} · ${periodLabel}` : userId ? `${personName ?? 'Salesperson'} · ${periodLabel}` : `My record · ${periodLabel}`}>
            <div className="-mx-4 overflow-x-auto sm:-mx-5">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200/80 text-xs font-medium text-slate-500">
                    <th scope="col" className="px-4 py-2 text-left font-medium sm:pl-5">Salesperson</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Leads logged</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Converted</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Cars booked</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Cars delivered</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">PPF sold</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">PPF amount</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Advance received</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium sm:pr-5">Quotations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.members.map((m) => (
                    <tr key={m.userId} className="tabular-nums">
                      <td className="px-4 py-2.5 text-left font-medium whitespace-nowrap text-slate-900 sm:pl-5">
                        {m.fullName}
                        {!m.isActive && <span className="ml-2 text-xs font-normal text-slate-500">(left)</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right">{m.leadsLogged}</td>
                      <td className="px-3 py-2.5 text-right">{m.converted}</td>
                      <td className="px-3 py-2.5 text-right">{m.carsBooked}</td>
                      <td className="px-3 py-2.5 text-right">{m.carsDelivered}</td>
                      <td className="px-3 py-2.5 text-right">
                        {m.ppfSold ? (
                          <Link to={ppfLink(m.userId)} className="text-brand-700 hover:underline">
                            {m.ppfSold}
                          </Link>
                        ) : (
                          0
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatMoney(m.ppfAmount)}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap text-slate-600">{formatMoney(m.ppfAdvance)}</td>
                      <td className="px-4 py-2.5 text-right sm:pr-5">{m.quotations}</td>
                    </tr>
                  ))}
                </tbody>
                {team && data.members.length > 1 && (
                  <tfoot>
                    <tr className="border-t border-slate-200 font-semibold text-slate-900 tabular-nums">
                      <td className="px-4 py-2.5 text-left sm:pl-5">Total</td>
                      <td className="px-3 py-2.5 text-right">{data.totals.leadsLogged}</td>
                      <td className="px-3 py-2.5 text-right">{data.totals.converted}</td>
                      <td className="px-3 py-2.5 text-right">{data.totals.carsBooked}</td>
                      <td className="px-3 py-2.5 text-right">{data.totals.carsDelivered}</td>
                      <td className="px-3 py-2.5 text-right">{data.totals.ppfSold}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatMoney(data.totals.ppfAmount)}</td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">{formatMoney(data.totals.ppfAdvance)}</td>
                      <td className="px-4 py-2.5 text-right sm:pr-5">{data.totals.quotations}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Converted = leads converted in the period, credited to the lead's salesperson (also when the Assistant Manager converts a duplicate customer sent to them). Cars booked = sales orders raised by the Sales Admin (not cancelled); delivered = handed over in the period. PPF amount is after discount.
            </p>
          </Panel>
        </>
      )}
    </div>
  );
}
