import { useState } from 'react';
import { Button, Field, Textarea } from '@/shared/components/ui';
import { cn } from '@/shared/lib';

export type PdiChoice = 'done' | 'pending' | 'issue';

export const PDI_CHOICES: { value: PdiChoice; label: string; hint: string; tone: string }[] = [
  { value: 'done', label: 'PDI done', hint: 'The inspection is complete and the car is clear', tone: 'text-emerald-800' },
  { value: 'pending', label: 'PDI pending', hint: 'The inspection has not been done yet', tone: 'text-amber-800' },
  { value: 'issue', label: 'PDI not clear', hint: 'An issue was found: describe it', tone: 'text-red-700' },
];

/** PDI choice <-> the API's { done, issue }: an issue found means the PDI is not clear; neither = pending. */
export const pdiChoiceOf = (p: { done?: boolean; issue?: boolean } | undefined | null): PdiChoice | '' => (p ? (p.issue ? 'issue' : p.done ? 'done' : 'pending') : '');
export const pdiBody = (choice: PdiChoice, notes: string) => ({ done: choice !== 'pending', issue: choice === 'issue', notes: notes.trim() || null });

/** Three radio choices, and the issue box when the PDI is not clear. Used when receiving a car and to update the PDI. */
export function PdiChoices({
  choice,
  onChoice,
  notes,
  onNotes,
  invalid,
}: {
  choice: PdiChoice | '';
  onChoice: (c: PdiChoice) => void;
  notes: string;
  onNotes: (v: string) => void;
  invalid?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="PDI">
        {PDI_CHOICES.map((c) => (
          <label
            key={c.value}
            className={cn(
              'flex cursor-pointer flex-col gap-0.5 rounded-xl px-3 py-2.5 text-sm ring-1 transition',
              choice === c.value ? 'bg-white shadow-sm ring-2 ring-brand-500' : 'bg-white/60 ring-slate-300 hover:ring-slate-400',
              invalid && !choice && 'ring-red-400',
            )}
          >
            <span className="flex items-center gap-2">
              <input type="radio" name="pdi-choice" checked={choice === c.value} onChange={() => onChoice(c.value)} className="size-4 text-brand-600" />
              <span className={cn('font-medium', c.tone)}>{c.label}</span>
            </span>
            <span className="pl-6 text-xs text-slate-500">{c.hint}</span>
          </label>
        ))}
      </div>
      {choice === 'issue' && (
        <Field label="Describe the issue" htmlFor="pdi-notes" required hint="What is wrong with the car, and what is being done about it">
          <Textarea id="pdi-notes" rows={3} value={notes} onChange={(e) => onNotes(e.target.value)} maxLength={2000} />
        </Field>
      )}
    </div>
  );
}

/**
 * The PDI (pre-delivery inspection) of a received car: done, pending, or not clear with the issue described.
 * Entered by the Delivery Team when the car is received, and correctable later.
 */
export function PdiForm({
  initial,
  submitLabel,
  loading,
  onSubmit,
  onCancel,
}: {
  /** The recorded PDI, when correcting it. */
  initial?: { done: boolean; issue: boolean; notes: string | null };
  submitLabel: string;
  loading?: boolean;
  onSubmit: (v: { done: boolean; issue: boolean; notes: string | null }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [choice, setChoice] = useState<PdiChoice | ''>(pdiChoiceOf(initial));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!choice) return setError('Choose: PDI done, PDI pending, or PDI not clear');
    if (choice === 'issue' && !notes.trim()) return setError('Describe the issue found in the PDI');
    setError(null);
    void onSubmit(pdiBody(choice, notes));
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Everyone linked to this car (the salesperson, Assistant Manager, Manager and Sales Admin) sees the PDI, and the managers can comment on it.</p>
      <PdiChoices choice={choice} onChoice={setChoice} notes={notes} onNotes={setNotes} />
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button loading={loading} onClick={submit}>
          {submitLabel}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
