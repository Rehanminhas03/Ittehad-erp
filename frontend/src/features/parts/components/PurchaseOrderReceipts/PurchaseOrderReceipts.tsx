import { Link } from 'react-router';
import { Section } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { formatDate, formatMoney } from '@/shared/lib';
import { type PurchaseOrder, useListGoodsReceiptsQuery } from '../../partsApi';
import { P } from '../../permissions';

/** Goods receipts posted against a purchase order. */
export function PurchaseOrderReceipts({ po }: { po: PurchaseOrder }) {
  const perm = usePermission();
  const canView = perm.can(P.receiptsView);
  const { data } = useListGoodsReceiptsQuery({ purchaseOrderId: po.id, pageSize: 50 }, { skip: !canView || ['draft', 'submitted'].includes(po.status) });
  if (!data?.items.length) return null;
  return (
    <Section title="Receipts">
      <ul className="divide-y divide-slate-100">
        {data.items.map((g) => (
          <li key={g.id} className="flex items-center justify-between py-2 text-sm">
            <Link to={`/parts/goods-receipts/${g.id}`} className="font-mono text-xs text-slate-800 hover:text-brand-700">
              {g.grnNo}
            </Link>
            <span className="text-slate-500">
              {formatDate(g.receivedDate)} · {g.supplierInvoiceNo ?? 'no invoice no.'} · <span className="tabular-nums text-slate-800">{formatMoney(g.totalCost)}</span>
            </span>
          </li>
        ))}
      </ul>
    </Section>
  );
}
