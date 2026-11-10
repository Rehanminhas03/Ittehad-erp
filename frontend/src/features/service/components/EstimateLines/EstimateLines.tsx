import { useState } from 'react';
import { PartPicker } from '@/features/parts/components/PartPicker';
import { LineItemsTable, type LineDraft } from '@/shared/components';
import { Button, Section, Spinner } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { LINE_KINDS, P } from '../../permissions';
import { EstimateServiceDialog } from './EstimateServiceDialog';
import {
  type Estimate,
  type EstimateLine,
  useAddEstimateLineMutation,
  useListEstimateLinesQuery,
  useRemoveEstimateLineMutation,
  useUpdateEstimateLineMutation,
} from '../../serviceApi';

const toBody = (d: LineDraft) => ({
  kind: d.kind as 'labour' | 'part' | 'lubricant' | 'accessory' | 'sublet',
  description: d.description,
  partNo: d.partNo || null,
  quantity: d.quantity,
  unitPrice: d.unitPrice.replace(/,/g, ''),
  discountPercent: d.discountPercent.replace('%', '').trim() || '0',
});

/** Estimate lines: editable while the estimate is a draft; totals are computed by the server. */
export function EstimateLines({ estimate }: { estimate: Estimate }) {
  const perm = usePermission();
  const toast = useToast();
  const { data: lines, isLoading } = useListEstimateLinesQuery({ id: estimate.id });
  const [add] = useAddEstimateLineMutation();
  const [update] = useUpdateEstimateLineMutation();
  const [remove] = useRemoveEstimateLineMutation();
  const [periodic, setPeriodic] = useState(false);
  // The advisor edits the estimate; the store adds the parts and their prices.
  const editable = estimate.status === 'draft' && (perm.canIn(P.estimatesUpdate, estimate.dealershipId, estimate.branchId) || perm.canIn(P.estimatesStoreEdit, estimate.dealershipId, estimate.branchId));
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
          discountable
          partNoField={(kind) => (kind === 'part' || kind === 'lubricant' || kind === 'accessory' ? 'auto' : 'none')}
          descriptionHint={(kind) => (kind === 'sublet' ? 'Work done outside the workshop (describe it)' : kind === 'labour' ? 'Labour: what is to be done' : 'Chosen from the store above')}
          addHelper={(kind, fill) =>
            kind === 'part' || kind === 'lubricant' || kind === 'accessory' ? (
              <PartPicker placeholder={kind === 'lubricant' ? 'Search the lubricant (engine oil, oil filter ...) by number or name, then choose it…' : 'Search the part by number or name, then choose it…'} onPick={(p) => fill({ partNo: p.partNo, description: p.description, unitPrice: p.sellingPrice })} />
            ) : kind === 'labour' ? (
              <Button size="sm" variant="secondary" onClick={() => setPeriodic(true)}>
                + Add a periodic service (5,000 km, 30,000 km ...)
              </Button>
            ) : (
              <p className="text-xs text-slate-500">Work done outside the workshop: write what is to be done and enter its price below.</p>
            )
          }
          lines={lines ?? []}
          kinds={LINE_KINDS}
          editable={editable}
          onAdd={(d) => withToast(add({ id: estimate.id, estimateLineCreate: { ...toBody(d), sortOrder: (lines?.length ?? 0) + 1 } }).unwrap())}
          onUpdate={(lineId, d) => withToast(update({ id: estimate.id, lineId, estimateLineUpdate: toBody(d) }).unwrap())}
          onRemove={(lineId) => withToast(remove({ id: estimate.id, lineId }).unwrap())}
          rowNote={(l) => (l.inspectionItemId ? 'From inspection' : null)}
        />
      )}
      {periodic && <EstimateServiceDialog estimate={estimate} firstSort={(lines?.length ?? 0) + 1} onClose={() => setPeriodic(false)} />}
      {!editable && estimate.status === 'draft' && <p className="mt-2 text-xs text-slate-500">You can view but not edit this estimate.</p>}
    </Section>
  );
}
