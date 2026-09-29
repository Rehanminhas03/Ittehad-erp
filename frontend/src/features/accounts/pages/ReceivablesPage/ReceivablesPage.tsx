import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorState, PageHeader, Pagination, Spinner } from '@/shared/components/ui';
import { apiErrorMessage, formatMoney } from '@/shared/lib';
import { useGetReceivablesAgingQuery } from '../../accountsApi';
import { ReportTable } from '../../components/ReportTable';
import { useDealershipParam } from '../../hooks';
import { amountOrBlank } from '../../lib/format';
import { P } from '../../permissions';

/** What customers owe, by how long it is past due (open invoices, as of today). */
export default function ReceivablesPage() {
  const { dealershipId, picker } = useDealershipParam(P.reportsView);
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useGetReceivablesAgingQuery({ dealershipId: dealershipId!, page, pageSize: 50 }, { skip: !dealershipId });

  return (
    <div>
      <PageHeader title="Receivables aging" subtitle="Outstanding customer invoices by days past their due date." />
      {picker && <div className="mb-4">{picker}</div>}
      <div className="surface p-5 sm:p-6">
        {!dealershipId ? (
          <EmptyState title="No dealership available" />
        ) : isLoading ? (
          <div className="flex justify-center py-16 text-slate-400">
            <Spinner />
          </div>
        ) : isError ? (
          <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />
        ) : !data?.items.length ? (
          <EmptyState title="Nothing outstanding" description="Every issued invoice is paid." />
        ) : (
          <>
            <ReportTable
              rows={data.items}
              rowKey={(r) => r.customerId}
              columns={[
                {
                  header: 'Customer',
                  render: (r) => (
                    <Link to={`/crm/customers/${r.customerId}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {r.customerName}
                    </Link>
                  ),
                },
                { header: 'Not yet due', numeric: true, render: (r) => amountOrBlank(r.current) },
                { header: '1–30 days', numeric: true, render: (r) => amountOrBlank(r.days1to30) },
                { header: '31–60 days', numeric: true, render: (r) => amountOrBlank(r.days31to60) },
                { header: '61–90 days', numeric: true, render: (r) => amountOrBlank(r.days61to90) },
                { header: 'Over 90', numeric: true, className: 'text-red-700', render: (r) => amountOrBlank(r.over90) },
                { header: 'Total', numeric: true, className: 'font-semibold', render: (r) => formatMoney(r.total) },
              ]}
            />
            <div className="mt-2">
              <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
