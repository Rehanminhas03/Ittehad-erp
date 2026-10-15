import { Badge } from '@/shared/components/ui';
import { LEAD_TEMPERATURES } from '../../../permissions';

/** Hot / Warm / Cold: how interested the customer is. */
export function TemperatureBadge({ value }: { value: string | null | undefined }) {
  const t = LEAD_TEMPERATURES.find((x) => x.value === value);
  return t ? (
    <Badge tone={t.tone} dot>
      {t.label}
    </Badge>
  ) : null;
}
