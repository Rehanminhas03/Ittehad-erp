/**
 * Which business modules the UI shows. While the Sales & Delivery rollout is completed, Service,
 * Parts and Accounts are hidden (menu, pages, dashboard cards and cross-module panels). Their code
 * and API are unchanged: set a module to `true` to bring it back.
 */
export const MODULES = {
  sales: true,
  crm: true,
  admin: true,
  service: false,
  parts: false,
  accounts: false,
} as const;

export type ModuleKey = keyof typeof MODULES;

export const isModuleEnabled = (m: ModuleKey): boolean => MODULES[m];
