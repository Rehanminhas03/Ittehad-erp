import { zodResolver } from '@hookform/resolvers/zod';
import { type ReactNode, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Button, ErrorState, PageHeader, PageSpinner, Section } from '@/shared/components/ui';
import type { EntityViewConfig, FormField } from '@/shared/entity';
import { usePermission, useToast } from '@/shared/hooks';
import { apiConflict, apiErrorMessage, apiFieldErrors } from '@/shared/lib';
import { FormFieldControl, type FormValues } from './FormFieldControl';

/**
 * Config-driven create/edit form (React Hook Form + Zod).
 * - create: fields can be prefilled from the URL (?mobile=...), e.g. from a search with no results
 * - 409 conflicts (duplicates) show a notice linking to the existing record
 */
export function EntityFormView<T extends { id: number }>({ config, mode }: { config: EntityViewConfig<T>; mode: 'create' | 'edit' }) {
  const params = useParams();
  const id = Number(params.id);
  const existing = config.api.useGet({ id }, { skip: mode === 'create' });

  if (mode === 'edit') {
    if (existing.isLoading) return <PageSpinner />;
    if (existing.isError || !existing.data) return <ErrorState message={apiErrorMessage(existing.error)} onRetry={existing.refetch} />;
  }
  return <FormBody config={config} mode={mode} row={existing.data} />;
}

function FormBody<T extends { id: number }>({ config, mode, row }: { config: EntityViewConfig<T>; mode: 'create' | 'edit'; row?: T }) {
  const form = config.form!;
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const toast = useToast();
  const perm = usePermission();
  const [conflictNotice, setConflictNotice] = useState<ReactNode>(null);
  const schema = (mode === 'edit' ? (form.updateSchema ?? form.createSchema) : form.createSchema) as never;
  const fields = form.fields.filter((f) => ((f.mode ?? 'both') === 'both' || f.mode === mode) && (!f.visible || f.visible(perm)));

  const defaultValues = useMemo<FormValues>(() => {
    if (mode === 'edit' && row) {
      const src = form.toFormValues ? form.toFormValues(row) : (row as FormValues);
      return Object.fromEntries(fields.map((f) => [f.name, toInputValue(src[f.name], f)]));
    }
    return Object.fromEntries(fields.map((f) => [f.name, toInputValue(search.get(f.name) ?? form.defaults?.[f.name], f)]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, row]);

  const rhf = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues });
  const [createTrigger, createState] = (config.api.create?.useMutation ?? noMutation)();
  const [updateTrigger, updateState] = (config.api.update?.useMutation ?? noMutation)();

  const onSubmit = rhf.handleSubmit(async (values) => {
    setConflictNotice(null);
    try {
      const saved =
        mode === 'create'
          ? await createTrigger(config.api.create!.toArg(values)).unwrap()
          : await updateTrigger(config.api.update!.toArg(row!.id, values)).unwrap();
      toast.success(`${config.singular} saved`);
      navigate(`${config.basePath}/${(saved as T).id}`);
    } catch (e) {
      const conflict = apiConflict(e);
      if (conflict) {
        setConflictNotice(
          form.renderConflict?.(conflict.details, values) ?? (
            <>
              {conflict.message}.{' '}
              {typeof conflict.details.existingId === 'number' && (
                <Link to={`${config.basePath}/${conflict.details.existingId}`} className="font-medium underline">
                  Open the existing {config.singular.toLowerCase()}
                </Link>
              )}
            </>
          ),
        );
        return;
      }
      for (const i of apiFieldErrors(e)) if (fields.some((f) => f.name === i.path)) rhf.setError(i.path, { message: i.message });
      toast.error(e);
    }
  });

  const title = mode === 'create' ? `New ${config.singular.toLowerCase()}` : `Edit ${config.detail.title(row!)}`;
  return (
    <div>
      <PageHeader
        title={title}
        breadcrumbs={[
          { label: config.plural, to: config.basePath },
          ...(row ? [{ label: config.detail.title(row), to: `${config.basePath}/${row.id}` }] : []),
          { label: mode === 'create' ? 'New' : 'Edit' },
        ]}
      />
      <form onSubmit={onSubmit} noValidate className="max-w-3xl">
        <Section>
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
            {fields.map((f) => (
              <FormFieldControl key={f.name} field={f} form={rhf} perm={perm} fallbackScope={config.permissions.create} />
            ))}
          </div>
          {conflictNotice && (
            <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
              {conflictNotice}
            </div>
          )}
          <div className="mt-8 flex gap-2 border-t border-slate-100 pt-5">
            <Button type="submit" loading={createState.isLoading || updateState.isLoading}>
              {mode === 'create' ? `Create ${config.singular.toLowerCase()}` : 'Save changes'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
          </div>
        </Section>
      </form>
    </div>
  );
}

const noMutation = () => [() => ({ unwrap: () => Promise.reject(new Error('Not supported')) }), { isLoading: false }] as const;

function toInputValue(v: unknown, f: FormField): unknown {
  if (f.type === 'boolean') return v === 'true' || v === true;
  if (v === null || v === undefined) return '';
  if (f.type === 'date' && typeof v === 'string') return v.slice(0, 10);
  return typeof v === 'number' ? String(v) : v;
}
