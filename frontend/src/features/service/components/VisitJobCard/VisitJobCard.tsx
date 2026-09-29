import { Link, useNavigate } from 'react-router';
import { Button, Section } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { P } from '../../permissions';
import { type Visit, useOpenJobCardMutation } from '../../serviceApi';

/** Link to the visit's job card, or open one for a checked-in visit. */
export function VisitJobCard({ visit }: { visit: Visit }) {
  const perm = usePermission();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, { isLoading }] = useOpenJobCardMutation();

  if (visit.jobCardId) {
    return (
      <Section title="Job card">
        <Link to={`/service/job-cards/${visit.jobCardId}`} className="text-sm font-medium text-brand-700 hover:underline">
          Open the job card
        </Link>
      </Section>
    );
  }
  if (visit.status !== 'open' || !perm.canIn(P.jobCardsCreate, visit.dealershipId, visit.branchId)) return null;
  return (
    <Section title="Job card">
      <Button
        loading={isLoading}
        onClick={async () => {
          try {
            const jc = await open({ id: visit.id }).unwrap();
            toast.success(`Job card ${jc.jobCardNo} opened`);
            navigate(`/service/job-cards/${jc.id}`);
          } catch (e) {
            toast.error(e);
          }
        }}
      >
        Open job card
      </Button>
    </Section>
  );
}
