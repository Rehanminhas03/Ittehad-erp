import { LineItemsTable } from '@/shared/components';
import { Section, Spinner } from '@/shared/components/ui';
import { type GoodsReceipt, useListGoodsReceiptLinesQuery } from '../../partsApi';

/** What a goods receipt brought into stock (read-only: receipts are immutable). */
export function GoodsReceiptLines({ grn }: { grn: GoodsReceipt }) {
  const { data, isLoading } = useListGoodsReceiptLinesQuery({ id: grn.id });
  return (
    <Section title="Lines">
      {isLoading ? (
        <Spinner className="size-4 text-slate-400" />
      ) : (
        <LineItemsTable lines={(data ?? []).map((l) => ({ ...l, unitPrice: l.unitCost }))} editable={false} priceLabel="Unit cost" />
      )}
    </Section>
  );
}
