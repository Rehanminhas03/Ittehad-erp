import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { VehicleField } from '@/features/crm';
import { useGetVehicleQuery } from '@/features/crm/crmApi';
import { LeadModelSelect } from '@/features/sales/leads/components/LeadModelSelect';
import { VariantPicker } from '@/features/sales/leads/components/VariantPicker';
import { useLeadModelOptions } from '@/features/sales/leads/useLeadModelOptions';
import { digitsOnly } from '@/shared/components';
import { Button, Field, Input, PageHeader, Section, Select, Textarea } from '@/shared/components/ui';
import { apiFieldErrors } from '@/shared/lib';
import { usePermission, useToast } from '@/shared/hooks';
import { P } from '../../permissions';
import { useCreateStandaloneEstimateMutation } from '../../serviceApi';

/**
 * A new estimate on its own, without a job card: for a customer who only wants a price. The customer's name and contact are
 * required; the car is chosen from the registered cars (which fills in everything) or by model and variant, like a quotation.
 * The parts and the services are added on the estimate that opens next (the store can price the parts too).
 */
export default function NewEstimatePage() {
  const perm = usePermission();
  const toast = useToast();
  const navigate = useNavigate();
  const dealerships = perm.dealershipsFor(P.estimatesCreate);
  const [dealershipId, setDealershipId] = useState(String(dealerships[0]?.id ?? ''));
  const [v, setV] = useState({
    customerName: '', customerMobile: '', modelId: '', variant: '', registrationNo: '', vin: '', engineNo: '', color: '', modelYear: '', validUntil: '', notes: '',
  });
  const [vehicleId, setVehicleId] = useState<number | ''>('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [create, { isLoading }] = useCreateStandaloneEstimateMutation();
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const branchId = dealershipId ? perm.branchesFor(P.estimatesCreate, Number(dealershipId))[0]?.id : undefined;
  const models = useLeadModelOptions(Number(dealershipId) || null, [P.estimatesCreate]);

  // A registered car chosen: its model, variant, registration, VIN, engine, colour and year fill in.
  const { data: car } = useGetVehicleQuery({ id: Number(vehicleId) }, { skip: !vehicleId });
  useEffect(() => {
    if (!car) return;
    setV((s) => ({ ...s, modelId: String(car.modelId), registrationNo: car.registrationNo ?? '', vin: car.vin ?? '', engineNo: car.engineNo ?? '', color: car.color ?? '', modelYear: car.modelYear ? String(car.modelYear) : '' }));
    // The variant is set after the model (changing the model clears the variant).
    const t = setTimeout(() => setV((s) => ({ ...s, variant: car.variant ?? '' })), 60);
    return () => clearTimeout(t);
  }, [car]);

  const submit = async () => {
    const next: Record<string, string> = {};
    if (v.customerName.trim().length < 2) next.customerName = 'Enter the customer name';
    if (v.customerMobile.trim().length < 7) next.customerMobile = 'Enter the contact number';
    if (!dealershipId) next.dealershipId = 'Choose the dealership';
    if (!v.modelId) next.modelId = 'Choose the model';
    if (!v.variant.trim()) next.variant = 'Choose the variant';
    setErrors(next);
    if (Object.keys(next).length) return;
    const model = models.find((m) => m.value === v.modelId)?.label;
    const text = (s: string) => s.trim() || null;
    try {
      const e = await create({
        standaloneEstimateCreate: {
          dealershipId: Number(dealershipId),
          branchId: branchId ?? null,
          customerName: v.customerName.trim(),
          customerMobile: v.customerMobile.trim(),
          vehicleModel: model ?? '',
          vehicleVariant: v.variant.trim(),
          registrationNo: v.registrationNo.trim().toUpperCase() || null,
          vin: text(v.vin)?.toUpperCase() ?? null,
          engineNo: text(v.engineNo)?.toUpperCase() ?? null,
          color: text(v.color),
          modelYear: Number(v.modelYear) || null,
          validUntil: v.validUntil || null,
          notes: text(v.notes),
        },
      }).unwrap();
      toast.success(`Estimate ${e.estimateNo} created: add the parts and services`);
      navigate(`/service/estimates/${e.id}`);
    } catch (err) {
      const issues = apiFieldErrors(err);
      if (issues.length) setErrors(Object.fromEntries(issues.map((i) => [i.path, i.message])));
      else toast.error(err);
    }
  };

  return (
    <>
      <PageHeader title="New estimate" subtitle="A price for the customer, without a job card. Add the parts and the services next; the store can price the parts too." />
      <Section title="Customer">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {dealerships.length > 1 && (
            <Field label="Dealership" htmlFor="ne-dealership" error={errors.dealershipId}>
              <Select
                id="ne-dealership"
                value={dealershipId}
                onChange={(e) => {
                  setDealershipId(e.target.value);
                  setV((s) => ({ ...s, modelId: '', variant: '' }));
                }}
              >
                {dealerships.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Customer name" htmlFor="ne-name" required error={errors.customerName}>
            <Input id="ne-name" value={v.customerName} onChange={set('customerName')} invalid={!!errors.customerName} />
          </Field>
          <Field label="Contact (mobile)" htmlFor="ne-mobile" required error={errors.customerMobile}>
            <Input id="ne-mobile" type="tel" inputMode="tel" maxLength={16} value={v.customerMobile} onChange={(e) => setV((s) => ({ ...s, customerMobile: digitsOnly(e.target.value) }))} placeholder="03001234567" invalid={!!errors.customerMobile} />
          </Field>
          <Field label="Valid until" htmlFor="ne-valid">
            <Input id="ne-valid" type="date" value={v.validUntil} onChange={set('validUntil')} />
          </Field>
        </div>
      </Section>
      <Section title="Car">
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Find a registered car" htmlFor="ne-vehicle" className="sm:col-span-2 lg:col-span-4" hint="Type the registration, VIN or engine number: the model, variant and the other details fill in">
            <VehicleField id="ne-vehicle" value={vehicleId} onChange={setVehicleId} />
          </Field>
          <Field label="Model" htmlFor="ne-model" required error={errors.modelId}>
            <LeadModelSelect id="ne-model" value={v.modelId} onChange={(modelId) => setV((s) => ({ ...s, modelId }))} dealershipId={Number(dealershipId) || null} access={[P.estimatesCreate]} invalid={!!errors.modelId} />
          </Field>
          <Field label="Variant" htmlFor="ne-variant" required error={errors.variant}>
            <VariantPicker id="ne-variant" value={v.variant} onChange={(variant) => setV((s) => ({ ...s, variant }))} modelId={Number(v.modelId) || null} dealershipId={Number(dealershipId) || null} invalid={!!errors.variant} />
          </Field>
          <Field label="Registration no." htmlFor="ne-reg">
            <Input id="ne-reg" value={v.registrationNo} onChange={set('registrationNo')} />
          </Field>
          <Field label="Colour" htmlFor="ne-color">
            <Input id="ne-color" value={v.color} onChange={set('color')} />
          </Field>
          <Field label="VIN / chassis no." htmlFor="ne-vin">
            <Input id="ne-vin" value={v.vin} onChange={set('vin')} />
          </Field>
          <Field label="Engine no." htmlFor="ne-engine">
            <Input id="ne-engine" value={v.engineNo} onChange={set('engineNo')} />
          </Field>
          <Field label="Model year" htmlFor="ne-year">
            <Input id="ne-year" inputMode="numeric" maxLength={4} value={v.modelYear} onChange={(e) => setV((s) => ({ ...s, modelYear: digitsOnly(e.target.value) }))} />
          </Field>
        </div>
      </Section>
      <Section>
        <Field label="Notes for the customer" htmlFor="ne-notes">
          <Textarea id="ne-notes" rows={2} value={v.notes} onChange={set('notes')} />
        </Field>
      </Section>
      <div className="flex gap-3">
        <Button loading={isLoading} onClick={() => void submit()}>
          Create estimate
        </Button>
        <Button variant="secondary" onClick={() => navigate('/service/estimates')}>
          Cancel
        </Button>
      </div>
    </>
  );
}
