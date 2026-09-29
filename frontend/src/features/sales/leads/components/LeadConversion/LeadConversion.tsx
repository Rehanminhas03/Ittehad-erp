import { useState } from 'react';
import { Button, Field, Input, Section, Select, Textarea } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { digitsOnly } from '@/shared/components/EntityFormView/FormFieldControl';
import { apiConflict, apiFieldErrors } from '@/shared/lib';
import { OPEN_LEAD_STATES, P, PAYMENT_INSTRUMENTS } from '../../../permissions';
import { type Lead, useConvertLeadMutation } from '../../../salesApi';
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
    prospectMobile: lead.prospectMobile,
    interestedModelId: lead.interestedModelId ? String(lead.interestedModelId) : '',
    preferredColor: lead.preferredColor ?? '',
    variant: lead.variant ?? '',
    email: lead.email ?? '',
    paymentInstrument: '',
    paymentInstrumentRef: '',
    paymentInstrumentBank: '',
    paymentAmount: '',
    notes: '',
  });

  const isOpenLead = (OPEN_LEAD_STATES as readonly string[]).includes(lead.status);
  const asOwner = lead.ownerId === perm.userId && perm.canIn(P.leadsConvertOwn, lead.dealershipId, lead.branchId);
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
          <Field label="Customer name" htmlFor="cv-name" required error={errors.prospectName}>
            <Input id="cv-name" value={v.prospectName} onChange={set('prospectName')} invalid={!!errors.prospectName} />
          </Field>
          <Field label="Phone" htmlFor="cv-phone" required error={errors.prospectMobile} hint="Digits only">
            <Input id="cv-phone" type="tel" inputMode="tel" value={v.prospectMobile} onChange={set('prospectMobile')} invalid={!!errors.prospectMobile} />
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
