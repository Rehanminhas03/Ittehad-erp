/**
 * Which optional business modules the API serves. While the Sales & Delivery rollout is completed,
 * Service, Parts and Accounts are switched off, as in the UI (frontend/src/shared/config/modules.ts):
 * their routes are not mounted. Their code, tables, permissions and event handlers stay (a delivered
 * car still gets its free-service schedule), so set a module to `true` to serve it again.
 * Core, customers & vehicles, Sales and the dashboards are always served; tests serve every module.
 */
export const API_MODULES = {
  service: false,
  parts: false,
  accounts: false,
} as const;
