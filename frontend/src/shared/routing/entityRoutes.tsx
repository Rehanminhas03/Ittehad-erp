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
  // Keyed by entity: moving between two entities' pages (e.g. Quotations → PPF vouchers) mounts a fresh
  // view. Without it React reuses the previous one, whose data hook still belongs to the other entity.
  const key = config.basePath;
  return (
    <>
      <Route path={path} element={guard(view, overrides.list ?? <EntityListView key={key} config={config} />)} />
      {config.form && config.permissions.create && (
        <Route path={`${path}/new`} element={guard([config.permissions.create], overrides.create ?? <EntityFormView key={`${key}/new`} config={config} mode="create" />)} />
      )}
      <Route path={`${path}/:id`} element={guard(view, overrides.detail ?? <EntityDetailView key={key} config={config} />)} />
      {config.form && config.permissions.update && (
        <Route path={`${path}/:id/edit`} element={guard(config.permissions.update, overrides.edit ?? <EntityFormView key={`${key}/edit`} config={config} mode="edit" />)} />
      )}
    </>
  );
}
