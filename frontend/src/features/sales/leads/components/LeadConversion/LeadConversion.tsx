import { useState } from 'react';
import { Button, Field, Input, Section, Select, Textarea } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { digitsOnly } from '@/shared/components/EntityFormView/FormFieldControl';
import { maskCnic } from '@/features/crm';
import { apiConflict, apiFieldErrors } from '@/shared/lib';
import { CUSTOMER_TYPES, OPEN_LEAD_STATES, P, PAYMENT_INSTRUMENTS } from '../../../permissions';
import { type Lead, useConvertLeadMutation } from '../../../salesApi';
import { ExpectedDeliveryInput, type ExpectedDeliveryValue } from '../../../orders/components/ExpectedDelivery';
import { LeadModelSelect } from '../LeadModelSelect';
import { VariantPicker } from '../VariantPicker';

/**
 * "Convert to Lead": the owner (or the Assistant Manager, for an escalated lead) captures the
 * qualifying details. Once converted, the dealership's Admin sees the lead and raises the order.
 */
export function LeadConversion({ lead }: { lead: Lead }) {
  const perm = usePermission();
  const toast = useToast();
  const [convert, { isLoading }] = useConvertLeadMutation();
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [v, setV] = useState({
    prospectName: lead.prospectName,
    prospectMobile: digitsOnly(lead.prospectMobile),
    interestedModelId: lead.interestedModelId ? String(lead.interestedModelId) : '',
    preferredColor: lead.preferredColor ?? '',
    variant: lead.variant ?? '',
    email: lead.email ?? '',
    paymentInstrument: '',
    paymentInstrumentRef: '',
    paymentInstrumentBank: '',
    paymentAmount: '',
    notes: '',
    // Individual, or corporate: billed to the company (its name, the contact's designation, a purchase order if any).
    customerType: 'individual',
    companyName: '',
    contactDesignation: '',
    purchaseOrderNo: '',
  });
  // The customer's CNIC (required): the Admin checks it against the copy when raising the order.
  const [cnic, setCnic] = useState('');
  const [expected, setExpected] = useState<ExpectedDeliveryValue>({ date: lead.expectedDeliveryDate ?? '', byMonth: lead.expectedDeliveryDate ? !!lead.expectedDeliveryByMonth : true });

  const isOpenLead = (OPEN_LEAD_STATES as readonly string[]).includes(lead.status);
  // The owner, or the Assistant Manager / Manager who logged the lead (also for a salesperson).
  const loggedIt = lead.createdById === perm.userId && lead.ownerId !== perm.userId;
  const asOwner = (lead.ownerId === perm.userId || loggedIt) && perm.canIn(P.leadsConvertOwn, lead.dealershipId, lead.branchId);
  const asEscalation = !!lead.escalatedAt && perm.canIn(P.leadsConvertEscalated, lead.dealershipId, lead.branchId);
  if (!isOpenLead || !(asOwner || asEscalation)) return null;

  const set = (k: keyof typeof v) => (e: { target: { value: string } }) =>
    setV((s) => ({ ...s, [k]: k === 'prospectMobile' ? digitsOnly(e.target.value) : e.target.value }));
  const required = (k: keyof typeof v, label: string) => (v[k].trim() ? null : [k, `${label} is required`] as const);

  const submit = async () => {
    const missing = [
      required('prospectName', 'Customer name'),
      required('prospectMobile', 'Phone'),
      required('interestedModelId', 'Model'),
      required('variant', 'Variant'),
      required('preferredColor', 'Vehicle colour'),
      required('email', 'Email'),
      required('paymentInstrument', 'Payment instrument'),
      required('paymentInstrumentRef', 'Instrument number'),
      cnic.replace(/\D/g, '').length === 13 ? null : (['customerCnic', "Enter the customer's CNIC (13 digits)"] as const),
      v.customerType === 'corporate' ? required('companyName', 'Company name') : null,
      v.customerType === 'corporate' ? required('contactDesignation', "The contact's designation") : null,
    ].filter((x) => x !== null);
    if (missing.length) {
      setErrors(Object.fromEntries(missing));
      return;
    }
    setErrors({});
    try {
      await convert({
        id: lead.id,
        convertLeadRequest: {
          prospectName: v.prospectName,
          prospectMobile: v.prospectMobile,
          interestedModelId: Number(v.interestedModelId),
          preferredColor: v.preferredColor,
          variant: v.variant,
          email: v.email,
          paymentInstrument: v.paymentInstrument as never,
          paymentInstrumentRef: v.paymentInstrumentRef,
          paymentInstrumentBank: v.paymentInstrumentBank || null,
          paymentAmount: v.paymentAmount || undefined,
          expectedDeliveryDate: expected.date || null,
          expectedDeliveryByMonth: !!expected.date && expected.byMonth,
          customerCnic: cnic,
          customerType: v.customerType as 'individual',
          companyName: v.customerType === 'corporate' ? v.companyName.trim() : null,
          contactDesignation: v.customerType === 'corporate' ? v.contactDesignation.trim() : null,
          purchaseOrderNo: v.customerType === 'corporate' ? v.purchaseOrderNo.trim() || null : null,
          notes: v.notes || null,
        },
      }).unwrap();
      toast.success('Lead converted — the Admin can now raise the sales order');
      setOpen(false);
    } catch (e) {
      const issues = apiFieldErrors(e);
      const conflict = apiConflict(e);
      if (issues.length) setErrors(Object.fromEntries(issues.map((i) => [i.path, i.message])));
      // A corrected phone that already has another open lead.
      else if (conflict) setErrors({ prospectMobile: conflict.message });
      else toast.error(e);
    }
  };

  return (
    <Section
      title="Convert to Lead"
      actions={!open && <Button onClick={() => setOpen(true)}>Convert to Lead</Button>}
    >
      {asOwner && loggedIt && (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
          You logged this lead for {lead.ownerName ?? 'a salesperson'}: you can convert it; {lead.ownerName ?? 'the salesperson'} stays the owner.
        </p>
      )}
      {!asOwner && (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Duplicate customer sent to you: you are converting it on behalf of {lead.ownerName ?? 'its salesperson'}, who stays the owner.
        </p>
      )}
      {!open ? (
        <p className="text-sm text-slate-600">
          When the customer is ready to book, check the customer's name and phone and capture the model, variant, colour, email and
          payment instrument. The lead then goes to the Admin, who raises the sales order.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-sm font-medium text-slate-700">Customer type</p>
            <div className="inline-flex rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Customer type">
              {CUSTOMER_TYPES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  role="radio"
                  aria-checked={v.customerType === c.value}
                  onClick={() => setV((s) => ({ ...s, customerType: c.value }))}
                  className={
                    v.customerType === c.value
                      ? 'rounded-lg bg-white px-4 py-1.5 text-sm font-semibold text-brand-700 shadow-sm'
                      : 'rounded-lg px-4 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900'
                  }
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          {v.customerType === 'corporate' && (
            <>
              <Field label="Company name" htmlFor="cv-company" required error={errors.companyName} hint="The order and documents are in the company's name">
                <Input id="cv-company" value={v.companyName} onChange={set('companyName')} invalid={!!errors.companyName} placeholder="e.g. ABC Traders (Pvt) Ltd" />
              </Field>
              <Field label="Contact's designation / title" htmlFor="cv-designation" required error={errors.contactDesignation}>
                <Input id="cv-designation" value={v.contactDesignation} onChange={set('contactDesignation')} invalid={!!errors.contactDesignation} placeholder="e.g. Admin Manager" />
              </Field>
              <Field label="Purchase order no." htmlFor="cv-po" error={errors.purchaseOrderNo} hint="Leave empty if the company has not given a purchase order">
                <Input id="cv-po" value={v.purchaseOrderNo} onChange={set('purchaseOrderNo')} invalid={!!errors.purchaseOrderNo} />
              </Field>
              <div className="hidden sm:block" />
            </>
          )}
          <Field label={v.customerType === 'corporate' ? 'Contact person (name)' : 'Customer name'} htmlFor="cv-name" required error={errors.prospectName}>
            <Input id="cv-name" value={v.prospectName} onChange={set('prospectName')} invalid={!!errors.prospectName} />
          </Field>
          <Field label="Phone" htmlFor="cv-phone" required error={errors.prospectMobile} hint="Digits only">
            <Input id="cv-phone" type="tel" inputMode="tel" maxLength={16} placeholder="03001234567" value={v.prospectMobile} onChange={(e) => set('prospectMobile')({ target: { value: digitsOnly(e.target.value) } })} invalid={!!errors.prospectMobile} />
          </Field>
          <Field label="Model" htmlFor="cv-model" required error={errors.interestedModelId}>
            <LeadModelSelect
              id="cv-model"
              value={v.interestedModelId}
              onChange={(interestedModelId) => setV((s) => ({ ...s, interestedModelId }))}
              invalid={!!errors.interestedModelId}
              dealershipId={lead.dealershipId}
            />
          </Field>
          <Field label="Variant" htmlFor="cv-variant" required error={errors.variant}>
            <VariantPicker
              id="cv-variant"
              value={v.variant}
              onChange={(variant) => setV((s) => ({ ...s, variant }))}
              invalid={!!errors.variant}
              modelId={Number(v.interestedModelId) || null}
              dealershipId={lead.dealershipId}
            />
          </Field>
          <Field label="Vehicle colour" htmlFor="cv-color" required error={errors.preferredColor}>
            <Input id="cv-color" value={v.preferredColor} onChange={set('preferredColor')} invalid={!!errors.preferredColor} />
          </Field>
          <Field label="Customer email" htmlFor="cv-email" required error={errors.email}>
            <Input id="cv-email" type="email" value={v.email} onChange={set('email')} invalid={!!errors.email} />
          </Field>
          <Field label="Payment instrument" htmlFor="cv-instrument" required error={errors.paymentInstrument}>
            <Select id="cv-instrument" value={v.paymentInstrument} onChange={set('paymentInstrument')} invalid={!!errors.paymentInstrument}>
              <option value="">Select…</option>
              {PAYMENT_INSTRUMENTS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Instrument number" htmlFor="cv-ref" required error={errors.paymentInstrumentRef}>
            <Input id="cv-ref" value={v.paymentInstrumentRef} onChange={set('paymentInstrumentRef')} invalid={!!errors.paymentInstrumentRef} />
          </Field>
          <Field label="Bank" htmlFor="cv-bank">
            <Input id="cv-bank" value={v.paymentInstrumentBank} onChange={set('paymentInstrumentBank')} />
          </Field>
          <Field label="Amount (PKR)" htmlFor="cv-amount" error={errors.paymentAmount}>
            <Input id="cv-amount" inputMode="decimal" value={v.paymentAmount} onChange={set('paymentAmount')} invalid={!!errors.paymentAmount} />
          </Field>
          <Field label="Customer CNIC" htmlFor="cv-cnic" required error={errors.customerCnic} hint="From the customer's CNIC; the Admin checks it against the copy">
            <Input id="cv-cnic" inputMode="numeric" value={cnic} onChange={(e) => setCnic(maskCnic(e.target.value))} placeholder="14301-5305891-1" invalid={!!errors.customerCnic} />
          </Field>
          <Field label="Expected delivery" htmlFor="cv-expected" className="sm:col-span-2" error={errors.expectedDeliveryDate} hint="What the customer is told: a month (some cars take 3–5 months) or an exact date. Goes on the sales order.">
            <ExpectedDeliveryInput id="cv-expected" value={expected} onChange={setExpected} invalid={!!errors.expectedDeliveryDate} />
          </Field>
          <Field label="Notes" htmlFor="cv-notes" className="sm:col-span-2">
            <Textarea id="cv-notes" value={v.notes} onChange={set('notes')} />
          </Field>
          <div className="flex gap-2 sm:col-span-2">
            <Button loading={isLoading} onClick={submit}>
              Confirm conversion
            </Button>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}
