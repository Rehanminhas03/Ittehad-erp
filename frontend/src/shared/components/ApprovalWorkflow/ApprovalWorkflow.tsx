import { useState } from 'react';
import type { TransitionItem, WorkflowDefinition } from '@/shared/entity';
import { cn, formatDateTime } from '@/shared/lib';
import { Button, Dialog, Field, Textarea } from '@/shared/components/ui';

export interface ApprovalWorkflowProps {
  definition: WorkflowDefinition;
  state: string;
  /** Server-computed actions this user may run on this record right now. */
  availableActions: string[];
  history?: TransitionItem[];
  busy?: boolean;
  onTransition: (action: string, comment?: string) => Promise<unknown>;
  /** Steps not drawn on the progress bar (unless the record is in one). */
  hiddenStates?: string[];
}

const REJECTING = /reject|cancel|return|void/i;

/**
 * One state-machine component for every approval flow (sales orders, service estimates,
 * purchase orders). The server owns the rules; this renders the definition it publishes and
 * only offers the actions the server says the user may take.
 */
export function ApprovalWorkflow({ definition, state, availableActions, history, busy, onTransition, hiddenStates = [] }: ApprovalWorkflowProps) {
  const [pending, setPending] = useState<WorkflowDefinition['transitions'][number] | null>(null);
  const [comment, setComment] = useState('');
  const actions = definition.transitions.filter((t) => availableActions.includes(t.action) && t.from.includes(state));
  const path = definition.states.filter((s) => (!s.terminal && !hiddenStates.includes(s.key)) || s.key === state);
  const currentIndex = path.findIndex((s) => s.key === state);

  async function run(t: WorkflowDefinition['transitions'][number], text?: string) {
    await onTransition(t.action, text?.trim() || undefined);
    setPending(null);
    setComment('');
  }

  return (
    <div>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Workflow progress">
        {path.map((s, i) => (
          <li key={s.key} className="flex items-center gap-1">
            {i > 0 && <span className={cn('h-px w-6', i <= currentIndex ? 'bg-brand-300' : 'bg-slate-200')} aria-hidden />}
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                s.key === state
                  ? 'bg-brand-600 text-white shadow-sm'
                  : i < currentIndex
                    ? 'bg-brand-50 text-brand-700'
                    : 'bg-slate-100 text-slate-500',
              )}
              aria-current={s.key === state ? 'step' : undefined}
            >
              {s.label}
            </span>
          </li>
        ))}
      </ol>

      {actions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          {actions.map((t) => (
            <Button
              key={t.action}
              size="sm"
              variant={REJECTING.test(t.action) ? 'secondary' : 'primary'}
              loading={busy && pending?.action === t.action}
              onClick={() => setPending(t)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      )}

      {history && history.length > 0 && (
        <ol className="mt-4 divide-y divide-slate-100 border-t border-slate-100 text-sm">
          {history.map((h) => (
            <li key={h.id} className="py-2.5">
              <span className="font-medium text-slate-800">{definition.transitions.find((t) => t.action === h.action)?.label ?? h.action}</span>
              <span className="text-slate-500">
                {' '}
                by {h.actorName ?? 'unknown'} · {formatDateTime(h.occurredAt)}
              </span>
              {h.comment && <p className="mt-0.5 text-slate-600">"{h.comment}"</p>}
            </li>
          ))}
        </ol>
      )}

      <Dialog
        open={!!pending}
        title={pending ? `${pending.label}?` : ''}
        onClose={() => setPending(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant={pending && REJECTING.test(pending.action) ? 'danger' : 'primary'}
              loading={busy}
              disabled={!!pending?.requiresComment && !comment.trim()}
              onClick={() => pending && void run(pending, comment)}
            >
              {pending?.label}
            </Button>
          </>
        }
      >
        <Field label={pending?.requiresComment ? 'Comment' : 'Comment (optional)'} htmlFor="wf-comment" required={pending?.requiresComment}>
          <Textarea id="wf-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
        </Field>
      </Dialog>
    </div>
  );
}
