import { Link } from 'react-router';
import { Badge, Section, Spinner } from '@/shared/components/ui';
import { formatDate, formatNumber } from '@/shared/lib';
import { ordinal } from '../../permissions';
import { useGetVehicleServiceScheduleQuery } from '../../serviceApi';

/** A vehicle's scheduled services: done (with the visit) and still due. */
export function VehicleSchedulePanel({ vehicleId }: { vehicleId: number }) {
  const { data, isLoading } = useGetVehicleServiceScheduleQuery({ id: vehicleId });
  return (
    <Section title="Service schedule">
      {isLoading ? (
        <Spinner className="size-4 text-slate-400" />
      ) : !data?.length ? (
        <p className="text-sm text-slate-500">No schedule. It is created when the vehicle is delivered, from its model's service schedule.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span>
                <span className="font-medium text-slate-800">
                  {ordinal(e.sequence)} · {e.name}
                </span>
                <span className="ml-2 text-slate-500">
                  {formatNumber(e.dueKm)} km / {formatDate(e.dueDate)}
                </span>
              </span>
              <span className="flex items-center gap-2 text-xs">
                {e.isFree && <Badge tone="green">Free</Badge>}
                {e.status === 'done' ? (
                  e.visitId ? (
                    <Link to={`/service/visits/${e.visitId}`} className="text-brand-700 hover:underline">
                      Done {formatDate(e.completedOn)}
                    </Link>
                  ) : (
                    <Badge tone="blue">Done</Badge>
                  )
                ) : (
                  <Badge tone="amber">Due</Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
