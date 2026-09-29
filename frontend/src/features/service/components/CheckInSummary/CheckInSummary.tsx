import { Link } from 'react-router';
import { Badge, Spinner } from '@/shared/components/ui';
import { formatDate, formatNumber } from '@/shared/lib';
import { ordinal } from '../../permissions';
import { usePreviewCheckInQuery } from '../../serviceApi';

/** What check-in will compute for the chosen vehicle, shown before the visit is created. */
export function CheckInSummary({ vehicleId, dealershipId }: { vehicleId: number | null; dealershipId: number | null }) {
  const { data, isFetching } = usePreviewCheckInQuery({ vehicleId: vehicleId!, dealershipId: dealershipId! }, { skip: !vehicleId || !dealershipId });
  if (!vehicleId || !dealershipId) return null;
  if (isFetching || !data) return <Spinner className="size-4 text-slate-400" />;
  if (data.openVisitId) {
    return (
      <p className="text-sm text-amber-800">
        This vehicle is already in the workshop.{' '}
        <Link to={`/service/visits/${data.openVisitId}`} className="font-medium underline">
          Open the current visit
        </Link>
      </p>
    );
  }
  const next = data.nextScheduled;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
      <div>
        <dt className="text-xs text-slate-500">Visit</dt>
        <dd>{ordinal(data.visitSequence)} visit</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Next scheduled service</dt>
        <dd>
          {next ? (
            <>
              {ordinal(next.sequence)} at {formatNumber(next.dueKm)} km / {formatDate(next.dueDate)}{' '}
              {data.freeServiceIfScheduled ? <Badge tone="green">Free</Badge> : next.isFree ? <Badge tone="amber">Free period passed</Badge> : null}
            </>
          ) : (
            'None pending'
          )}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Warranty</dt>
        <dd>{data.warrantyValid ? <Badge tone="green">Valid</Badge> : <Badge>Not covered</Badge>}</dd>
      </div>
      <div>
        <dt className="text-xs text-slate-500">Owner / last km</dt>
        <dd>
          {data.currentOwner?.fullName ?? 'Choose the customer below'}
          {data.lastOdometerKm != null && <span className="text-slate-500"> · {formatNumber(data.lastOdometerKm)} km</span>}
        </dd>
      </div>
    </dl>
  );
}
