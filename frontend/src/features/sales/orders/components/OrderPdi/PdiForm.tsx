import { useState } from 'react';
import { Button, Checkbox, Field, Textarea } from '@/shared/components/ui';

export interface PdiValues {
  done: boolean;
  issue: boolean;
  notes: string;
}

/**
 * The PDI (pre-delivery inspection) of a received car: PDI done, and an issue found in it (with its
 * description). Entered by the Delivery Team before the car is marked received, and correctable later.
 */
export function PdiForm({
  initial,
  submitLabel,
  loading,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<PdiValues>;
  submitLabel: string;
  loading?: boolean;
  onSubmit: (v: { done: boolean; issue: boolean; notes: string | null }) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [v, setV] = useState<PdiValues>({ done: initial?.done ?? false, issue: initial?.issue ?? false, notes: initial?.notes ?? '' });
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!v.done && !v.issue) return setError('Tick "PDI done", or report an issue found in the PDI');
    if (v.issue && !v.notes.trim()) return setError('Describe the issue found in the PDI');
    setError(null);
    void onSubmit({ done: v.done, issue: v.issue, notes: v.notes.trim() || null });
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Everyone linked to this car (the salesperson, Assistant Manager, Manager and Sales Admin) sees the PDI, and the managers can comment on it.
      </p>
      <div className="flex flex-col gap-2">
        <Checkbox checked={v.done} onChange={(e) => setV((s) => ({ ...s, done: e.target.checked }))} label={<span className="font-medium">PDI done</span>} />
        <Checkbox
          checked={v.issue}
          onChange={(e) => setV((s) => ({ ...s, issue: e.target.checked }))}
          label={<span className="font-medium text-red-700">There is an issue in the PDI</span>}
        />
      </div>
      <Field
        label={v.issue ? 'Describe the issue' : 'PDI remarks (optional)'}
        htmlFor="pdi-notes"
        required={v.issue}
        hint={v.issue ? 'What is wrong with the car, and what is being done about it' : 'Anything to note from the inspection'}
      >
        <Textarea id="pdi-notes" rows={3} value={v.notes} onChange={(e) => setV((s) => ({ ...s, notes: e.target.value }))} maxLength={2000} />
      </Field>
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
