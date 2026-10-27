import { useGetVehicleQuery } from '@/features/crm/crmApi';
import { PartPicker } from '@/features/parts/components/PartPicker';
import { LineItemsTable, type LineDraft } from '@/shared/components';
import { Badge, Checkbox, Section, Select, Spinner } from '@/shared/components/ui';
import { formatNumber } from '@/shared/lib';
import { usePermission, useToast } from '@/shared/hooks';
import { LINE_KINDS, P } from '../../permissions';
import {
  type JobCard,
  type JobCardLine,
  useAddJobCardLineMutation,
  useListJobCardLinesQuery,
  useListScheduleItemsQuery,
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
  // The services of the car's model (1st service, 5,000 km ... ) offered when adding labour.
  const { data: vehicle } = useGetVehicleQuery({ id: jobCard.vehicleId });
  const { data: services } = useListScheduleItemsQuery({ modelId: vehicle?.modelId ?? 0, isActive: 'true', pageSize: 50, sort: 'sequence' }, { skip: !vehicle?.modelId });
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
            ) : services?.items.length ? (
              <Select value="" aria-label="Add a service" onChange={(e) => { const s = services.items.find((x) => String(x.id) === e.target.value); if (s) fill({ description: `${s.name} (${formatNumber(s.dueKm)} km service)`, partNo: '' }); }}>
                <option value="">Choose a service (1st, 2nd ... with its km), or type the work below</option>
                {services.items.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {formatNumber(s.dueKm)} km{s.isFree ? ' · free labour' : ''}
                  </option>
                ))}
              </Select>
            ) : null
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
