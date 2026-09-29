import { useListVehicleModelsQuery } from '../crmApi';

/**
 * Active vehicle models as select options ("Hyundai Tucson"); cached, so safe to use in many forms.
 * `brands` keeps only those brands (e.g. a Hyundai dealership's forms show Hyundai models only).
 */
export function useVehicleModelOptions(brands?: string[]) {
  const { data } = useListVehicleModelsQuery({ pageSize: 100, isActive: 'true', sort: 'brand' });
  const keep = brands && new Set(brands.map((b) => b.toLowerCase()));
  return (data?.items ?? [])
    .filter((m) => !keep || keep.has(m.brand.toLowerCase()))
    .map((m) => ({ value: String(m.id), label: `${m.brand} ${m.name}` }));
}
