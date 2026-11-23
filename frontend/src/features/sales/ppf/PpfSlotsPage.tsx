import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Dialog, ErrorState, Field, Input, PageHeader, Select, Spinner } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { LeadModelSelect } from '../leads/components/LeadModelSelect';
import { P } from '../permissions';
import { PpfCalendar } from './PpfCalendar';
import { PpfSlotDetail } from './PpfSlotDetail';
import { useBookPpfSlotMutation, useCancelPpfSlotMutation, useFinishPpfSlotMutation, useListPpfSlotsQuery, useReceivePpfSlotMutation } from '../salesApi';

const dayLabel = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' });

/**
 * The PPF bay calendar. One car starts per day and the bay is shared by Hyundai, Jetour and CSM: a day taken by any
 * dealership is taken for everyone. The PPF team sees who booked each day and the car; salespeople see free and booked days
 * (their own bookings in full) and book a day by issuing a PPF voucher.
 */
export default function PpfSlotsPage() {
  const perm = usePermission();
  const toast = useToast();
  const own = perm.dealershipsFor(P.ppfSlots);
  const dealers = own.length ? own : [...perm.dealershipsFor(P.ppfCreate), ...perm.dealershipsFor(P.ppfViewAll), ...perm.dealershipsFor(P.ppfViewOwn)];
  const dealershipId = dealers[0]?.id ?? 0;
  const { data, isFetching, isError, refetch } = useListPpfSlotsQuery({ dealershipId, days: 28, back: 7 }, { skip: !dealershipId, refetchOnMountOrArgChange: true });
  const [book, { isLoading: booking }] = useBookPpfSlotMutation();
  const [cancel] = useCancelPpfSlotMutation();
  const [finish] = useFinishPpfSlotMutation();
  const [receive] = useReceivePpfSlotMutation();
  // The day being booked; `extra`: another car on a day that is already booked or closed.
  const [slot, setSlot] = useState<{ date: string; extra: boolean } | null>(null);
  const dialog = slot?.date ?? null;
  const setDialog = (date: string | null, extra = false) => setSlot(date ? { date, extra } : null);
  const BLANK = { customerName: '', customerMobile: '', modelId: '', variant: '', chassisNo: '', engineNo: '', registrationNo: '', salespersonName: '', amount: '', notes: '' };
  const [f, setF] = useState({ dealershipId: String(dealershipId), ...BLANK });
  const [err, setErr] = useState<string | null>(null);
  const canManage = !!data?.canManage;
  // A booked or closed day opened by the PPF team (read again from the list so it stays current).
  const [opened, setOpened] = useState<string | null>(null);
  const openedDay = opened ? (data?.days.find((x) => x.date === opened) ?? null) : null;

  const submit = async (closeDay = false) => {
    try {
      await book({
        ppfSlotBook: {
          dealershipId: Number(f.dealershipId) || dealershipId,
          slotDate: dialog!,
          customerName: closeDay ? 'Closed' : f.customerName.trim() || undefined,
          blocked: closeDay || undefined,
          customerMobile: f.customerMobile.trim() || null,
          modelId: Number(f.modelId) || undefined,
          variant: f.variant.trim() || null,
          chassisNo: f.chassisNo.trim() || null,
          engineNo: f.engineNo.trim() || null,
          registrationNo: f.registrationNo.trim() || null,
          salespersonName: f.salespersonName.trim() || null,
          amount: f.amount.trim() || undefined,
          extra: slot?.extra || undefined,
          notes: f.notes.trim() || null,
        },
      }).unwrap();
      setDialog(null);
      setErr(null);
      setF((s) => ({ ...s, ...BLANK }));
      toast.success(closeDay ? 'Day closed' : 'Day booked');
    } catch (e) {
      toast.error(e);
      void refetch();
    }
  };

  const free = (data?.days ?? []).filter((d) => !d.booked).length;
  return (
    <div>
      <PageHeader
        title="PPF slots"
        subtitle={`One car starts in the PPF bay each day (Sundays off), shared by every dealership. A car takes 4 to 5 days, so the estimate date is 4 working days after the day it comes.${data ? ` ${free} free day${free === 1 ? '' : 's'} in the next 4 weeks.` : ''}`}
        actions={
          <Link to="/sales/ppf-forms" className="text-sm font-medium text-brand-700 hover:underline">
            PPF vouchers
          </Link>
        }
      />
      {isError && <ErrorState message="Could not load the PPF slots." onRetry={() => refetch()} />}
      <div className="surface relative p-3">
        {isFetching && <Spinner className="absolute top-3 right-3 size-4 text-slate-400" />}
        {!isFetching && !data?.days.length ? (
          <p className="py-8 text-center text-sm text-slate-500">No days to show.</p>
        ) : (
          <PpfCalendar
            days={data?.days ?? []}
            details={canManage}
            allowPast={canManage}
            onBooked={canManage ? (day) => setOpened(day.date) : undefined}
            onFree={canManage ? (date) => setDialog(date) : undefined}
            onCancelExtra={canManage ? async (id) => {
              if (!window.confirm('Cancel this extra car?')) return;
              try {
                await cancel({ id }).unwrap();
                toast.success('Extra car cancelled');
              } catch (e) {
                toast.error(e);
              }
            } : undefined}
            actions={(d) =>
              canManage && d.booked && d.bookingId ? (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5" onClick={(e) => e.stopPropagation()}>
                  {!d.blocked && !d.finishedOn && !d.receivedOn && (
                    <button
                      type="button"
                      className="text-[11px] font-medium text-blue-700 hover:underline"
                      onClick={async () => {
                        try {
                          await receive({ id: d.bookingId! }).unwrap();
                          toast.success('Car marked as received');
                        } catch (e) {
                          toast.error(e);
                        }
                      }}
                    >
                      Mark received
                    </button>
                  )}
                  {!d.blocked && !d.finishedOn && (
                    <button
                      type="button"
                      className="text-[11px] font-medium text-emerald-700 hover:underline"
                      onClick={async () => {
                        if (!window.confirm('Mark the work on this car as done today? Its salesperson is told, and the estimate date becomes today.')) return;
                        try {
                          await finish({ id: d.bookingId! }).unwrap();
                          toast.success('Marked as done');
                        } catch (e) {
                          toast.error(e);
                        }
                      }}
                    >
                      Mark done
                    </button>
                  )}
                  <button type="button" className="text-[11px] font-medium text-brand-700 hover:underline" onClick={() => setDialog(d.date, true)}>
                    Add another car
                  </button>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-red-600 hover:underline"
                    onClick={async () => {
                      if (!window.confirm(d.blocked ? 'Reopen this day?' : `Cancel the booking of ${dayLabel(d.date)}?`)) return;
                      try {
                        await cancel({ id: d.bookingId! }).unwrap();
                        toast.success(d.blocked ? 'Day reopened' : 'Booking cancelled');
                      } catch (e) {
                        toast.error(e);
                      }
                    }}
                  >
                    {d.blocked ? 'Reopen day' : 'Cancel booking'}
                  </button>
                </div>
              ) : null
            }
          />
        )}
      </div>
      <PpfSlotDetail day={openedDay} onClose={() => setOpened(null)} onAddExtra={(date) => setDialog(date, true)} />
      <Dialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        title={dialog ? `${slot?.extra ? 'Add another car on' : 'Book'} ${dayLabel(dialog)}` : ''}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            {!slot?.extra && (
              <Button variant="secondary" onClick={() => submit(true)}>
                Close this day
              </Button>
            )}
            <Button loading={booking} onClick={() => submit()}>
              {slot?.extra ? 'Add this car' : 'Book this day'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900 sm:col-span-2">
            {slot?.extra ? 'This day is already booked or closed: the car is added as an extra car on it, next to the first one.' : 'Book a car from our own reference (no PPF voucher yet), including an earlier day for a car you started early. Or close the day (a holiday, the bay is busy): nobody can book it until you reopen it. Vouchers book their own day when the salesperson issues them.'}
          </p>
          {own.length > 1 && (
            <Field label="Dealership" htmlFor="slot-dealer" required className="sm:col-span-2">
              <Select id="slot-dealer" value={f.dealershipId} onChange={(e) => setF((s) => ({ ...s, dealershipId: e.target.value, modelId: '' }))}>
                {own.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Customer name" htmlFor="slot-name" hint="Optional: a car can be booked without any details" error={err ?? undefined}>
            <Input id="slot-name" value={f.customerName} onChange={(e) => setF((s) => ({ ...s, customerName: e.target.value }))} />
          </Field>
          <Field label="Phone" htmlFor="slot-phone">
            <Input id="slot-phone" inputMode="tel" value={f.customerMobile} onChange={(e) => setF((s) => ({ ...s, customerMobile: e.target.value.replace(/[^\d+]/g, '') }))} />
          </Field>
          <Field label="Vehicle model" htmlFor="slot-model">
            <LeadModelSelect id="slot-model" value={f.modelId} onChange={(modelId) => setF((s) => ({ ...s, modelId }))} dealershipId={Number(f.dealershipId) || dealershipId} />
          </Field>
          <Field label="Variant" htmlFor="slot-variant">
            <Input id="slot-variant" value={f.variant} onChange={(e) => setF((s) => ({ ...s, variant: e.target.value }))} placeholder="e.g. T2 i-DM PHEV" />
          </Field>
          <Field label="Engine no." htmlFor="slot-engine">
            <Input id="slot-engine" value={f.engineNo} onChange={(e) => setF((s) => ({ ...s, engineNo: e.target.value }))} />
          </Field>
          <Field label="Chassis no." htmlFor="slot-chassis">
            <Input id="slot-chassis" value={f.chassisNo} onChange={(e) => setF((s) => ({ ...s, chassisNo: e.target.value }))} />
          </Field>
          <Field label="Registration no." htmlFor="slot-reg" hint="If the car has one">
            <Input id="slot-reg" value={f.registrationNo} onChange={(e) => setF((s) => ({ ...s, registrationNo: e.target.value }))} />
          </Field>
          <Field label="Salesperson" htmlFor="slot-sp" hint="Optional: who pitched the PPF and is responsible for it">
            <Input id="slot-sp" value={f.salespersonName} onChange={(e) => setF((s) => ({ ...s, salespersonName: e.target.value }))} />
          </Field>
          <Field label="Amount (PKR)" htmlFor="slot-amount" hint="Optional">
            <Input id="slot-amount" inputMode="decimal" value={f.amount} onChange={(e) => setF((s) => ({ ...s, amount: e.target.value }))} />
          </Field>
          <Field label="Notes" htmlFor="slot-notes">
            <Input id="slot-notes" value={f.notes} onChange={(e) => setF((s) => ({ ...s, notes: e.target.value }))} />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
