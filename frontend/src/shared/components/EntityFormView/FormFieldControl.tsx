import { useEffect } from 'react';
import { Controller, type UseFormReturn, useWatch } from 'react-hook-form';
import { Checkbox, Field, Input, Select, Textarea } from '@/shared/components/ui';
import type { FormField } from '@/shared/entity';
import type { PermissionApi } from '@/shared/hooks';
import { cn } from '@/shared/lib';

export type FormValues = Record<string, unknown>;

/** Digits only, keeping a single leading "+". */
export const digitsOnly = (v: string) => v.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');

export interface FormFieldControlProps {
  field: FormField;
  form: UseFormReturn<FormValues>;
  perm: PermissionApi;
  /** Permission used to limit dealership/branch options when the field names none. */
  fallbackScope?: string;
}

/**
 * A 'custom' field. It re-renders when any other field changes, so a control that depends on
 * another field (e.g. the variant on the chosen model) sees the current value, not a stale one.
 */
function CustomControl({ field: f, form, id, invalid }: { field: FormField; form: UseFormReturn<FormValues>; id: string; invalid: boolean }) {
  const values = useWatch({ control: form.control }) as FormValues;
  return (
    <Controller
      control={form.control}
      name={f.name}
      render={({ field }) => <>{f.render?.({ id, value: field.value, onChange: field.onChange, invalid, values })}</>}
    />
  );
}

/** Renders one config-described field, wired to React Hook Form. */
export function FormFieldControl({ field: f, form, perm, fallbackScope }: FormFieldControlProps) {
  const error = form.formState.errors[f.name]?.message as string | undefined;
  const id = `f-${f.name}`;
  const scopeCode = f.scopePermission ?? fallbackScope ?? '';
  const dealershipId = f.dealershipField ? Number(form.watch(f.dealershipField)) || null : null;
  // Custom fields are wired through <Controller>; registering them here too would double-bind.
  const reg = f.type === 'custom' ? ({} as ReturnType<typeof form.register>) : form.register(f.name);

  // Clear a branch selection that no longer belongs to the chosen dealership.
  useEffect(() => {
    if (f.type !== 'branch') return;
    const current = Number(form.getValues(f.name));
    if (current && !perm.branchesFor(scopeCode, dealershipId).some((b) => b.id === current)) form.setValue(f.name, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealershipId]);

  // A user who works at a single dealership never has to pick it.
  useEffect(() => {
    if (f.type !== 'dealership' || form.getValues(f.name)) return;
    const options = perm.dealershipsFor(scopeCode);
    if (options.length === 1) form.setValue(f.name, String(options[0]!.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let control;
  switch (f.type) {
    case 'custom':
      control = <CustomControl field={f} form={form} id={id} invalid={!!error} />;
      break;
    case 'textarea':
      control = <Textarea id={id} invalid={!!error} placeholder={f.placeholder} {...reg} />;
      break;
    case 'boolean':
      return (
        <div className={cn(f.span === 2 && 'sm:col-span-2', 'flex items-end pb-2')}>
          <Checkbox id={id} label={f.label} {...reg} />
        </div>
      );
    case 'select':
      control = f.useOptions ? (
        <RemoteSelect id={id} invalid={!!error} useOptions={f.useOptions} reg={reg} form={form} />
      ) : (
        <Select id={id} invalid={!!error} {...reg}>
          <option value="">Select…</option>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
      break;
    case 'dealership':
      control = (
        <Select id={id} invalid={!!error} {...reg}>
          <option value="">Select dealership…</option>
          {perm.dealershipsFor(scopeCode).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      );
      break;
    case 'branch':
      control = (
        <Select id={id} invalid={!!error} disabled={!!f.dealershipField && !dealershipId} {...reg}>
          <option value="">{f.required ? 'Select branch…' : 'No specific branch'}</option>
          {perm.branchesFor(scopeCode, dealershipId).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      );
      break;
    case 'tel':
      // Phone numbers are typed as plain digits: dashes, spaces and letters are dropped as you type
      // or paste (a leading + is kept for international numbers).
      control = (
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={16}
          invalid={!!error}
          placeholder={f.placeholder}
          {...reg}
          onChange={(e) => {
            e.target.value = digitsOnly(e.target.value);
            return reg.onChange(e);
          }}
        />
      );
      break;
    default:
      control = (
        <Input
          id={id}
          type={f.type === 'money' ? 'text' : f.type}
          inputMode={f.type === 'money' || f.type === 'number' ? 'decimal' : undefined}
          invalid={!!error}
          placeholder={f.placeholder}
          autoComplete={f.type === 'password' ? 'new-password' : undefined}
          {...reg}
        />
      );
  }
  return (
    <Field label={f.label} htmlFor={id} error={error} hint={f.hint} required={f.required} className={cn(f.span === 2 && 'sm:col-span-2')}>
      {control}
    </Field>
  );
}

function RemoteSelect({
  id,
  invalid,
  useOptions,
  reg,
  form,
}: {
  id: string;
  invalid: boolean;
  useOptions: NonNullable<FormField['useOptions']>;
  reg: ReturnType<UseFormReturn<FormValues>['register']>;
  form: UseFormReturn<FormValues>;
}) {
  const options = useOptions();
  // Options arrive after mount; re-apply the current value so edit forms show their selection.
  useEffect(() => {
    const v = form.getValues(reg.name);
    if (v !== '' && v !== undefined) form.setValue(reg.name, v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.length]);
  return (
    <Select id={id} invalid={invalid} {...reg}>
      <option value="">Select…</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
