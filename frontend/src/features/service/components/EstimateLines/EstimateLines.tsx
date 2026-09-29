import { LineItemsTable, type LineDraft } from '@/shared/components';
import { Section, Spinner } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { LINE_KINDS, P } from '../../permissions';
import {
  type Estimate,
  type EstimateLine,
  useAddEstimateLineMutation,
  useListEstimateLinesQuery,
  useRemoveEstimateLineMutation,
  useUpdateEstimateLineMutation,
} from '../../serviceApi';

const toBody = (d: LineDraft) => ({
  kind: d.kind as 'labour' | 'part',
  description: d.description,
  partNo: d.partNo || null,
  quantity: d.quantity,
  unitPrice: d.unitPrice.replace(/,/g, ''),
});

/** Estimate lines: editable while the estimate is a draft; totals are computed by the server. */
export function EstimateLines({ estimate }: { estimate: Estimate }) {
  const perm = usePermission();
  const toast = useToast();
  const { data: lines, isLoading } = useListEstimateLinesQuery({ id: estimate.id });
  const [add] = useAddEstimateLineMutation();
  const [update] = useUpdateEstimateLineMutation();
  const [remove] = useRemoveEstimateLineMutation();
  const editable = estimate.status === 'draft' && perm.canIn(P.estimatesUpdate, estimate.dealershipId, estimate.branchId);
  const withToast = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      toast.error(e);
      throw e;
    }
  };

  return (
    <Section title="Lines">
      {isLoading ? (
        <Spinner className="size-4 text-slate-400" />
      ) : (
        <LineItemsTable<EstimateLine>
          lines={lines ?? []}
          kinds={LINE_KINDS}
          editable={editable}
          onAdd={(d) => withToast(add({ id: estimate.id, estimateLineCreate: { ...toBody(d), sortOrder: (lines?.length ?? 0) + 1 } }).unwrap())}
          onUpdate={(lineId, d) => withToast(update({ id: estimate.id, lineId, estimateLineUpdate: toBody(d) }).unwrap())}
          onRemove={(lineId) => withToast(remove({ id: estimate.id, lineId }).unwrap())}
          rowNote={(l) => (l.inspectionItemId ? 'From inspection' : null)}
        />
      )}
      {!editable && estimate.status === 'draft' && <p className="mt-2 text-xs text-slate-500">You can view but not edit this estimate.</p>}
    </Section>
  );
}
