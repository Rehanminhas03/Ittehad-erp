import { useState } from 'react';
import { Badge, Button, Field, Section, Select, Spinner, Textarea } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatDateTime } from '@/shared/lib';
import { FOLLOW_UP_OUTCOMES, labelOf, MIN_FOLLOW_UPS_TO_EXHAUST, OPEN_LEAD_STATES, P } from '../../../permissions';
import { type Lead, useListLeadFollowUpsQuery, useRecordLeadFollowUpMutation } from '../../../salesApi';

const OUTCOME_TONES = { interested: 'green', not_interested: 'red', visited: 'blue' } as const;

/** Follow-up log of a lead, and recording the next one (owner only). */
export function LeadFollowUps({ lead }: { lead: Lead }) {
  const perm = usePermission();
  const toast = useToast();
  const { data, isLoading } = useListLeadFollowUpsQuery({ id: lead.id });
  const [record, { isLoading: saving }] = useRecordLeadFollowUpMutation();
  const [outcome, setOutcome] = useState('');
  const [remarks, setRemarks] = useState('');

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
            <Select id="fu-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
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
                await record({ id: lead.id, leadFollowUpCreate: { outcome: outcome as never, remarks: remarks || null } }).unwrap();
                toast.success('Follow-up recorded');
                setOutcome('');
                setRemarks('');
              } catch (e) {
                toast.error(e);
              }
            }}
          >
            Record
          </Button>
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
              <div className="min-w-0">
                {f.remarks && <p className="text-slate-800">{f.remarks}</p>}
                <p className="text-xs text-slate-500">
                  {f.createdByName ?? 'Unknown'} · {formatDateTime(f.createdAt)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Section>
  );
}
