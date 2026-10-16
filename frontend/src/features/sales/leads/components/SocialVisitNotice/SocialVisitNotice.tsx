import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Field, Textarea } from '@/shared/components/ui';
import { useToast } from '@/shared/hooks';
import { useCreateLeadMutation } from '../../../salesApi';

/**
 * Shown when the customer being entered is already a social media (Meta ad) lead: there is no second lead; the
 * social lead becomes Visited and this salesperson is recorded as dealing with the customer. What the
 * customer said is mandatory (will buy, will not, needs time…); saving sends the same lead again with it.
 */
export function SocialVisitNotice({ details, values }: { details: Record<string, unknown>; values: Record<string, unknown> }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [create, { isLoading }] = useCreateLeadMutation();
  const [said, setSaid] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!said.trim()) return setError('Write what the customer said');
    setError(null);
    try {
      const lead = await create({
        leadCreate: { ...values, email: values.email || null, ownerId: values.ownerId || undefined, visitRemarks: said.trim() } as never,
      }).unwrap();
      toast.success('Saved: the social media lead is now Visited and recorded as dealt with by you. The CRO is notified.');
      navigate(`/sales/leads/${lead.id}`);
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <div className="space-y-3">
      <p className="font-medium">
        This customer is already a <span className="font-semibold">social media lead</span>
        {typeof details.ownerName === 'string' ? <> of {details.ownerName}</> : null}
        {typeof details.campaignName === 'string' ? <> (campaign: {details.campaignName})</> : null}.
      </p>
      <p>
        No new lead is made. It becomes <b>Visited</b> and you are recorded as the salesperson who dealt with the customer. Write what the customer said
        during the visit.
      </p>
      <Field label="What did the customer say?" htmlFor="sv-said" required error={error ?? undefined} hint="e.g. will buy this month, wants a discount, will not buy, needs time">
        <Textarea id="sv-said" rows={3} value={said} onChange={(e) => setSaid(e.target.value)} maxLength={2000} />
      </Field>
      <Button size="sm" loading={isLoading} onClick={save}>
        Save visit
      </Button>
    </div>
  );
}
