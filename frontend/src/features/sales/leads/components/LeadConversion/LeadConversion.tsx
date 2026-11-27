import { useEffect, useState } from 'react';
import { type FilerStatus, FilerStatusInput } from '../FilerStatusInput';
import { Button, Checkbox, Field, Input, Section, Select, Textarea } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { digitsOnly } from '@/shared/components/EntityFormView/FormFieldControl';
import { maskCnic } from '@/features/crm';
import { amountNumber, apiConflict, apiFieldErrors } from '@/shared/lib';
import { CUSTOMER_TYPES, OPEN_LEAD_STATES, P, PAYMENT_INSTRUMENTS, PAYMENT_TYPES } from '../../../permissions';
import { type Lead, type VariantCode, useConvertLeadMutation } from '../../../salesApi';
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
    // The customer's address (required): saved on the customer; the PPF voucher starts from it.
    customerAddress: lead.customerAddress ?? '',
    customerOccupation: lead.customerOccupation ?? '',
    referredBy: lead.referredBy ?? '',
    // Partial (a booking amount) or Full payment: one must be chosen; its fields are then required.
    paymentType: '',
    // Partial payment: the total price of the car (the balance is paid before delivery).
    vehiclePrice: '',
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
  // An individual needs the CNIC (NTN optional); a company needs the NTN (CNIC optional).
  const [cnic, setCnic] = useState('');
  const [ntn, setNtn] = useState(lead.customerNtn ?? '');
  // Optional here: if the salesperson does not know it, the Sales Admin has to enter it when raising the order.
  // The chosen variant's price list: the car's total price is worked out from it (until the salesperson types another).
  const [prices, setPrices] = useState<VariantCode | null>(null);
  const [totalTyped, setTotalTyped] = useState(false);
  const [filer, setFiler] = useState<FilerStatus>((lead.customerFilerStatus as FilerStatus | null | undefined) ?? '');
  // Net price of the variant: ex-factory + advance tax (filer, or non-filer when the customer is inactive) + freight (+ levy / CVT where listed).
  const netPrice = prices?.exFactoryPrice
    ? Number(prices.exFactoryPrice) + Number((filer === 'inactive' ? prices.advanceTaxNonFiler : prices.advanceTaxFiler) ?? 0) + Number(prices.freightCharges ?? 0) + Number(prices.nevLevy ?? 0) + Number(prices.cvt ?? 0)
    : null;
  useEffect(() => {
    if (netPrice !== null && !totalTyped) setV((x) => ({ ...x, vehiclePrice: String(Math.round(netPrice)) }));
  }, [netPrice, totalTyped]);
  const [expected, setExpected] = useState<ExpectedDeliveryValue>({ date: lead.expectedDeliveryDate ?? '', byMonth: lead.expectedDeliveryDate ? !!lead.expectedDeliveryByMonth : true });

  const isOpenLead = (OPEN_LEAD_STATES as readonly string[]).includes(lead.status);
  // The owner, or the Assistant Manager / Manager who logged the lead (also for a salesperson).
  const loggedIt = lead.createdById === perm.userId && lead.ownerId !== perm.userId;
  const asOwner = (lead.ownerId === perm.userId || loggedIt) && perm.canIn(P.leadsConvertOwn, lead.dealershipId, lead.branchId);
  const asEscalation = !!lead.escalatedAt && perm.canIn(P.leadsConvertEscalated, lead.dealershipId, lead.branchId);
  // The CRO: any social media (Meta ad) lead of the dealership can be converted; it then becomes theirs.
  const asSocial = !asOwner && lead.source === 'social' && perm.canIn(P.leadsViewSocial, lead.dealershipId, lead.branchId) && perm.canIn(P.leadsConvertOwn, lead.dealershipId, lead.branchId);
  if (!isOpenLead || !(asOwner || asEscalation || asSocial)) return null;

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
      required('customerAddress', 'Address'),
      required('customerOccupation', 'Occupation'),
      v.paymentType ? null : (['paymentType', 'Tick Partial payment or Full payment'] as const),
      v.paymentType ? required('paymentAmount', v.paymentType === 'full' ? 'The full amount paid' : 'The amount paid') : null,
      v.paymentType ? required('vehiclePrice', 'The total amount of the car') : null,
      v.paymentType === 'full' && v.vehiclePrice.trim() && v.paymentAmount.trim() && amountNumber(v.paymentAmount) !== amountNumber(v.vehiclePrice)
        ? (['paymentAmount', 'A full payment equals the total amount of the car (otherwise choose Partial payment)'] as const)
        : null,
      v.paymentType === 'partial' && v.vehiclePrice.trim() && v.paymentAmount.trim() && amountNumber(v.paymentAmount) >= amountNumber(v.vehiclePrice)
        ? (['paymentAmount', 'A partial payment is less than the total amount (otherwise choose Full payment)'] as const)
        : null,
      v.paymentType ? required('paymentInstrument', 'Payment instrument') : null,
      // Cash has no instrument number or bank.
      v.paymentType && v.paymentInstrument !== 'cash' ? required('paymentInstrumentRef', 'Instrument number') : null,
      v.paymentType && v.paymentInstrument !== 'cash' ? required('paymentInstrumentBank', 'Bank') : null,
      cnic.replace(/\D/g, '').length === 13 || (v.customerType === 'corporate' && !cnic.trim()) ? null : (['customerCnic', "Enter the customer's CNIC (13 digits)"] as const),
      v.customerType === 'corporate' && !ntn.trim() ? (['ntn', 'NTN is required for a company'] as const) : null,
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
          email: v.email.trim() || null,
          paymentType: v.paymentType as 'partial',
          paymentInstrument: v.paymentInstrument as never,
          paymentInstrumentRef: v.paymentInstrumentRef.trim() || null,
          paymentInstrumentBank: v.paymentInstrumentBank.trim() || null,
          paymentAmount: v.paymentAmount.trim(),
          vehiclePrice: v.paymentType === 'partial' ? v.vehiclePrice.trim() : undefined,
          expectedDeliveryDate: expected.date || null,
          expectedDeliveryByMonth: !!expected.date && expected.byMonth,
          customerCnic: cnic || undefined,
          ntn: ntn.trim() || null,
          filerStatus: filer || null,
          customerAddress: v.customerAddress.trim(),
          customerOccupation: v.customerOccupation.trim(),
          referredBy: v.referredBy.trim() || null,
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
    <Section compact
      title="Convert to Lead"
      actions={!open && <Button onClick={() => setOpen(true)}>Convert to Lead</Button>}
    >
      {asOwner && loggedIt && (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
          You logged this lead for {lead.ownerName ?? 'a salesperson'}: you can convert it; {lead.ownerName ?? 'the salesperson'} stays the owner.
        </p>
      )}
      {asSocial && (
        <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
          This is a social media lead of {lead.ownerName ?? 'another CRO'}. When you convert it, it becomes yours{lead.dealtByName ? `; ${lead.dealtByName} dealt with the customer` : ''}.
        </p>
      )}
      {!asOwner && !asSocial && (
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
          <Field label="Address" htmlFor="cv-address" required className="sm:col-span-2" error={errors.customerAddress} hint="House / street, sector or area, city">
            <Input id="cv-address" value={v.customerAddress} onChange={set('customerAddress')} invalid={!!errors.customerAddress} placeholder="e.g. House 12, Street 4, F-10/2, Islamabad" />
          </Field>
          <Field label="Occupation" htmlFor="cv-occupation" required error={errors.customerOccupation} hint="What the customer does, e.g. businessman, doctor, government employee">
            <Input id="cv-occupation" value={v.customerOccupation} onChange={set('customerOccupation')} invalid={!!errors.customerOccupation} maxLength={120} />
          </Field>
          <Field label="Referred by" htmlFor="cv-referred" hint="Optional: e.g. the General Manager or the CEO. It shows as the Reference on the bookings report">
            <Input id="cv-referred" value={v.referredBy} onChange={set('referredBy')} maxLength={120} />
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
              onCode={(_code, variant) => {
                setPrices(variant ?? null);
                setTotalTyped(false);
              }}
              invalid={!!errors.variant}
              modelId={Number(v.interestedModelId) || null}
              dealershipId={lead.dealershipId}
            />
          </Field>
          <Field label="Vehicle colour" htmlFor="cv-color" required error={errors.preferredColor}>
            <Input id="cv-color" value={v.preferredColor} onChange={set('preferredColor')} invalid={!!errors.preferredColor} />
          </Field>
          <Field label="Customer email" htmlFor="cv-email" hint="Optional" error={errors.email}>
            <Input id="cv-email" type="email" value={v.email} onChange={set('email')} invalid={!!errors.email} />
          </Field>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-sm font-medium text-slate-700">
              Payment <span className="text-red-600">*</span>
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2" role="radiogroup" aria-label="Payment">
              {PAYMENT_TYPES.map((p) => (
                <Checkbox
                  key={p.value}
                  checked={v.paymentType === p.value}
                  onChange={(e) => setV((s) => ({ ...s, paymentType: e.target.checked ? p.value : '' }))}
                  label={<span className="font-medium">{p.label}</span>}
                />
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {v.paymentType === 'partial'
                ? 'Partial payment: the booking amount now; the balance is paid before delivery.'
                : v.paymentType === 'full'
                  ? 'Full payment: the customer has paid the full price.'
                  : 'Tick one: Partial payment (a booking amount now) or Full payment.'}
            </p>
            {errors.paymentType && <p className="mt-1 text-sm text-red-600">{errors.paymentType}</p>}
          </div>
          {v.paymentType && (
            <>
              <Field
                label="Total amount of the car (PKR)"
                htmlFor="cv-total"
                required
                error={errors.vehiclePrice}
                hint={
                  v.paymentType === 'partial' && amountNumber(v.vehiclePrice) > 0 && amountNumber(v.paymentAmount) > 0 && amountNumber(v.vehiclePrice) > amountNumber(v.paymentAmount)
                    ? `Balance to pay before delivery: Rs ${(amountNumber(v.vehiclePrice) - amountNumber(v.paymentAmount)).toLocaleString('en-PK')}`
                    : netPrice !== null && !totalTyped
                      ? 'From the variant\'s price list (you can change it)'
                      : 'The full price of the car'
                }
              >
                <Input
                  id="cv-total"
                  inputMode="decimal"
                  value={v.vehiclePrice}
                  onChange={(e) => {
                    setTotalTyped(true);
                    setV((x) => ({ ...x, vehiclePrice: e.target.value }));
                  }}
                  invalid={!!errors.vehiclePrice}
                  placeholder="e.g. 9500000"
                />
              </Field>
              <Field label={v.paymentType === 'full' ? 'Amount paid by the customer (PKR)' : 'Amount paid now — booking (PKR)'} htmlFor="cv-amount" required error={errors.paymentAmount}>
                <Input id="cv-amount" inputMode="decimal" value={v.paymentAmount} onChange={set('paymentAmount')} invalid={!!errors.paymentAmount} placeholder={v.paymentType === 'full' ? 'e.g. 9500000' : 'e.g. 2500000'} />
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
              {v.paymentInstrument !== 'cash' && (
                <>
                  <Field label="Instrument number" htmlFor="cv-ref" required error={errors.paymentInstrumentRef}>
                    <Input id="cv-ref" value={v.paymentInstrumentRef} onChange={set('paymentInstrumentRef')} invalid={!!errors.paymentInstrumentRef} />
                  </Field>
                  <Field label="Bank" htmlFor="cv-bank" required error={errors.paymentInstrumentBank}>
                    <Input id="cv-bank" value={v.paymentInstrumentBank} onChange={set('paymentInstrumentBank')} invalid={!!errors.paymentInstrumentBank} />
                  </Field>
                </>
              )}
            </>
          )}
          <Field label="Customer CNIC" htmlFor="cv-cnic" required={v.customerType !== 'corporate'} error={errors.customerCnic} hint={v.customerType === 'corporate' ? 'Optional for a company' : "From the customer's CNIC; the Admin checks it against the copy"}>
            <Input id="cv-cnic" inputMode="numeric" value={cnic} onChange={(e) => setCnic(maskCnic(e.target.value))} placeholder="14301-5305891-1" invalid={!!errors.customerCnic} />
          </Field>
          <Field label="NTN" htmlFor="cv-ntn" required={v.customerType === 'corporate'} error={errors.ntn} hint={v.customerType === 'corporate' ? "The company's National Tax Number" : 'Optional'}>
            <Input id="cv-ntn" value={ntn} maxLength={20} onChange={(e) => setNtn(e.target.value)} placeholder="1234567-8" invalid={!!errors.ntn} />
          </Field>
          <Field label="Filer status" htmlFor="cv-filer" hint="Tick one: active filer or inactive (non-filer). If you leave it, the Sales Admin must enter it with the PBO number.">
            <FilerStatusInput id="cv-filer" value={filer} onChange={setFiler} />
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
