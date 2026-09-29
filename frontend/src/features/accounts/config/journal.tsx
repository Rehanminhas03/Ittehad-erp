import { Link } from 'react-router';
import { Section } from '@/shared/components/ui';
import { dealershipFilter, type EntityViewConfig, mono, muted, strong } from '@/shared/entity';
import { formatDate, formatDateTime, formatMoney } from '@/shared/lib';
import { type JournalEntry, useGetJournalEntryHistoryQuery, useGetJournalEntryQuery, useListJournalEntriesQuery } from '../accountsApi';
import { JournalLines } from '../components/JournalLines';
import { JournalReverse } from '../components/JournalReverse';
import { JOURNAL_SOURCES, labelOf, P, sourceLink } from '../permissions';

const SourceRef = ({ e }: { e: JournalEntry }) => {
  const to = sourceLink(e.sourceType, e.sourceId);
  return to ? (
    <Link to={to} className="text-brand-700 hover:underline">
      {labelOf(JOURNAL_SOURCES, e.source)} #{e.sourceId}
    </Link>
  ) : (
    <>{labelOf(JOURNAL_SOURCES, e.source)}</>
  );
};

/** The general journal: append-only; every entry balances (enforced by the database). */
export const journalView: EntityViewConfig<JournalEntry> = {
  singular: 'Journal entry',
  plural: 'Journal',
  basePath: '/accounts/journals',
  entityType: 'accounts.journal_entry',
  permissions: { view: [P.journalsView], create: P.journalsPost },
  scope: { dealershipKey: 'dealershipId' },
  list: {
    defaultSort: '-postedAt',
    searchPlaceholder: 'Search entry number or memo',
    createPath: '/accounts/journals/new',
    filters: [dealershipFilter, { param: 'source', label: 'Source', type: 'select', options: JOURNAL_SOURCES }],
    columns: [
      { key: 'entryNo', header: 'Entry', sortKey: 'entryNo', render: (e) => mono(e.entryNo) },
      { key: 'entryDate', header: 'Date', sortKey: 'entryDate', render: (e) => formatDate(e.entryDate) },
      { key: 'memo', header: 'Memo', render: (e) => strong(e.memo) },
      { key: 'source', header: 'Source', render: (e) => muted(labelOf(JOURNAL_SOURCES, e.source)) },
      { key: 'totalAmount', header: 'Amount', sortKey: 'totalAmount', className: 'text-right tabular-nums', render: (e) => formatMoney(e.totalAmount) },
    ],
  },
  detail: {
    title: (e) => e.entryNo,
    subtitle: (e) => e.memo,
    fields: [
      { label: 'Date', value: (e) => formatDate(e.entryDate) },
      { label: 'Source', value: (e) => <SourceRef e={e} /> },
      { label: 'Amount', value: (e) => <span className="font-semibold">{formatMoney(e.totalAmount)}</span> },
      { label: 'Posted by', value: (e) => `${e.postedByName ?? '—'} · ${formatDateTime(e.postedAt)}` },
      {
        label: 'Reverses',
        value: (e) => (e.reversalOfId ? <Link to={`/accounts/journals/${e.reversalOfId}`} className="text-brand-700 hover:underline">Entry #{e.reversalOfId}</Link> : null),
      },
      {
        label: 'Reversed by',
        value: (e) => (e.reversedById ? <Link to={`/accounts/journals/${e.reversedById}`} className="text-brand-700 hover:underline">Entry #{e.reversedById}</Link> : null),
      },
    ],
    sections: (e) => (
      <>
        <Section title="Lines">
          <JournalLines entryId={e.id} />
        </Section>
        <JournalReverse entry={e} />
      </>
    ),
  },
  api: { useList: useListJournalEntriesQuery, useGet: useGetJournalEntryQuery, useHistory: useGetJournalEntryHistoryQuery },
};
