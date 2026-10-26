import { useState } from 'react';
import { Button, Field, Input, PageHeader, Section, Select, Textarea } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { amountNumber, formatMoney } from '@/shared/lib';
import { PartPicker } from '../../components/PartPicker';
import { StoreTargetFields, useStoreTarget } from '../../components/StoreTarget';
import { usePrefillPart } from '../../hooks/usePrefillPart';
import { type DirectIssueResult, useIssueStockMutation, useListOpenJobCardsQuery } from '../../partsApi';
import { P } from '../../permissions';

const pct = (v: string) => Math.min(100, Math.max(0, Number(v.replace('%', '')) || 0));
/** Price x quantity less the discount in percent. */
const net = (l: { quantity: string; unitPrice: string; discountPercent: string }) => amountNumber(l.quantity) * amountNumber(l.unitPrice) * (1 - pct(l.discountPercent) / 100);

interface Line {
  partNo: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
}

/**
 * Parts out of the store against a repair order (RO) / job card number: pick each part and the quantity.
 * The price charged starts from the price list. Unused parts can be taken back into stock.
 */
export default function IssuePartsPage() {
  const toast = useToast();
  const t = useStoreTarget(P.issuesCreate);
  const [kind, setKind] = useState<'issue' | 'return'>('issue');
  // An open job card of the workshop (its vehicle comes with it), or 'other': a typed repair order number.
  const [jobCardId, setJobCardId] = useState('');
  const [referenceNo, setReferenceNo] = useState('');
  const [vehicleRef, setVehicleRef] = useState('');
  const [notes, setNotes] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DirectIssueResult | null>(null);
  const [issue, { isLoading }] = useIssueStockMutation();
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + net(l), 0);
  const gross = lines.reduce((s, l) => s + amountNumber(l.quantity) * amountNumber(l.unitPrice), 0);
  // One discount for every part on the list (a line can still be changed).
  const [allPct, setAllPct] = useState('');
  const out = kind === 'issue';
  const { data: cards } = useListOpenJobCardsQuery({ dealershipId: t.dealershipId ?? 0 }, { skip: !t.dealershipId });
  const card = cards?.find((c) => String(c.id) === jobCardId);
  usePrefillPart((p) => setLines((ls) => (ls.some((l) => l.partNo === p.partNo) ? ls : [...ls, { partNo: p.partNo, description: p.description, quantity: '1', unitPrice: String(Number(p.sellingPrice)), discountPercent: allPct }])));

  const submit = async () => {
    if (!t.dealershipId || !t.branchId) return setError('Choose the store');
    const counter = jobCardId === 'counter';
    if (!card && !counter && referenceNo.trim().length < 2) return setError(jobCardId === 'other' ? 'Enter the repair order number' : 'Choose the open job card, or counter sale');
    if (!lines.length) return setError('Add at least one part');
    const bad = lines.findIndex((l) => !(amountNumber(l.quantity) > 0));
    if (bad >= 0) return setError(`${lines[bad]!.partNo}: enter the quantity`);
    setError(null);
    try {
      const r = await issue({
        directIssueRequest: {
          dealershipId: t.dealershipId,
          branchId: t.branchId,
          kind,
          jobCardId: card?.id,
          referenceNo: card ? undefined : counter ? 'Counter Sale' : referenceNo.trim(),
          invoiceNo: invoiceNo.trim() || undefined,
          vehicleRef: card ? undefined : vehicleRef.trim() || null,
          notes: notes.trim() || null,
          lines: lines.map((l) => ({ partNo: l.partNo, quantity: l.quantity.trim(), unitPrice: l.unitPrice.trim() || undefined, discountPercent: l.discountPercent.replace('%', '').trim() || undefined })),
        },
      }).unwrap();
      setDone(r);
      setLines([]);
      setReferenceNo('');
      setJobCardId('');
      setVehicleRef('');
      setNotes('');
      setInvoiceNo('');
      toast.success(out ? `Parts issued to ${r.referenceNo}` : `Parts from ${r.referenceNo} are back in stock`);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div>
      <PageHeader title={out ? 'Issue parts' : 'Take parts back'} subtitle="Parts that leave the store for a repair order (RO) / job card. Stock goes down straight away." />
      <div className="space-y-5">
        <Section title="Repair order / job card">
          <div className="mb-4 inline-flex rounded-xl bg-slate-100 p-1 text-sm">
            {(['issue', 'return'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`rounded-lg px-4 py-1.5 font-medium ${kind === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
              >
                {k === 'issue' ? 'Issue to RO / job card' : 'Unused parts back to stock'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <StoreTargetFields t={t} />
            <Field label="Open job card" htmlFor="ip-card" required className="sm:col-span-2" hint="The job cards the workshop has open. The vehicle comes with the job card.">
              <Select id="ip-card" value={jobCardId} onChange={(e) => setJobCardId(e.target.value)}>
                <option value="">Choose the open job card…</option>
                {(cards ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {[c.jobCardNo, c.registrationNo ?? c.vin, c.modelName, c.customerName].filter(Boolean).join(' · ')}
                  </option>
                ))}
                <option value="counter">Counter sale (no repair order)</option>
                <option value="other">Other: type a repair order (RO) number</option>
              </Select>
            </Field>
            {card?.freeService && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:col-span-2 lg:col-span-3">
                This is a <span className="font-semibold">free service</span>{card.serviceLabel ? ` (${card.serviceLabel})` : ''}: the labour is free, but the parts and oil you issue here are charged to the customer.
              </p>
            )}
            {card && (
              <div className="rounded-xl bg-slate-50 p-3 text-sm sm:col-span-2 lg:col-span-3">
                <p className="font-medium text-slate-900">{card.jobCardNo}</p>
                <p className="text-slate-600">
                  Registration {card.registrationNo ?? '—'} · Chassis {card.vin ?? '—'} · {card.modelName ?? 'Model not set'} · {card.customerName ?? 'Customer not set'}
                </p>
              </div>
            )}
            {jobCardId === 'other' && (
              <>
                <Field label="Repair order (RO) no." htmlFor="ip-ref" required>
                  <Input id="ip-ref" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} placeholder="e.g. RO-1045" />
                </Field>
                <Field label="Vehicle (registration / chassis)" htmlFor="ip-veh">
                  <Input id="ip-veh" value={vehicleRef} onChange={(e) => setVehicleRef(e.target.value)} />
                </Field>
              </>
            )}
            <Field label="Invoice no." htmlFor="ip-inv" hint="The customer invoice the parts are billed on">
              <Input id="ip-inv" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
            </Field>
            <Field label="Remarks" htmlFor="ip-notes" className="sm:col-span-2" hint="e.g. Campaign, 3% discount on this RO">
              <Textarea id="ip-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Parts">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <Field label="Discount on all parts (%)" htmlFor="ip-all" hint="Type 1, 2, 3 ... to give the same discount on every part below">
              <Input id="ip-all" className="w-28" inputMode="decimal" placeholder="e.g. 5" value={allPct} onChange={(e) => setAllPct(e.target.value)} />
            </Field>
            <Button variant="secondary" disabled={!lines.length} onClick={() => setLines((ls) => ls.map((l) => ({ ...l, discountPercent: allPct })))}>
              Apply to all
            </Button>
          </div>
          <PartPicker
            onPick={(p) =>
              setLines((ls) => (ls.some((l) => l.partNo === p.partNo) ? ls : [...ls, { partNo: p.partNo, description: p.description, quantity: '1', unitPrice: String(Number(p.sellingPrice)), discountPercent: allPct }]))
            }
          />
          {lines.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-medium tracking-wide text-slate-500">
                    <th className="py-2 pr-2 font-medium">Part</th>
                    <th className="py-2 pr-2 text-right font-medium">Quantity</th>
                    <th className="py-2 pr-2 text-right font-medium">Price charged (PKR)</th>
                    <th className="py-2 pr-2 text-right font-medium">Discount %</th>
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
                        <Input value={l.unitPrice} onChange={(e) => set(i, { unitPrice: e.target.value })} className="ml-auto w-32 py-1 text-right text-xs" inputMode="decimal" aria-label={`Price of ${l.partNo}`} />
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <Input value={l.discountPercent} onChange={(e) => set(i, { discountPercent: e.target.value })} className="ml-auto w-20 py-1 text-right text-xs" inputMode="decimal" placeholder="%" aria-label={`Discount of ${l.partNo} in percent`} />
                      </td>
                      <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(String(Math.round(net(l) * 100) / 100))}</td>
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
                    <td colSpan={4} className="py-2 pr-2 text-right text-sm font-medium">
                      {gross - total > 0.005 ? `Total (discount given ${formatMoney(String(Math.round((gross - total) * 100) / 100))})` : 'Total'}
                    </td>
                    <td className="py-2 pr-2 text-right font-semibold tabular-nums">{formatMoney(String(Math.round(total * 100) / 100))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end">
            <Button loading={isLoading} disabled={!lines.length} onClick={submit}>
              {out ? 'Issue from stock' : 'Return to stock'}
            </Button>
          </div>
        </Section>

        {done && (
          <Section title={`${done.kind === 'issue' ? 'Issued to' : 'Returned from'} ${done.referenceNo}`}>
            <ul className="divide-y divide-slate-100 text-sm">
              {done.lines.map((l) => (
                <li key={l.partNo} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-mono text-xs">{l.partNo}</span> <span className="text-slate-600">{l.description}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">
                    {Number(l.quantity)} × {formatMoney(l.unitPrice)}{Number(l.discountPercent) > 0 ? ` − ${Number(l.discountPercent)}% = ${formatMoney(l.netAmount)}` : ''} · {Number(l.balanceAfter)} left in store
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}
