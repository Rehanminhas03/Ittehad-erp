import type { ReactNode } from 'react';
import { Route } from 'react-router';
import { RequirePermission } from '@/features/auth';
import { EntityDetailView, EntityFormView, EntityListView } from '@/shared/components';
import type { EntityViewConfig } from '@/shared/entity';

/**
 * Standard routes for a config-driven entity, relative to the module's route:
 *   <path>            list
 *   <path>/new        create   (if form + create permission)
 *   <path>/:id        detail
 *   <path>/:id/edit   edit     (if form + update permission)
 * Pass `overrides` to swap in a custom screen for any of them.
 */
export function entityRoutes<T extends { id: number }>(
  path: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config: EntityViewConfig<T> | EntityViewConfig<any>,
  overrides: Partial<Record<'list' | 'detail' | 'create' | 'edit', ReactNode>> = {},
) {
  const view = config.permissions.view;
  const guard = (codes: readonly string[], el: ReactNode) => <RequirePermission any={codes}>{el}</RequirePermission>;
  return (
    <>
      <Route path={path} element={guard(view, overrides.list ?? <EntityListView config={config} />)} />
      {config.form && config.permissions.create && (
        <Route path={`${path}/new`} element={guard([config.permissions.create], overrides.create ?? <EntityFormView config={config} mode="create" />)} />
      )}
      <Route path={`${path}/:id`} element={guard(view, overrides.detail ?? <EntityDetailView config={config} />)} />
      {config.form && config.permissions.update && (
        <Route path={`${path}/:id/edit`} element={guard(config.permissions.update, overrides.edit ?? <EntityFormView config={config} mode="edit" />)} />
      )}
    </>
  );
}
