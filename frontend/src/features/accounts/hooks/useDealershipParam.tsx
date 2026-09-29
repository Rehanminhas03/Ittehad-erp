import { useSearchParams } from 'react-router';
import { Select } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';

/**
 * The dealership a report is for, kept in the URL (`?dealershipId=`), defaulting to the first
 * dealership where the user holds `permission`. Returns the id and a ready-made picker.
 */
export function useDealershipParam(permission: string) {
  const perm = usePermission();
  const [params, setParams] = useSearchParams();
  const options = perm.dealershipsFor(permission);
  const fromUrl = Number(params.get('dealershipId'));
  const dealershipId = options.some((d) => d.id === fromUrl) ? fromUrl : (options[0]?.id ?? null);
  const picker =
    options.length > 1 ? (
      <Select
        value={dealershipId ?? ''}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          next.set('dealershipId', e.target.value);
          next.delete('page');
          setParams(next, { replace: true });
        }}
        className="w-auto"
        aria-label="Dealership"
      >
        {options.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
    ) : null;
  return { dealershipId, picker, dealerships: options };
}
