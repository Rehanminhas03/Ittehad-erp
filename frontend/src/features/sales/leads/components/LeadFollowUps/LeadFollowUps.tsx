import { useState } from 'react';
import { Badge, Button, Field, Input, Section, Select, Spinner, Textarea } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatDate, formatDateTime } from '@/shared/lib';
import { FOLLOW_UP_GAP_DAYS, FOLLOW_UP_OUTCOMES, labelOf, LEAD_TEMPERATURES, MIN_FOLLOW_UPS_TO_EXHAUST, OPEN_LEAD_STATES, P } from '../../../permissions';
import { TemperatureBadge } from '../TemperatureBadge';

const pakistanToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** The schedule's day for the next follow-up, once `done` have been made (null after the third). */
const scheduled = (done: number) => (FOLLOW_UP_GAP_DAYS[done] === undefined ? '' : plusDays(pakistanToday(), FOLLOW_UP_GAP_DAYS[done]!));
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
  // How interested the customer is, and when to call next (the schedule's day, which can be changed).
  const [temperature, setTemperature] = useState<string>(lead.temperature ?? '');
  const [nextOn, setNextOn] = useState<string | null>(null);

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

  const lost = outcome === 'not_interested';
  const nextValue = nextOn ?? scheduled(lead.followUpCount + 1);
  const today = pakistanToday();
  const due = isOpenLead && !!lead.nextFollowUpOn && lead.nextFollowUpOn <= today;

  return (
    <Section
      title={`Follow-ups (${lead.followUpCount})`}
      actions={isOpenLead && remaining > 0 && <span className="text-xs text-slate-500">{remaining} more before it can be marked exhausted</span>}
    >
      {isOpenLead && (
        <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${due ? 'bg-red-50 font-medium text-red-800' : 'bg-brand-50 text-brand-900'}`}>
          {lead.nextFollowUpOn
            ? `${due ? 'Follow-up due' : 'Next follow-up'}: ${lead.nextFollowUpOn === today ? 'today' : formatDate(lead.nextFollowUpOn)} (follow-up ${Math.min(lead.followUpCount + 1, MIN_FOLLOW_UPS_TO_EXHAUST)} of ${MIN_FOLLOW_UPS_TO_EXHAUST})`
            : lead.followUpCount >= MIN_FOLLOW_UPS_TO_EXHAUST
              ? 'All three follow-ups are done: convert the lead, mark it exhausted or lost.'
              : 'No follow-up date set.'}
          {' '}Schedule: day 2, day 5 and about day 11 after the lead is logged.
        </p>
      )}
      {canRecord && (
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-[12rem_10rem_1fr] sm:items-end">
          <Field label="Outcome" htmlFor="fu-outcome">
            <Select
              id="fu-outcome"
              value={outcome}
              onChange={(e) => {
                setOutcome(e.target.value);
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
          <Field label="Interest" htmlFor="fu-temp" required={!lost}>
            <Select id="fu-temp" value={lost ? 'cold' : temperature} disabled={lost} onChange={(e) => setTemperature(e.target.value)}>
              <option value="">Hot, warm or cold…</option>
              {LEAD_TEMPERATURES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Remarks" htmlFor="fu-remarks">
            <Textarea id="fu-remarks" rows={1} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="What the customer said" />
          </Field>
          {!lost && (
            <Field label="Next follow-up" htmlFor="fu-next" hint={nextValue ? 'Per the schedule; you can change it' : 'This was the third: none planned'}>
              <Input id="fu-next" type="date" min={today} value={nextValue} onChange={(e) => setNextOn(e.target.value)} />
            </Field>
          )}
          <Button
            disabled={!outcome || (!lost && !temperature)}
            loading={saving}
            onClick={async () => {
              try {
                await record({
                  id: lead.id,
                  leadFollowUpCreate: {
                    outcome: outcome as never,
                    remarks: remarks || null,
                    markLost: lost || undefined,
                    temperature: lost ? undefined : (temperature as never),
                    nextFollowUpOn: lost ? undefined : nextValue || null,
                  },
                }).unwrap();
                toast.success(lost ? 'Lead marked as lost: it moves to Lost leads' : 'Follow-up recorded');
                setOutcome('');
                setRemarks('');
                setNextOn(null);
              } catch (e) {
                toast.error(e);
              }
            }}
          >
            Record follow-up
          </Button>
          {outcome === 'not_interested' && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 sm:col-span-3">
              Not interested: there are no more follow-ups. The lead moves to Lost leads (it stays there with all its details and your remarks).
            </p>
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
              <span className="flex flex-col items-start gap-1">
                <Badge tone={OUTCOME_TONES[f.outcome]}>{labelOf(FOLLOW_UP_OUTCOMES, f.outcome)}</Badge>
                <TemperatureBadge value={f.temperature} />
              </span>
              <div className="min-w-0 flex-1">
                {f.remarks && <p className="text-slate-800">{f.remarks}</p>}
                <p className="text-xs text-slate-500">
                  {f.createdByName ?? 'Unknown'} · {formatDateTime(f.createdAt)}
                  {f.nextFollowUpOn ? ` · next follow-up ${formatDate(f.nextFollowUpOn)}` : ''}
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
