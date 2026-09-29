import { LineItemsTable, type LineDraft } from '@/shared/components';
import { Section, Spinner } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import {
  type StockAdjustment,
  type StockTransfer,
  useAddStockAdjustmentLineMutation,
  useAddStockTransferLineMutation,
  useListStockAdjustmentLinesQuery,
  useListStockTransferLinesQuery,
  useRemoveStockAdjustmentLineMutation,
  useRemoveStockTransferLineMutation,
  useUpdateStockAdjustmentLineMutation,
  useUpdateStockTransferLineMutation,
} from '../../partsApi';
import { P } from '../../permissions';

function useToastingCall() {
  const toast = useToast();
  return async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      toast.error(e);
      throw e;
    }
  };
}

/** Transfer lines: part and quantity only; cost is taken at dispatch. */
export function TransferLines({ transfer }: { transfer: StockTransfer }) {
  const perm = usePermission();
  const call = useToastingCall();
  const { data, isLoading } = useListStockTransferLinesQuery({ id: transfer.id });
  const [add] = useAddStockTransferLineMutation();
  const [update] = useUpdateStockTransferLineMutation();
  const [remove] = useRemoveStockTransferLineMutation();
  const editable = transfer.status === 'draft' && perm.canIn(P.transfersCreate, transfer.dealershipId, transfer.branchId);
  return (
    <Section title="Lines">
      {isLoading ? (
        <Spinner className="size-4 text-slate-400" />
      ) : (
        <LineItemsTable
          lines={data ?? []}
          editable={editable}
          priced={false}
          descriptionFromPart
          onAdd={(d: LineDraft) => call(add({ id: transfer.id, transferLineCreate: { partNo: d.partNo.trim(), quantity: d.quantity.trim() } }).unwrap())}
          onUpdate={(lineId, d) => call(update({ id: transfer.id, lineId, transferLineUpdate: { quantity: d.quantity.trim() } }).unwrap())}
          onRemove={(lineId) => call(remove({ id: transfer.id, lineId }).unwrap())}
        />
      )}
    </Section>
  );
}

/** Adjustment lines: signed quantity (+found / -missing); increases may carry a cost. */
export function AdjustmentLines({ adjustment }: { adjustment: StockAdjustment }) {
  const perm = usePermission();
  const call = useToastingCall();
  const { data, isLoading } = useListStockAdjustmentLinesQuery({ id: adjustment.id });
  const [add] = useAddStockAdjustmentLineMutation();
  const [update] = useUpdateStockAdjustmentLineMutation();
  const [remove] = useRemoveStockAdjustmentLineMutation();
  const editable = adjustment.status === 'draft' && perm.canIn(P.adjustmentsCreate, adjustment.dealershipId, adjustment.branchId);
  // Blank cost = use the current average cost (the field is simply omitted).
  const cost = (d: LineDraft) => d.unitPrice.replace(/,/g, '').trim() || undefined;
  return (
    <Section title="Lines">
      {isLoading ? (
        <Spinner className="size-4 text-slate-400" />
      ) : (
        <LineItemsTable
          lines={(data ?? []).map((l) => ({ ...l, unitPrice: l.unitCost, amount: null }))}
          editable={editable}
          descriptionFromPart
          allowNegative
          priceOptional
          priceLabel="Unit cost"
          showTotal={false}
          onAdd={(d) => call(add({ id: adjustment.id, adjustmentLineCreate: { partNo: d.partNo.trim(), quantity: d.quantity.trim(), unitCost: cost(d) } }).unwrap())}
          onUpdate={(lineId, d) => call(update({ id: adjustment.id, lineId, adjustmentLineUpdate: { quantity: d.quantity.trim(), unitCost: cost(d) } }).unwrap())}
          onRemove={(lineId) => call(remove({ id: adjustment.id, lineId }).unwrap())}
        />
      )}
      {editable && <p className="mt-2 text-xs text-slate-500">Use negative quantities for missing or damaged stock. Leave the cost empty to use the average cost.</p>}
    </Section>
  );
}
