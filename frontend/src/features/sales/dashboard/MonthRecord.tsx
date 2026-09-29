import { Link } from 'react-router';
import { Spinner } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { formatDate, formatMoney } from '@/shared/lib';
import { P } from '../permissions';
import { useGetSalesTrackRecordQuery, useListPpfFormsQuery, useListQuotationsQuery } from '../salesApi';
import { Panel } from './components';

const nowPk = () => new Date(Date.now() + 5 * 3600_000);

function Figure({ label, value, hint, to }: { label: string; value: string | number; hint?: string; to?: string }) {
  const body = (
    <>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl leading-none font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {hint && <p className="mt-1 truncate text-xs text-slate-500">{hint}</p>}
    </>
  );
  const cls = 'rounded-xl bg-white/50 p-3 ring-1 ring-slate-200/70';
  return to ? (
    <Link to={to} className={`${cls} transition hover:bg-white/80 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * This month's track record (leads logged, converted, cars booked / delivered, PPF sold and for how much,
 * quotations) and the latest quotations and PPF forms. Team figures for managers, own figures for a salesperson.
 */
export function MonthRecord({ userId = null }: { userId?: number | null }) {
  const perm = usePermission();
  const dealershipId = [P.ppfViewAll, P.reportsView, P.ppfViewOwn].flatMap((c) => perm.dealershipsFor(c))[0]?.id;
  const now = nowPk();
  const { data, isLoading } = useGetSalesTrackRecordQuery(
    { dealershipId: dealershipId!, year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, userId: userId ?? undefined },
    { skip: !dealershipId },
  );
  const canQt = perm.can([P.quotationsViewAll, P.quotationsViewOwn]);
  const canPpf = perm.can([P.ppfViewAll, P.ppfViewOwn]);
  const qts = useListQuotationsQuery({ pageSize: 5, ownerId: userId ?? undefined }, { skip: !canQt });
  const ppf = useListPpfFormsQuery({ pageSize: 5, ownerId: userId ?? undefined }, { skip: !canPpf });
  if (!dealershipId) return null;

  const monthName = now.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const from = `${now.getUTCFullYear()}-${mm}-01`;
  const recent = [
    ...(qts.data?.items ?? []).map((q) => ({ key: `q${q.id}`, kind: 'Quotation', no: q.quotationNo, customer: q.customerName, amount: q.totalAmount, at: q.createdAt, to: `/sales/quotations/${q.id}`, by: q.ownerName })),
    ...(ppf.data?.items ?? []).map((f) => ({ key: `p${f.id}`, kind: 'PPF', no: f.formNo, customer: f.customerName, amount: f.totalAmount, at: f.createdAt, to: `/sales/ppf-forms/${f.id}`, by: f.ownerName })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);
  const team = !!data && data.scope !== 'own' && !userId;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Panel title={`${userId ? (data?.people.find((p) => p.userId === userId)?.fullName ?? 'Salesperson') : team ? (data?.scope === 'salespeople' ? 'Salespeople' : 'Team') : 'My'} record · ${monthName}`} subtitle="Leads, conversions, cars and PPF this month" to="/sales/track-record" toLabel="Track record" className="lg:col-span-2">
        {isLoading || !data ? (
          <Spinner className="mx-auto my-6 size-5 text-slate-400" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Figure label="Leads logged" value={data.totals.leadsLogged} />
            <Figure label="Converted" value={data.totals.converted} hint="Leads converted" />
            <Figure label="Cars booked" value={data.totals.carsBooked} hint="Sales orders raised" />
            <Figure label="Cars delivered" value={data.totals.carsDelivered} />
            <Figure label="PPF sold" value={data.totals.ppfSold} hint={formatMoney(data.totals.ppfAmount)} to={`/sales/ppf-forms?createdFrom=${from}`} />
            <Figure label="Quotations" value={data.totals.quotations} to={`/sales/quotations?createdFrom=${from}`} />
          </div>
        )}
      </Panel>
      {(canQt || canPpf) && (
        <Panel title="Latest quotations & PPF" to={canPpf ? '/sales/ppf-forms' : '/sales/quotations'}>
          {qts.isLoading || ppf.isLoading ? (
            <Spinner className="mx-auto my-6 size-5 text-slate-400" />
          ) : recent.length ? (
            <ul className="-my-1 divide-y divide-slate-200/60">
              {recent.map((r) => (
                <li key={r.key}>
                  <Link to={r.to} className="flex items-center gap-3 py-2 text-sm hover:text-brand-700">
                    <span className={`w-16 shrink-0 rounded-md px-1.5 py-0.5 text-center text-[11px] font-semibold ${r.kind === 'PPF' ? 'bg-violet-100 text-violet-800' : 'bg-blue-100 text-blue-800'}`}>{r.kind}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-slate-900">{r.customer ?? r.no}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {team && r.by ? `${r.by} · ` : ''}
                        {formatDate(r.at)}
                      </span>
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-700">{formatMoney(r.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">No quotations or PPF forms yet.</p>
          )}
        </Panel>
      )}
    </div>
  );
}
