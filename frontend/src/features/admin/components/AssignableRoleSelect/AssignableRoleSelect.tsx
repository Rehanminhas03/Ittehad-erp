import { Select } from '@/shared/components/ui';
import { usePermission } from '@/shared/hooks';
import { useListAssignableRolesQuery } from '../../adminApi';
import { P } from '../../permissions';

/**
 * Role picker listing only the roles the signed-in user may grant at the dealership (the server
 * decides: e.g. a Sales Manager gets the sales staff roles). Without a dealership it lists the roles
 * grantable globally; a single-dealership user always gets their own dealership.
 */
export function AssignableRoleSelect({
  id,
  value,
  onChange,
  dealershipId,
  invalid,
}: {
  id: string;
  value: unknown;
  onChange: (value: string) => void;
  dealershipId?: number | null;
  invalid?: boolean;
}) {
  const perm = usePermission();
  const own = perm.dealershipsFor(P.usersAssignRoles);
  const scope = dealershipId ?? (!perm.isGlobal(P.usersAssignRoles) && own.length === 1 ? own[0]!.id : undefined);
  const { data: roles, isFetching } = useListAssignableRolesQuery({ dealershipId: scope });

  return (
    <Select id={id} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} invalid={invalid} disabled={isFetching}>
      <option value="">{isFetching ? 'Loading roles…' : roles && !roles.length ? 'No roles you can assign here' : 'Select role…'}</option>
      {roles?.map((r) => (
        <option key={r.id} value={r.id} title={r.description ?? undefined}>
          {r.name}
        </option>
      ))}
    </Select>
  );
}
