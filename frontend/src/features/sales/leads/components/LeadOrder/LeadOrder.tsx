import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { VEHICLE_PIPELINE, VEHICLE_STATUSES } from '@/features/crm';
import { Button, Field, Input, Section, Select, StatusBadge, Textarea } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { apiFieldErrors, formatMoney } from '@/shared/lib';
import { labelOf, ORDER_TYPES, P, PAYMENT_INSTRUMENTS } from '../../../permissions';
import { type Lead, useRaiseSalesOrderMutation } from '../../../salesApi';

/**
 * The lead's sales order: the Admin raises it (PBO / CBO) once the lead is converted; afterwards
 * everyone who can see the lead sees the order number (and can open it if they may view orders).
 */
export function LeadOrder({ lead }: { lead: Lead }) {
  const perm = usePermission();
  const toast = useToast();
  const navigate = useNavigate();
  const [raise, { isLoading }] = useRaiseSalesOrderMutation();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [v, setV] = useState({
    orderType: 'pbo',
    unitPrice: '',
    discount: '0',
    bookingAmount: lead.paymentAmount ?? '',
    paymentReference: lead.paymentInstrumentRef ?? '',
    expectedDeliveryDate: '',
    notes: '',
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const canViewOrders = perm.canIn(P.ordersViewAll, lead.dealershipId, lead.branchId);
  const payment = lead.paymentInstrument && (
    <p className="mb-4 text-sm text-slate-600">
      Payment: {labelOf(PAYMENT_INSTRUMENTS, lead.paymentInstrument)} {lead.paymentInstrumentRef}
      {lead.paymentInstrumentBank ? ` · ${lead.paymentInstrumentBank}` : ''}
      {lead.paymentAmount ? ` · ${formatMoney(lead.paymentAmount)}` : ''}
    </p>
  );

  if (lead.salesOrderId && lead.status !== 'converted') {
    return (
      <Section title="Sales order">
        {payment}
        {canViewOrders ? (
          <Link to={`/sales/orders/${lead.salesOrderId}`} className="text-sm font-medium text-brand-700 hover:underline">
            Open sales order {lead.orderNo}
          </Link>
        ) : (
          <p className="text-sm text-slate-700">
            Sales order <span className="font-mono">{lead.orderNo}</span> has been raised by the Admin.
          </p>
        )}
        {/* Where the car is (Delivery Team updates it), so the customer can be kept informed. */}
        {lead.status === 'processing' && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-600">Car:</span>
            {lead.vehicleStage ? (
              <>
                <ol className="flex flex-wrap items-center gap-1.5" aria-label="Car progress">
                  {VEHICLE_PIPELINE.map((p, i) => (
                    <li key={p} className="flex items-center gap-1.5">
                      <span
                        className={
                          i <= VEHICLE_PIPELINE.indexOf(lead.vehicleStage as (typeof VEHICLE_PIPELINE)[number])
                            ? 'rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700'
                            : 'rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500'
                        }
                      >
                        {VEHICLE_STATUSES.find((s) => s.value === p)?.label ?? p}
                      </span>
                      {i < VEHICLE_PIPELINE.length - 1 && <span className="text-slate-300">→</span>}
                    </li>
                  ))}
                </ol>
                {lead.vehicleStage === 'hold' && <StatusBadge status="hold" label="On hold" />}
              </>
            ) : (
              <span className="text-amber-700">Waiting for a car to be allocated</span>
            )}
          </div>
        )}
      </Section>
    );
  }
  if (lead.status !== 'converted' || !perm.canIn(P.ordersCreate, lead.dealershipId, lead.branchId)) return null;

  const submit = async () => {
    if (!v.unitPrice.trim()) {
      setErrors({ unitPrice: 'Price is required' });
      return;
    }
    setErrors({});
    try {
      const order = await raise({
        id: lead.id,
        raiseOrderRequest: {
          orderType: v.orderType as never,
          unitPrice: v.unitPrice,
          discount: v.discount || '0',
          bookingAmount: v.bookingAmount || undefined,
          paymentReference: v.paymentReference || null,
          expectedDeliveryDate: v.expectedDeliveryDate || null,
          notes: v.notes || null,
        },
      }).unwrap();
      toast.success(`Sales order ${order.orderNo} raised`);
      navigate(`/sales/orders/${order.id}`);
    } catch (e) {
      const issues = apiFieldErrors(e);
      if (issues.length) setErrors(Object.fromEntries(issues.map((i) => [i.path, i.message])));
      else toast.error(e);
    }
  };

  return (
    <Section title="Raise sales order">
      {payment}
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        <Field label="Order type" htmlFor="ro-type" required>
          <Select id="ro-type" value={v.orderType} onChange={set('orderType')}>
            {ORDER_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Expected delivery" htmlFor="ro-date">
          <Input id="ro-date" type="date" value={v.expectedDeliveryDate} onChange={set('expectedDeliveryDate')} />
        </Field>
        <Field label="Price (PKR)" htmlFor="ro-price" required error={errors.unitPrice}>
          <Input id="ro-price" inputMode="decimal" value={v.unitPrice} onChange={set('unitPrice')} invalid={!!errors.unitPrice} />
        </Field>
        <Field label="Discount (PKR)" htmlFor="ro-discount" error={errors.discount} hint="Limited by the group discount policy">
          <Input id="ro-discount" inputMode="decimal" value={v.discount} onChange={set('discount')} invalid={!!errors.discount} />
        </Field>
        <Field label="Booking amount (PKR)" htmlFor="ro-booking" error={errors.bookingAmount}>
          <Input id="ro-booking" inputMode="decimal" value={v.bookingAmount} onChange={set('bookingAmount')} />
        </Field>
        <Field label="Payment reference" htmlFor="ro-ref">
          <Input id="ro-ref" value={v.paymentReference} onChange={set('paymentReference')} />
        </Field>
        <Field label="Notes" htmlFor="ro-notes" className="sm:col-span-2">
          <Textarea id="ro-notes" value={v.notes} onChange={set('notes')} />
        </Field>
        <div className="sm:col-span-2">
          <Button loading={isLoading} onClick={submit}>
            Raise sales order
          </Button>
        </div>
      </div>
    </Section>
  );
}
