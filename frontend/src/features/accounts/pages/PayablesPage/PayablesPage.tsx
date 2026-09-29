import { useState } from 'react';
import { Link } from 'react-router';
import { EmptyState, ErrorState, PageHeader, Pagination, Spinner } from '@/shared/components/ui';
import { apiErrorMessage, formatMoney } from '@/shared/lib';
import { useGetPayablesBySupplierQuery } from '../../accountsApi';
import { ReportTable } from '../../components/ReportTable';
import { useDealershipParam } from '../../hooks';
import { P } from '../../permissions';

/** What the dealership owes each supplier: goods received less payments made. */
export default function PayablesPage() {
  const { dealershipId, picker } = useDealershipParam(P.reportsView);
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useGetPayablesBySupplierQuery({ dealershipId: dealershipId!, page, pageSize: 50 }, { skip: !dealershipId });

  return (
    <div>
      <PageHeader title="Payables" subtitle="Supplier balances from goods received and payments made." />
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
          <EmptyState title="No supplier balances" />
        ) : (
          <>
            <ReportTable
              rows={data.items}
              rowKey={(r) => r.supplierId}
              columns={[
                {
                  header: 'Supplier',
                  render: (r) => (
                    <Link to={`/parts/suppliers/${r.supplierId}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {r.supplierName}
                    </Link>
                  ),
                },
                { header: 'Goods received', numeric: true, render: (r) => formatMoney(r.billed) },
                { header: 'Paid', numeric: true, render: (r) => formatMoney(r.paid) },
                { header: 'Balance owed', numeric: true, className: 'font-semibold', render: (r) => formatMoney(r.balance) },
                {
                  header: '',
                  render: (r) =>
                    Number(r.balance) > 0 && (
                      <Link to={`/accounts/payments/new?direction=disbursement&dealershipId=${dealershipId}&supplierId=${r.supplierId}`} className="text-sm font-medium text-brand-700 hover:underline">
                        Pay
                      </Link>
                    ),
                },
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
