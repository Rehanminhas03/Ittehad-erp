import { useState } from 'react';
import { useVehicleModelOptions } from '@/features/crm';
import { VariantPicker } from '@/features/sales/leads/components/VariantPicker';
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
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="text-xs font-medium text-brand-700 hover:underline" onClick={() => setOpen(true)}>
        Car not in the system (bought elsewhere)? Register it here
      </button>
      {open && <RegisterVehicleDialog dealershipId={dealershipId} onClose={() => setOpen(false)} onRegistered={onRegistered} />}
    </>
  );
}

/** The form itself: a new customer (name and phone; CNIC optional) and their car (every detail required). */
export function RegisterVehicleDialog({
  dealershipId,
  onClose,
  onRegistered,
  defaults,
}: {
  dealershipId: number | null;
  onClose: () => void;
  onRegistered: (r: RegisteredVehicle) => void;
  /** What the advisor already typed (a name or a phone number), or the known customer who has no car yet. */
  defaults?: { fullName?: string; mobile?: string };
}) {
  const perm = usePermission();
  const toast = useToast();
  const brand = perm.dealershipsFor('service.visits.create').find((d) => d.id === dealershipId)?.brand;
  const models = useVehicleModelOptions(brand ? [brand] : undefined);
  const [save, { isLoading }] = useRegisterVehicleAtCheckInMutation();
  const [v, setV] = useState({
    kind: 'individual',
    fullName: defaults?.fullName ?? '',
    mobile: defaults?.mobile ?? '',
    cnic: '',
    ntn: '',
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
    if (v.fullName.trim().length < 2) return setError(v.kind === 'company' ? 'Enter the company name' : 'Enter the customer name');
    if (digits(v.mobile).replace(/\D/g, '').length < 10) return setError('Enter a valid mobile number, e.g. 03001234567');
    if (!v.modelId) return setError('Choose the model');
    if (!v.variant.trim()) return setError('Enter the variant');
    if (v.vin.trim().length < 5) return setError('Enter the chassis (VIN) number');
    if (v.engineNo.trim().length < 3) return setError('Enter the engine number');
    if (!v.color.trim()) return setError('Enter the colour');
    if (!/^(19|20)[0-9]{2}$/.test(v.modelYear.trim())) return setError('Enter the model year, e.g. 2024');
    if (v.odometerKm.trim() === '' || Number(v.odometerKm) < 0) return setError('Enter the odometer reading in km');
    setError(null);
    try {
      const r = await save({
        registerVehicleRequest: {
          dealershipId,
          customer: { kind: v.kind as 'individual' | 'company', fullName: v.fullName.trim(), mobile: digits(v.mobile), cnic: v.cnic.trim() || null, ntn: v.ntn.trim() || null, address: v.address.trim() || null },
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
      onClose();
      onRegistered({ vehicleId: r.vehicleId, customerId: r.customerId });
    } catch (e) {
      const issues = apiFieldErrors(e);
      if (issues.length) setError(issues.map((i) => `${i.path}: ${i.message}`).join('; '));
      else toast.error(e);
    }
  };

  return (
        <Dialog
          open
          size="lg"
          onClose={onClose}
          title="New customer and car"
          footer={
            <>
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button loading={isLoading} onClick={submit}>
                Register and continue check-in
              </Button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
            <p className="text-sm text-slate-600 sm:col-span-2">Enter the new customer and the car. The customer's CNIC and address are optional; every car detail is required. They are saved, so the visit and its job card can start, and next time the customer and the car are found by name, phone or registration number.</p>
            <Field label="Customer type" htmlFor="rv-kind" required>
              <Select id="rv-kind" value={v.kind} onChange={set('kind')}>
                <option value="individual">Individual</option>
                <option value="company">Company</option>
              </Select>
            </Field>
            <Field label={v.kind === 'company' ? 'Company name' : 'Customer name'} htmlFor="rv-name" required>
              <Input id="rv-name" value={v.fullName} onChange={set('fullName')} />
            </Field>
            <Field label="Mobile" htmlFor="rv-mobile" required hint="An existing customer with this number is reused">
              <Input id="rv-mobile" inputMode="tel" value={v.mobile} onChange={set('mobile')} placeholder="03001234567" />
            </Field>
            <Field label="CNIC (optional)" htmlFor="rv-cnic">
              <Input id="rv-cnic" value={v.cnic} onChange={set('cnic')} placeholder="35202-1234567-1" />
            </Field>
            <Field label="NTN (optional)" htmlFor="rv-ntn" hint="National Tax Number, mostly for a company">
              <Input id="rv-ntn" value={v.ntn} onChange={set('ntn')} />
            </Field>
            <Field label="Address (optional)" htmlFor="rv-addr">
              <Input id="rv-addr" value={v.address} onChange={set('address')} />
            </Field>
            <Field label="Chassis number (VIN)" htmlFor="rv-vin" required>
              <Input id="rv-vin" value={v.vin} onChange={set('vin')} />
            </Field>
            <Field label="Registration number (optional)" htmlFor="rv-reg" hint="Leave empty if not registered yet">
              <Input id="rv-reg" value={v.registrationNo} onChange={set('registrationNo')} placeholder="e.g. ABC-123" />
            </Field>
            <Field label="Engine number" htmlFor="rv-eng" required>
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
            <Field label="Variant" htmlFor="rv-var" required hint="The variants of the chosen model. Choose Other to type one that is not listed">
              <VariantPicker id="rv-var" value={v.variant} onChange={(variant) => setV((s) => ({ ...s, variant }))} modelId={Number(v.modelId) || null} dealershipId={dealershipId} />
            </Field>
            <Field label="Colour" htmlFor="rv-col" required>
              <Input id="rv-col" value={v.color} onChange={set('color')} />
            </Field>
            <Field label="Model year" htmlFor="rv-year" required>
              <Input id="rv-year" inputMode="numeric" value={v.modelYear} onChange={set('modelYear')} />
            </Field>
            <Field label="Odometer now (km)" htmlFor="rv-km" required>
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
  );
}
