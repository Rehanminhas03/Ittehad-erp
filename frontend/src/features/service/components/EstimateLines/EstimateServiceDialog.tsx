import { useEffect, useState } from 'react';
import { useGetVehicleQuery } from '@/features/crm/crmApi';
import { useVehicleModelOptions } from '@/features/crm';
import { PartPicker } from '@/features/parts/components/PartPicker';
import { Button, Dialog, Field, Input, Select, Spinner } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { formatMoney, formatNumber } from '@/shared/lib';
import { type Estimate, useAddEstimateLineMutation, useGetJobCardQuery, useListScheduleItemsQuery, useListServicePackageQuery } from '../../serviceApi';

const TAX_PERCENT = 5;
const clean = (s: string) => s.replace(/,/g, '').trim();
const money = (n: number) => formatMoney(String(Math.round(n * 100) / 100));

interface Row { partNo: string; description: string; quantity: string; price: number; discount: string; on: boolean }

/**
 * A periodic service (5,000 km, 10,000 km ...) on an estimate, as on a job card: the advisor enters the service charges
 * (5% sales tax is added as its own line) and checks the parts of the service at the price list prices; each becomes a line.
 */
export function EstimateServiceDialog({ estimate, firstSort, onClose }: { estimate: Estimate; firstSort: number; onClose: () => void }) {
  const toast = useToast();
  const [add] = useAddEstimateLineMutation();
  const models = useVehicleModelOptions();
  const { data: card } = useGetJobCardQuery({ id: estimate.jobCardId ?? 0 }, { skip: !estimate.jobCardId });
  const { data: vehicle } = useGetVehicleQuery({ id: card?.vehicleId ?? 0 }, { skip: !card?.vehicleId });
  const byName = models.find((m) => m.label.toLowerCase() === (estimate.vehicleModel ?? '').trim().toLowerCase());
  const modelId = vehicle?.modelId ?? (byName ? Number(byName.value) : 0);
  const { data: services, isFetching: loadingServices } = useListScheduleItemsQuery({ modelId, isActive: 'true', pageSize: 50, sort: 'sequence' }, { skip: !modelId });
  const [serviceId, setServiceId] = useState('');
  const { data: pkg, isFetching } = useListServicePackageQuery({ id: Number(serviceId) }, { skip: !serviceId });
  const [charge, setCharge] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  // The work and checks the service includes (no charge): the ones not wanted are unticked.
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const tasks = (pkg ?? []).filter((x) => x.kind === 'labour' || x.kind === 'check').map((x) => x.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows((pkg ?? []).filter((x) => x.kind === 'part' && x.partNo).map((x) => ({ partNo: x.partNo!, description: x.description, quantity: String(Number(x.quantity)), price: Number(x.sellingPrice ?? 0), discount: '', on: true })));
    setUnticked(new Set());
  }, [pkg]);

  const chosen = services?.items.find((s) => String(s.id) === serviceId);
  const chargeNum = Number(clean(charge)) || 0;
  const tax = Math.round(chargeNum * TAX_PERCENT) / 100;
  const lineTotal = (r: Row) => Number(r.quantity || 0) * r.price * (1 - (Number(r.discount.replace('%', '')) || 0) / 100);
  const on = rows.filter((r) => r.on);
  const patch = (i: number, p: Partial<Row>) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const submit = async () => {
    if (!serviceId) return setError('Choose the service');
    if (clean(charge) === '' || !(chargeNum >= 0)) return setError('Enter the service charges (before tax)');
    for (const r of on) if (!(Number(r.quantity) > 0)) return setError(`${r.partNo}: enter the quantity`);
    setError(null);
    setSaving(true);
    let n = firstSort;
    try {
      const line = (kind: 'labour' | 'part', description: string, partNo: string | null, quantity: string, unitPrice: string, discountPercent = '0') =>
        add({ id: estimate.id, estimateLineCreate: { kind, description, partNo, quantity, unitPrice, discountPercent, sortOrder: n++ } }).unwrap();
      await line('labour', `${chosen?.name ?? 'Periodic'} service charges`, null, '1', String(chargeNum));
      if (tax > 0) await line('labour', `Sales tax ${TAX_PERCENT}% on service charges`, null, '1', String(tax));
      for (const r of on) await line('part', r.description, r.partNo, r.quantity.trim(), String(r.price), r.discount.replace('%', '').trim() || '0');
      for (const t of tasks.filter((x) => !unticked.has(x))) await line('labour', t, null, '1', '0');
      toast.success('Service added to the estimate');
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title="Periodic maintenance service"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} disabled={!serviceId} onClick={() => void submit()}>
            Add to the estimate
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!modelId ? (
          <p className="text-sm text-slate-600">{loadingServices ? 'Loading…' : 'The services are listed for the car model: choose the model on the estimate first.'}</p>
        ) : (
          <Field label="Which service" htmlFor="es-service">
            <Select id="es-service" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              <option value="">Choose the service (5,000 km, 10,000 km ...)</option>
              {(services?.items ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {formatNumber(s.dueKm)} km
                </option>
              ))}
            </Select>
          </Field>
        )}
        {serviceId && isFetching && <Spinner className="size-4 text-slate-400" />}
        {serviceId && !isFetching && (
          <>
            <section className="rounded-xl bg-sky-50 p-3 ring-1 ring-sky-200">
              <h3 className="text-sm font-semibold text-sky-900">1. Service charges</h3>
              <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Service charges, before tax (PKR)" htmlFor="es-charge">
                  <Input id="es-charge" inputMode="decimal" value={charge} onChange={(e) => setCharge(e.target.value)} placeholder="Enter the amount" />
                </Field>
                <div className="text-sm">
                  <p className="text-xs text-slate-500">Sales tax {TAX_PERCENT}%</p>
                  <p className="mt-2 font-medium tabular-nums">{money(tax)}</p>
                </div>
                <div className="text-sm">
                  <p className="text-xs text-slate-500">Total with tax</p>
                  <p className="mt-2 font-semibold tabular-nums">{money(chargeNum + tax)}</p>
                </div>
              </div>
            </section>
            <section className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
              <h3 className="text-sm font-semibold text-emerald-900">2. Parts of this service (untick what the customer does not want)</h3>
              {rows.length === 0 ? (
                <p className="mt-1 text-sm text-emerald-900">No parts are listed for this service. Add parts below if any are needed.</p>
              ) : (
                <table className="mt-2 min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="w-6 py-1 pr-2" />
                      <th className="py-1 pr-2 font-medium">Part</th>
                      <th className="py-1 pr-2 text-right font-medium">Qty</th>
                      <th className="py-1 pr-2 text-right font-medium">Price</th>
                      <th className="py-1 pr-2 text-right font-medium">Disc. %</th>
                      <th className="py-1 pr-2 text-right font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.partNo} className={r.on ? '' : 'opacity-50'}>
                        <td className="py-1 pr-2">
                          <input type="checkbox" checked={r.on} onChange={(e) => patch(i, { on: e.target.checked })} aria-label={`Include ${r.description}`} className="size-4 accent-emerald-600" />
                        </td>
                        <td className="py-1 pr-2">
                          <span className="block font-mono text-xs text-slate-900">{r.partNo}</span>
                          <span className="block truncate text-xs text-slate-600">{r.description}</span>
                        </td>
                        <td className="py-1 pr-2">
                          <Input value={r.quantity} onChange={(e) => patch(i, { quantity: e.target.value })} className="w-16 py-1 text-right text-xs" inputMode="decimal" aria-label={`Quantity of ${r.partNo}`} />
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums">{money(r.price)}</td>
                        <td className="py-1 pr-2">
                          <Input value={r.discount} onChange={(e) => patch(i, { discount: e.target.value })} className="w-16 py-1 text-right text-xs" inputMode="decimal" placeholder="%" aria-label={`Discount on ${r.partNo}`} />
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums">{money(lineTotal(r))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="mt-2">
                <PartPicker
                  placeholder="Add another part: search by number or name…"
                  onPick={(p) => setRows((cur) => (cur.some((r) => r.partNo === p.partNo) ? cur : [...cur, { partNo: p.partNo, description: p.description, quantity: '1', price: Number(p.sellingPrice), discount: '', on: true }]))}
                />
              </div>
            </section>
            {tasks.length > 0 && (
              <section className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
                <h3 className="text-sm font-semibold text-amber-900">3. Work and checks included in this service (untick what is not needed)</h3>
                <ul className="mt-1 grid grid-cols-1 gap-x-6 gap-y-0.5 text-sm text-slate-800 sm:grid-cols-2">
                  {tasks.map((t) => (
                    <li key={t}>
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={!unticked.has(t)}
                          onChange={(e) =>
                            setUnticked((cur) => {
                              const next = new Set(cur);
                              if (e.target.checked) next.delete(t);
                              else next.add(t);
                              return next;
                            })
                          }
                          className="mt-0.5 size-4 accent-amber-600"
                        />
                        <span className={unticked.has(t) ? 'text-slate-400 line-through' : ''}>{t}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Dialog>
  );
}
