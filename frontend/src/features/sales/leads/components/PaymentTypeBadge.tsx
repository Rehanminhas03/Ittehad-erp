import { Badge } from '@/shared/components/ui';

/** What the customer paid at conversion: Full payment (green) or Partial payment (amber). */
export function PaymentTypeBadge({ type }: { type: string | null | undefined }) {
  if (!type) return null;
  return <Badge tone={type === 'full' ? 'green' : 'amber'}>{type === 'full' ? 'Full payment' : 'Partial payment'}</Badge>;
}
