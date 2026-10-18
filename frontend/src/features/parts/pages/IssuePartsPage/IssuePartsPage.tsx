import { useState } from 'react';
import { Button, Field, Input, PageHeader, Section, Select, Textarea } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { amountNumber, formatMoney } from '@/shared/lib';
import { PartPicker } from '../../components/PartPicker';
import { StoreTargetFields, useStoreTarget } from '../../components/StoreTarget';
import { usePrefillPart } from '../../hooks/usePrefillPart';
import { type DirectIssueResult, useIssueStockMutation, useListOpenJobCardsQuery } from '../../partsApi';
import { P } from '../../permissions';

interface Line {
  partNo: string;
  description: string;
  quantity: string;
  unitPrice: string;
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
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DirectIssueResult | null>(null);
  const [issue, { isLoading }] = useIssueStockMutation();
  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + amountNumber(l.quantity) * amountNumber(l.unitPrice), 0);
  const out = kind === 'issue';
  const { data: cards } = useListOpenJobCardsQuery({ dealershipId: t.dealershipId ?? 0 }, { skip: !t.dealershipId });
  const card = cards?.find((c) => String(c.id) === jobCardId);
  usePrefillPart((p) => setLines((ls) => (ls.some((l) => l.partNo === p.partNo) ? ls : [...ls, { partNo: p.partNo, description: p.description, quantity: '1', unitPrice: String(Number(p.sellingPrice)) }])));

  const submit = async () => {
    if (!t.dealershipId || !t.branchId) return setError('Choose the store');
    if (!card && referenceNo.trim().length < 2) return setError(jobCardId === 'other' ? 'Enter the repair order number' : 'Choose the open job card');
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
          referenceNo: card ? undefined : referenceNo.trim(),
          vehicleRef: card ? undefined : vehicleRef.trim() || null,
          notes: notes.trim() || null,
          lines: lines.map((l) => ({ partNo: l.partNo, quantity: l.quantity.trim(), unitPrice: l.unitPrice.trim() || undefined })),
        },
      }).unwrap();
      setDone(r);
      setLines([]);
      setReferenceNo('');
      setJobCardId('');
      setVehicleRef('');
      setNotes('');
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
                <option value="other">Other: type a repair order (RO) number</option>
              </Select>
            </Field>
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
            <Field label="Notes" htmlFor="ip-notes" className="sm:col-span-2">
              <Textarea id="ip-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Parts">
          <PartPicker
            onPick={(p) =>
              setLines((ls) => (ls.some((l) => l.partNo === p.partNo) ? ls : [...ls, { partNo: p.partNo, description: p.description, quantity: '1', unitPrice: String(Number(p.sellingPrice)) }]))
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
                      <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(String(amountNumber(l.quantity) * amountNumber(l.unitPrice)))}</td>
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
                      Total
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
                    {Number(l.quantity)} × {formatMoney(l.unitPrice)} · {Number(l.balanceAfter)} left in store
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
