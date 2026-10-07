import { useCallback, useState } from 'react';
import { useParams } from 'react-router';
import { Badge, Button, ErrorState, Field, Input, PageHeader, PageSpinner, Section } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { apiErrorMessage, formatDate, formatDateTime } from '@/shared/lib';
import { PdfDialog, PrintIcon, usePdf } from '../documents/DocumentPreview';
import { buildLeavePdf } from '../documents/pdf';
import { labelOf, LEAVE_TYPES, P } from '../permissions';
import { useDecideLeaveApplicationMutation, useGetLeaveApplicationQuery, useLazyGetLeaveDocumentQuery } from '../salesApi';
import { LEAVE_STATUS } from './LeaveListPage';

/** One leave application: its details, the manager's decision, and the printed form. */
export default function LeaveDetailPage() {
  const id = Number(useParams().id);
  const perm = usePermission();
  const toast = useToast();
  const { data: l, isLoading, error, refetch } = useGetLeaveApplicationQuery({ id });
  const [decide, { isLoading: deciding }] = useDecideLeaveApplicationMutation();
  const [loadDoc] = useLazyGetLeaveDocumentQuery();
  const [note, setNote] = useState('');
  const [printing, setPrinting] = useState(false);
  const build = useCallback(async () => buildLeavePdf(await loadDoc({ id }).unwrap()), [id, loadDoc]);
  const pdf = usePdf(printing ? build : null);

  if (isLoading) return <PageSpinner />;
  if (error || !l) return <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />;
  const canDecide = l.status === 'submitted' && l.employeeId !== perm.userId && perm.canIn(P.leaveApprove, l.dealershipId);
  const s = LEAVE_STATUS[l.status]!;

  const submit = async (approve: boolean) => {
    if (!approve && !note.trim()) return toast.error('Give the reason for rejecting');
    try {
      await decide({ id, leaveDecision: { approve, note: note.trim() || null } }).unwrap();
      toast.success(approve ? 'Leave approved: the employee is notified' : 'Leave rejected: the employee is notified');
      setNote('');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div>
      <PageHeader
        title={`${labelOf(LEAVE_TYPES, l.leaveType)} — ${l.employeeName}`}
        subtitle={l.applicationNo}
        breadcrumbs={[{ label: 'Leave applications', to: '/sales/leave' }, { label: l.applicationNo }]}
        actions={
          <Button variant="secondary" onClick={() => setPrinting(true)}>
            <PrintIcon />
            Leave form (print)
          </Button>
        }
      />
      <Section title="Application">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          {[
            ['Status', <Badge key="s" tone={s.tone}>{s.label}</Badge>],
            ['Employee', l.employeeName],
            ['Employee no.', l.employeeNo ?? '—'],
            ['Department', l.department],
            ['Leave', labelOf(LEAVE_TYPES, l.leaveType)],
            ['From – to', `${formatDate(l.fromDate)} – ${formatDate(l.toDate)} (${l.days} day${l.days > 1 ? 's' : ''})`],
            ['Reason', l.reason ?? '—'],
            ['Submitted', formatDateTime(l.createdAt)],
            ['Decision', l.decidedAt ? `${s.label} by ${l.decidedByName ?? '—'} on ${formatDateTime(l.decidedAt)}${l.decisionNote ? ` — ${l.decisionNote}` : ''}` : 'Waiting for the manager'],
          ].map(([k, v]) => (
            <div key={String(k)}>
              <dt className="text-slate-500">{k}</dt>
              <dd className="mt-0.5 font-medium text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
      {canDecide && (
        <Section title="Approve or reject">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Note (required to reject)" htmlFor="lv-note">
              <Input id="lv-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Approved; hand over your leads to Ali" />
            </Field>
            <div className="flex gap-2">
              <Button loading={deciding} onClick={() => void submit(true)}>
                Approve leave
              </Button>
              <Button variant="secondary" loading={deciding} onClick={() => void submit(false)}>
                Reject
              </Button>
            </div>
          </div>
        </Section>
      )}
      <PdfDialog open={printing} onClose={() => setPrinting(false)} title={`Leave application — ${l.applicationNo}`} pdf={pdf} loading={printing && !pdf} />
    </div>
  );
}
