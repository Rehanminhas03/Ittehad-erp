import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, EmptyState, ErrorState, Input, PageHeader, Spinner } from '@/shared/components/ui';
import { apiErrorMessage, formatMoney } from '@/shared/lib';
import { useGetTrialBalanceQuery } from '../../accountsApi';
import { ReportTable } from '../../components/ReportTable';
import { useDealershipParam } from '../../hooks';
import { amountOrBlank, drCr } from '../../lib/format';
import { ACCOUNT_TYPES, labelOf, P } from '../../permissions';

/** Every account's debits and credits up to a date. Total debits always equal total credits. */
export default function TrialBalancePage() {
  const { dealershipId, picker } = useDealershipParam(P.reportsView);
  const [asOf, setAsOf] = useState('');
  const { data, isLoading, isError, error, refetch } = useGetTrialBalanceQuery({ dealershipId: dealershipId!, asOf: asOf || undefined }, { skip: !dealershipId });

  return (
    <div>
      <PageHeader title="Trial balance" subtitle="Balances of every account from the general journal." />
      <div className="flex flex-wrap items-center gap-3 py-4">
        {picker}
        <label className="flex items-center gap-2 text-sm text-slate-600">
          As of
          <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-auto" />
        </label>
        {data && (data.balanced ? <Badge tone="green">Balanced</Badge> : <Badge tone="red">Out of balance</Badge>)}
      </div>
      <div className="surface p-5 sm:p-6">
        {!dealershipId ? (
          <EmptyState title="No dealership available" />
        ) : isLoading ? (
          <div className="flex justify-center py-16 text-slate-400">
            <Spinner />
          </div>
        ) : isError ? (
          <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
        ) : (
          data && (
            <ReportTable
              rows={data.rows}
              rowKey={(r) => r.accountId}
              columns={[
                { header: 'Code', render: (r) => <span className="font-mono text-xs">{r.code}</span> },
                {
                  header: 'Account',
                  render: (r) => (
                    <Link to={`/accounts/chart/${r.accountId}`} className="text-slate-900 hover:text-brand-700">
                      {r.name}
                    </Link>
                  ),
                },
                { header: 'Type', render: (r) => <span className="text-slate-500">{labelOf(ACCOUNT_TYPES, r.type)}</span> },
                { header: 'Debits', numeric: true, render: (r) => amountOrBlank(r.debit) },
                { header: 'Credits', numeric: true, render: (r) => amountOrBlank(r.credit) },
                { header: 'Balance', numeric: true, className: 'font-medium', render: (r) => (Number(r.balance) ? drCr(r.balance) : '') },
              ]}
              totals={[null, 'Total', null, formatMoney(data.totalDebit), formatMoney(data.totalCredit), null]}
            />
          )
        )}
      </div>
    </div>
  );
}
