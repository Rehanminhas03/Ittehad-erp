import { usePermission } from '@/shared/hooks';
import { P } from '../permissions';
import { useListSalesTeamMembersQuery } from '../salesApi';

/** Who sees the whole team (and so gets a salesperson filter). */
export const TEAM_VIEW = [P.leadsViewAll, P.leadsViewConverted, P.ordersViewAll, P.reportsView] as const;

/**
 * People for a "Salesperson" filter: the Sales Manager can pick anyone in the sales team; the
 * Assistant Manager / Sales Admin only the Salespersons (not CROs or managers).
 */
export function useSalespersonOptions() {
  const perm = usePermission();
  // Only those allowed to list the team (not e.g. the Delivery Team, who sees orders but not people).
  const dealershipId = [P.leadsViewAll, P.reportsView, P.quotationsViewAll, P.ppfViewAll].flatMap((c) => perm.dealershipsFor(c))[0]?.id;
  const { data } = useListSalesTeamMembersQuery({ dealershipId: dealershipId ?? 0 }, { skip: !dealershipId });
  const everyone = perm.can([P.reportsView]);
  return (data ?? []).filter((m) => everyone || m.sellsCars).map((m) => ({ value: String(m.id), label: m.fullName }));
}
