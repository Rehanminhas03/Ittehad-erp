import { useListSuppliersQuery } from '../partsApi';

/** Active suppliers as select options, optionally for one dealership. */
export function useSupplierOptions(dealershipId?: number | null) {
  const { data } = useListSuppliersQuery({ pageSize: 100, isActive: 'true', ...(dealershipId ? { dealershipId } : {}) });
  return (data?.items ?? []).map((s) => ({ value: String(s.id), label: `${s.name} (${s.code})` }));
}
