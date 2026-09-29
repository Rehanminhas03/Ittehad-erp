import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Field, Input, Section } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { type PurchaseOrder, useListPurchaseOrderLinesQuery, useReceiveGoodsMutation } from '../../partsApi';
import { P } from '../../permissions';

const remaining = (q: string, r: string) => Math.round((Number(q) - Number(r)) * 100) / 100;

/** Receive goods against an approved PO: quantities default to what is still outstanding. */
export function ReceiveGoods({ po }: { po: PurchaseOrder }) {
  const perm = usePermission();
  const toast = useToast();
  const navigate = useNavigate();
  const can = ['approved', 'partially_received'].includes(po.status) && perm.canIn(P.receiptsCreate, po.dealershipId, po.branchId);
  const { data: lines } = useListPurchaseOrderLinesQuery({ id: po.id }, { skip: !can });
  const [receive, { isLoading }] = useReceiveGoodsMutation();
  const [qty, setQty] = useState<Record<number, string>>({});
  const [invoiceNo, setInvoiceNo] = useState('');

  useEffect(() => {
    if (lines) setQty(Object.fromEntries(lines.map((l) => [l.id, String(remaining(l.quantity, l.receivedQty))])));
  }, [lines]);

  if (!can || !lines) return null;
  const open = lines.filter((l) => remaining(l.quantity, l.receivedQty) > 0);
  const toReceive = open.filter((l) => Number(qty[l.id]) > 0);

  return (
    <Section title="Receive goods">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
            <th className="py-2 pr-2 font-medium">Part</th>
            <th className="py-2 pr-2 text-right font-medium">Ordered</th>
            <th className="py-2 pr-2 text-right font-medium">Received</th>
            <th className="py-2 pr-2 text-right font-medium">Receive now</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {open.map((l) => (
            <tr key={l.id}>
              <td className="py-2 pr-2">
                <span className="font-mono text-xs">{l.partNo}</span> <span className="text-slate-600">{l.description}</span>
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{Number(l.quantity)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{Number(l.receivedQty)}</td>
              <td className="py-2 pr-2 text-right">
                <Input
                  value={qty[l.id] ?? ''}
                  onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })}
                  className="ml-auto w-24 py-1 text-right text-xs"
                  inputMode="decimal"
                  aria-label={`Receive ${l.partNo}`}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Field label="Supplier invoice no." htmlFor="grn-invoice">
          <Input id="grn-invoice" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
        </Field>
        <Button
          disabled={!toReceive.length}
          loading={isLoading}
          onClick={async () => {
            try {
              const grn = await receive({
                id: po.id,
                receiveGoodsRequest: {
                  supplierInvoiceNo: invoiceNo.trim() || null,
                  lines: toReceive.map((l) => ({ lineId: l.id, quantity: qty[l.id]!.trim() })),
                },
              }).unwrap();
              toast.success(`Goods receipt ${grn.grnNo} posted to stock`);
              navigate(`/parts/goods-receipts/${grn.id}`);
            } catch (e) {
              toast.error(e);
            }
          }}
        >
          Receive into stock
        </Button>
      </div>
    </Section>
  );
}
