import { Link } from 'react-router';
import { Section } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { P } from '../../permissions';
import { JournalLines } from '../JournalLines';

/** The ledger posting of a document (invoice, payment), for users who may see the journal. */
export function PostingSection({ entryId, title = 'Ledger posting' }: { entryId: number | null | undefined; title?: string }) {
  const perm = usePermission();
  if (!entryId || !perm.can(P.journalsView)) return null;
  return (
    <Section
      title={title}
      actions={
        <Link to={`/accounts/journals/${entryId}`} className="text-sm text-brand-700 hover:underline">
          Open journal entry
        </Link>
      }
    >
      <JournalLines entryId={entryId} />
    </Section>
  );
}
