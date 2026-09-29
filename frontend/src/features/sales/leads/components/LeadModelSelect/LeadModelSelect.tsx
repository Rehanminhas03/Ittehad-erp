import { Select } from '@/shared/components/ui';
import { useLeadModelOptions } from '../../useLeadModelOptions';

interface LeadModelSelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  dealershipId?: number | null;
  /** Where the user's dealerships come from when none is chosen (default: lead access). */
  access?: string[];
}

/** A model of the dealership's own brand only (Hyundai Islamabad lists Hyundai models). */
export function LeadModelSelect({ id, value, onChange, invalid, dealershipId, access }: LeadModelSelectProps) {
  const models = useLeadModelOptions(dealershipId, access);
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} invalid={invalid}>
      <option value="">Select…</option>
      {models.map((m) => (
        <option key={m.value} value={m.value}>
          {m.label}
        </option>
      ))}
    </Select>
  );
}
