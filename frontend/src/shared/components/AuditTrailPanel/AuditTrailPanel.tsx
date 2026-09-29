import { useState } from 'react';
import type { AuditItem, EntityHistory, QueryHook } from '@/shared/entity';
import { apiErrorMessage, formatDateTime, humanize } from '@/shared/lib';
import { ErrorState, Spinner } from '@/shared/components/ui';

/**
 * Plain words for actions and fields whose code names users should not see (e.g. a duplicate
 * customer "sent to the Assistant Manager", never "escalate").
 */
const ACTION_LABELS: Record<string, string> = { escalate: 'Sent to Assistant Manager', 'details.update': 'Customer details corrected' };
const FIELD_LABELS: Record<string, string> = { escalatedAt: 'Sent to Assistant Manager', escalationNote: 'Note to Assistant Manager' };
/** Internal ids already shown as "by <name>" (or meaningless to the reader). */
const HIDDEN_FIELDS = new Set(['escalatedById']);
const actionLabel = (action: string) => ACTION_LABELS[action] ?? humanize(action);
const fieldLabel = (key: string) => FIELD_LABELS[key] ?? humanize(key);

/** Who changed what, when — from the entity's append-only audit trail. */
export function AuditTrailPanel({ useHistory, id }: { useHistory: QueryHook<{ id: number }, EntityHistory>; id: number }) {
  const { data, isLoading, isError, error, refetch } = useHistory({ id });
  if (isLoading) return <Spinner className="size-4 text-slate-400" />;
  if (isError) return <ErrorState message={apiErrorMessage(error)} onRetry={refetch} />;
  if (!data?.audit.length) return <p className="text-sm text-slate-500">No history yet.</p>;
  return (
    <ol className="relative">
      {data.audit.map((a, i) => (
        <AuditRow key={a.id} item={a} last={i === data.audit.length - 1} />
      ))}
    </ol>
  );
}

function AuditRow({ item, last }: { item: AuditItem; last: boolean }) {
  const [open, setOpen] = useState(false);
  const changes = describeChanges(item.changes);
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span className="flex flex-col items-center">
        <span className="mt-1 size-2 shrink-0 rounded-full bg-brand-400 ring-4 ring-brand-50" aria-hidden />
        {!last && <span className="mt-1 w-px flex-1 bg-slate-200" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <span>
            <span className="font-medium text-slate-800">{actionLabel(item.action)}</span>
            <span className="text-slate-500"> by {item.actorName ?? 'system'}</span>
          </span>
          <time className="text-xs text-slate-400" dateTime={item.occurredAt}>
            {formatDateTime(item.occurredAt)}
          </time>
        </div>
        {changes.length > 0 && (
          <>
            <button type="button" onClick={() => setOpen(!open)} className="mt-1 text-xs font-medium text-brand-600 hover:text-brand-700">
              {open ? 'Hide' : 'Show'} {changes.length} change{changes.length === 1 ? '' : 's'}
            </button>
            {open && (
              <ul className="mt-1.5 space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </li>
  );
}

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Handles both diff maps ({field: {from, to}}) and plain value snapshots. */
export function describeChanges(changes: unknown): string[] {
  if (!changes || typeof changes !== 'object') return [];
  return Object.entries(changes as Record<string, unknown>).filter(([k]) => !HIDDEN_FIELDS.has(k)).map(([k, v]) => {
    if (v && typeof v === 'object' && 'from' in v && 'to' in v) {
      const d = v as { from: unknown; to: unknown };
      return `${fieldLabel(k)}: ${show(d.from)} → ${show(d.to)}`;
    }
    return `${fieldLabel(k)}: ${show(v)}`;
  });
}
