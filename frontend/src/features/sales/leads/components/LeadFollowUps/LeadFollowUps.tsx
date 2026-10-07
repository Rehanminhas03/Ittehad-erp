import { useState } from 'react';
import { Badge, Button, Checkbox, Field, Section, Select, Spinner, Textarea } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatDateTime } from '@/shared/lib';
import { FOLLOW_UP_OUTCOMES, labelOf, MIN_FOLLOW_UPS_TO_EXHAUST, OPEN_LEAD_STATES, P } from '../../../permissions';
import { type Lead, type LeadFollowUp, useCommentOnFollowUpMutation, useListLeadFollowUpsQuery, useRecordLeadFollowUpMutation } from '../../../salesApi';

const OUTCOME_TONES = { interested: 'green', not_interested: 'red', visited: 'blue' } as const;

/** Follow-up log of a lead, and recording the next one (owner only). */
export function LeadFollowUps({ lead }: { lead: Lead }) {
  const perm = usePermission();
  const toast = useToast();
  const { data, isLoading } = useListLeadFollowUpsQuery({ id: lead.id });
  const [record, { isLoading: saving }] = useRecordLeadFollowUpMutation();
  const [outcome, setOutcome] = useState('');
  const [remarks, setRemarks] = useState('');
  // "Not interested": the lead is lost (out of the leads list) unless unticked.
  const [markLost, setMarkLost] = useState(true);

  const isOpenLead = (OPEN_LEAD_STATES as readonly string[]).includes(lead.status);
  const canRecord =
    isOpenLead &&
    (perm.canIn(P.leadsUpdate, lead.dealershipId, lead.branchId) ||
      (lead.ownerId === perm.userId && perm.canIn(P.leadsUpdateOwn, lead.dealershipId, lead.branchId)));
  const remaining = Math.max(0, MIN_FOLLOW_UPS_TO_EXHAUST - lead.followUpCount);
  // Visits are the CRO's (social / digital leads); a walk-in customer is already in the showroom.
  const outcomes = FOLLOW_UP_OUTCOMES.filter(
    (o) => o.value !== 'visited' || (lead.source !== 'walk_in' && perm.canIn(P.leadsRecordVisit, lead.dealershipId, lead.branchId)),
  );

  return (
    <Section
      title={`Follow-ups (${lead.followUpCount})`}
      actions={isOpenLead && remaining > 0 && <span className="text-xs text-slate-500">{remaining} more before it can be marked exhausted</span>}
    >
      {canRecord && (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-[14rem_1fr_auto] sm:items-end">
          <Field label="Outcome" htmlFor="fu-outcome">
            <Select
              id="fu-outcome"
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value);
                setMarkLost(true);
              }}
            >
              <option value="">Select…</option>
              {outcomes.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Remarks" htmlFor="fu-remarks">
            <Textarea id="fu-remarks" rows={1} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </Field>
          <Button
            disabled={!outcome}
            loading={saving}
            onClick={async () => {
              try {
                const lost = outcome === 'not_interested' && markLost;
                await record({ id: lead.id, leadFollowUpCreate: { outcome: outcome as never, remarks: remarks || null, markLost: lost || undefined } }).unwrap();
                toast.success(lost ? 'Lead marked as lost: it moves to Lost leads' : 'Follow-up recorded');
                setOutcome('');
                setRemarks('');
              } catch (e) {
                toast.error(e);
              }
            }}
          >
            Record
          </Button>
          {outcome === 'not_interested' && (
            <Checkbox
              className="sm:col-span-3"
              checked={markLost}
              onChange={(e) => setMarkLost(e.target.checked)}
              label="Mark this lead as Lost (the customer is not interested). It leaves the leads list and stays under Lost leads, with all its details."
            />
          )}
        </div>
      )}
      {isLoading ? (
        <Spinner className="size-4 text-slate-400" />
      ) : !data?.length ? (
        <p className="text-sm text-slate-500">No follow-ups yet.</p>
      ) : (
        <ol className="space-y-3">
          {data.map((f) => (
            <li key={f.id} className="flex gap-3 text-sm">
              <Badge tone={OUTCOME_TONES[f.outcome]}>{labelOf(FOLLOW_UP_OUTCOMES, f.outcome)}</Badge>
              <div className="min-w-0 flex-1">
                {f.remarks && <p className="text-slate-800">{f.remarks}</p>}
                <p className="text-xs text-slate-500">
                  {f.createdByName ?? 'Unknown'} · {formatDateTime(f.createdAt)}
                </p>
                <FollowUpComments leadId={lead.id} followUp={f} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}

/**
 * Comments under a follow-up: the Manager / Assistant Manager (later the CEO) ask to clarify what the
 * customer said; the salesperson answers. Everyone who sees the lead reads the thread.
 */
function FollowUpComments({ leadId, followUp }: { leadId: number; followUp: LeadFollowUp }) {
  const toast = useToast();
  const [comment, { isLoading }] = useCommentOnFollowUpMutation();
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const comments = followUp.comments ?? [];
  return (
    <div className="mt-1.5">
      {comments.length > 0 && (
        <ul className="mb-1.5 space-y-1.5 border-l-2 border-brand-100 pl-3">
          {comments.map((c) => (
            <li key={c.id}>
              <p className="text-slate-800">{c.body}</p>
              <p className="text-xs text-slate-500">
                {c.createdByName ?? 'Unknown'} · {formatDateTime(c.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
      {!open ? (
        <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => setOpen(true)}>
          {comments.length ? 'Reply' : 'Comment'}
        </button>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <Textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="e.g. Please explain in detail what the customer said"
            aria-label="Comment"
            className="flex-1"
            maxLength={1000}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!body.trim()}
              loading={isLoading}
              onClick={async () => {
                try {
                  await comment({ id: leadId, followUpId: followUp.id, followUpCommentRequest: { body: body.trim() } }).unwrap();
                  toast.success('Comment added: everyone following this lead is notified');
                  setBody('');
                  setOpen(false);
                } catch (e) {
                  toast.error(e);
                }
              }}
            >
              Post
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
