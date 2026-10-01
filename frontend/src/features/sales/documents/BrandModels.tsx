import { useState } from 'react';
import { useCreateDealershipModelMutation, useListVehicleModelsQuery, useUpdateDealershipModelMutation } from '@/features/crm/crmApi';
import { Badge, Button, Input, Select } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';

const MANAGE_BRAND = 'master.models.manage_brand';

/**
 * The models of the dealership's own brand (e.g. Jetour: Dashing, T1, T2, X70 Plus), for its
 * Assistant Manager / Manager: add a model, rename it, or take it off (inactive models are no longer
 * offered on new leads). Variants are the codes below, each linked to its model.
 */
export function BrandModels() {
  const perm = usePermission();
  const toast = useToast();
  const dealerships = perm.dealershipsFor(MANAGE_BRAND);
  const [dealershipId, setDealershipId] = useState<number | undefined>(dealerships[0]?.id);
  const dealership = dealerships.find((d) => d.id === dealershipId) ?? dealerships[0];
  const { data, isFetching } = useListVehicleModelsQuery({ brand: dealership?.brand ?? '', pageSize: 100, sort: 'name' }, { skip: !dealership });
  const [create, { isLoading: adding }] = useCreateDealershipModelMutation();
  const [update] = useUpdateDealershipModelMutation();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  if (!dealership) return null;

  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.success(done);
      return true;
    } catch (e) {
      toast.error(e);
      return false;
    }
  };
  const models = data?.items ?? [];

  return (
    <div className="surface mb-4 space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{dealership.brand} models</h2>
          <p className="text-xs text-slate-500">Offered on leads and quotations. Add each model&apos;s variants below (Add variant code).</p>
        </div>
        {dealerships.length > 1 && (
          <Select value={dealership.id} onChange={(e) => setDealershipId(Number(e.target.value))} className="w-auto" aria-label="Dealership">
            {dealerships.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
      </div>
      <ul className="flex flex-wrap gap-2" aria-busy={isFetching}>
        {models.map((m) =>
          renaming?.id === m.id ? (
            <li key={m.id} className="flex items-center gap-1">
              <Input value={renaming.name} onChange={(e) => setRenaming({ id: m.id, name: e.target.value })} className="h-8 w-40" aria-label={`New name for ${m.name}`} />
              <Button
                size="sm"
                disabled={!renaming.name.trim()}
                onClick={async () => {
                  if (await run(() => update({ id: m.id, dealershipModelUpdate: { dealershipId: dealership.id, name: renaming.name.trim() } }).unwrap(), 'Model renamed')) setRenaming(null);
                }}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
            </li>
          ) : (
            <li key={m.id} className="flex items-center gap-2 rounded-full bg-white/70 py-1 pr-1 pl-3 text-sm ring-1 ring-slate-200">
              <span className={m.isActive ? 'font-medium text-slate-900' : 'text-slate-400 line-through'}>{m.name}</span>
              {!m.isActive && <Badge tone="gray">Inactive</Badge>}
              <button type="button" className="rounded-full px-2 py-0.5 text-xs text-brand-700 hover:bg-brand-50" onClick={() => setRenaming({ id: m.id, name: m.name })}>
                Rename
              </button>
              <button
                type="button"
                className="rounded-full px-2 py-0.5 text-xs text-slate-500 hover:bg-slate-100"
                onClick={() =>
                  run(
                    () => update({ id: m.id, dealershipModelUpdate: { dealershipId: dealership.id, isActive: !m.isActive } }).unwrap(),
                    m.isActive ? `${m.name} taken off new leads` : `${m.name} offered again`,
                  )
                }
              >
                {m.isActive ? 'Deactivate' : 'Activate'}
              </button>
            </li>
          ),
        )}
        {!models.length && !isFetching && <li className="text-sm text-slate-500">No {dealership.brand} models yet.</li>}
      </ul>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const n = name.trim();
          if (n && (await run(() => create({ dealershipModelCreate: { dealershipId: dealership.id, name: n } }).unwrap(), `${dealership.brand} ${n} added`))) setName('');
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${dealership.brand} model, e.g. T1`} className="w-full sm:w-64" aria-label="New model name" />
        <Button type="submit" size="sm" loading={adding} disabled={!name.trim()}>
          Add model
        </Button>
      </form>
    </div>
  );
}
