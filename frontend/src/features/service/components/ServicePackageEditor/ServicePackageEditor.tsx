import { useEffect, useState } from 'react';
import { PartPicker } from '@/features/parts/components/PartPicker';
import { Button, Input, Section, Spinner } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { P } from '../../permissions';
import { useListServicePackageQuery, useSetServicePackageMutation } from '../../serviceApi';

interface Row {
  kind: 'labour' | 'part';
  description: string;
  partNo: string;
  quantity: string;
}

/**
 * What a periodic service includes (on a service of the model's schedule): the labour (hours) and the parts to
 * replace (oil, filters ...). When the advisor picks the service on a job card, the labour is added and the store
 * is asked for the parts, which it then issues onto the job card.
 */
export function ServicePackageEditor({ scheduleItemId }: { scheduleItemId: number }) {
  const perm = usePermission();
  const toast = useToast();
  const canEdit = perm.can(P.setupManage);
  const { data, isLoading } = useListServicePackageQuery({ id: scheduleItemId });
  const [save, { isLoading: saving }] = useSetServicePackageMutation();
  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (data) {
      setRows(data.map((l) => ({ kind: l.kind, description: l.description, partNo: l.partNo ?? '', quantity: String(Number(l.quantity)) })));
      setDirty(false);
    }
  }, [data]);
  const change = (next: Row[]) => {
    setRows(next);
    setDirty(true);
  };
  const labour = rows.filter((r) => r.kind === 'labour');
  const parts = rows.filter((r) => r.kind === 'part');

  const submit = async () => {
    try {
      await save({
        id: scheduleItemId,
        servicePackageLines: { lines: rows.map((r) => ({ kind: r.kind, description: r.description.trim(), partNo: r.kind === 'part' ? r.partNo : null, quantity: r.quantity.trim() || '1' })) },
      }).unwrap();
      toast.success('Saved: new job cards use it');
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Section
      title="Included in this service"
      actions={
        canEdit ? (
          <Button size="sm" disabled={!dirty} loading={saving} onClick={submit}>
            Save
          </Button>
        ) : undefined
      }
    >
      {isLoading ? (
        <Spinner className="size-4 text-slate-400" />
      ) : (
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-800">Parts to replace</h3>
            {parts.length === 0 && <p className="mb-2 text-sm text-slate-500">No parts yet.</p>}
            <ul className="divide-y divide-slate-100">
              {rows.map((r, i) =>
                r.kind !== 'part' ? null : (
                  <li key={i} className="flex items-center gap-3 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs text-slate-900">{r.partNo}</span>
                      <span className="block truncate text-slate-600">{r.description}</span>
                    </span>
                    <Input value={r.quantity} disabled={!canEdit} onChange={(e) => change(rows.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} className="w-20 py-1 text-right text-xs" inputMode="decimal" aria-label={`Quantity of ${r.partNo}`} />
                    {canEdit && (
                      <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => change(rows.filter((_, j) => j !== i))}>
                        Remove
                      </button>
                    )}
                  </li>
                ),
              )}
            </ul>
            {canEdit && (
              <div className="mt-2">
                <PartPicker
                  placeholder="Search the part by number or name, then choose it…"
                  onPick={(p) => change(rows.some((r) => r.kind === 'part' && r.partNo === p.partNo) ? rows : [...rows, { kind: 'part', description: p.description, partNo: p.partNo, quantity: '1' }])}
                />
              </div>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-800">Labour included (in hours)</h3>
            {labour.length === 0 && <p className="mb-2 text-sm text-slate-500">No extra labour lines. The service's own labour hours are added anyway.</p>}
            <ul className="space-y-2">
              {rows.map((r, i) =>
                r.kind !== 'labour' ? null : (
                  <li key={i} className="flex items-center gap-3">
                    <Input value={r.description} disabled={!canEdit} onChange={(e) => change(rows.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} className="flex-1 py-1 text-xs" aria-label="Labour description" />
                    <Input value={r.quantity} disabled={!canEdit} onChange={(e) => change(rows.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} className="w-20 py-1 text-right text-xs" inputMode="decimal" aria-label="Hours" />
                    {canEdit && (
                      <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => change(rows.filter((_, j) => j !== i))}>
                        Remove
                      </button>
                    )}
                  </li>
                ),
              )}
            </ul>
            {canEdit && (
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => change([...rows, { kind: 'labour', description: '', partNo: '', quantity: '1' }])}>
                + Add labour
              </Button>
            )}
          </div>
          {!canEdit && <p className="text-xs text-slate-500">Only the service setup administrator can change this list.</p>}
        </div>
      )}
    </Section>
  );
}
