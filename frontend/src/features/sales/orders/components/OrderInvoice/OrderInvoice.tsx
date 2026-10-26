import { useState } from 'react';
import { Badge, Button, Dialog, Field, Input, Section, Textarea } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatDate } from '@/shared/lib';
import { P } from '../../../permissions';
import { type SalesOrder, useClearVehicleInvoiceMutation, useRecordVehicleInvoiceMutation } from '../../../salesApi';

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
  const [receivedOn, setReceivedOn] = useState(order.invoiceReceivedOn ?? '');
  const [notes, setNotes] = useState(order.invoiceNotes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [save, { isLoading }] = useRecordVehicleInvoiceMutation();
  const [clear, { isLoading: clearing }] = useClearVehicleInvoiceMutation();
  const applies = !!order.vehicleId && ['approved', 'delivered'].includes(order.status);
  if (!applies && !order.invoiceNo) return null;
  const canRecord = applies && perm.canIn(P.ordersInvoice, order.dealershipId, order.branchId);

  const submit = async () => {
    if (!invoiceNo.trim()) return setError('Enter the invoice number');
    setError(null);
    try {
      await save({ id: order.id, vehicleInvoiceRequest: { invoiceNo: invoiceNo.trim(), receivedOn: receivedOn || null, notes: notes.trim() || null } }).unwrap();
      toast.success('Vehicle invoice recorded');
      setOpen(false);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Section
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
            Received on {formatDate(order.invoiceReceivedOn)}
            {order.invoiceReceivedByName ? ` · recorded by ${order.invoiceReceivedByName}` : ''}
          </p>
          {order.invoiceNotes && <p className="text-slate-700">{order.invoiceNotes}</p>}
        </div>
      ) : (
        <p className="text-sm text-slate-600">
          <Badge tone="amber">Invoice not received yet</Badge> <span className="ml-2">The Sales Admin, Assistant Manager or Manager records it when it arrives for this customer&apos;s car.</span>
        </p>
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
