import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Field, Input, PageHeader, Section, Select, Textarea } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { amountNumber, formatMoney } from '@/shared/lib';
import { PartPicker } from '../../components/PartPicker';
import { StoreTargetFields, useStoreTarget } from '../../components/StoreTarget';
import { useSupplierOptions } from '../../hooks';
import { usePrefillPart } from '../../hooks/usePrefillPart';
import { useReceiveStockMutation } from '../../partsApi';
import { P } from '../../permissions';

interface Line {
  partNo: string;
  description: string;
  quantity: string;
  unitCost: string;
}

/**
 * Receive parts from head office: pick each part, enter the quantity and the price paid per piece, and
 * post them to stock. No purchase order needed; the head-office invoice / challan number is kept.
 */
export default function ReceiveStockPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const t = useStoreTarget(P.receiptsCreate);
  const suppliers = useSupplierOptions(t.dealershipId);
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [receive, { isLoading }] = useReceiveStockMutation();
  const supplier = supplierId || suppliers[0]?.value || '';
  usePrefillPart((p) => setLines((ls) => (ls.some((l) => l.partNo === p.partNo) ? ls : [...ls, { partNo: p.partNo, description: p.description, quantity: '1', unitCost: '' }])));

  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + amountNumber(l.quantity) * amountNumber(l.unitCost), 0);

  const submit = async () => {
    if (!t.dealershipId || !t.branchId || !supplier) return setError('Choose the store and the supplier (head office)');
    if (!lines.length) return setError('Add at least one part');
    const bad = lines.findIndex((l) => !(amountNumber(l.quantity) > 0) || !l.unitCost.trim());
    if (bad >= 0) return setError(`${lines[bad]!.partNo}: enter the quantity and the price per piece`);
    setError(null);
    try {
      const grn = await receive({
        directReceiveRequest: {
          dealershipId: t.dealershipId,
          branchId: t.branchId,
          supplierId: Number(supplier),
          receivedDate: receivedDate || undefined,
          supplierInvoiceNo: invoiceNo.trim() || null,
          notes: notes.trim() || null,
          lines: lines.map((l) => ({ partNo: l.partNo, quantity: l.quantity.trim(), unitCost: l.unitCost.trim() })),
        },
      }).unwrap();
      toast.success(`Goods receipt ${grn.grnNo} posted: ${lines.length} parts are in stock`);
      navigate(`/parts/goods-receipts/${grn.id}`);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div>
      <PageHeader title="Receive parts" subtitle="Parts that came from head office: enter each part with its quantity and price. They go into the store's stock straight away." />
      <div className="space-y-5">
        <Section title="Delivery">
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <StoreTargetFields t={t} />
            <Field label="Received from" htmlFor="rs-supplier">
              <Select id="rs-supplier" value={supplier} onChange={(e) => setSupplierId(e.target.value)}>
                {suppliers.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Invoice / challan no." htmlFor="rs-invoice" hint="The head-office document">
              <Input id="rs-invoice" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
            </Field>
            <Field label="Received on" htmlFor="rs-date" hint="Empty: today">
              <Input id="rs-date" type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} />
            </Field>
            <Field label="Notes" htmlFor="rs-notes" className="sm:col-span-2">
              <Textarea id="rs-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Parts received">
          <PartPicker
            onPick={(p) =>
              setLines((ls) => (ls.some((l) => l.partNo === p.partNo) ? ls : [...ls, { partNo: p.partNo, description: p.description, quantity: '1', unitCost: '' }]))
            }
          />
          {lines.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
                    <th className="py-2 pr-2 font-medium">Part</th>
                    <th className="py-2 pr-2 text-right font-medium">Quantity</th>
                    <th className="py-2 pr-2 text-right font-medium">Price per piece (PKR)</th>
                    <th className="py-2 pr-2 text-right font-medium">Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l, i) => (
                    <tr key={l.partNo}>
                      <td className="py-2 pr-2">
                        <span className="font-mono text-xs">{l.partNo}</span> <span className="text-slate-600">{l.description}</span>
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <Input value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} className="ml-auto w-20 py-1 text-right text-xs" inputMode="decimal" aria-label={`Quantity of ${l.partNo}`} />
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <Input value={l.unitCost} onChange={(e) => set(i, { unitCost: e.target.value })} className="ml-auto w-32 py-1 text-right text-xs" inputMode="decimal" aria-label={`Price of ${l.partNo}`} />
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(String(amountNumber(l.quantity) * amountNumber(l.unitCost)))}</td>
                      <td className="py-2 text-right">
                        <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} className="py-2 pr-2 text-right text-sm font-medium">
                      Total value received
                    </td>
                    <td className="py-2 pr-2 text-right font-semibold tabular-nums">{formatMoney(String(total))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end">
            <Button loading={isLoading} disabled={!lines.length} onClick={submit}>
              Receive into stock
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
