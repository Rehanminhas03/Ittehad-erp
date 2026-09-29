import { usePermission } from '@/shared/hooks';
import { P } from '../permissions';
import { useGetSalesActionItemsQuery } from '../salesApi';

const SALES_VIEWERS = [P.leadsViewAll, P.leadsViewOwn, P.leadsViewConverted, P.ordersViewAll, P.ordersViewOwn, P.stockView, P.deliveriesViewAll, P.deliveriesViewOwn];

/**
 * What is waiting for the signed-in person ("Action needed"), urgent first. Refreshed every minute
 * and after every change to leads, orders, deliveries or stock; empty for users outside Sales.
 */
export function useActionItems() {
  const perm = usePermission();
  const enabled = perm.can(SALES_VIEWERS);
  const { data } = useGetSalesActionItemsQuery(undefined, { skip: !enabled, pollingInterval: 60_000, refetchOnFocus: true });
  const items = [...(data ?? [])].sort((a, b) => Number(b.urgent) - Number(a.urgent));
  return { items, total: items.reduce((n, i) => n + i.count, 0), urgent: items.some((i) => i.urgent) };
}
