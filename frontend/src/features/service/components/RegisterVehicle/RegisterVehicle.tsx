import { useState } from 'react';
import { useVehicleModelOptions } from '@/features/crm';
import { Button, Dialog, Field, Input, Select } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { apiFieldErrors } from '@/shared/lib';
import { useRegisterVehicleAtCheckInMutation } from '../../serviceApi';

export interface RegisteredVehicle {
  vehicleId: number;
  customerId: number;
}

const digits = (s: string) => s.replace(/[^\d+]/g, '');

/**
 * A car that is not in the system (bought from another dealership) came for service: write down its owner and
 * the car here, and the check-in carries on with it. A car already known to the group is just added; a customer
 * with the same mobile number is reused.
 */
export function RegisterVehicle({ dealershipId, onRegistered }: { dealershipId: number | null; onRegistered: (r: RegisteredVehicle) => void }) {
  const perm = usePermission();
  const toast = useToast();
  const brand = perm.dealershipsFor('service.visits.create').find((d) => d.id === dealershipId)?.brand;
  const models = useVehicleModelOptions(brand ? [brand] : undefined);
  const [open, setOpen] = useState(false);
  const [save, { isLoading }] = useRegisterVehicleAtCheckInMutation();
  const [v, setV] = useState({
    fullName: '',
    mobile: '',
    cnic: '',
    address: '',
    vin: '',
    engineNo: '',
    registrationNo: '',
    modelId: '',
    variant: '',
    color: '',
    modelYear: '',
    boughtFrom: '',
    warrantyEndsOn: '',
    odometerKm: '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));

  const submit = async () => {
    if (!dealershipId) return setError('Choose the dealership first');
    if (v.fullName.trim().length < 2) return setError('Enter the customer name');
    if (digits(v.mobile).replace(/\D/g, '').length < 10) return setError('Enter a valid mobile number, e.g. 03001234567');
    if (v.vin.trim().length < 5) return setError('Enter the chassis (VIN) number');
    if (!v.modelId) return setError('Choose the model');
    setError(null);
    try {
      const r = await save({
        registerVehicleRequest: {
          dealershipId,
          customer: { fullName: v.fullName.trim(), mobile: digits(v.mobile), cnic: v.cnic.trim() || null, address: v.address.trim() || null },
          vehicle: {
            vin: v.vin.trim(),
            engineNo: v.engineNo.trim() || null,
            registrationNo: v.registrationNo.trim() || null,
            modelId: Number(v.modelId),
            variant: v.variant.trim() || null,
            color: v.color.trim() || null,
            modelYear: v.modelYear ? Number(v.modelYear) : null,
          },
          boughtFrom: v.boughtFrom.trim() || null,
          warrantyEndsOn: v.warrantyEndsOn || null,
          odometerKm: v.odometerKm ? Number(v.odometerKm) : null,
        },
      }).unwrap();
      toast.success(r.alreadyInSystem ? `${r.vehicleLabel} was already in the system: added to this dealership` : `${r.vehicleLabel} registered for ${r.customerName}`);
      setOpen(false);
      onRegistered({ vehicleId: r.vehicleId, customerId: r.customerId });
    } catch (e) {
      const issues = apiFieldErrors(e);
      if (issues.length) setError(issues.map((i) => `${i.path}: ${i.message}`).join('; '));
      else toast.error(e);
    }
  };

  return (
    <>
      <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setOpen(true)}>
        Car not in the system (bought elsewhere)? Register it here
      </button>
      {open && (
        <Dialog
          open
          size="lg"
          onClose={() => setOpen(false)}
          title="Register a car bought elsewhere"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button loading={isLoading} onClick={submit}>
                Register and continue check-in
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
            <p className="text-sm text-slate-600 sm:col-span-2">The owner and the car are saved, so the visit and its job card can start. The next time this car comes, it is found by its registration or chassis number.</p>
            <Field label="Customer name" htmlFor="rv-name" required>
              <Input id="rv-name" value={v.fullName} onChange={set('fullName')} />
            </Field>
            <Field label="Mobile" htmlFor="rv-mobile" required hint="An existing customer with this number is reused">
              <Input id="rv-mobile" inputMode="tel" value={v.mobile} onChange={set('mobile')} placeholder="03001234567" />
            </Field>
            <Field label="CNIC" htmlFor="rv-cnic">
              <Input id="rv-cnic" value={v.cnic} onChange={set('cnic')} placeholder="35202-1234567-1" />
            </Field>
            <Field label="Address" htmlFor="rv-addr">
              <Input id="rv-addr" value={v.address} onChange={set('address')} />
            </Field>
            <Field label="Chassis number (VIN)" htmlFor="rv-vin" required>
              <Input id="rv-vin" value={v.vin} onChange={set('vin')} />
            </Field>
            <Field label="Registration number" htmlFor="rv-reg">
              <Input id="rv-reg" value={v.registrationNo} onChange={set('registrationNo')} placeholder="e.g. ABC-123" />
            </Field>
            <Field label="Engine number" htmlFor="rv-eng">
              <Input id="rv-eng" value={v.engineNo} onChange={set('engineNo')} />
            </Field>
            <Field label="Model" htmlFor="rv-model" required>
              <Select id="rv-model" value={v.modelId} onChange={set('modelId')}>
                <option value="">Choose the model…</option>
                {models.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Variant" htmlFor="rv-var">
              <Input id="rv-var" value={v.variant} onChange={set('variant')} />
            </Field>
            <Field label="Colour" htmlFor="rv-col">
              <Input id="rv-col" value={v.color} onChange={set('color')} />
            </Field>
            <Field label="Model year" htmlFor="rv-year">
              <Input id="rv-year" inputMode="numeric" value={v.modelYear} onChange={set('modelYear')} />
            </Field>
            <Field label="Odometer now (km)" htmlFor="rv-km">
              <Input id="rv-km" inputMode="numeric" value={v.odometerKm} onChange={set('odometerKm')} />
            </Field>
            <Field label="Bought from" htmlFor="rv-from" hint="The dealership or showroom, if known">
              <Input id="rv-from" value={v.boughtFrom} onChange={set('boughtFrom')} />
            </Field>
            <Field label="Warranty ends on" htmlFor="rv-war" hint="If known: needed for warranty visits">
              <Input id="rv-war" type="date" value={v.warrantyEndsOn} onChange={set('warrantyEndsOn')} />
            </Field>
            {error && (
              <p className="text-sm text-red-600 sm:col-span-2" role="alert">
                {error}
              </p>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
