import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Field, Input, PageHeader, Section, Select, Textarea } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { amountNumber, formatMoney } from '@/shared/lib';
import { ITEM_TYPES, type ItemType, itemTypeOf } from '../../lib/itemType';
import { PartPicker } from '../../components/PartPicker';
import { StoreTargetFields, useStoreTarget } from '../../components/StoreTarget';
import { useSupplierOptions } from '../../hooks';
import { useAddPurchaseOrderLineMutation, useCreatePurchaseOrderMutation } from '../../partsApi';
import { P } from '../../permissions';

interface Line {
  itemType: ItemType;
  partNo: string;
  description: string;
  quantity: string;
  unitCost: string;
}
const blank = (): Line => ({ itemType: 'part', partNo: '', description: '', quantity: '1', unitCost: '' });

/**
 * A new purchase order with its parts and lubricants in one go: pick a part from the catalogue, or type the part number and
 * the part name by hand when it is not in the list (it is added to the catalogue). Saved as one order, ready to print.
 */
export default function NewPurchaseOrderPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const t = useStoreTarget(P.purchaseOrdersCreate);
  const suppliers = useSupplierOptions(t.dealershipId);
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createPo] = useCreatePurchaseOrderMutation();
  const [addLine] = useAddPurchaseOrderLineMutation();
  const supplier = supplierId || suppliers[0]?.value || '';

  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const filled = lines.filter((l) => l.partNo.trim() || l.description.trim());
  const total = filled.reduce((s, l) => s + amountNumber(l.quantity) * amountNumber(l.unitCost), 0);

  const submit = async () => {
    if (!t.dealershipId || !t.branchId || !supplier) return setError('Choose the store and the supplier');
    if (!filled.length) return setError('Add at least one part');
    const bad = filled.findIndex((l) => l.partNo.trim().length < 2 || l.description.trim().length < 2 || !(amountNumber(l.quantity) > 0) || !l.unitCost.trim());
    if (bad >= 0) return setError(`Line ${bad + 1}: enter the part number, the part name, the quantity and the cost from the supplier`);
    setError(null);
    setBusy(true);
    let id: number | null = null;
    try {
      const po = await createPo({ purchaseOrderCreate: { dealershipId: t.dealershipId, branchId: t.branchId, supplierId: Number(supplier), expectedDate: expectedDate || null, notes: notes.trim() || null } }).unwrap();
      id = po.id;
      for (const l of filled) {
        await addLine({ id: po.id, purchaseOrderLineCreate: { partNo: l.partNo.trim(), itemType: l.itemType, description: l.description.trim(), quantity: l.quantity.trim(), unitPrice: l.unitCost.replace(/,/g, '').trim() } }).unwrap();
      }
      toast.success(`Purchase order ${po.poNo} created`);
      navigate(`/parts/purchase-orders/${po.id}`);
    } catch (e) {
      toast.error(e);
      // The order was made but a line was refused: open it so the rest can be fixed there.
      if (id) navigate(`/parts/purchase-orders/${id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="New purchase order" subtitle="The parts and lubricants to order from the company. The cost is what we pay the supplier per piece, not the customer's selling price. Save it, print it and send it; receive the goods against it when they arrive." />
      <Section title="Order">
        <div className="grid gap-4 sm:grid-cols-2">
          <StoreTargetFields t={t} />
          <Field label="Supplier (company)" htmlFor="po-supplier">
            <Select id="po-supplier" value={supplier} onChange={(e) => setSupplierId(e.target.value)}>
              {suppliers.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Expected delivery" htmlFor="po-expected">
            <Input id="po-expected" type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
          </Field>
          <Field label="Notes" htmlFor="po-notes" className="sm:col-span-2">
            <Textarea id="po-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </Field>
        </div>
      </Section>

      <Section title="Parts and lubricants">
        <div className="mb-3">
          <PartPicker
            placeholder="Search the catalogue by number or name, then choose it… (or type a new part below)"
            onPick={(p) => setLines((ls) => [...ls.filter((l) => l.partNo.trim() || l.description.trim()), ...(ls.some((l) => l.partNo === p.partNo) ? [] : [{ itemType: itemTypeOf(p), partNo: p.partNo, description: p.description, quantity: '1', unitCost: p.purchasePrice ? String(Number(p.purchasePrice)) : '' }]), blank()])}
          />
        </div>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
              <th className="py-2 pr-2 font-medium">Type</th>
              <th className="py-2 pr-2 font-medium">Part number</th>
              <th className="py-2 pr-2 font-medium">Part name</th>
              <th className="py-2 pr-2 text-right font-medium">Qty</th>
              <th className="py-2 pr-2 text-right font-medium">Cost from supplier (each)</th>
              <th className="py-2 pr-2 text-right font-medium">Amount</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="py-1.5 pr-2">
                  <Select value={l.itemType} onChange={(e) => set(i, { itemType: e.target.value as ItemType })} className="py-1 text-xs" aria-label="Type">
                    {ITEM_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="py-1.5 pr-2">
                  <Input value={l.partNo} onChange={(e) => set(i, { partNo: e.target.value })} className="py-1 font-mono text-xs" placeholder="Part number" aria-label="Part number" />
                </td>
                <td className="py-1.5 pr-2">
                  <Input value={l.description} onChange={(e) => set(i, { description: e.target.value })} className="py-1 text-xs" placeholder="Part name" aria-label="Part name" />
                </td>
                <td className="py-1.5 pr-2">
                  <Input value={l.quantity} onChange={(e) => set(i, { quantity: e.target.value })} className="ml-auto w-20 py-1 text-right text-xs" inputMode="decimal" aria-label="Quantity" />
                </td>
                <td className="py-1.5 pr-2">
                  <Input value={l.unitCost} onChange={(e) => set(i, { unitCost: e.target.value })} className="ml-auto w-28 py-1 text-right text-xs" inputMode="decimal" placeholder="0.00" aria-label="Cost from supplier, per piece" />
                </td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(amountNumber(l.quantity) * amountNumber(l.unitCost))}</td>
                <td className="py-1.5 text-right">
                  {lines.length > 1 && (
                    <button type="button" className="text-slate-400 hover:text-red-600" aria-label="Remove line" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))}>
                      ×
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button variant="secondary" size="sm" onClick={() => setLines((ls) => [...ls, blank()])}>
            Add another part
          </Button>
          <span className="text-sm font-semibold">Total {formatMoney(total)}</span>
        </div>
      </Section>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button loading={busy} onClick={() => void submit()}>
          Save purchase order
        </Button>
        <Button variant="secondary" onClick={() => navigate('/parts/purchase-orders')}>
          Cancel
        </Button>
      </div>
    </>
  );
}
