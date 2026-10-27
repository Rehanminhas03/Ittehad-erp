import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Button, Dialog, Field, Input, Select } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { partsApi, useCreatePartsReturnMutation } from '../../partsApi';

const REASONS = ['Not used', 'Replaced: not needed', 'Wrong part', 'Customer declined', 'Faulty part', 'Other'];

/**
 * On a part issued to a job card: send it back to the store. It is a request to the parts desk, which checks the part
 * and accepts it; only then does the part go back into stock and come off the job card.
 */
export function ReturnPartButton({ jobCardId, partNo, description, issuedQty, pendingQty }: { jobCardId: number; partNo: string; description: string; issuedQty: number; pendingQty: number }) {
  const toast = useToast();
  const dispatch = useDispatch();
  const [open, setOpen] = useState(false);
  const room = issuedQty - pendingQty;
  const [qty, setQty] = useState(String(room > 0 ? room : 1));
  const [reason, setReason] = useState(REASONS[0]!);
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [send, { isLoading }] = useCreatePartsReturnMutation();

  if (pendingQty >= issuedQty) return <span className="text-xs font-medium text-amber-700">Return requested: waiting for the store</span>;

  const submit = async () => {
    const n = Number(qty);
    if (!(n > 0) || n > room) return setError(`Enter a quantity from 1 to ${room}`);
    const why = reason === 'Other' ? other.trim() : reason;
    if (why.length < 2) return setError('Write the reason');
    setError(null);
    try {
      const r = await send({ partsReturnCreate: { jobCardId, lines: [{ partNo, quantity: String(n), reason: why }] } }).unwrap();
      dispatch(partsApi.util.invalidateTags(['PartsRequest']));
      toast.success(`Return ${r.requestNo} sent to the store: it goes back into stock when they accept it`);
      setOpen(false);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setOpen(true)}>
        Return to store
      </button>
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="Return the part to the store"
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
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              <span className="font-mono text-xs">{partNo}</span> {description}
            </p>
            <p className="text-sm text-slate-600">The request goes to the parts department. When they receive the part and accept it, it is added back to the stock and taken off this job card. Nobody has to enter it by hand.</p>
            <Field label={`Quantity to return (up to ${room})`} htmlFor="rp-qty">
              <Input id="rp-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            </Field>
            <Field label="Why" htmlFor="rp-reason">
              <Select id="rp-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            {reason === 'Other' && (
              <Field label="Reason" htmlFor="rp-other">
                <Input id="rp-other" value={other} onChange={(e) => setOther(e.target.value)} />
              </Field>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </Dialog>
      )}
    </>
  );
}
