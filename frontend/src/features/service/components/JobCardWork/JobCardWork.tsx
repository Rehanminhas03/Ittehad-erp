import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PartPicker } from '@/features/parts/components/PartPicker';
import { ReturnPartButton } from '@/features/parts/components/ReturnPartButton';
import { useListPendingPartReturnsQuery } from '@/features/parts/partsApi';
import { PeriodicServiceDialog } from '../PeriodicServiceDialog';
import { ServiceIncludes } from '../ServiceIncludes';
import { LineItemsTable, type LineDraft } from '@/shared/components';
import { Badge, Button, Checkbox, Section, Spinner } from '@/shared/components/ui';
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
  discountPercent: d.discountPercent.replace('%', '').trim() || '0',
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
  // The periodic service form: opened by the button, or straight after check-in (?service=<id>).
  const [params, setParams] = useSearchParams();
  const [periodic, setPeriodic] = useState(params.has('service'));
  // Parts sent back to the store and not yet accepted (part number to quantity).
  const { data: pendingReturns } = useListPendingPartReturnsQuery({ jobCardId: jobCard.id }, { skip: !perm.can('parts.requests.view') });
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
          discountable
          addHelper={(kind, fill) =>
            kind === 'part' ? (
              <PartPicker placeholder="Search the part by number or name, then choose it…" onPick={(p) => fill({ partNo: p.partNo, description: p.description, unitPrice: p.sellingPrice })} />
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setPeriodic(true)}>
                + Add a periodic service (5,000 km, 30,000 km ...)
              </Button>
            )
          }
          kinds={LINE_KINDS}
          editable={canEdit}
          onAdd={(d) => withToast(add({ id: jobCard.id, jobCardLineCreate: toBody(d) }).unwrap())}
          onUpdate={(lineId, d) => withToast(update({ id: jobCard.id, lineId, jobCardLineUpdate: toBody(d) }).unwrap())}
          onRemove={(lineId) => withToast(remove({ id: jobCard.id, lineId }).unwrap())}
          lineLocked={(l) => (l.source === 'manual' ? null : l.source === 'estimate' ? 'Approved by the customer' : 'Scheduled service')}
          rowNote={(l) => (
            <>
              {l.source === 'estimate' && 'From approved estimate'}
              {l.source === 'schedule' && 'Scheduled service'}
              {!l.billable && <> · <Badge tone="green">Free of charge</Badge></>}
              {l.billable && l.kind === 'part' && <> · <Badge tone="amber">Charged to the customer</Badge></>}
              {l.scheduleItemId && <ServiceIncludes scheduleItemId={l.scheduleItemId} />}
              {l.source === 'parts' && l.partNo && !closed && perm.canIn('parts.requests.create', jobCard.dealershipId, jobCard.branchId) && (
                <div className="mt-1">
                  <ReturnPartButton jobCardId={jobCard.id} partNo={l.partNo} description={l.description} issuedQty={Number(l.quantity)} pendingQty={Number(pendingReturns?.[l.partNo] ?? 0)} />
                </div>
              )}
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
      {periodic && (
        <PeriodicServiceDialog
          jobCard={jobCard}
          initialServiceId={Number(params.get('service')) || null}
          onClose={() => {
            setPeriodic(false);
            if (params.has('service')) {
              params.delete('service');
              setParams(params, { replace: true });
            }
          }}
        />
      )}
    </Section>
  );
}
