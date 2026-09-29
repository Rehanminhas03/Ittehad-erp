import { useState } from 'react';
import { Link } from 'react-router';
import { DashboardWidget } from '@/shared/components';
import { ErrorState, Field, Input, PageHeader, Section, Select, Spinner } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { apiErrorMessage, formatDate } from '@/shared/lib';
import { P } from '../../permissions';
import { useGetSalesTeamReportQuery } from '../../salesApi';

const localDate = (offsetDays = 0) => new Date(Date.now() - offsetDays * 86400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });

/**
 * Sales Manager: the department's record — per Salesperson / CRO / Assistant Manager, daily
 * walk-ins, orders raised and completed. Computed server-side from the records.
 */
export default function TeamReportPage() {
  const perm = usePermission();
  const dealerships = perm.dealershipsFor(P.reportsView);
  const [dealershipId, setDealershipId] = useState<number | undefined>(dealerships[0]?.id);
  const [from, setFrom] = useState(localDate(29));
  const [to, setTo] = useState(localDate());
  const { data, isFetching, error, refetch } = useGetSalesTeamReportQuery({ dealershipId: dealershipId!, from, to }, { skip: !dealershipId });

  const cell = 'px-3 py-2 text-right tabular-nums';
  return (
    <div>
      <PageHeader title="Sales team report" subtitle="Track record per person, daily walk-ins and orders, for your dealership." />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        {dealerships.length > 1 && (
          <Field label="Dealership" htmlFor="tr-dealership">
            <Select id="tr-dealership" value={dealershipId ?? ''} onChange={(e) => setDealershipId(Number(e.target.value))}>
              {dealerships.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="From" htmlFor="tr-from">
          <Input id="tr-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="tr-to">
          <Input id="tr-to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </Field>
        {isFetching && <Spinner className="mb-2.5 size-4 text-slate-400" />}
      </div>

      {error ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : !data ? null : (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <DashboardWidget kind="kpi" title="Leads" value={data.totals.leads} />
            <DashboardWidget kind="kpi" title="Walk-ins" value={data.totals.walkIns} />
            <DashboardWidget kind="kpi" title="Converted" value={data.totals.converted} />
            <DashboardWidget kind="kpi" title="Orders raised" value={data.totals.ordersRaised} />
            <DashboardWidget kind="kpi" title="Orders completed" value={data.totals.ordersCompleted} />
            <DashboardWidget
              kind="kpi"
              title="Salespeople with an order"
              value={data.totals.salespeopleWithOrders}
              hint={`of ${data.members.filter((m) => m.roles.includes('Salesperson') || m.roles.includes('CRO')).length}`}
            />
          </div>

          <Section title="Per person">
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Name</th>
                    <th className="px-3 py-2 text-left font-medium">Role</th>
                    <th className={cell}>Leads</th>
                    <th className={cell}>Walk-ins</th>
                    <th className={cell}>Follow-ups</th>
                    <th className={cell}>Converted</th>
                    <th className={cell}>Duplicates converted for others</th>
                    <th className={cell}>Orders raised</th>
                    <th className={cell}>Orders completed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.members.map((m) => (
                    <tr key={m.userId}>
                      <td className="px-3 py-2 font-medium text-slate-900">{m.fullName}</td>
                      <td className="px-3 py-2 text-slate-600">{m.roles}</td>
                      <td className={cell}>{m.leads}</td>
                      <td className={cell}>{m.walkIns}</td>
                      <td className={cell}>{m.followUps}</td>
                      <td className={cell}>{m.converted}</td>
                      <td className={cell}>{m.escalationsConverted}</td>
                      <td className={cell}>{m.ordersRaised}</td>
                      <td className={cell}>{m.ordersCompleted}</td>
                    </tr>
                  ))}
                  {!data.members.length && (
                    <tr>
                      <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                        No sales staff at this dealership yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="By day">
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="min-w-full text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className={cell}>Walk-ins</th>
                    <th className={cell}>All leads</th>
                    <th className={cell}>Converted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.daily.map((d) => (
                    <tr key={d.date}>
                      <td className="px-3 py-2">
                        {/* The day's counts are leads logged that day: open exactly those. */}
                        <Link to={`/sales/leads?createdOn=${d.date}&range=all`} className="hover:text-brand-700">
                          {formatDate(d.date)}
                        </Link>
                      </td>
                      <td className={cell}>{d.walkIns}</td>
                      <td className={cell}>{d.leads}</td>
                      <td className={cell}>{d.converted}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
