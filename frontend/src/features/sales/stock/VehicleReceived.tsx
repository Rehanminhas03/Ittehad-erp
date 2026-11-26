import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button, Dialog, Input, Spinner, StatusBadge } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { PdiChoices, pdiBody, type PdiChoice } from '../orders/components/OrderPdi';
import { P } from '../permissions';
import { type StockVehicle, useListStockVehiclesQuery, useReceiveIncomingVehicleMutation } from '../salesApi';

/**
 * "Vehicle received" (Delivery Team): a car whose chassis / engine number is already in the system (entered when it was
 * allocated from the plant) arrives. Search it by chassis, engine or registration number, pick it, mark the PDI (done,
 * pending, or not clear with the issue) and mark it received. A car that is not in the system yet is registered in Open stock.
 */
export function VehicleReceivedButton({ size = 'md', variant = 'primary' }: { size?: 'sm' | 'md'; variant?: 'primary' | 'secondary' } = {}) {
  const perm = usePermission();
  const [open, setOpen] = useState(false);
  if (!perm.can(P.stockManage)) return null;
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        Vehicle received
      </Button>
      {open && <ReceivedDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ReceivedDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<StockVehicle | null>(null);
  const [choice, setChoice] = useState<PdiChoice | ''>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [save, { isLoading: saving }] = useReceiveIncomingVehicleMutation();

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);
  // Cars still on their way (booked or in transit), searchable by chassis / engine / registration (or the order / customer).
  const { data, isFetching } = useListStockVehiclesQuery({ incoming: 'true', q: q || undefined, pageSize: 20, sort: '-createdAt' });
  const cars = data?.items ?? [];

  const receive = async () => {
    if (!picked) return;
    if (!choice) return setError('Choose: PDI done, PDI pending, or PDI not clear');
    if (choice === 'issue' && !notes.trim()) return setError('Describe the issue found in the PDI');
    setError(null);
    try {
      await save({ id: picked.id, pdiRequest: pdiBody(choice, notes) }).unwrap();
      toast.success(`${picked.vin ?? picked.engineNo ?? 'The vehicle'} marked received`);
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Vehicle received"
      footer={
        picked ? (
          <>
            <Button variant="secondary" onClick={() => setPicked(null)}>
              Back
            </Button>
            <Button loading={saving} onClick={receive}>
              Mark received
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {!picked ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Search the car that has arrived by its chassis number, engine number or registration number. Cars already entered in the system and not yet received are listed.</p>
          <Input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Chassis, engine or registration number" aria-label="Search vehicles" />
          <div className="max-h-[45vh] overflow-auto rounded-xl ring-1 ring-slate-200">
            {isFetching && !cars.length ? (
              <div className="p-4">
                <Spinner className="size-4 text-slate-400" />
              </div>
            ) : !cars.length ? (
              <p className="p-4 text-sm text-slate-500">
                {q ? 'No vehicle waiting to be received matches this.' : 'No vehicle is waiting to be received.'}{' '}
                <Link to="/sales/stock/new" onClick={onClose} className="font-medium text-brand-700 hover:underline">
                  Register a new car
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {cars.map((v) => (
                  <li key={v.id}>
                    <button type="button" onClick={() => setPicked(v)} className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-50">
                      <span>
                        <span className="block font-mono text-xs font-semibold text-slate-900">{v.vin ?? '—'}</span>
                        <span className="block font-mono text-xs text-slate-500">{v.engineNo ?? '—'}</span>
                      </span>
                      <span className="text-sm text-slate-700">{[v.modelName, v.variant, v.color].filter(Boolean).join(' · ')}</span>
                      <span className="flex items-center gap-2">
                        {v.customerName && <span className="text-xs text-slate-500">{v.customerName}</span>}
                        <StatusBadge status={v.status} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
            <p className="font-mono text-xs font-semibold text-slate-900">{picked.vin ?? '—'}</p>
            <p className="font-mono text-xs text-slate-500">{picked.engineNo ?? '—'}</p>
            <p className="mt-1 text-slate-700">{[picked.modelName, picked.variant, picked.color, picked.modelYear].filter(Boolean).join(' · ')}</p>
            {picked.orderNo && (
              <p className="text-xs text-slate-500">
                Order {picked.orderNo} · {picked.customerName}
              </p>
            )}
          </div>
          <p className="text-sm font-medium text-slate-800">PDI (pre-delivery inspection)</p>
          <PdiChoices choice={choice} onChoice={setChoice} notes={notes} onNotes={setNotes} />
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** A car that is still on its way (booked or in transit): the Delivery Team can mark it received from wherever the car is listed. */
export const isOnItsWay = (car: { status?: string | null }) => car.status === 'booked' || car.status === 'in_transit';

/**
 * "Mark received" for one car: asks for the PDI (done, pending, or not clear with the issue) and marks the car received.
 * Shown to the Delivery Team on the car's page, in the open stock list and in the dashboard's list of cars on their way.
 */
export function ReceiveCarButton({ car, size = 'sm', variant = 'primary' }: { car: StockVehicle; size?: 'sm' | 'md'; variant?: 'primary' | 'secondary' }) {
  const perm = usePermission();
  const [open, setOpen] = useState(false);
  const can = car.dealershipId ? perm.canIn(P.stockManage, car.dealershipId) : perm.can(P.stockManage);
  if (!can || !isOnItsWay(car)) return null;
  return (
    // Inside a clickable row: pressing the button must not also open the row.
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="inline-flex">
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        Mark received
      </Button>
      {open && <ReceiveCarDialog car={car} onClose={() => setOpen(false)} />}
    </span>
  );
}

export function ReceiveCarDialog({ car, onClose }: { car: StockVehicle; onClose: () => void }) {
  const toast = useToast();
  const [choice, setChoice] = useState<PdiChoice | ''>('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [save, { isLoading }] = useReceiveIncomingVehicleMutation();
  const receive = async () => {
    if (!choice) return setError('Choose: PDI done, PDI pending, or PDI not clear');
    if (choice === 'issue' && !notes.trim()) return setError('Describe the issue found in the PDI');
    setError(null);
    try {
      await save({ id: car.id, pdiRequest: pdiBody(choice, notes) }).unwrap();
      toast.success(`${car.vin ?? car.engineNo ?? 'The vehicle'} marked received`);
      onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title="Mark the car received"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={isLoading} onClick={receive}>
            Mark received
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm">
          <p className="font-mono text-xs font-semibold text-slate-900">{car.vin ?? '—'}</p>
          <p className="font-mono text-xs text-slate-500">{car.engineNo ?? '—'}</p>
          <p className="mt-1 text-slate-700">{[car.modelName, car.variant, car.color, car.modelYear].filter(Boolean).join(' · ')}</p>
          {car.orderNo && (
            <p className="text-xs text-slate-500">
              Order {car.orderNo} · {car.customerName}
            </p>
          )}
        </div>
        <p className="text-sm font-medium text-slate-800">PDI (pre-delivery inspection)</p>
        <PdiChoices choice={choice} onChoice={setChoice} notes={notes} onNotes={setNotes} />
        {error && (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
