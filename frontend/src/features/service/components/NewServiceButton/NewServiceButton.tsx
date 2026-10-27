import { useState } from 'react';
import { useNavigate } from 'react-router';
import { CustomerField, VehicleField } from '@/features/crm';
import { Button, Dialog, Field, Input, Select, Textarea } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { P, VISIT_TYPES } from '../../permissions';
import { useCreateVisitMutation, useOpenJobCardMutation } from '../../serviceApi';
import { CheckInSummary } from '../CheckInSummary';
import { RegisterVehicle } from '../RegisterVehicle';

/**
 * "New service": a customer has arrived. Check the car in (the car, the visit type, the odometer, what the
 * customer said), open its job card and go straight to it, in one step.
 */
export function NewServiceButton() {
  const perm = usePermission();
  const toast = useToast();
  const navigate = useNavigate();
  const dealerships = perm.dealershipsFor(P.visitsCreate);
  const [open, setOpen] = useState(false);
  const [dealershipId, setDealershipId] = useState<number | null>(dealerships[0]?.id ?? null);
  const [vehicleId, setVehicleId] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [visitType, setVisitType] = useState('scheduled');
  const [odometer, setOdometer] = useState('');
  const [complaints, setComplaints] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [createVisit, { isLoading: checkingIn }] = useCreateVisitMutation();
  const [openJobCard, { isLoading: opening }] = useOpenJobCardMutation();

  if (!dealerships.length) return null;
  const canJobCard = !!dealershipId && perm.canIn(P.jobCardsCreate, dealershipId);

  const reset = () => {
    setVehicleId(null);
    setCustomerId(null);
    setVisitType('scheduled');
    setOdometer('');
    setComplaints('');
    setError(null);
  };
  const close = () => {
    setOpen(false);
    reset();
  };

  const submit = async () => {
    if (!dealershipId) return setError('Choose the dealership');
    if (!vehicleId) return setError('Choose the car, or register it below');
    const km = Number(odometer);
    if (odometer.trim() === '' || !Number.isInteger(km) || km < 0 || km > 2_000_000) return setError('Enter the odometer reading in km');
    setError(null);
    try {
      const visit = await createVisit({
        visitCreate: { dealershipId, vehicleId, customerId: customerId ?? undefined, visitType: visitType as 'scheduled', odometerKm: km, complaints: complaints.trim() || undefined },
      }).unwrap();
      if (canJobCard) {
        const jc = await openJobCard({ id: visit.id }).unwrap();
        toast.success(`${visit.visitNo} checked in, job card ${jc.jobCardNo} opened`);
        navigate(`/service/job-cards/${jc.id}`);
      } else {
        toast.success(`${visit.visitNo} checked in`);
        navigate(`/service/visits/${visit.id}`);
      }
      close();
    } catch (e) {
      toast.error(e);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>+ New service</Button>
      <Dialog
        open={open}
        onClose={close}
        size="lg"
        title="New service: customer arrived"
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button loading={checkingIn || opening} onClick={submit}>
              {canJobCard ? 'Check in and open job card' : 'Check in'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
          {dealerships.length > 1 && (
            <Field label="Dealership" htmlFor="ns-dealership" className="sm:col-span-2">
              <Select
                id="ns-dealership"
                value={dealershipId ?? ''}
                onChange={(e) => {
                  setDealershipId(Number(e.target.value) || null);
                  setVehicleId(null);
                  setCustomerId(null);
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
          <div className="space-y-3 sm:col-span-2">
            <Field label="Car" htmlFor="ns-vehicle" required hint="Search by registration number, chassis number or engine number">
              <VehicleField id="ns-vehicle" value={vehicleId ?? ''} onChange={(v) => setVehicleId(v === '' ? null : v)} />
            </Field>
            {!vehicleId && <RegisterVehicle dealershipId={dealershipId} onRegistered={(r) => { setVehicleId(r.vehicleId); setCustomerId(r.customerId); }} />}
            <CheckInSummary vehicleId={vehicleId} dealershipId={dealershipId} />
          </div>
          <Field label="Visit type" htmlFor="ns-type" required>
            <Select id="ns-type" value={visitType} onChange={(e) => setVisitType(e.target.value)}>
              {VISIT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Odometer now (km)" htmlFor="ns-odo" required>
            <Input id="ns-odo" inputMode="numeric" value={odometer} onChange={(e) => setOdometer(e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label="Customer" htmlFor="ns-customer" className="sm:col-span-2" hint="Leave empty to use the owner on record at this dealership">
            <CustomerField id="ns-customer" value={customerId ?? ''} onChange={(v) => setCustomerId(v === '' ? null : v)} permission="master.customers.view" dealershipId={dealershipId} />
          </Field>
          <Field label="What the customer said" htmlFor="ns-complaints" className="sm:col-span-2">
            <Textarea id="ns-complaints" rows={3} value={complaints} onChange={(e) => setComplaints(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
        </div>
      </Dialog>
    </>
  );
}
