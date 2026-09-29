import { useEffect, useMemo, useState } from 'react';
import { meRefreshed } from '@/features/auth/authSlice';
import { useLazyGetMeQuery } from '@/features/auth/authApi.generated';
import { Button, Section, Spinner } from '@/shared/components/ui';
import { useAppDispatch, usePermission, useToast } from '@/shared/hooks';
import { humanize } from '@/shared/lib';
import {
  type Permission,
  useGetRolePermissionsQuery,
  useListPermissionsQuery,
  useSetRolePermissionsMutation,
} from '../../adminApi';
import { P } from '../../permissions';

/** Groups `module.resource.action` codes as module -> resource -> permissions. */
function group(perms: Permission[]) {
  const out = new Map<string, Map<string, Permission[]>>();
  for (const p of perms) {
    const [, resource = ''] = p.code.split('.');
    const byResource = out.get(p.module) ?? new Map<string, Permission[]>();
    byResource.set(resource, [...(byResource.get(resource) ?? []), p]);
    out.set(p.module, byResource);
  }
  return out;
}

/** Runtime-editable role -> permission mapping (global `core.roles.manage` required to save). */
export function RolePermissionMatrix({ roleId }: { roleId: number }) {
  const perm = usePermission();
  const toast = useToast();
  const dispatch = useAppDispatch();
  const editable = perm.isGlobal(P.rolesManage);
  const { data: catalog, isLoading: loadingCatalog } = useListPermissionsQuery({});
  const { data: current, isLoading: loadingRole } = useGetRolePermissionsQuery({ id: roleId });
  const [save, { isLoading: saving }] = useSetRolePermissionsMutation();
  const [refetchMe] = useLazyGetMeQuery();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (current) setSelected(new Set(current.permissionCodes));
  }, [current]);

  const grouped = useMemo(() => group(catalog ?? []), [catalog]);
  const dirty = !!current && (current.permissionCodes.length !== selected.size || current.permissionCodes.some((c) => !selected.has(c)));

  const toggle = (codes: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of codes) (on ? next.add(c) : next.delete(c));
      return next;
    });

  async function onSave() {
    try {
      await save({ id: roleId, rolePermissionsUpdate: { permissionCodes: [...selected] } }).unwrap();
      toast.success('Permissions updated. They apply on the next request.');
      // The editor's own effective permissions may have changed.
      const me = await refetchMe().unwrap();
      dispatch(meRefreshed(me));
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <Section
      title="Permissions"
      actions={
        editable && (
          <div className="flex gap-2">
            {dirty && (
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(current!.permissionCodes))}>
                Discard
              </Button>
            )}
            <Button size="sm" disabled={!dirty} loading={saving} onClick={onSave}>
              Save permissions
            </Button>
          </div>
        )
      }
    >
      {loadingCatalog || loadingRole ? (
        <Spinner className="size-4 text-slate-400" />
      ) : (
        <div className="space-y-6">
          {!editable && <p className="text-xs text-slate-500">Read-only: editing roles requires a global role-management grant.</p>}
          {[...grouped].map(([module, resources]) => (
            <div key={module}>
              <h3 className="mb-1 text-sm font-semibold text-slate-800">{humanize(module)}</h3>
              <div className="divide-y divide-slate-100">
                {[...resources].map(([resource, perms]) => {
                  const codes = perms.map((p) => p.code);
                  const all = codes.every((c) => selected.has(c));
                  return (
                    <div key={resource} className="grid grid-cols-1 gap-2 py-2 sm:grid-cols-[12rem_1fr]">
                      <label className="flex items-center gap-2 text-sm text-slate-600">
                        <input type="checkbox" disabled={!editable} checked={all} onChange={(e) => toggle(codes, e.target.checked)} className="size-4 rounded border-slate-300" />
                        {humanize(resource)}
                      </label>
                      <div className="flex flex-wrap gap-x-5 gap-y-1">
                        {perms.map((p) => (
                          <label key={p.code} className="flex items-center gap-1.5 text-sm text-slate-700" title={p.description}>
                            <input
                              type="checkbox"
                              disabled={!editable}
                              checked={selected.has(p.code)}
                              onChange={(e) => toggle([p.code], e.target.checked)}
                              className="size-4 rounded border-slate-300"
                            />
                            {humanize(p.code.split('.')[2] ?? p.code)}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
