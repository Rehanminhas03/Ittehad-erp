import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Button, Dialog, Input, Select } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { partsApi, useCreatePartsReturnMutation, useListPartsRequestLinesQuery } from '../../partsApi';

const REASONS = ['Not used', 'Replaced: not needed', 'Wrong part', 'Customer declined', 'Faulty part', 'Other'];

/**
 * On an issued parts request of a job card: a "Return to store" button. The advisor ticks the parts to send back, with
 * the quantity and why; the request goes to the parts desk, which accepts it and puts the parts back into stock.
 */
export function ReturnRequestParts({ jobCardId, requestId, pending }: { jobCardId: number; requestId: number; pending: Record<string, string> | undefined }) {
  const toast = useToast();
  const dispatch = useDispatch();
  const [open, setOpen] = useState(false);
  const { data: lines } = useListPartsRequestLinesQuery({ id: requestId }, { skip: !open });
  const [send, { isLoading }] = useCreatePartsReturnMutation();
  const [picked, setPicked] = useState<Record<string, { qty: string; reason: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const issued = (lines ?? []).filter((l) => Number(l.issuedQty) - Number(l.returnedQty) > 0);

  const submit = async () => {
    const chosen = Object.entries(picked);
    if (!chosen.length) return setError('Tick the parts to return');
    for (const [partNo, v] of chosen) {
      const line = issued.find((l) => l.partNo === partNo)!;
      const room = Number(line.issuedQty) - Number(line.returnedQty) - Number(pending?.[partNo] ?? 0);
      if (!(Number(v.qty) > 0) || Number(v.qty) > room) return setError(`${partNo}: enter a quantity from 1 to ${room}`);
    }
    setError(null);
    try {
      const r = await send({ partsReturnCreate: { jobCardId, lines: chosen.map(([partNo, v]) => ({ partNo, quantity: v.qty, reason: v.reason })) } }).unwrap();
      dispatch(partsApi.util.invalidateTags(['PartsRequest']));
      toast.success(`Return ${r.requestNo} sent to the store: the parts go back into stock when they accept it`);
      setOpen(false);
      setPicked({});
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Return to store
      </Button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          size="lg"
          title="Return parts to the store"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button loading={isLoading} onClick={submit}>
                Send return request
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Tick the parts that were not used or are being sent back. The parts desk checks them and accepts the return, and they go back into stock and come off the job card automatically.</p>
            {issued.length === 0 && <p className="text-sm text-slate-500">Nothing issued on this request can be returned.</p>}
            <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
              {issued.map((l) => {
                const room = Number(l.issuedQty) - Number(l.returnedQty) - Number(pending?.[l.partNo] ?? 0);
                const p = picked[l.partNo];
                return (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      disabled={room <= 0}
                      checked={!!p}
                      aria-label={`Return ${l.partNo}`}
                      onChange={(e) => setPicked((cur) => (e.target.checked ? { ...cur, [l.partNo]: { qty: String(room), reason: REASONS[0]! } } : Object.fromEntries(Object.entries(cur).filter(([k]) => k !== l.partNo))))}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs text-slate-900">{l.partNo}</span>
                      <span className="block truncate text-slate-600">{l.description}</span>
                      {room <= 0 && <span className="text-xs text-amber-700">Return already requested</span>}
                    </span>
                    {p && (
                      <>
                        <Input value={p.qty} onChange={(e) => setPicked({ ...picked, [l.partNo]: { ...p, qty: e.target.value } })} className="w-20 py-1 text-right text-xs" inputMode="decimal" aria-label={`Quantity of ${l.partNo}`} />
                        <Select value={p.reason} onChange={(e) => setPicked({ ...picked, [l.partNo]: { ...p, reason: e.target.value } })} className="w-auto py-1 text-xs" aria-label={`Reason for ${l.partNo}`}>
                          {REASONS.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </Select>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </Dialog>
      )}
    </>
  );
}
