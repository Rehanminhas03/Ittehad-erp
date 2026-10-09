import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatCnic, maskCnic, VEHICLE_PIPELINE, VEHICLE_STATUSES } from '@/features/crm';
import { useGetCustomerQuery } from '@/features/crm/crmApi';
import { Button, Field, Input, Section, Select, Textarea } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { apiFieldErrors, formatMoney } from '@/shared/lib';
import { labelOf, ORDER_TYPES, P, PAYMENT_INSTRUMENTS } from '../../../permissions';
import { type Lead, useRaiseSalesOrderMutation } from '../../../salesApi';
import { ExpectedDeliveryInput, type ExpectedDeliveryValue } from '../../../orders/components/ExpectedDelivery';

const STAGE_STYLE: Record<string, { label: string; tone: string }> = {
  none: { label: 'Waiting for a car', tone: 'bg-amber-50 text-amber-900 ring-amber-200' },
  booked: { label: 'Car booked', tone: 'bg-sky-50 text-sky-900 ring-sky-200' },
  in_transit: { label: 'In transit', tone: 'bg-indigo-50 text-indigo-900 ring-indigo-200' },
  received: { label: 'Received at the dealership', tone: 'bg-teal-50 text-teal-900 ring-teal-200' },
  ready_for_delivery: { label: 'Ready for delivery', tone: 'bg-emerald-50 text-emerald-900 ring-emerald-200' },
  delivered: { label: 'Delivered', tone: 'bg-emerald-600 text-white ring-emerald-700' },
  hold: { label: 'On hold', tone: 'bg-red-50 text-red-900 ring-red-200' },
};

/**
 * Where the customer's car is, easy to read at a glance: the stage in large bold letters, then the
 * steps (done ✓, the current one filled, the rest grey).
 */
function CarStatus({ stage }: { stage: string | null | undefined }) {
  const key = stage ?? 'none';
  const style = STAGE_STYLE[key] ?? { label: VEHICLE_STATUSES.find((s) => s.value === key)?.label ?? key, tone: 'bg-slate-50 text-slate-900 ring-slate-200' };
  const at = key === 'delivered' ? VEHICLE_PIPELINE.length : VEHICLE_PIPELINE.indexOf(key as (typeof VEHICLE_PIPELINE)[number]);
  return (
    <div className="mt-4 space-y-3">
      <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl px-4 py-3 ring-1 ${style.tone}`}>
        <span className="text-xs font-semibold tracking-wide uppercase opacity-80">Car status</span>
        <span className="text-xl font-bold">{style.label}</span>
      </div>
      {key !== 'none' && key !== 'hold' && (
        <ol className="flex flex-wrap items-center gap-1.5 text-sm" aria-label="Car progress">
          {VEHICLE_PIPELINE.map((p, i) => (
            <li key={p} className="flex items-center gap-1.5">
              <span
                className={
                  i < at
                    ? 'rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-800'
                    : i === at
                      ? 'rounded-full bg-brand-600 px-2.5 py-1 font-bold text-white shadow-sm'
                      : 'rounded-full bg-slate-100 px-2.5 py-1 text-slate-400'
                }
              >
                {i < at ? '✓ ' : ''}
                {VEHICLE_STATUSES.find((s) => s.value === p)?.label ?? p}
              </span>
              {i < VEHICLE_PIPELINE.length - 1 && <span className="text-slate-300">→</span>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

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
    // The car's price told at conversion (partial: its total; full: the amount paid), checked by the Admin.
    unitPrice: lead.vehiclePrice ? String(Number(lead.vehiclePrice)) : '',
    discount: '0',
    bookingAmount: lead.paymentAmount ?? '',
    paymentReference: lead.paymentInstrumentRef ?? '',
    notes: '',
  });
  // The customer's CNIC: required on every sales order (prefilled when the customer has one).
  const canRaise = lead.status === 'converted' && perm.canIn(P.ordersCreate, lead.dealershipId, lead.branchId);
  const { data: customer } = useGetCustomerQuery({ id: lead.customerId ?? 0 }, { skip: !canRaise || !lead.customerId });
  const [cnic, setCnic] = useState('');
  // The PBO number from the head-office system (required); leads and orders are searchable by it.
  const [pboNo, setPboNo] = useState('');
  useEffect(() => {
    if (customer?.cnic) setCnic((c) => c || formatCnic(customer.cnic));
  }, [customer?.cnic]);
  // What the salesperson told the customer at conversion (a month, usually).
  const [expected, setExpected] = useState<ExpectedDeliveryValue>({ date: lead.expectedDeliveryDate ?? '', byMonth: lead.expectedDeliveryDate ? !!lead.expectedDeliveryByMonth : true });
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
        {/* Where the car is (in big, clear letters), so the customer can be kept informed. */}
        {(lead.status === 'processing' || lead.status === 'completed') && <CarStatus stage={lead.status === 'completed' ? 'delivered' : lead.vehicleStage} />}
      </Section>
    );
  }
  if (lead.status !== 'converted' || !perm.canIn(P.ordersCreate, lead.dealershipId, lead.branchId)) return null;

  const submit = async () => {
    const missing: Record<string, string> = {};
    if (!v.unitPrice.trim()) missing.unitPrice = 'Price is required';
    if (!pboNo.trim()) missing.pboNo = 'Enter the PBO number from the head-office system';
    if (cnic.replace(/\D/g, '').length !== 13) missing.customerCnic = "Enter the customer's CNIC (13 digits), required on every sales order";
    if (Object.keys(missing).length) {
      setErrors(missing);
      return;
    }
    setErrors({});
    try {
      const order = await raise({
        id: lead.id,
        raiseOrderRequest: {
          orderType: v.orderType as never,
          pboNo: pboNo.trim(),
          unitPrice: v.unitPrice,
          discount: v.discount || '0',
          bookingAmount: v.bookingAmount || undefined,
          paymentReference: v.paymentReference || null,
          customerCnic: cnic.trim(),
          expectedDeliveryDate: expected.date || null,
          expectedDeliveryByMonth: !!expected.date && expected.byMonth,
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
        <Field label="PBO number" htmlFor="ro-pbo" required error={errors.pboNo} hint="From the head-office system">
          <Input id="ro-pbo" value={pboNo} onChange={(e) => setPboNo(e.target.value)} placeholder="e.g. 11873" invalid={!!errors.pboNo} />
        </Field>
        <Field
          label="Customer CNIC"
          htmlFor="ro-cnic"
          required
          error={errors.customerCnic}
          hint={customer?.cnic ? 'Entered by the salesperson: check it against the CNIC copy and correct it if needed' : 'Saved on the customer'}
        >
          <Input
            id="ro-cnic"
            inputMode="numeric"
            value={cnic}
            onChange={(e) => setCnic(maskCnic(e.target.value))}
            placeholder="14301-5305891-1"
            invalid={!!errors.customerCnic}
          />
        </Field>
        <Field label="Expected delivery" htmlFor="ro-date" error={errors.expectedDeliveryDate} hint="A month (usual) or the exact date">
          <ExpectedDeliveryInput id="ro-date" value={expected} onChange={setExpected} invalid={!!errors.expectedDeliveryDate} />
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
