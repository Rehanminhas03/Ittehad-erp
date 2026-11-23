import { useEffect, useState } from 'react';
import { Button, Dialog, Field, Input } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { formatDate } from '@/shared/lib';
import { useCancelPpfSlotMutation, useFinishPpfSlotMutation, useReceivePpfSlotMutation, useUpdatePpfSlotMutation } from '../salesApi';
import type { PpfSlotDay } from './PpfCalendar';

const Row = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <div className="flex gap-3 py-1 text-sm">
    <dt className="w-36 shrink-0 text-slate-500">{label}</dt>
    <dd className="font-medium text-slate-900">{value || '—'}</dd>
  </div>
);

/**
 * Opens a booked (or closed) day for the PPF team: everything known about the car, with the actions on it: mark received,
 * mark done, correct the details, add another car on the day, or free the slot again (cancel the booking / reopen the day).
 */
export function PpfSlotDetail({ day, onClose, onAddExtra }: { day: PpfSlotDay | null; onClose: () => void; onAddExtra: (date: string) => void }) {
  const toast = useToast();
  const [receive] = useReceivePpfSlotMutation();
  const [finish] = useFinishPpfSlotMutation();
  const [cancel] = useCancelPpfSlotMutation();
  const [update, { isLoading: saving }] = useUpdatePpfSlotMutation();
  const [editing, setEditing] = useState(false);
  const [f, setF] = useState({ customerName: '', customerMobile: '', vehicle: '', engineNo: '', chassisNo: '', registrationNo: '', salespersonName: '', amount: '' });
  useEffect(() => {
    setEditing(false);
    if (day)
      setF({
        customerName: day.customerName ?? '',
        customerMobile: day.customerMobile ?? '',
        vehicle: day.vehicle ?? '',
        engineNo: day.engineNo ?? '',
        chassisNo: day.chassisNo ?? '',
        registrationNo: day.registrationNo ?? '',
        salespersonName: day.salespersonName ?? '',
        amount: day.amount ? String(Number(day.amount)) : '',
      });
  }, [day?.date, day?.bookingId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!day || !day.bookingId) return null;
  const id = day.bookingId;
  const run = async (fn: () => Promise<unknown>, ok: string, close = false) => {
    try {
      await fn();
      toast.success(ok);
      if (close) onClose();
    } catch (e) {
      toast.error(e);
    }
  };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const status = day.blocked ? 'Closed' : day.finishedOn ? `Done on ${formatDate(day.finishedOn)}` : day.receivedOn ? `Received on ${formatDate(day.receivedOn)}` : 'Booked, car not received yet';

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={`${new Date(`${day.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })} — ${day.blocked ? 'closed day' : 'booked'}`}
      footer={
        editing ? (
          <>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Back
            </Button>
            <Button
              loading={saving}
              onClick={() =>
                run(
                  () =>
                    update({
                      id,
                      ppfSlotUpdate: {
                        customerName: f.customerName.trim() || undefined,
                        customerMobile: f.customerMobile.trim() || null,
                        vehicle: f.vehicle.trim() || null,
                        engineNo: f.engineNo.trim() || null,
                        chassisNo: f.chassisNo.trim() || null,
                        registrationNo: f.registrationNo.trim() || null,
                        salespersonName: f.salespersonName.trim() || null,
                        amount: f.amount.trim() || undefined,
                      },
                    }).unwrap(),
                  'Details saved',
                  true,
                )
              }
            >
              Save details
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {editing ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Customer name" htmlFor="sd-name">
            <Input id="sd-name" value={f.customerName} onChange={set('customerName')} />
          </Field>
          <Field label="Phone" htmlFor="sd-phone">
            <Input id="sd-phone" value={f.customerMobile} onChange={set('customerMobile')} />
          </Field>
          <Field label="Vehicle (model and variant)" htmlFor="sd-vehicle" className="sm:col-span-2">
            <Input id="sd-vehicle" value={f.vehicle} onChange={set('vehicle')} />
          </Field>
          <Field label="Engine no." htmlFor="sd-engine">
            <Input id="sd-engine" value={f.engineNo} onChange={set('engineNo')} />
          </Field>
          <Field label="Chassis no." htmlFor="sd-chassis">
            <Input id="sd-chassis" value={f.chassisNo} onChange={set('chassisNo')} />
          </Field>
          <Field label="Registration no." htmlFor="sd-reg">
            <Input id="sd-reg" value={f.registrationNo} onChange={set('registrationNo')} />
          </Field>
          <Field label="Salesperson" htmlFor="sd-sp" hint="Who pitched the PPF">
            <Input id="sd-sp" value={f.salespersonName} onChange={set('salespersonName')} />
          </Field>
          <Field label="Amount (PKR)" htmlFor="sd-amount">
            <Input id="sd-amount" inputMode="decimal" value={f.amount} onChange={set('amount')} />
          </Field>
        </div>
      ) : (
        <div>
          <dl className="divide-y divide-slate-100">
            <Row label="Status" value={status} />
            {!day.blocked && (
              <>
                <Row label="Customer" value={day.customerName} />
                <Row label="Phone" value={day.customerMobile} />
                <Row label="Vehicle" value={day.vehicle} />
                <Row label="Engine no." value={day.engineNo} />
                <Row label="Chassis no." value={day.chassisNo} />
                <Row label="Registration no." value={day.registrationNo} />
                <Row label="Salesperson" value={day.salespersonName} />
                <Row label="Dealership" value={day.dealershipName} />
                <Row label="Voucher" value={day.formNo} />
                <Row label="Amount" value={day.amount ? `PKR ${Number(day.amount).toLocaleString('en-GB')}` : null} />
                <Row label="Estimate date" value={formatDate(day.estimateDate)} />
                <Row label="Booked by" value={day.bookedByName} />
              </>
            )}
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            {!day.blocked && !day.finishedOn && !day.receivedOn && (
              <Button onClick={() => run(() => receive({ id }).unwrap(), 'Car marked as received', true)}>Mark car received</Button>
            )}
            {!day.blocked && !day.finishedOn && (
              <Button variant="secondary" onClick={() => run(() => finish({ id }).unwrap(), 'Marked as done', true)}>
                Mark done
              </Button>
            )}
            {!day.blocked && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit details
              </Button>
            )}
            <Button
              variant="secondary"
              onClick={() => {
                onAddExtra(day.date);
                onClose();
              }}
            >
              Add another car on this day
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (window.confirm(day.blocked ? 'Reopen this day?' : 'Free this slot? The booking is cancelled and the day is open again.')) void run(() => cancel({ id }).unwrap(), day.blocked ? 'Day reopened' : 'Slot is free again', true);
              }}
            >
              {day.blocked ? 'Reopen the day' : 'Free this slot (cancel booking)'}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
