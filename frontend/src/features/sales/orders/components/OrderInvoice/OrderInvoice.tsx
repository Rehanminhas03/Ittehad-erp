import { useState } from 'react';
import { Badge, Button, Dialog, Field, Input, Section, Textarea } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { apiErrorMessage, formatDate, formatDateTime } from '@/shared/lib';
import { P } from '../../../permissions';
import { type SalesOrder, useClearVehicleInvoiceMutation, useRecordVehicleInvoiceMutation, useSetInvoiceDeliveredMutation } from '../../../salesApi';

/** The badge for the list and the lead: Invoice received (with its number) or not received yet. */
export function InvoiceBadge({ no, hasCar = true }: { no?: string | null; hasCar?: boolean }) {
  if (no) return <Badge tone="green" dot>Invoice {no}</Badge>;
  return hasCar ? <Badge tone="amber">Invoice not received</Badge> : <span className="text-slate-400">—</span>;
}

/**
 * The vehicle invoice received from the manufacturer / head office for the car of this order. The Sales Admin,
 * Assistant Manager or Manager records its number and the day it arrived (and can correct or remove it); the
 * salesperson of the customer, the managers and the admin see it.
 */
export function OrderInvoice({ order }: { order: SalesOrder }) {
  const perm = usePermission();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState(order.invoiceNo ?? '');
  const [invoiceDate, setInvoiceDate] = useState(order.invoiceDate ?? '');
  const [receivedOn, setReceivedOn] = useState(order.invoiceReceivedOn ?? '');
  const [notes, setNotes] = useState(order.invoiceNotes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [save, { isLoading }] = useRecordVehicleInvoiceMutation();
  const [clear, { isLoading: clearing }] = useClearVehicleInvoiceMutation();
  const [setDelivered, { isLoading: handing }] = useSetInvoiceDeliveredMutation();
  // Handing the invoice over: the customer himself, or someone else (name, contact and CNIC are then needed).
  const [handOpen, setHandOpen] = useState(false);
  const [takenBy, setTakenBy] = useState<'customer' | 'other'>('customer');
  const [receiver, setReceiver] = useState({ name: '', contact: '', cnic: '' });
  const [handError, setHandError] = useState<string | null>(null);
  const applies = !!order.vehicleId && ['approved', 'delivered'].includes(order.status);
  if (!applies && !order.invoiceNo) return null;
  const canRecord = applies && perm.canIn(P.ordersInvoice, order.dealershipId, order.branchId);

  const submit = async () => {
    if (!invoiceNo.trim()) return setError('Enter the invoice number');
    if (!invoiceDate) return setError('Enter the invoice date');
    setError(null);
    try {
      await save({ id: order.id, vehicleInvoiceRequest: { invoiceNo: invoiceNo.trim(), invoiceDate, receivedOn: receivedOn || null, notes: notes.trim() || null } }).unwrap();
      toast.success('Vehicle invoice recorded');
      setOpen(false);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Section compact
      title="Vehicle invoice (from the manufacturer)"
      actions={
        canRecord && (
          <Button size="sm" variant={order.invoiceNo ? 'secondary' : 'primary'} onClick={() => setOpen(true)}>
            {order.invoiceNo ? 'Correct invoice' : 'Record invoice received'}
          </Button>
        )
      }
    >
      {order.invoiceNo ? (
        <div className="space-y-1 text-sm">
          <p>
            <Badge tone="green" dot>Invoice received</Badge> <span className="ml-2 font-mono font-semibold text-slate-900">{order.invoiceNo}</span>
          </p>
          <p className="text-slate-600">
            {order.invoiceDate ? `Invoice dated ${formatDate(order.invoiceDate)} · ` : ''}Received on {formatDate(order.invoiceReceivedOn)}
            {order.invoiceReceivedByName ? ` · recorded by ${order.invoiceReceivedByName}` : ''}
          </p>
          {order.invoiceNotes && <p className="text-slate-700">{order.invoiceNotes}</p>}
          {/* The invoice is handed over: to the customer or to someone else; the date and time are taken from now. */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            {order.invoiceDeliveredAt ? (
              <>
                <Badge tone="green" dot>Invoice delivered</Badge>
                <span className="text-emerald-700">
                  Handed over {formatDateTime(order.invoiceDeliveredAt)} to{' '}
                  {order.invoiceTakenByName ? (
                    <b>
                      {order.invoiceTakenByName}
                      {order.invoiceTakenByContact ? ` · ${order.invoiceTakenByContact}` : ''}
                      {order.invoiceTakenByCnic ? ` · CNIC ${order.invoiceTakenByCnic}` : ''}
                    </b>
                  ) : (
                    <b>the customer</b>
                  )}
                </span>
                {canRecord && (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={handing}
                    onClick={async () => {
                      if (!window.confirm('Mark the invoice as not delivered?')) return;
                      try {
                        await setDelivered({ id: order.id, invoiceDeliveredRequest: { delivered: false, takenBy: 'customer' } }).unwrap();
                        toast.success('Marked as not delivered');
                      } catch (err) {
                        toast.error(err);
                      }
                    }}
                  >
                    Undo
                  </Button>
                )}
              </>
            ) : (
              canRecord && (
                <Button
                  size="sm"
                  onClick={() => {
                    setTakenBy('customer');
                    setReceiver({ name: '', contact: '', cnic: '' });
                    setHandError(null);
                    setHandOpen(true);
                  }}
                >
                  Hand over the invoice
                </Button>
              )
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          <Badge tone="amber">Invoice not received yet</Badge> <span className="ml-2">The Sales Admin, Assistant Manager or Manager records it when it arrives for this customer&apos;s car.</span>
        </p>
      )}
      {handOpen && (
        <Dialog
          open
          onClose={() => setHandOpen(false)}
          title="Hand over the invoice"
          footer={
            <>
              <Button variant="secondary" onClick={() => setHandOpen(false)}>
                Cancel
              </Button>
              <Button
                loading={handing}
                onClick={async () => {
                  if (takenBy === 'other' && !(receiver.name.trim() && receiver.contact.trim() && receiver.cnic.trim())) return setHandError("Enter the receiver's name, contact and CNIC");
                  setHandError(null);
                  try {
                    await setDelivered({
                      id: order.id,
                      invoiceDeliveredRequest: {
                        delivered: true,
                        takenBy,
                        receiverName: takenBy === 'other' ? receiver.name.trim() : null,
                        receiverContact: takenBy === 'other' ? receiver.contact.trim() : null,
                        receiverCnic: takenBy === 'other' ? receiver.cnic.trim() : null,
                      },
                    }).unwrap();
                    toast.success('Invoice handed over');
                    setHandOpen(false);
                  } catch (err) {
                    setHandError(apiErrorMessage(err));
                  }
                }}
              >
                Hand over
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Invoice <b className="font-mono">{order.invoiceNo}</b> · {order.customerName}. The date and time are recorded now.
            </p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Who is taking the invoice">
              {(
                [
                  ['customer', 'The customer', 'comes himself'],
                  ['other', 'Someone else', 'on the customer’s behalf'],
                ] as const
              ).map(([value, text, sub]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={takenBy === value}
                  onClick={() => setTakenBy(value)}
                  className={takenBy === value ? 'rounded-xl border-2 border-brand-600 bg-brand-50 px-3 py-2.5 text-left' : 'rounded-xl border-2 border-slate-200 bg-white px-3 py-2.5 text-left hover:border-slate-300'}
                >
                  <span className="block text-sm font-semibold text-slate-900">{text}</span>
                  <span className="block text-xs text-slate-500">{sub}</span>
                </button>
              ))}
            </div>
            {takenBy === 'other' && (
              <div className="space-y-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                <Field label="Receiver's name" htmlFor="ho-name" required>
                  <Input id="ho-name" value={receiver.name} onChange={(e) => setReceiver((r) => ({ ...r, name: e.target.value }))} autoFocus />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Receiver's contact" htmlFor="ho-contact" required>
                    <Input id="ho-contact" inputMode="tel" value={receiver.contact} onChange={(e) => setReceiver((r) => ({ ...r, contact: e.target.value.replace(/[^\d+\s-]/g, '') }))} />
                  </Field>
                  <Field label="Receiver's CNIC" htmlFor="ho-cnic" required hint="13 digits">
                    <Input id="ho-cnic" inputMode="numeric" value={receiver.cnic} onChange={(e) => setReceiver((r) => ({ ...r, cnic: e.target.value.replace(/[^\d-]/g, '') }))} placeholder="35202-1234567-1" />
                  </Field>
                </div>
              </div>
            )}
            {handError && <p className="text-sm text-red-600">{handError}</p>}
          </div>
        </Dialog>
      )}
      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          title="Vehicle invoice received"
          footer={
            <>
              {order.invoiceNo && (
                <Button
                  variant="secondary"
                  loading={clearing}
                  onClick={async () => {
                    try {
                      await clear({ id: order.id }).unwrap();
                      toast.success('Invoice removed');
                      setOpen(false);
                    } catch (e) {
                      toast.error(e);
                    }
                  }}
                >
                  Remove
                </Button>
              )}
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button loading={isLoading} onClick={submit}>
                Save
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              {order.customerName} · {order.vehicleLabel ?? order.vehicleVin}
            </p>
            <Field label="Invoice number" htmlFor="vi-no" required>
              <Input id="vi-no" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} autoFocus />
            </Field>
            <Field label="Invoice date" htmlFor="vi-date" required hint="The date printed on the invoice">
              <Input id="vi-date" type="date" value={invoiceDate} max={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' })} onChange={(e) => setInvoiceDate(e.target.value)} />
            </Field>
            <Field label="Received on" htmlFor="vi-on" hint="Empty: today">
              <Input id="vi-on" type="date" value={receivedOn} max={new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' })} onChange={(e) => setReceivedOn(e.target.value)} />
            </Field>
            <Field label="Notes" htmlFor="vi-notes">
              <Textarea id="vi-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </Dialog>
      )}
    </Section>
  );
}
