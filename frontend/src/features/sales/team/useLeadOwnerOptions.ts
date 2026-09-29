import { usePermission } from '@/shared/hooks';
import { P } from '../permissions';
import { useListSalesTeamMembersQuery } from '../salesApi';

/**
 * "Salesperson" on a new lead (team leaders only): the staff who work their own leads (Salesperson,
 * CRO). Leaving it empty keeps the lead for yourself.
 */
export function useLeadOwnerOptions() {
  const perm = usePermission();
  const dealershipId = perm.dealershipsFor(P.leadsViewAll)[0]?.id;
  const { data } = useListSalesTeamMembersQuery({ dealershipId: dealershipId ?? 0 }, { skip: !dealershipId });
  return (data ?? []).filter((m) => m.takesLeads && m.id !== perm.userId).map((m) => ({ value: String(m.id), label: m.fullName }));
}
