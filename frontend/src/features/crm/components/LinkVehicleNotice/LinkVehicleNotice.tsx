import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Select } from '@/shared/components/ui';
import { usePermission, useToast } from '@/shared/hooks';
import { useLinkVehicleMutation } from '../../crmApi';
import { P } from '../../permissions';

export interface LinkVehicleNoticeProps {
  /** The exact VIN, engine or registration number that matched. */
  identifier: string;
  /** Preferred dealership to add it to (e.g. the one chosen in the form). */
  dealershipId?: number;
  /** Short description of the matched vehicle, if known. */
  description?: string;
}

/**
 * Shown when a vehicle already exists elsewhere in the group: never re-create it, add it to the
 * user's dealership instead (the vehicle keeps one identity and one history).
 */
export function LinkVehicleNotice({ identifier, dealershipId, description }: LinkVehicleNoticeProps) {
  const perm = usePermission();
  const toast = useToast();
  const navigate = useNavigate();
  const dealerships = perm.dealershipsFor(P.vehiclesCreate);
  const [target, setTarget] = useState(String(dealershipId && dealerships.some((d) => d.id === dealershipId) ? dealershipId : (dealerships[0]?.id ?? '')));
  const [link, { isLoading }] = useLinkVehicleMutation();

  async function onLink() {
    try {
      const v = await link({ vehicleLinkRequest: { dealershipId: Number(target), identifier } }).unwrap();
      toast.success('Vehicle added to your dealership');
      navigate(`/crm/vehicles/${v.id}`);
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <div className="space-y-2">
      <p>
        {description ? <b>{description}</b> : 'This vehicle'} is already registered at another dealership in the group. Add it to your dealership instead
        of creating it again.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {dealerships.length > 1 && (
          <Select value={target} onChange={(e) => setTarget(e.target.value)} className="w-auto py-1 text-xs" aria-label="Dealership">
            {dealerships.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
        <Button size="sm" onClick={onLink} loading={isLoading} disabled={!target}>
          Add to {dealerships.length === 1 ? dealerships[0]!.name : 'dealership'}
        </Button>
      </div>
    </div>
  );
}
