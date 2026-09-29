import { useState } from 'react';
import { Badge, Button, Field, Input, Section, StatusBadge } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { apiFieldErrors } from '@/shared/lib';
import { P } from '../../../permissions';
import { type SalesOrder, useSetOrderVehicleMutation } from '../../../salesApi';

/**
 * The vehicle for an order. The Admin allocates it by entering the chassis / engine number when
 * the vehicle is in stock; until then it shows as pending. Identifiers stay editable until
 * delivery; the Delivery Team can complete them too.
 */
export function OrderVehicle({ order }: { order: SalesOrder }) {
  const perm = usePermission();
  const toast = useToast();
  const [save, { isLoading }] = useSetOrderVehicleMutation();
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [v, setV] = useState({ vin: order.vehicleVin ?? '', engineNo: order.vehicleEngineNo ?? '' });

  const live = !['delivered', 'cancelled'].includes(order.status);
  const canEdit = live && (perm.canIn(P.ordersUpdate, order.dealershipId, order.branchId) || perm.canIn(P.ordersAllocate, order.dealershipId, order.branchId));

  const submit = async () => {
    // Both numbers are required for the car on an order.
    const missing = {
      ...(!v.vin.trim() && { vin: 'Enter the chassis number' }),
      ...(!v.engineNo.trim() && { engineNo: 'Enter the engine number' }),
    };
    if (Object.keys(missing).length) {
      setErrors(missing);
      return;
    }
    setErrors({});
    try {
      await save({ id: order.id, orderVehicleRequest: { vin: v.vin || null, engineNo: v.engineNo || null } }).unwrap();
      toast.success('Vehicle details saved');
      setEditing(false);
    } catch (e) {
      const issues = apiFieldErrors(e);
      if (issues.length) setErrors(Object.fromEntries(issues.map((i) => [i.path, i.message])));
      else toast.error(e);
    }
  };

  return (
    <Section
      title="Vehicle"
      actions={
        canEdit && !editing && (
          <Button size="sm" variant={order.vehicleId ? 'secondary' : 'primary'} onClick={() => setEditing(true)}>
            {order.vehicleId ? 'Edit identifiers' : 'Enter chassis / engine no.'}
          </Button>
        )
      }
    >
      {editing ? (
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          <Field label="Chassis number (VIN)" htmlFor="ov-vin" required error={errors.vin}>
            <Input id="ov-vin" value={v.vin} onChange={(e) => setV((s) => ({ ...s, vin: e.target.value }))} invalid={!!errors.vin} className="font-mono uppercase" />
          </Field>
          <Field label="Engine number" htmlFor="ov-engine" required error={errors.engineNo}>
            <Input id="ov-engine" value={v.engineNo} onChange={(e) => setV((s) => ({ ...s, engineNo: e.target.value }))} invalid={!!errors.engineNo} className="font-mono uppercase" />
          </Field>
          <p className="text-xs text-slate-500 sm:col-span-2">Both the chassis and the engine number are required.</p>
          <div className="flex gap-2 sm:col-span-2">
            <Button loading={isLoading} onClick={submit}>
              Save
            </Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : order.vehicleId ? (
        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-slate-500">Chassis number</dt>
            <dd className="font-mono text-slate-900">{order.vehicleVin ?? <Badge tone="amber">Pending</Badge>}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Engine number</dt>
            <dd className="font-mono text-slate-900">{order.vehicleEngineNo ?? <Badge tone="amber">Pending</Badge>}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd>{order.vehicleStatus && <StatusBadge status={order.vehicleStatus} />}</dd>
          </div>
        </dl>
      ) : (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Badge tone="amber">Pending</Badge> No vehicle allocated yet — the chassis / engine number is entered once the vehicle is in stock.
        </p>
      )}
    </Section>
  );
}
