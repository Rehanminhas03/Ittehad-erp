import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { formatCnic, maskCnic } from '@/features/crm';
import { useGetCustomerQuery } from '@/features/crm/crmApi';
import { Button, Field, Input, Section, Select, Textarea } from '@/shared/components/ui';
import { digitsOnly } from '@/shared/components/EntityFormView/FormFieldControl';
import { usePermission, useToast } from '@/shared/hooks';
import { apiConflict, apiFieldErrors } from '@/shared/lib';
import { CUSTOMER_TYPES, P, PAYMENT_INSTRUMENTS, PAYMENT_TYPES } from '../../../permissions';
import { type Lead, useCorrectLeadConversionMutation } from '../../../salesApi';
import { ExpectedDeliveryInput, type ExpectedDeliveryValue } from '../../../orders/components/ExpectedDelivery';
import { LeadModelSelect } from '../LeadModelSelect';
import { VariantPicker } from '../VariantPicker';

/**
 * Assistant Manager / Sales Manager / Sales Admin: correct what the salesperson entered when converting the lead (contact,
 * address, CNIC, model, price, payment, customer type, expected delivery), until the Sales Admin raises
 * the sales order. The customer record follows; the owner and the Sales Admin are notified.
 */
export function LeadConversionEdit({ lead }: { lead: Lead }) {
  const perm = usePermission();
  const toast = useToast();
  const allowed = lead.status === 'converted' && perm.canIn(P.leadsCorrectConversion, lead.dealershipId, lead.branchId);
  const { data: customer } = useGetCustomerQuery({ id: lead.customerId ?? 0 }, { skip: !allowed || !lead.customerId });
  const [save, { isLoading }] = useCorrectLeadConversionMutation();
  const [open, setOpen] = useState(false);
  // The "Edit conversion details" button at the top of the lead page opens this form (?editConversion=1).
  const [params, setParams] = useSearchParams();
  const top = useRef<HTMLDivElement>(null);
  const close = () => {
    setOpen(false);
    if (params.has('editConversion')) {
      const next = new URLSearchParams(params);
      next.delete('editConversion');
      setParams(next, { replace: true });
    }
  };
  const [errors, setErrors] = useState<Record<string, string>>({});
  const initial = () => ({
    prospectName: lead.prospectName,
    prospectMobile: digitsOnly(lead.prospectMobile),
    email: lead.email ?? '',
    customerAddress: lead.customerAddress ?? '',
    interestedModelId: lead.interestedModelId ? String(lead.interestedModelId) : '',
    variant: lead.variant ?? '',
    preferredColor: lead.preferredColor ?? '',
    paymentType: lead.paymentType ?? '',
    vehiclePrice: lead.vehiclePrice && lead.paymentType === 'partial' ? String(Number(lead.vehiclePrice)) : '',
    paymentAmount: lead.paymentAmount ? String(Number(lead.paymentAmount)) : '',
    paymentInstrument: lead.paymentInstrument ?? '',
    paymentInstrumentRef: lead.paymentInstrumentRef ?? '',
    paymentInstrumentBank: lead.paymentInstrumentBank ?? '',
    customerType: lead.customerType ?? 'individual',
    companyName: lead.companyName ?? '',
    contactDesignation: lead.contactDesignation ?? '',
    purchaseOrderNo: lead.purchaseOrderNo ?? '',
    notes: lead.notes ?? '',
  });
  const [v, setV] = useState(initial);
  const [cnic, setCnic] = useState('');
  const [expected, setExpected] = useState<ExpectedDeliveryValue>({ date: lead.expectedDeliveryDate ?? '', byMonth: lead.expectedDeliveryDate ? !!lead.expectedDeliveryByMonth : true });
  useEffect(() => {
    if (customer?.cnic) setCnic((c) => c || formatCnic(customer.cnic));
  }, [customer?.cnic]);
  const asked = params.get('editConversion') === '1';
  useEffect(() => {
    if (!allowed || !asked) return;
    setV(initial());
    setOpen(true);
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the button is pressed
  }, [asked, allowed]);
  if (!allowed) return null;

  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: k === 'prospectMobile' ? digitsOnly(e.target.value) : e.target.value }));
  const err = (k: string) => errors[k];

  const submit = async () => {
    const missing: Record<string, string> = {};
    for (const [k, label] of [['prospectName', 'Customer name'], ['prospectMobile', 'Phone'], ['email', 'Email'], ['customerAddress', 'Address'], ['interestedModelId', 'Model'], ['variant', 'Variant'], ['preferredColor', 'Colour'], ['paymentType', 'Payment type'], ['paymentInstrument', 'Payment instrument'], ['paymentAmount', 'The amount paid']] as const) {
      if (!v[k].trim()) missing[k] = `${label} is required`;
    }
    if (v.paymentType === 'partial' && !v.vehiclePrice.trim()) missing.vehiclePrice = 'Enter the total amount of the car';
    if (cnic && cnic.replace(/\D/g, '').length !== 13) missing.customerCnic = 'CNIC must be 13 digits';
    if (Object.keys(missing).length) return setErrors(missing);
    setErrors({});
    try {
      await save({
        id: lead.id,
        conversionCorrectionRequest: {
          prospectName: v.prospectName.trim(),
          prospectMobile: v.prospectMobile,
          email: v.email.trim(),
          customerAddress: v.customerAddress.trim(),
          ...(cnic ? { customerCnic: cnic } : {}),
          interestedModelId: Number(v.interestedModelId),
          variant: v.variant.trim(),
          preferredColor: v.preferredColor.trim(),
          paymentType: v.paymentType as 'partial',
          paymentInstrument: v.paymentInstrument as never,
          paymentInstrumentRef: v.paymentInstrumentRef.trim() || null,
          paymentInstrumentBank: v.paymentInstrumentBank.trim() || null,
          paymentAmount: v.paymentAmount.trim(),
          vehiclePrice: v.paymentType === 'partial' ? v.vehiclePrice.trim() : undefined,
          customerType: v.customerType as 'individual',
          companyName: v.customerType === 'corporate' ? v.companyName.trim() || null : null,
          contactDesignation: v.customerType === 'corporate' ? v.contactDesignation.trim() || null : null,
          purchaseOrderNo: v.customerType === 'corporate' ? v.purchaseOrderNo.trim() || null : null,
          expectedDeliveryDate: expected.date || null,
          expectedDeliveryByMonth: !!expected.date && expected.byMonth,
          notes: v.notes.trim() || null,
        },
      }).unwrap();
      toast.success('Conversion details corrected: the salesperson and the Sales Admin are notified');
      close();
    } catch (e) {
      const issues = apiFieldErrors(e);
      const conflict = apiConflict(e);
      if (issues.length) setErrors(Object.fromEntries(issues.map((i) => [i.path, i.message])));
      else if (conflict) setErrors({ prospectMobile: conflict.message });
      else toast.error(e);
    }
  };

  return (
    <div ref={top} className="scroll-mt-24">
    <Section
      title="Correct the conversion details"
      actions={
        !open && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setV(initial());
              setOpen(true);
            }}
          >
            Edit conversion details
          </Button>
        )
      }
    >
      {!open ? (
        <p className="text-sm text-slate-600">
          If the salesperson made a mistake while converting (phone, email, address, price, payment…), correct it here before the Sales Admin raises the sales order.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <Field label="Customer name" htmlFor="ce-name" required error={err('prospectName')}>
            <Input id="ce-name" value={v.prospectName} onChange={set('prospectName')} invalid={!!err('prospectName')} />
          </Field>
          <Field label="Phone" htmlFor="ce-phone" required error={err('prospectMobile')} hint="Digits only">
            <Input id="ce-phone" type="tel" inputMode="tel" maxLength={16} value={v.prospectMobile} onChange={set('prospectMobile')} invalid={!!err('prospectMobile')} />
          </Field>
          <Field label="Email" htmlFor="ce-email" required error={err('email')}>
            <Input id="ce-email" type="email" value={v.email} onChange={set('email')} invalid={!!err('email')} />
          </Field>
          <Field label="Customer CNIC" htmlFor="ce-cnic" error={err('customerCnic')}>
            <Input id="ce-cnic" inputMode="numeric" value={cnic} onChange={(e) => setCnic(maskCnic(e.target.value))} placeholder="14301-5305891-1" invalid={!!err('customerCnic')} />
          </Field>
          <Field label="Address" htmlFor="ce-address" required className="sm:col-span-2" error={err('customerAddress')}>
            <Input id="ce-address" value={v.customerAddress} onChange={set('customerAddress')} invalid={!!err('customerAddress')} />
          </Field>
          <Field label="Model" htmlFor="ce-model" required error={err('interestedModelId')}>
            <LeadModelSelect id="ce-model" value={v.interestedModelId} onChange={(interestedModelId) => setV((s) => ({ ...s, interestedModelId }))} invalid={!!err('interestedModelId')} dealershipId={lead.dealershipId} />
          </Field>
          <Field label="Variant" htmlFor="ce-variant" required error={err('variant')}>
            <VariantPicker id="ce-variant" value={v.variant} onChange={(variant) => setV((s) => ({ ...s, variant }))} invalid={!!err('variant')} modelId={Number(v.interestedModelId) || null} dealershipId={lead.dealershipId} />
          </Field>
          <Field label="Vehicle colour" htmlFor="ce-color" required error={err('preferredColor')}>
            <Input id="ce-color" value={v.preferredColor} onChange={set('preferredColor')} invalid={!!err('preferredColor')} />
          </Field>
          <Field label="Customer type" htmlFor="ce-type">
            <Select id="ce-type" value={v.customerType} onChange={set('customerType')}>
              {CUSTOMER_TYPES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          {v.customerType === 'corporate' && (
            <>
              <Field label="Company name" htmlFor="ce-company" required error={err('companyName')}>
                <Input id="ce-company" value={v.companyName} onChange={set('companyName')} invalid={!!err('companyName')} />
              </Field>
              <Field label="Contact's designation" htmlFor="ce-designation" required error={err('contactDesignation')}>
                <Input id="ce-designation" value={v.contactDesignation} onChange={set('contactDesignation')} invalid={!!err('contactDesignation')} />
              </Field>
              <Field label="Purchase order no." htmlFor="ce-po" error={err('purchaseOrderNo')}>
                <Input id="ce-po" value={v.purchaseOrderNo} onChange={set('purchaseOrderNo')} />
              </Field>
            </>
          )}
          <Field label="Payment" htmlFor="ce-ptype" required error={err('paymentType')}>
            <Select id="ce-ptype" value={v.paymentType} onChange={set('paymentType')} invalid={!!err('paymentType')}>
              <option value="">Select…</option>
              {PAYMENT_TYPES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          {v.paymentType === 'partial' && (
            <Field label="Total amount of the car (PKR)" htmlFor="ce-total" required error={err('vehiclePrice')}>
              <Input id="ce-total" inputMode="decimal" value={v.vehiclePrice} onChange={set('vehiclePrice')} invalid={!!err('vehiclePrice')} />
            </Field>
          )}
          <Field label={v.paymentType === 'full' ? 'Full amount paid (PKR)' : 'Amount paid now — booking (PKR)'} htmlFor="ce-amount" required error={err('paymentAmount')}>
            <Input id="ce-amount" inputMode="decimal" value={v.paymentAmount} onChange={set('paymentAmount')} invalid={!!err('paymentAmount')} />
          </Field>
          <Field label="Payment instrument" htmlFor="ce-instrument" required error={err('paymentInstrument')}>
            <Select id="ce-instrument" value={v.paymentInstrument} onChange={set('paymentInstrument')} invalid={!!err('paymentInstrument')}>
              <option value="">Select…</option>
              {PAYMENT_INSTRUMENTS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          {v.paymentInstrument !== 'cash' && (
            <>
              <Field label="Instrument number" htmlFor="ce-ref" required error={err('paymentInstrumentRef')}>
                <Input id="ce-ref" value={v.paymentInstrumentRef} onChange={set('paymentInstrumentRef')} invalid={!!err('paymentInstrumentRef')} />
              </Field>
              <Field label="Bank" htmlFor="ce-bank" required error={err('paymentInstrumentBank')}>
                <Input id="ce-bank" value={v.paymentInstrumentBank} onChange={set('paymentInstrumentBank')} invalid={!!err('paymentInstrumentBank')} />
              </Field>
            </>
          )}
          <Field label="Expected delivery" htmlFor="ce-expected" className="sm:col-span-2" error={err('expectedDeliveryDate')}>
            <ExpectedDeliveryInput id="ce-expected" value={expected} onChange={setExpected} invalid={!!err('expectedDeliveryDate')} />
          </Field>
          <Field label="Notes" htmlFor="ce-notes" className="sm:col-span-2">
            <Textarea id="ce-notes" value={v.notes} onChange={set('notes')} />
          </Field>
          <div className="flex gap-2 sm:col-span-2">
            <Button loading={isLoading} onClick={submit}>
              Save corrections
            </Button>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Section>
    </div>
  );
}
