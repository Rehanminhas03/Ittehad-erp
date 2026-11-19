import { Link, useParams } from 'react-router';
import { PageHeader, Spinner } from '@/shared/components/ui';
import { JobCardPartsDesk } from '../../components/JobCardPartsDesk';
import { StoreJobCard } from '../../components/StoreJobCard';
import { useListPartsRequestsQuery } from '../../partsApi';

/**
 * Every part asked for on one job card, from all its requests (the advisor's, the store manager's, however many times), in one
 * table with one Issue button.
 */
export function JobCardRequestsList({ jobCardId }: { jobCardId: number }) {
  const { data, isLoading } = useListPartsRequestsQuery({ jobCardId, kind: 'request', pageSize: 100, sort: 'createdAt' }, { skip: !jobCardId });
  if (isLoading) return <Spinner className="size-4 text-slate-400" />;
  return <JobCardPartsDesk requests={data?.items ?? []} />;
}

/** The job card page opened from the requests list. */
export function JobCardRequestsDetail() {
  const jobCardId = Number(useParams().jobCardId);
  const { data } = useListPartsRequestsQuery({ jobCardId, kind: 'request', pageSize: 1, sort: 'createdAt' }, { skip: !jobCardId });
  const requests = (data?.items ?? []).filter((r) => r.status !== 'cancelled');
  return (
    <div>
      <PageHeader
        title={requests[0]?.jobCardNo ? `Job card ${requests[0].jobCardNo}` : 'Job card'}
        subtitle="All the parts asked for on this job card, in one table. Enter the quantity you give for each part, then Issue to job card."
        actions={
          <Link to="/parts/requests?kind=request" className="text-sm font-medium text-brand-700 hover:underline">
            ← All parts requests
          </Link>
        }
      />
      <div className="space-y-4">
        {jobCardId > 0 && <StoreJobCard jobCardId={jobCardId} />}
        {jobCardId > 0 && <JobCardRequestsList jobCardId={jobCardId} />}
      </div>
    </div>
  );
}
