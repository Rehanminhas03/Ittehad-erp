import { useMemo, useState } from 'react';
import { z } from 'zod';
import { useVehicleModelOptions } from '@/features/crm';
import { Badge, Button, Dialog, Field, Select, Textarea } from '@/shared/components/ui';
import { dealershipFilter, type EntityViewConfig, idField, mono, muted, optionalId, strong } from '@/shared/entity';
import { usePermission, useToast } from '@/shared/hooks';
import { apiFieldErrors } from '@/shared/lib';
import { P } from '../permissions';
import {
  type VariantCode,
  useCreateVariantCodeMutation,
  useGetVariantCodeHistoryQuery,
  useGetVariantCodeQuery,
  useImportVariantCodesMutation,
  useListVariantCodesQuery,
  useUpdateVariantCodeMutation,
} from '../salesApi';

/**
 * Rows copied from Excel: a code and its description per line (tab-separated, or the code followed
 * by spaces). A header row ("Code  Description") is skipped.
 */
export function parseVariantRows(text: string): { code: string; description: string }[] {
  const rows: { code: string; description: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [code, ...rest] = line.includes('\t') ? line.split('\t') : line.split(/\s+/);
    const description = rest.join(' ').replace(/\s+/g, ' ').trim();
    if (!code || !description || /^code$/i.test(code.trim())) continue;
    rows.push({ code: code.trim().toUpperCase(), description });
  }
  return rows;
}

/** "Paste from Excel": adds new codes and updates descriptions of known ones. */
function PasteVariants() {
  const perm = usePermission();
  const toast = useToast();
  const dealerships = perm.dealershipsFor(P.templatesManage);
  const [open, setOpen] = useState(false);
  const [dealershipId, setDealershipId] = useState<number | undefined>(dealerships[0]?.id);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [save, { isLoading }] = useImportVariantCodesMutation();
  const rows = useMemo(() => parseVariantRows(text), [text]);
  if (!dealerships.length) return null;

  const submit = async () => {
    if (!dealershipId || !rows.length) return setError('Paste at least one row: the code, then its description');
    setError(null);
    try {
      const r = await save({ variantImport: { dealershipId, rows } }).unwrap();
      toast.success(`${r.added} added, ${r.updated} updated, ${r.unchanged} unchanged`);
      setText('');
      setOpen(false);
    } catch (e) {
      const issues = apiFieldErrors(e);
      if (issues.length) setError(issues.map((i) => `${i.path}: ${i.message}`).join('; '));
      else toast.error(e);
    }
  };

  return (
    <div className="mb-4 flex justify-end">
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Paste from Excel
      </Button>
      {open && (
        <Dialog
          open
          size="lg"
          onClose={() => setOpen(false)}
          title="Paste variant codes from Excel"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button loading={isLoading} disabled={!rows.length} onClick={submit}>
                Save {rows.length || ''} codes
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {dealerships.length > 1 && (
              <Field label="Dealership" htmlFor="vc-dealership">
                <Select id="vc-dealership" value={dealershipId ?? ''} onChange={(e) => setDealershipId(Number(e.target.value))}>
                  {dealerships.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Code and Description columns" htmlFor="vc-rows" hint="Select both columns in Excel, copy, and paste here. New codes are added; existing codes get the new description." error={error ?? undefined}>
              <Textarea id="vc-rows" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'NX4FL16THAW\tTUCSON HEV 1598CC 6A/T AWD SIGNATURE\nNX4FL16THFW\tTUCSON HEV 1598CC 6A/T FWD SMART'} className="font-mono text-xs" />
            </Field>
            {rows.length > 0 && (
              <div className="max-h-48 overflow-auto rounded-lg ring-1 ring-slate-200">
                <table className="min-w-full text-xs">
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.code}>
                        <td className="px-3 py-1.5 font-mono whitespace-nowrap">{r.code}</td>
                        <td className="px-3 py-1.5">{r.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}

const fields = {
  code: z.string().trim().min(2, 'Enter the code').max(40),
  description: z.string().trim().min(2, 'Enter the description').max(160),
  modelId: optionalId(),
  isActive: z.boolean(),
};

/** Variant codes (Hyundai): picked on quotations; the description is what the quotation prints. */
export const variantView: EntityViewConfig<VariantCode> = {
  singular: 'Variant code',
  plural: 'Variant codes',
  basePath: '/sales/variants',
  entityType: 'sales.vehicle_variant',
  permissions: { view: [P.variantsView], create: P.templatesManage, update: [P.templatesManage] },
  scope: { dealershipKey: 'dealershipId' },
  list: {
    defaultSort: 'code',
    searchPlaceholder: 'Search code or description (e.g. NX4 or TUCSON)',
    header: () => <PasteVariants />,
    filters: [{ param: 'modelId', label: 'Model', type: 'select', useOptions: useVehicleModelOptions }, { param: 'isActive', label: 'Active', type: 'boolean' }, dealershipFilter],
    columns: [
      { key: 'code', header: 'Code', sortKey: 'code', render: (v) => mono(v.code) },
      { key: 'description', header: 'Description (printed on the quotation)', sortKey: 'description', render: (v) => strong(v.description) },
      { key: 'modelName', header: 'Model', render: (v) => muted(v.modelName) },
      { key: 'isActive', header: 'Status', render: (v) => (v.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>) },
    ],
  },
  detail: {
    title: (v) => v.code,
    subtitle: (v) => v.description,
    fields: [
      { label: 'Code', value: (v) => v.code },
      { label: 'Description', value: (v) => v.description },
      { label: 'Model', value: (v) => v.modelName },
      { label: 'Status', value: (v) => (v.isActive ? 'Active' : 'Inactive (not offered on new quotations)') },
    ],
  },
  form: {
    fields: [
      { name: 'dealershipId', label: 'Dealership', type: 'dealership', required: true, mode: 'create', scopePermission: P.templatesManage },
      { name: 'code', label: 'Code', type: 'text', required: true, placeholder: 'NX4FL16THAW' },
      { name: 'description', label: 'Description', type: 'text', required: true, span: 2, placeholder: 'TUCSON HEV 1598CC 6A/T AWD SIGNATURE' },
      { name: 'modelId', label: 'Model', type: 'select', useOptions: useVehicleModelOptions, hint: 'Empty: found from the description' },
      { name: 'isActive', label: 'Active', type: 'boolean' },
    ],
    defaults: { isActive: true },
    createSchema: z.object({ dealershipId: idField('Dealership'), ...fields }),
    updateSchema: z.object(fields),
  },
  api: {
    useList: useListVariantCodesQuery,
    useGet: useGetVariantCodeQuery,
    useHistory: useGetVariantCodeHistoryQuery,
    create: { useMutation: useCreateVariantCodeMutation, toArg: (v) => ({ vehicleVariantCreate: v }) },
    update: { useMutation: useUpdateVariantCodeMutation, toArg: (id, v) => ({ id, vehicleVariantUpdate: v }) },
  },
};
