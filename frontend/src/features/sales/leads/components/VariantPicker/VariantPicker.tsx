import { useEffect, useRef, useState } from 'react';
import { Input, Select } from '@/shared/components/ui';
import { useListVariantCodesQuery } from '../../../salesApi';

const OTHER = '__other__';

interface VariantPickerProps {
  id: string;
  /** The variant text saved on the lead (a code's description, or typed). */
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  modelId: number | null;
  dealershipId?: number | null;
  /** The picked code (null when typed or none), e.g. for the quotation Ref. */
  onCode?: (code: string | null) => void;
}

/**
 * The lead's variant: a dropdown of the chosen model's variant codes (Hyundai), with "Other (type it)"
 * for anything not in the list. Models without codes (Jetour, CSM) just type the variant.
 */
export function VariantPicker({ id, value, onChange, invalid, modelId, dealershipId, onCode }: VariantPickerProps) {
  const { data, isFetching } = useListVariantCodesQuery(
    { modelId: modelId ?? 0, dealershipId: dealershipId ?? undefined, isActive: 'true', pageSize: 100, sort: 'code' },
    { skip: !modelId },
  );
  const codes = modelId ? (data?.items ?? []) : [];
  const [typing, setTyping] = useState(false);

  // A different model: its variant has to be chosen again.
  const lastModel = useRef(modelId);
  useEffect(() => {
    if (lastModel.current && lastModel.current !== modelId) {
      onChange('');
      setTyping(false);
    }
    lastModel.current = modelId;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the model changes
  }, [modelId]);

  // The code behind the chosen variant (also for a variant filled in from the lead).
  const picked = typing ? undefined : codes.find((c) => c.description === value);
  useEffect(() => {
    onCode?.(picked?.code ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report only when the code changes
  }, [picked?.code]);

  if (!modelId) return <Input id={id} disabled placeholder="Choose the model first" invalid={invalid} />;
  if (!codes.length) {
    return <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} invalid={invalid} placeholder={isFetching ? 'Loading…' : 'e.g. 1.5 GL'} />;
  }

  const custom = typing || (value !== '' && !picked);
  return (
    <div className="space-y-2">
      <Select
        id={id}
        value={custom ? OTHER : picked ? String(picked.id) : ''}
        invalid={invalid && !custom}
        onChange={(e) => {
          const next = e.target.value;
          setTyping(next === OTHER);
          onChange(next === OTHER ? '' : (codes.find((c) => String(c.id) === next)?.description ?? ''));
          if (next === OTHER) onCode?.(null);
        }}
      >
        <option value="">Choose the variant…</option>
        {codes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} — {c.description}
          </option>
        ))}
        <option value={OTHER}>Other (type it)</option>
      </Select>
      {custom && (
        <Input aria-label="Variant (typed)" value={value} onChange={(e) => onChange(e.target.value)} invalid={invalid} placeholder="Type the variant" autoFocus={typing} />
      )}
    </div>
  );
}
