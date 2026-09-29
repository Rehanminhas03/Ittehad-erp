import { Link } from 'react-router';
import { Badge, Button, Section, Spinner } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { formatDate } from '@/shared/lib';
import { useListCustomerVehiclesQuery } from '../../crmApi';
import { P } from '../../permissions';

/** A customer's current and past vehicles. */
export function CustomerVehicles({ customerId }: { customerId: number }) {
  const perm = usePermission();
  const { data, isLoading } = useListCustomerVehiclesQuery({ id: customerId });
  return (
    <Section
      title="Vehicles"
      actions={
        perm.can(P.vehiclesCreate) && (
          <Link to="/crm/vehicles/new">
            <Button size="sm" variant="secondary">
              Register vehicle
            </Button>
          </Link>
        )
      }
    >
      {isLoading ? (
        <Spinner className="size-4 text-slate-400" />
      ) : !data?.length ? (
        <p className="text-sm text-slate-500">No vehicles recorded for this customer.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.map((v) => (
            <li key={`${v.vehicleId}-${v.startDate}`} className="flex items-center justify-between py-2 text-sm">
              <Link to={`/crm/vehicles/${v.vehicleId}`} className="hover:text-brand-700">
                <span className="font-medium text-slate-800">{v.registrationNo ?? 'Unregistered'}</span>
                <span className="ml-2 text-slate-500">{v.modelName}</span>
                <span className="ml-2 font-mono text-xs text-slate-400">{v.vin}</span>
              </Link>
              <span className="flex items-center gap-2 text-xs text-slate-500">
                since {formatDate(v.startDate)}
                {v.endDate ? <Badge>Until {formatDate(v.endDate)}</Badge> : <Badge tone="green">Current</Badge>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
