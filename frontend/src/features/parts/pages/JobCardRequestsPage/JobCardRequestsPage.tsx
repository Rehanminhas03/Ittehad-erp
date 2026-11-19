import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeader, Select, Spinner, StatusBadge } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { formatDateTime, formatMoney } from '@/shared/lib';
import { type PartsRequest, useListOpenJobCardsQuery, useListPartsRequestsQuery } from '../../partsApi';
import { P } from '../../permissions';

/** Requests still waiting for the store to issue. */
const WAITING = ['open', 'partially_issued'];

interface Group {
  jobCardId: number;
  jobCardNo: string;
  requests: PartsRequest[];
  waiting: number;
  last: string;
  requestedBy: string[];
}

/**
 * Parts requests, one row per job card: however many times the advisor (or the store manager) asked for parts on a job card,
 * it is one row. Opening it shows the job card with every part asked for, and the store issues from there.
 */
export default function JobCardRequestsPage() {
  const perm = usePermission();
  const navigate = useNavigate();
  const [show, setShow] = useState<'waiting' | 'all'>('waiting');
  const { data, isFetching } = useListPartsRequestsQuery({ kind: 'request', pageSize: 100, sort: '-createdAt' });
  const dealershipId = perm.dealershipsFor(P.issuesCreate)[0]?.id ?? perm.dealershipsFor(P.requestsView)[0]?.id ?? 0;
  const { data: cards } = useListOpenJobCardsQuery({ dealershipId }, { skip: !dealershipId });
  const cardOf = useMemo(() => new Map((cards ?? []).map((c) => [c.id, c])), [cards]);

  const groups = useMemo(() => {
    const by = new Map<number, Group>();
    for (const r of data?.items ?? []) {
      if (r.status === 'cancelled') continue;
      const g = by.get(r.jobCardId) ?? { jobCardId: r.jobCardId, jobCardNo: r.jobCardNo ?? '', requests: [], waiting: 0, last: r.createdAt, requestedBy: [] };
      g.requests.push(r);
      if (WAITING.includes(r.status)) g.waiting += 1;
      if (r.createdAt > g.last) g.last = r.createdAt;
      if (r.requestedByName && !g.requestedBy.includes(r.requestedByName)) g.requestedBy.push(r.requestedByName);
      by.set(r.jobCardId, g);
    }
    return [...by.values()].filter((g) => show === 'all' || g.waiting > 0).sort((a, b) => (a.last < b.last ? 1 : -1));
  }, [data, show]);

  return (
    <div>
      <PageHeader
        title="Parts requests"
        subtitle="One row for each job card, however many times parts were asked for. Open it to see the job card and every part asked for, and issue them."
        actions={
          <Select aria-label="Show" value={show} onChange={(e) => setShow(e.target.value as 'waiting' | 'all')}>
            <option value="waiting">Waiting to be issued</option>
            <option value="all">All requests</option>
          </Select>
        }
      />
      <div className="surface relative overflow-x-auto p-2 sm:p-4">
        {isFetching && <Spinner className="absolute top-3 right-3 size-4 text-slate-400" />}
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
              <th className="py-2 pr-3 font-medium">Job card</th>
              <th className="py-2 pr-3 font-medium">Customer</th>
              <th className="py-2 pr-3 font-medium">Registration no.</th>
              <th className="py-2 pr-3 font-medium">Chassis no.</th>
              <th className="py-2 pr-3 text-right font-medium">Requests</th>
              <th className="py-2 pr-3 font-medium">Requested by</th>
              <th className="py-2 pr-3 font-medium">Last requested</th>
              <th className="py-2 pr-3 text-right font-medium">Total (PKR)</th>
              <th className="py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {!groups.length && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-500">
                  {isFetching ? 'Loading…' : show === 'waiting' ? 'No job card is waiting for parts.' : 'No parts requests yet.'}
                </td>
              </tr>
            )}
            {groups.map((g) => {
              const c = cardOf.get(g.jobCardId);
              return (
                <tr key={g.jobCardId} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/parts/requests/job-card/${g.jobCardId}`)}>
                  <td className="py-2 pr-3">
                    <Link to={`/parts/requests/job-card/${g.jobCardId}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">
                      {g.jobCardNo}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">{c?.customerName ?? '—'}</td>
                  <td className="py-2 pr-3">{c?.registrationNo ?? '—'}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{c?.vin ?? '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{g.requests.length}</td>
                  <td className="py-2 pr-3 text-xs text-slate-600">{g.requestedBy.join(', ') || '—'}</td>
                  <td className="py-2 pr-3 text-xs whitespace-nowrap text-slate-600">{formatDateTime(g.last)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{c?.totalAmount ? formatMoney(c.totalAmount) : '—'}</td>
                  <td className="py-2">{g.waiting > 0 ? <StatusBadge status="open" /> : <StatusBadge status="issued" />}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
