import { PartPicker } from '../PartPicker';
import { itemTypeOf } from '../../lib/itemType';
import { LineItemsTable, type LineDraft } from '@/shared/components';
import { Section, Spinner } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import {
  type PurchaseOrder,
  type PurchaseOrderLine,
  useAddPurchaseOrderLineMutation,
  useListPurchaseOrderLinesQuery,
  useRemovePurchaseOrderLineMutation,
  useUpdatePurchaseOrderLineMutation,
} from '../../partsApi';
import { ITEM_TYPES } from '../../lib/itemType';
import { P } from '../../permissions';

const body = (d: LineDraft) => ({ partNo: d.partNo.trim(), description: d.description.trim(), quantity: d.quantity.trim(), unitPrice: d.unitPrice.replace(/,/g, '') });

/** PO lines: a part is chosen from the catalogue by searching its number or name (never typed in); the server computes amounts and the total. */
export function PurchaseOrderLines({ po }: { po: PurchaseOrder }) {
  const perm = usePermission();
  const toast = useToast();
  const { data: lines, isLoading } = useListPurchaseOrderLinesQuery({ id: po.id });
  const [add] = useAddPurchaseOrderLineMutation();
  const [update] = useUpdatePurchaseOrderLineMutation();
  const [remove] = useRemovePurchaseOrderLineMutation();
  const editable = po.status === 'draft' && perm.canIn(P.purchaseOrdersUpdate, po.dealershipId, po.branchId);
  const received = !['draft', 'submitted'].includes(po.status);
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
        <LineItemsTable<PurchaseOrderLine & { kind: string }>
          lines={(lines ?? []).map((l) => ({ ...l, kind: l.itemType }))}
          kinds={ITEM_TYPES}
          editable={editable}
          partNoField={() => 'auto'}
          descriptionHint={() => 'Chosen from the parts above'}
          addHelper={(_kind, fill) => (
            <PartPicker placeholder="Search the part by number or name, then choose it…" onPick={(p) => fill({ kind: itemTypeOf(p), partNo: p.partNo, description: p.description, ...(p.purchasePrice ? { unitPrice: String(Number(p.purchasePrice)) } : {}) })} />
          )}
          priceLabel="Cost from supplier"
          onAdd={(d) => withToast(add({ id: po.id, purchaseOrderLineCreate: { ...body(d), itemType: d.kind as 'part' | 'accessory' | 'lubricant' } }).unwrap())}
          onUpdate={(lineId, d) => withToast(update({ id: po.id, lineId, purchaseOrderLineUpdate: body(d) }).unwrap())}
          onRemove={(lineId) => withToast(remove({ id: po.id, lineId }).unwrap())}
          extraHeader={received ? 'Received' : undefined}
          renderExtra={received ? (l) => <span className="tabular-nums">{Number(l.receivedQty)} / {Number(l.quantity)}</span> : undefined}
        />
      )}
    </Section>
  );
}
