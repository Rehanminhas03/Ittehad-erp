import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useGetVehicleQuery } from '@/features/crm/crmApi';
import { PartPicker } from '@/features/parts/components/PartPicker';
import { partsApi } from '@/features/parts/partsApi';
import { Button, Dialog, Field, Input, Select, Spinner } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { formatMoney, formatNumber } from '@/shared/lib';
import {
  type JobCard,
  useAddServiceToJobCardMutation,
  useGetVisitQuery,
  useListJobCardLinesQuery,
  useListScheduleItemsQuery,
  useListServicePackageQuery,
} from '../../serviceApi';

const TAX_PERCENT = 18;
const money = (n: number) => formatMoney(String(Math.round(n * 100) / 100));
const clean = (s: string) => s.replace(/,/g, '').trim();

interface PartRow {
  partNo: string;
  description: string;
  quantity: string;
  price: number;
  discount: string;
}

/**
 * A periodic maintenance service (5,000 km, 30,000 km ...) on the job card, in three parts: the service charges
 * the advisor enters (sales tax of 18% is added), the parts to replace (prices from the price list, a discount
 * where one is agreed) and the checks and work the service covers. The advisor checks everything is right, then
 * sends the request to the parts department.
 */
export function PeriodicServiceDialog({ jobCard, initialServiceId, onClose }: { jobCard: JobCard; initialServiceId?: number | null; onClose: () => void }) {
  const toast = useToast();
  const dispatch = useDispatch();
  const { data: vehicle } = useGetVehicleQuery({ id: jobCard.vehicleId });
  const { data: visit } = useGetVisitQuery({ id: jobCard.visitId });
  const { data: lines } = useListJobCardLinesQuery({ id: jobCard.id });
  const { data: services } = useListScheduleItemsQuery({ modelId: vehicle?.modelId ?? 0, isActive: 'true', pageSize: 50, sort: 'sequence' }, { skip: !vehicle?.modelId });
  const [serviceId, setServiceId] = useState(initialServiceId ? String(initialServiceId) : '');
  const { data: pkg, isFetching } = useListServicePackageQuery({ id: Number(serviceId) }, { skip: !serviceId });
  const [add, { isLoading }] = useAddServiceToJobCardMutation();
  const [charge, setCharge] = useState('');
  const [rows, setRows] = useState<PartRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  // The parts of the chosen service, with the price-list prices, to be checked before they are sent.
  useEffect(() => {
    setRows((pkg ?? []).filter((x) => x.kind === 'part' && x.partNo).map((x) => ({ partNo: x.partNo!, description: x.description, quantity: String(Number(x.quantity)), price: Number(x.sellingPrice ?? 0), discount: '' })));
  }, [pkg]);

  const chosen = services?.items.find((s) => String(s.id) === serviceId);
  // A scheduled-service visit already has the service's labour line from the schedule.
  const onCard = !!serviceId && !!lines?.some((l) => String(l.scheduleItemId ?? '') === serviceId);
  const chargeNum = Number(clean(charge)) || 0;
  const tax = Math.round(chargeNum * TAX_PERCENT) / 100;
  const free = !!visit?.freeService;
  const lineTotal = (r: PartRow) => Number(r.quantity || 0) * r.price * (1 - (Number(r.discount.replace('%', '')) || 0) / 100);
  const partsTotal = rows.reduce((n, r) => n + lineTotal(r), 0);
  const group = (kind: 'labour' | 'check') => (pkg ?? []).filter((x) => x.kind === kind);

  const submit = async (sendToStore: boolean) => {
    if (!serviceId) return setError('Choose the service');
    if (!onCard && (clean(charge) === '' || !(chargeNum >= 0))) return setError('Enter the service charges (before tax)');
    for (const r of rows) {
      if (!(Number(r.quantity) > 0)) return setError(`${r.partNo}: enter the quantity`);
      const d = Number(r.discount.replace('%', '') || 0);
      if (Number.isNaN(d) || d < 0 || d > 100) return setError(`${r.partNo}: the discount must be 0 to 100`);
    }
    setError(null);
    try {
      const r = await add({
        id: jobCard.id,
        addServiceToJobCard: {
          scheduleItemId: Number(serviceId),
          serviceCharge: onCard ? undefined : clean(charge),
          parts: rows.map((x) => ({ partNo: x.partNo, quantity: x.quantity.trim(), discountPercent: x.discount.replace('%', '').trim() || undefined })),
          sendToStore,
        },
      }).unwrap();
      dispatch(partsApi.util.invalidateTags(['PartsRequest']));
      toast.success(r.partsRequestNo ? `Service added; parts request ${r.partsRequestNo} sent to the parts department` : 'Service added to the job card');
      onClose();
    } catch (e) {
      toast.error(e);
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
          <Button variant="secondary" loading={isLoading} disabled={!serviceId} onClick={() => void submit(false)}>
            Add to job card only
          </Button>
          <Button loading={isLoading} disabled={!serviceId || !rows.length} onClick={() => void submit(true)}>
            Add and send request to parts
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Which service" htmlFor="ps-service">
          <Select id="ps-service" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
            <option value="">Choose the service (5,000 km, 10,000 km ...)</option>
            {(services?.items ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {formatNumber(s.dueKm)} km{s.isFree ? ' · free labour' : ''}
              </option>
            ))}
          </Select>
        </Field>
        {serviceId && isFetching && <Spinner className="size-4 text-slate-400" />}
        {serviceId && !isFetching && (
          <>
            {/* 1. Service charges: entered by the advisor, tax added */}
            <section className="rounded-xl bg-sky-50 p-3 ring-1 ring-sky-200">
              <h3 className="text-sm font-semibold text-sky-900">1. Service charges</h3>
              {onCard ? (
                <p className="mt-1 text-sm text-sky-900">The service charges of {chosen?.name} are already on this job card (see Work).</p>
              ) : (
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Service charges, before tax (PKR)" htmlFor="ps-charge">
                    <Input id="ps-charge" inputMode="decimal" value={charge} onChange={(e) => setCharge(e.target.value)} placeholder="Enter the amount" />
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
              )}
              {free && !onCard && <p className="mt-2 text-xs text-emerald-800">This visit is a free service: the service charges are shown on the job card but are free for the customer.</p>}
            </section>

            {/* 2. Parts to replace: price list prices, discounts */}
            <section className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
              <h3 className="text-sm font-semibold text-emerald-900">2. Parts to replace (check them, then send to the parts department)</h3>
              {rows.length === 0 ? (
                <p className="mt-1 text-sm text-emerald-900">No parts are listed for this service. Add the parts below if any are needed.</p>
              ) : (
                <table className="mt-2 min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="py-1 pr-2 font-medium">Part</th>
                      <th className="py-1 pr-2 text-right font-medium">Qty</th>
                      <th className="py-1 pr-2 text-right font-medium">Price</th>
                      <th className="py-1 pr-2 text-right font-medium">Disc. %</th>
                      <th className="py-1 pr-2 text-right font-medium">Amount</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.partNo} className="align-middle">
                        <td className="py-1 pr-2">
                          <span className="block font-mono text-xs text-slate-900">{r.partNo}</span>
                          <span className="block truncate text-xs text-slate-600">{r.description}</span>
                        </td>
                        <td className="py-1 pr-2">
                          <Input value={r.quantity} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} className="w-16 py-1 text-right text-xs" inputMode="decimal" aria-label={`Quantity of ${r.partNo}`} />
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums">{money(r.price)}</td>
                        <td className="py-1 pr-2">
                          <Input value={r.discount} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, discount: e.target.value } : x)))} className="w-16 py-1 text-right text-xs" inputMode="decimal" placeholder="%" aria-label={`Discount on ${r.partNo}`} />
                        </td>
                        <td className="py-1 pr-2 text-right tabular-nums">{money(lineTotal(r))}</td>
                        <td className="py-1 text-right">
                          <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={4} className="pt-1 pr-2 text-right text-xs text-slate-500">
                        Parts total (price list prices include sales tax)
                      </td>
                      <td className="pt-1 pr-2 text-right font-semibold tabular-nums">{money(partsTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}
              <div className="mt-2">
                <PartPicker
                  placeholder="Add another part: search by number or name…"
                  onPick={(p) => setRows((cur) => (cur.some((r) => r.partNo === p.partNo) ? cur : [...cur, { partNo: p.partNo, description: p.description, quantity: '1', price: Number(p.sellingPrice), discount: '' }]))}
                />
              </div>
            </section>

            {/* 3. Work and checks the service covers */}
            <section className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
              <h3 className="text-sm font-semibold text-amber-900">3. Work and checks included in this service</h3>
              {group('labour').length + group('check').length === 0 ? (
                <p className="mt-1 text-sm text-amber-900">Nothing else is listed for this service yet.</p>
              ) : (
                <ul className="mt-1 grid grid-cols-1 gap-x-6 gap-y-0.5 text-sm text-slate-800 sm:grid-cols-2">
                  {[...group('labour'), ...group('check')].map((x, i) => (
                    <li key={i} className="flex gap-2">
                      <span aria-hidden>✓</span>
                      {x.description}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Dialog>
  );
}
