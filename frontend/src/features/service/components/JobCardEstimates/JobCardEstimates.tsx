import { Link, useNavigate } from 'react-router';
import { Button, Section, StatusBadge } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatMoney } from '@/shared/lib';
import { P } from '../../permissions';
import { type JobCard, useCreateEstimateMutation, useListEstimatesQuery } from '../../serviceApi';

/** Estimates of a job card, and creating one (blank or from inspection findings). */
export function JobCardEstimates({ jobCard }: { jobCard: JobCard }) {
  const perm = usePermission();
  const toast = useToast();
  const navigate = useNavigate();
  const canView = perm.can([P.estimatesView, P.estimatesViewOwn]);
  const { data } = useListEstimatesQuery({ jobCardId: jobCard.id, pageSize: 50 }, { skip: !canView });
  const [create, { isLoading }] = useCreateEstimateMutation();
  const canCreate = ['open', 'in_progress'].includes(jobCard.status) && perm.canIn(P.estimatesCreate, jobCard.dealershipId, jobCard.branchId);

  async function onCreate(fromInspection: boolean) {
    try {
      const e = await create({ id: jobCard.id, body: { fromInspection } }).unwrap();
      toast.success(`Estimate ${e.estimateNo} created`);
      navigate(`/service/estimates/${e.id}`);
    } catch (err) {
      toast.error(err);
    }
  }

  if (!canView) return null;
  return (
    <Section
      title="Estimates"
      actions={
        canCreate && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" loading={isLoading} onClick={() => void onCreate(true)}>
              Estimate from inspection
            </Button>
            <Button size="sm" variant="secondary" loading={isLoading} onClick={() => void onCreate(false)}>
              New estimate
            </Button>
          </div>
        )
      }
    >
      {!data?.items.length ? (
        <p className="text-sm text-slate-500">No estimates. Extra work found during service is quoted here for the customer's approval.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.items.map((e) => (
            <li key={e.id} className="flex items-center justify-between py-2 text-sm">
              <Link to={`/service/estimates/${e.id}`} className="font-mono text-xs text-slate-800 hover:text-brand-700">
                {e.estimateNo}
              </Link>
              <span className="flex items-center gap-3">
                <span className="tabular-nums">{formatMoney(e.totalAmount)}</span>
                <StatusBadge status={e.status} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
