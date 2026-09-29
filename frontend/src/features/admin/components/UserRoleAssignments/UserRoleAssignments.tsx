import { useState } from 'react';
import { Badge, Button, ConfirmDialog, Field, Section, Select } from '@/shared/components/ui';
import { useAuth, usePermission, useToast } from '@/shared/hooks';
import {
  useAssignUserRoleMutation,
  type User,
  useRevokeUserRoleMutation,
  type UserRoleAssignment,
} from '../../adminApi';
import { P } from '../../permissions';
import { AssignableRoleSelect } from '../AssignableRoleSelect';

const scopeLabel = (a: UserRoleAssignment) =>
  a.dealershipId === null ? <Badge tone="blue">All dealerships</Badge> : [a.dealershipName ?? `#${a.dealershipId}`, a.branchName].filter(Boolean).join(' · ');

export function UserRoleAssignments({ user }: { user: User }) {
  const perm = usePermission();
  const { user: me } = useAuth();
  const toast = useToast();
  const isSelf = me?.id === user.id;
  const canAssign = perm.can(P.usersAssignRoles) && !isSelf;
  const [revoke, { isLoading: revoking }] = useRevokeUserRoleMutation();
  const [pending, setPending] = useState<UserRoleAssignment | null>(null);

  const covers = (a: UserRoleAssignment) =>
    a.dealershipId === null ? perm.isGlobal(P.usersAssignRoles) : perm.canIn(P.usersAssignRoles, a.dealershipId, a.branchId);

  return (
    <Section title="Roles">
      {isSelf && <p className="mb-2 text-xs text-slate-500">You cannot change your own role assignments.</p>}
      {user.roles.length === 0 ? (
        <p className="text-sm text-slate-500">No roles in your scope.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {user.roles.map((a) => (
            <li key={a.id} className="flex items-center justify-between py-2 text-sm">
              <span>
                <span className="font-medium text-slate-800">{a.roleName}</span>
                <span className="ml-2 text-slate-500">{scopeLabel(a)}</span>
              </span>
              {canAssign && covers(a) && (
                <Button size="sm" variant="ghost" onClick={() => setPending(a)}>
                  Revoke
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canAssign && <AssignRoleForm userId={user.id} />}
      <ConfirmDialog
        open={!!pending}
        title="Revoke role"
        message={pending && <>Remove <b>{pending.roleName}</b> from {user.fullName}? It takes effect on their next request.</>}
        confirmLabel="Revoke"
        danger
        loading={revoking}
        onClose={() => setPending(null)}
        onConfirm={async () => {
          try {
            await revoke({ id: user.id, assignmentId: pending!.id }).unwrap();
            toast.success('Role revoked');
            setPending(null);
          } catch (e) {
            toast.error(e);
          }
        }}
      />
    </Section>
  );
}

function AssignRoleForm({ userId }: { userId: number }) {
  const perm = usePermission();
  const toast = useToast();
  const [assign, { isLoading }] = useAssignUserRoleMutation();
  const [roleId, setRoleId] = useState('');
  const [dealershipId, setDealershipId] = useState('');
  const [branchId, setBranchId] = useState('');
  const global = perm.isGlobal(P.usersAssignRoles);
  const dealerships = perm.dealershipsFor(P.usersAssignRoles);
  const branches = dealershipId ? perm.branchesFor(P.usersAssignRoles, Number(dealershipId)) : [];

  async function onAssign() {
    try {
      await assign({
        id: userId,
        roleAssignmentInput: {
          roleId: Number(roleId),
          dealershipId: dealershipId ? Number(dealershipId) : null,
          branchId: branchId ? Number(branchId) : null,
        },
      }).unwrap();
      toast.success('Role assigned');
      setRoleId('');
      setBranchId('');
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <div className="mt-4 grid grid-cols-1 items-end gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4">
      <Field label="Role" htmlFor="as-role">
        <AssignableRoleSelect id="as-role" value={roleId} onChange={setRoleId} dealershipId={dealershipId ? Number(dealershipId) : null} />
      </Field>
      <Field label="Dealership" htmlFor="as-dealership">
        <Select
          id="as-dealership"
          value={dealershipId}
          onChange={(e) => {
            setDealershipId(e.target.value);
            setBranchId('');
          }}
        >
          {global ? <option value="">All dealerships</option> : <option value="">Select…</option>}
          {dealerships.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Branch" htmlFor="as-branch">
        <Select id="as-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} disabled={!dealershipId}>
          <option value="">Whole dealership</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button onClick={onAssign} loading={isLoading} disabled={!roleId || (!global && !dealershipId)}>
        Assign role
      </Button>
    </div>
  );
}
