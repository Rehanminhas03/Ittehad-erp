import { useState } from 'react';
import { digitsOnly } from '@/shared/components/EntityFormView/FormFieldControl';
import { Button, Field, Input, Section, Textarea } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { apiConflict, apiFieldErrors } from '@/shared/lib';
import { P } from '../../../permissions';
import { type Lead, useCorrectLeadDetailsMutation } from '../../../salesApi';
import { VariantPicker } from '../VariantPicker';

/**
 * Correct the customer's details after conversion (name, phone, email, colour, variant, notes): the
 * salesperson who owns the lead or the Sales Admin. Open leads use the normal Edit button; completed
 * and exhausted leads are final. Every change is recorded in the activity log.
 */
export function LeadDetailsEditor({ lead }: { lead: Lead }) {
  const perm = usePermission();
  const toast = useToast();
  const [save, { isLoading }] = useCorrectLeadDetailsMutation();
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const initial = {
    prospectName: lead.prospectName,
    prospectMobile: lead.prospectMobile,
    email: lead.email ?? '',
    preferredColor: lead.preferredColor ?? '',
    variant: lead.variant ?? '',
    notes: lead.notes ?? '',
  };
  const [v, setV] = useState(initial);

  const converted = ['converted', 'processing'].includes(lead.status);
  const isOwner = lead.ownerId === perm.userId && perm.canIn(P.leadsUpdateOwn, lead.dealershipId, lead.branchId);
  const allowed = converted && (isOwner || perm.canIn(P.leadsUpdate, lead.dealershipId, lead.branchId) || perm.canIn(P.leadsUpdateConverted, lead.dealershipId, lead.branchId));
  if (!allowed) return null;

  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: k === 'prospectMobile' ? digitsOnly(e.target.value) : e.target.value }));

  const submit = async () => {
    // Send only what changed.
    const changed = Object.fromEntries(
      (Object.keys(v) as (keyof typeof v)[]).filter((k) => v[k] !== initial[k]).map((k) => [k, v[k] === '' && k !== 'prospectName' && k !== 'variant' ? null : v[k]]),
    );
    if (!Object.keys(changed).length) {
      setEditing(false);
      return;
    }
    setErrors({});
    try {
      await save({ id: lead.id, leadDetailsRequest: changed }).unwrap();
      toast.success('Customer details updated');
      setEditing(false);
    } catch (e) {
      const issues = apiFieldErrors(e);
      const conflict = apiConflict(e);
      if (issues.length) setErrors(Object.fromEntries(issues.map((i) => [i.path, i.message])));
      else if (conflict) setErrors({ prospectMobile: conflict.message });
      else toast.error(e);
    }
  };

  return (
    <Section
      title="Customer details"
      actions={
        !editing && (
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Correct details
          </Button>
        )
      }
    >
      {!editing ? (
        <p className="text-sm text-slate-600">
          Spotted a mistake in the customer's name, phone or email? Correct it here — the customer on the sales order is updated too, and
          the change is recorded in the activity log.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <Field label="Customer name" htmlFor="ld-name" required error={errors.prospectName}>
            <Input id="ld-name" value={v.prospectName} onChange={set('prospectName')} invalid={!!errors.prospectName} />
          </Field>
          <Field label="Phone" htmlFor="ld-phone" required error={errors.prospectMobile} hint="Digits only">
            <Input id="ld-phone" type="tel" inputMode="tel" value={v.prospectMobile} onChange={set('prospectMobile')} invalid={!!errors.prospectMobile} />
          </Field>
          <Field label="Email" htmlFor="ld-email" error={errors.email}>
            <Input id="ld-email" type="email" value={v.email} onChange={set('email')} invalid={!!errors.email} />
          </Field>
          <Field label="Vehicle colour" htmlFor="ld-color" error={errors.preferredColor}>
            <Input id="ld-color" value={v.preferredColor} onChange={set('preferredColor')} />
          </Field>
          <Field label="Variant" htmlFor="ld-variant" required error={errors.variant}>
            <VariantPicker
              id="ld-variant"
              value={v.variant}
              onChange={(variant) => setV((s) => ({ ...s, variant }))}
              invalid={!!errors.variant}
              modelId={lead.interestedModelId ?? null}
              dealershipId={lead.dealershipId}
            />
          </Field>
          <Field label="Notes" htmlFor="ld-notes" className="sm:col-span-2">
            <Textarea id="ld-notes" value={v.notes} onChange={set('notes')} />
          </Field>
          <p className="text-xs text-slate-500 sm:col-span-2">The model and payment details stay as converted: the sales order is built on them.</p>
          <div className="flex gap-2 sm:col-span-2">
            <Button loading={isLoading} onClick={submit}>
              Save changes
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setV(initial);
                setErrors({});
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}
