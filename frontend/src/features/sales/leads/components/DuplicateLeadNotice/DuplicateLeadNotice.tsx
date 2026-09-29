import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Input } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { useEscalateDuplicateLeadMutation } from '../../../salesApi';

/**
 * Shown when a new lead is blocked by "Duplicate lead already exists". Callers who may open the
 * existing lead (e.g. a team leader) see whose it is and get a link; a salesperson can send it to the
 * Assistant Manager instead.
 */
export function DuplicateLeadNotice({ details, values }: { details: Record<string, unknown>; values: Record<string, unknown> }) {
  const toast = useToast();
  const [escalate, { isLoading }] = useEscalateDuplicateLeadMutation();
  const [note, setNote] = useState('');
  const [done, setDone] = useState(details.escalated === true);

  return (
    <div className="space-y-2">
      <p className="font-medium">Duplicate lead already exists.</p>
      {typeof details.existingId === 'number' ? (
        <p>
          {typeof details.ownerName === 'string' ? <>It is already with <span className="font-medium">{details.ownerName}</span>. </> : null}
          <Link to={`/sales/leads/${details.existingId}`} className="font-medium underline">
            Open the existing lead
          </Link>
        </p>
      ) : done ? (
        <p>This customer has been sent to the Assistant Manager, who can open the lead and convert it if its salesperson is unavailable.</p>
      ) : (
        <>
          <p>It belongs to another salesperson. If the customer is waiting, send it to the Assistant Manager.</p>
          <div className="flex flex-wrap gap-2">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the Assistant Manager (optional)" className="min-w-64 flex-1" aria-label="Note for the Assistant Manager" />
            <Button
              size="sm"
              loading={isLoading}
              onClick={async () => {
                try {
                  await escalate({
                    escalateDuplicateRequest: { dealershipId: Number(values.dealershipId), prospectMobile: String(values.prospectMobile), note: note || null },
                  }).unwrap();
                  toast.success('Sent to the Assistant Manager');
                  setDone(true);
                } catch (e) {
                  toast.error(e);
                }
              }}
            >
              Send to Assistant Manager
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
