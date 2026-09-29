import { EmptyState, ErrorState, Spinner } from '@/shared/components/ui';
import { apiErrorMessage, formatMoney } from '@/shared/lib';
import { type JournalLine, useListJournalEntryLinesQuery } from '../../accountsApi';
import { amountOrBlank as amount } from '../../lib/format';
import { ReportTable } from '../ReportTable';

const sum = (lines: JournalLine[], k: 'debit' | 'credit') => lines.reduce((s, l) => s + Number(l[k]), 0);

/** The debit and credit lines of one journal entry, with totals (always equal). */
export function JournalLines({ entryId }: { entryId: number }) {
  const { data, isLoading, isError, error, refetch } = useListJournalEntryLinesQuery({ id: entryId });
  if (isLoading) return <Spinner className="size-4 text-slate-400" />;
  if (isError) return <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />;
  if (!data?.length) return <EmptyState title="No lines" />;
  return (
    <ReportTable
      rows={data}
      rowKey={(l) => l.id}
      columns={[
        { header: 'Account', render: (l) => <span><span className="font-mono text-xs text-slate-500">{l.accountCode}</span> {l.accountName}</span> },
        { header: 'Party', render: (l) => <span className="text-slate-500">{l.customerName ?? l.supplierName ?? ''}</span> },
        { header: 'Description', render: (l) => <span className="text-slate-500">{l.description ?? ''}</span> },
        { header: 'Debit', numeric: true, render: (l) => amount(l.debit) },
        { header: 'Credit', numeric: true, render: (l) => amount(l.credit) },
      ]}
      totals={[null, null, null, formatMoney(sum(data, 'debit')), formatMoney(sum(data, 'credit'))]}
    />
  );
}
