import { Link } from 'react-router';
import { Badge, Spinner } from '@/shared/components/ui';
import { formatDate, formatDateTime, formatNumber } from '@/shared/lib';
import { ordinal, visitTypeLabel } from '../../permissions';
import { usePreviewCheckInQuery } from '../../serviceApi';

/**
 * What check-in will compute for the chosen vehicle, shown before the visit is created: where the car came from
 * (delivered by us with its date, or bought elsewhere), its warranty, the next free service, and every earlier
 * service of the car with the kilometres.
 */
export function CheckInSummary({ vehicleId, dealershipId, customerId }: { vehicleId: number | null; dealershipId: number | null; customerId?: number | null }) {
  const { data, isFetching } = usePreviewCheckInQuery({ vehicleId: vehicleId!, dealershipId: dealershipId!, customerId: customerId ?? undefined }, { skip: !vehicleId || !dealershipId });
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
  const v = data.vehicle;
  return (
    <div className="space-y-3 rounded-xl bg-slate-50/80 p-3 ring-1 ring-slate-200">
      <p className="text-sm">
        <span className="font-semibold text-slate-900">{[v.modelName, v.variant, v.color, v.modelYear].filter(Boolean).join(' · ')}</span>
        <span className="ml-2 text-slate-600">
          {v.registrationNo ?? 'Unregistered'} · <span className="font-mono text-xs">{v.vin}</span>
        </span>
      </p>
      <p className="text-sm">
        {data.delivered ? (
          <>
            <Badge tone="green" dot>Delivered by us</Badge>{' '}
            <span className="text-slate-700">
              on {formatDate(data.delivered.on)}
              {data.delivered.soldBy ? ` by ${data.delivered.soldBy}` : ''}
              {data.delivered.odometerKm != null ? ` at ${formatNumber(data.delivered.odometerKm)} km` : ''}
            </span>
            <span className="mt-1 block text-xs text-slate-600">
              {[
                data.delivered.orderNo && `Sales order ${data.delivered.orderNo}`,
                data.delivered.pboNo && `PBO ${data.delivered.pboNo}`,
                data.delivered.salesperson && `Sold by ${data.delivered.salesperson}`,
                data.delivered.boughtBy && `Customer ${data.delivered.boughtBy}`,
                data.delivered.engineNo && `Engine ${data.delivered.engineNo}`,
                data.delivered.warrantyEndsOn && `Warranty until ${formatDate(data.delivered.warrantyEndsOn)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </>
        ) : (
          <>
            <Badge tone="amber" dot>Bought elsewhere</Badge> <span className="text-slate-700">registered at service check-in</span>
          </>
        )}
      </p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-slate-500">Visit</dt>
          <dd>
            {ordinal(data.visitSequence)} visit {data.visitSequence === 1 && <Badge tone="blue">First time for this car</Badge>}
          </dd>
        </div>
        {data.customerVisits != null && (
          <div>
            <dt className="text-xs text-slate-500">Customer</dt>
            <dd>{data.customerVisits === 0 ? <Badge tone="blue">First visit of this customer</Badge> : `${data.customerVisits} earlier visit${data.customerVisits === 1 ? '' : 's'}`}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-slate-500">Next scheduled service</dt>
          <dd>
            {next ? (
              <>
                {next.name} at {formatNumber(next.dueKm)} km / {formatDate(next.dueDate)}{' '}
                {data.freeServiceIfScheduled ? <Badge tone="green">Free</Badge> : next.isFree ? <Badge tone="amber">Free period passed</Badge> : null}
              </>
            ) : (
              'None pending'
            )}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-4">
          {data.freeServiceIfScheduled && <p className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-900">This visit qualifies as a free scheduled service: the labour and services are free. Parts and oil are charged to the customer.</p>}
        </div>
        <div>
          <dt className="text-xs text-slate-500">Warranty</dt>
          <dd>
            {data.warrantyValid ? <Badge tone="green">Valid</Badge> : <Badge>Not covered</Badge>}
            {data.warrantyEndsOn && <span className="ml-1 text-xs text-slate-500">until {formatDate(data.warrantyEndsOn)}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Owner / last km</dt>
          <dd>
            {data.currentOwner?.fullName ?? 'Choose the customer below'}
            {data.lastOdometerKm != null && <span className="text-slate-500"> · {formatNumber(data.lastOdometerKm)} km</span>}
          </dd>
        </div>
      </dl>
      <div>
        <p className="mb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">Earlier services of this car</p>
        {data.previousVisits.length === 0 ? (
          <p className="text-sm text-slate-500">No earlier visit on record.</p>
        ) : (
          <div className="max-h-48 overflow-auto rounded-lg bg-white ring-1 ring-slate-200">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Visit</th>
                  <th className="px-2 py-1.5 font-medium">Date</th>
                  <th className="px-2 py-1.5 text-right font-medium">Odometer</th>
                  <th className="px-2 py-1.5 font-medium">Service</th>
                  <th className="px-2 py-1.5 font-medium">Complaints</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.previousVisits.map((p) => (
                  <tr key={p.id}>
                    <td className="px-2 py-1.5">
                      <Link to={`/service/visits/${p.id}`} className="font-mono text-brand-700 hover:underline">
                        {p.visitNo}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatDateTime(p.arrivedAt)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(p.odometerKm)} km</td>
                    <td className="px-2 py-1.5">
                      {p.serviceName ?? (p.serviceNumber ? `${ordinal(p.serviceNumber)} service` : visitTypeLabel(p.visitType))} {p.freeService && <Badge tone="green">Free</Badge>}
                    </td>
                    <td className="px-2 py-1.5 text-slate-600">{p.complaints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
