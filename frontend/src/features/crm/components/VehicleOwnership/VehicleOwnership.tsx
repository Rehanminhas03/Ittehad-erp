import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, Button, Field, Input, Section, Spinner } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { formatDate } from '@/shared/lib';
import { type Customer, type Vehicle, useListVehicleOwnershipsQuery, useRecordVehicleOwnershipMutation } from '../../crmApi';
import { P } from '../../permissions';
import { CustomerPicker } from '../CustomerPicker';

/** Ownership history of a vehicle (within the caller's customer scope) and recording a new owner. */
export function VehicleOwnership({ vehicle }: { vehicle: Vehicle }) {
  const perm = usePermission();
  const { data, isLoading } = useListVehicleOwnershipsQuery({ id: vehicle.id });
  const [adding, setAdding] = useState(false);
  const canRecord = perm.can(P.ownershipManage);

  return (
    <Section
      title="Ownership"
      actions={
        canRecord &&
        !adding && (
          <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>
            {vehicle.currentOwner ? 'Transfer ownership' : 'Record owner'}
          </Button>
        )
      }
    >
      {adding && <RecordOwnerForm vehicleId={vehicle.id} onDone={() => setAdding(false)} />}
      {isLoading ? (
        <Spinner className="size-4 text-slate-400" />
      ) : !data?.length ? (
        <p className="text-sm text-slate-500">No ownership recorded.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {data.map((o) => (
            <li key={o.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                <Link to={`/crm/customers/${o.customerId}`} className="font-medium text-slate-800 hover:text-brand-700">
                  {o.customerName}
                </Link>
                <span className="ml-2 text-slate-500">{o.customerMobile}</span>
              </span>
              <span className="flex items-center gap-2 text-xs text-slate-500">
                {formatDate(o.startDate)} – {o.endDate ? formatDate(o.endDate) : 'now'}
                {!o.endDate && <Badge tone="green">Current</Badge>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function RecordOwnerForm({ vehicleId, onDone }: { vehicleId: number; onDone: () => void }) {
  const toast = useToast();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [record, { isLoading }] = useRecordVehicleOwnershipMutation();

  async function onSave() {
    if (!customer) return;
    try {
      await record({ id: vehicleId, ownershipCreate: { customerId: customer.id, startDate } }).unwrap();
      toast.success('Ownership recorded');
      onDone();
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <div className="mb-4 grid grid-cols-1 items-end gap-3 border-b border-slate-100 pb-4 sm:grid-cols-[1fr_10rem_auto]">
      <Field label="New owner" htmlFor="owner-picker">
        <CustomerPicker id="owner-picker" value={customer} onChange={setCustomer} permission={P.ownershipManage} />
      </Field>
      <Field label="From" htmlFor="owner-start">
        <Input id="owner-start" type="date" value={startDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setStartDate(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button onClick={onSave} loading={isLoading} disabled={!customer}>
          Save
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
