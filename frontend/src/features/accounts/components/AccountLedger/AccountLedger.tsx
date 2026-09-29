import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorState, Input, Pagination, Section, Spinner } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { apiErrorMessage, formatDate } from '@/shared/lib';
import { type Account, useGetAccountLedgerQuery } from '../../accountsApi';
import { amountOrBlank, drCr } from '../../lib/format';
import { P } from '../../permissions';
import { ReportTable } from '../ReportTable';

/** The account's postings, oldest first, with the running balance. */
export function AccountLedger({ account }: { account: Account }) {
  const perm = usePermission();
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const allowed = perm.canIn(P.reportsView, account.dealershipId);
  const { data, isLoading, isError, error, refetch } = useGetAccountLedgerQuery(
    { accountId: account.id, from: from || undefined, to: to || undefined, page, pageSize: 50 },
    { skip: !allowed },
  );
  if (!allowed) return null;

  return (
    <Section
      title="Ledger"
      actions={
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="w-auto py-1"
            aria-label="From"
          />
          to
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="w-auto py-1"
            aria-label="To"
          />
        </div>
      }
    >
      {isLoading ? (
        <Spinner className="size-4 text-slate-400" />
      ) : isError ? (
        <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
      ) : !data?.items.length ? (
        <EmptyState title="No postings in this period" />
      ) : (
        <>
          <ReportTable
            rows={data.items}
            rowKey={(r) => r.lineId}
            columns={[
              { header: 'Date', render: (r) => <span className="whitespace-nowrap">{formatDate(r.entryDate)}</span> },
              {
                header: 'Entry',
                render: (r) => (
                  <Link to={`/accounts/journals/${r.journalEntryId}`} className="font-mono text-xs hover:text-brand-700">
                    {r.entryNo}
                  </Link>
                ),
              },
              { header: 'Memo', render: (r) => <span className="text-slate-600">{r.description ?? r.memo}</span> },
              { header: 'Debit', numeric: true, render: (r) => amountOrBlank(r.debit) },
              { header: 'Credit', numeric: true, render: (r) => amountOrBlank(r.credit) },
              { header: 'Balance', numeric: true, className: 'font-medium', render: (r) => drCr(r.balance) },
            ]}
          />
          <div className="mt-2">
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </div>
        </>
      )}
    </Section>
  );
}
