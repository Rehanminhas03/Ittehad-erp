import { useListPartVehicleModelsQuery } from '../partsApi';

/** The vehicle models of a brand as select options ("Jetour X70 Plus"...), from the store's own endpoint (no master-data permission needed). */
export function usePartModelOptions(brand?: string) {
  const { data } = useListPartVehicleModelsQuery({ brand: brand || undefined }, { skip: !brand });
  return (data ?? []).map((m) => ({ value: String(m.id), label: `${m.brand} ${m.name}` }));
}
