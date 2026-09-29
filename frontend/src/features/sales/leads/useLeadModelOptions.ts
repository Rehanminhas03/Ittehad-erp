import { useVehicleModelOptions } from '@/features/crm';
import { usePermission } from '@/shared/hooks';
import { P } from '../permissions';

const LEAD_ACCESS = [P.leadsCreate, P.leadsViewAll, P.leadsViewOwn, P.leadsViewConverted];

/**
 * The models a lead (or a stock vehicle) can be: only the dealership's own brand (Hyundai Islamabad:
 * Hyundai models). Without a dealership (e.g. editing a lead), the brands of the dealerships where
 * the user holds `access` (default: lead access).
 */
export function useLeadModelOptions(dealershipId?: number | null, access: string[] = LEAD_ACCESS) {
  const perm = usePermission();
  const mine = access.flatMap((c) => perm.dealershipsFor(c));
  const chosen = dealershipId ? mine.filter((d) => d.id === dealershipId) : mine;
  return useVehicleModelOptions(chosen.map((d) => d.brand));
}
