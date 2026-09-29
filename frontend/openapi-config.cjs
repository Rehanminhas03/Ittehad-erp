// Generates typed RTK Query endpoints from the backend's OpenAPI schema.
// Run `npm run api:sync` after changing backend routes (re-exports openapi.json, then regenerates).
// Each feature gets its own generated file, injected into the shared baseApi; the hand-written
// `<feature>Api.ts` next to it re-exports the hooks and adds cache tweaks.
const byPrefix = (...prefixes) => (_name, def) => prefixes.some((p) => def.path.startsWith(p));

/** @type {import('@rtk-query/codegen-openapi').ConfigFile} */
module.exports = {
  schemaFile: './openapi.json',
  apiFile: './src/shared/api/baseApi.ts',
  apiImport: 'baseApi',
  hooks: { queries: true, lazyQueries: true, mutations: true },
  // OpenAPI tags are per entity (Dealership, Branch, User...): list/get provide them, mutations invalidate them.
  tag: true,
  outputFiles: {
    './src/features/auth/authApi.generated.ts': { filterEndpoints: byPrefix('/api/auth') },
    './src/features/admin/adminApi.generated.ts': { filterEndpoints: byPrefix('/api/core') },
    './src/features/crm/crmApi.generated.ts': { filterEndpoints: byPrefix('/api/master') },
    './src/features/sales/salesApi.generated.ts': { filterEndpoints: byPrefix('/api/sales') },
    './src/features/service/serviceApi.generated.ts': { filterEndpoints: byPrefix('/api/service') },
    './src/features/parts/partsApi.generated.ts': { filterEndpoints: byPrefix('/api/parts') },
    './src/features/accounts/accountsApi.generated.ts': { filterEndpoints: byPrefix('/api/accounts') },
    './src/features/reports/reportsApi.generated.ts': { filterEndpoints: byPrefix('/api/reports') },
    './src/features/notifications/notificationsApi.generated.ts': { filterEndpoints: byPrefix('/api/notifications') },
  },
};
