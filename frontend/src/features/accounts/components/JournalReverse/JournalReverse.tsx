import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Input, Section } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { type JournalEntry, useReverseJournalEntryMutation } from '../../accountsApi';
import { P } from '../../permissions';

/**
 * Corrects a manual entry by posting its mirror image (entries are never edited or deleted).
 * Automatic entries are corrected through their document: void the invoice or payment.
 */
export function JournalReverse({ entry }: { entry: JournalEntry }) {
  const perm = usePermission();
  const toast = useToast();
  const navigate = useNavigate();
  const [memo, setMemo] = useState('');
  const [reverse, { isLoading }] = useReverseJournalEntryMutation();
  if (entry.source !== 'manual' || entry.reversedById || !perm.canIn(P.journalsPost, entry.dealershipId)) return null;
  return (
    <Section title="Reverse this entry">
      <div className="flex flex-wrap gap-2">
        <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Reason (e.g. posted to the wrong account)" className="max-w-md" aria-label="Reason" />
        <Button
          variant="secondary"
          disabled={memo.trim().length < 3}
          loading={isLoading}
          onClick={async () => {
            try {
              const rev = await reverse({ id: entry.id, reverseJournalRequest: { memo: memo.trim() } }).unwrap();
              toast.success(`Reversed by ${rev.entryNo}`);
              navigate(`/accounts/journals/${rev.id}`);
            } catch (e) {
              toast.error(e);
            }
          }}
        >
          Post reversal
        </Button>
      </div>
    </Section>
  );
}
