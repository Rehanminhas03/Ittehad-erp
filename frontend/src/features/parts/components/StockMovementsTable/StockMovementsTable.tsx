import { useState } from 'react';
import { EmptyState, ErrorState, Pagination, Spinner } from '@/shared/components/ui';
import { apiErrorMessage, cn, formatDateTime, formatMoney } from '@/shared/lib';
import { type ListStockMovementsApiArg, useListStockMovementsQuery } from '../../partsApi';
import { MOVEMENT_LABELS } from '../../permissions';

/** The append-only stock ledger for a filter (a part at a branch, a document, a type...). */
export function StockMovementsTable({ filter, pageSize = 25 }: { filter: Omit<ListStockMovementsApiArg, 'page' | 'pageSize'>; pageSize?: number }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error, refetch } = useListStockMovementsQuery({ ...filter, page, pageSize });
  if (isLoading) return <Spinner className="size-4 text-slate-400" />;
  if (isError) return <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />;
  if (!data?.items.length) return <EmptyState title="No stock movements" />;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
            <th className="py-2 pr-2 font-medium">When</th>
            <th className="py-2 pr-2 font-medium">Part</th>
            <th className="py-2 pr-2 font-medium">Movement</th>
            <th className="py-2 pr-2 font-medium">Reference</th>
            <th className="py-2 pr-2 text-right font-medium">Qty</th>
            <th className="py-2 pr-2 text-right font-medium">Unit cost</th>
            <th className="py-2 pr-2 text-right font-medium">Value</th>
            <th className="py-2 pr-2 text-right font-medium">Balance</th>
            <th className="py-2 pr-2 font-medium">By</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.items.map((m) => (
            <tr key={m.id}>
              <td className="py-2 pr-2 whitespace-nowrap text-slate-500">{formatDateTime(m.occurredAt)}</td>
              <td className="py-2 pr-2 font-mono text-xs">{m.partNo}</td>
              <td className="py-2 pr-2">{MOVEMENT_LABELS[m.type] ?? m.type}</td>
              <td className="py-2 pr-2 font-mono text-xs text-slate-500">{m.referenceNo ?? `${m.referenceType} #${m.referenceId}`}</td>
              <td className={cn('py-2 pr-2 text-right tabular-nums', Number(m.quantity) < 0 ? 'text-red-600' : 'text-emerald-700')}>
                {Number(m.quantity) > 0 ? '+' : ''}
                {Number(m.quantity)}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(m.unitCost)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(m.value)}</td>
              <td className="py-2 pr-2 text-right font-medium tabular-nums">{Number(m.balanceAfter)}</td>
              <td className="py-2 pr-2 text-slate-500">{m.actorName}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2">
        <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
      </div>
    </div>
  );
}
