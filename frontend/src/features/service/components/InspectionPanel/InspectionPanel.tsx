import { useEffect, useState } from 'react';
import { Button, Input, Section, Spinner, StatusBadge } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { cn } from '@/shared/lib';
import { P } from '../../permissions';
import {
  type Inspection,
  type JobCard,
  useCompleteInspectionMutation,
  useGetJobCardInspectionQuery,
  useRecordInspectionMutation,
  useStartInspectionMutation,
} from '../../serviceApi';

type Condition = Inspection['items'][number]['condition'];
const CONDITIONS: { value: Condition; label: string; tone: string }[] = [
  { value: 'ok', label: 'OK', tone: 'bg-emerald-600 text-white' },
  { value: 'attention', label: 'Attention', tone: 'bg-amber-500 text-white' },
  { value: 'urgent', label: 'Urgent', tone: 'bg-red-600 text-white' },
];

/** Multi-point inspection: start from the checklist, record each item, complete when all are checked. */
export function InspectionPanel({ jobCard }: { jobCard: JobCard }) {
  const perm = usePermission();
  const toast = useToast();
  const canView = perm.canIn(P.inspectionsView, jobCard.dealershipId, jobCard.branchId);
  const { data: insp, isLoading } = useGetJobCardInspectionQuery({ id: jobCard.id }, { skip: !canView });
  const [start, { isLoading: starting }] = useStartInspectionMutation();
  const [record, { isLoading: saving }] = useRecordInspectionMutation();
  const [complete, { isLoading: completing }] = useCompleteInspectionMutation();
  const [edits, setEdits] = useState<Record<number, { condition: Condition; notes: string }>>({});
  useEffect(() => setEdits({}), [insp?.id, insp?.status]);

  if (!canView) return null;
  const open = ['open', 'in_progress'].includes(jobCard.status);
  const canStart = open && perm.canIn(P.inspectionsCreate, jobCard.dealershipId, jobCard.branchId);
  const canRecord = insp?.status === 'in_progress' && perm.canIn(P.inspectionsUpdate, jobCard.dealershipId, jobCard.branchId);
  const dirty = Object.keys(edits).length > 0;
  const act = async (p: Promise<unknown>, ok: string) => {
    try {
      await p;
      toast.success(ok);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <Section title="Inspection" actions={insp && <StatusBadge status={insp.status} />}>
      {isLoading ? (
        <Spinner className="size-4 text-slate-400" />
      ) : !insp ? (
        canStart ? (
          <Button variant="secondary" loading={starting} onClick={() => void act(start({ id: jobCard.id }).unwrap(), 'Inspection started')}>
            Start inspection
          </Button>
        ) : (
          <p className="text-sm text-slate-500">No inspection.</p>
        )
      ) : (
        <>
          <ul className="divide-y divide-slate-100">
            {insp.items.map((it) => {
              const current = edits[it.id] ?? { condition: it.condition, notes: it.notes ?? '' };
              return (
                <li key={it.id} className="grid grid-cols-1 items-center gap-2 py-2 text-sm sm:grid-cols-[14rem_auto_1fr]">
                  <span>
                    <span className="text-xs text-slate-500">{it.area}</span>
                    <br />
                    {it.item}
                  </span>
                  <span className="flex gap-1">
                    {CONDITIONS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        disabled={!canRecord}
                        onClick={() => setEdits({ ...edits, [it.id]: { ...current, condition: c.value } })}
                        className={cn(
                          'rounded px-2 py-0.5 text-xs ring-1 ring-slate-200',
                          current.condition === c.value ? c.tone : 'bg-white text-slate-600',
                          !canRecord && 'cursor-default',
                        )}
                      >
                        {c.label}
                      </button>
                    ))}
                  </span>
                  <Input
                    value={current.notes}
                    disabled={!canRecord}
                    onChange={(e) => setEdits({ ...edits, [it.id]: { ...current, notes: e.target.value } })}
                    placeholder="Notes"
                    className="py-1 text-xs"
                    aria-label={`Notes for ${it.item}`}
                  />
                </li>
              );
            })}
          </ul>
          {canRecord && (
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                disabled={!dirty}
                loading={saving}
                onClick={() =>
                  void act(
                    record({
                      id: jobCard.id,
                      inspectionItemsUpdate: { items: Object.entries(edits).map(([id, e]) => ({ id: Number(id), condition: e.condition, notes: e.notes || null })) },
                    }).unwrap(),
                    'Findings saved',
                  )
                }
              >
                Save findings
              </Button>
              <Button size="sm" variant="secondary" disabled={dirty} loading={completing} onClick={() => void act(complete({ id: jobCard.id }).unwrap(), 'Inspection completed')}>
                Complete inspection
              </Button>
            </div>
          )}
        </>
      )}
    </Section>
  );
}
