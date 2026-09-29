import { LineItemsTable, type LineDraft } from '@/shared/components';
import { Badge, Checkbox, Section, Spinner } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { LINE_KINDS, P } from '../../permissions';
import {
  type JobCard,
  type JobCardLine,
  useAddJobCardLineMutation,
  useListJobCardLinesQuery,
  useRemoveJobCardLineMutation,
  useSetJobCardLineDoneMutation,
  useUpdateJobCardLineMutation,
} from '../../serviceApi';

const toBody = (d: LineDraft) => ({
  kind: d.kind as 'labour' | 'part',
  description: d.description,
  partNo: d.partNo || null,
  quantity: d.quantity,
  unitPrice: d.unitPrice.replace(/,/g, ''),
});

/** The work on a job card: advisors add/edit manual lines, technicians mark lines done. */
export function JobCardWork({ jobCard }: { jobCard: JobCard }) {
  const perm = usePermission();
  const toast = useToast();
  const { data: lines, isLoading } = useListJobCardLinesQuery({ id: jobCard.id });
  const [add] = useAddJobCardLineMutation();
  const [update] = useUpdateJobCardLineMutation();
  const [remove] = useRemoveJobCardLineMutation();
  const [setDone] = useSetJobCardLineDoneMutation();
  const closed = ['completed', 'cancelled'].includes(jobCard.status);
  const canEdit = !closed && perm.canIn(P.jobCardsUpdate, jobCard.dealershipId, jobCard.branchId);
  const canWork = jobCard.status === 'in_progress' && perm.canIn(P.jobCardsWork, jobCard.dealershipId, jobCard.branchId);
  const withToast = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      toast.error(e);
      throw e;
    }
  };

  return (
    <Section title="Work">
      {isLoading ? (
        <Spinner className="size-4 text-slate-400" />
      ) : (
        <LineItemsTable<JobCardLine>
          lines={lines ?? []}
          kinds={LINE_KINDS}
          editable={canEdit}
          onAdd={(d) => withToast(add({ id: jobCard.id, jobCardLineCreate: { ...toBody(d), billable: true } }).unwrap())}
          onUpdate={(lineId, d) => withToast(update({ id: jobCard.id, lineId, jobCardLineUpdate: toBody(d) }).unwrap())}
          onRemove={(lineId) => withToast(remove({ id: jobCard.id, lineId }).unwrap())}
          lineLocked={(l) => (l.source === 'manual' ? null : l.source === 'estimate' ? 'Approved by the customer' : 'Scheduled service')}
          rowNote={(l) => (
            <>
              {l.source === 'estimate' && 'From approved estimate'}
              {l.source === 'schedule' && 'Scheduled service'}
              {!l.billable && <> · <Badge tone="green">Free / warranty</Badge></>}
            </>
          )}
          extraHeader="Done"
          renderExtra={(l) =>
            canWork ? (
              <Checkbox
                label=""
                aria-label={`Mark ${l.description} done`}
                checked={l.status === 'done'}
                onChange={(e) => void withToast(setDone({ id: jobCard.id, lineId: l.id, body: { done: e.target.checked } }).unwrap()).catch(() => undefined)}
              />
            ) : l.status === 'done' ? (
              <Badge tone="green">Done</Badge>
            ) : (
              <Badge>Pending</Badge>
            )
          }
        />
      )}
    </Section>
  );
}
