/**
 * Permission catalog. Modules declare the permission codes their endpoints check;
 * `npm run db:migrate` syncs the catalog into core.permission. Which roles hold which
 * permissions is data (core.role_permission), editable at runtime by an admin.
 *
 * Naming: `<module>.<resource>.<action>`, e.g. `sales.orders.view_all` / `sales.orders.view_own`.
 */
export interface PermissionDef {
  code: string;
  module: string;
  description: string;
}

const catalog = new Map<string, PermissionDef>();

const CODE_RE = /^[a-z][a-z_]*\.[a-z][a-z_]*\.[a-z][a-z_]*$/;

export function definePermissions<const T extends Record<string, readonly [code: string, description: string]>>(
  module: string,
  defs: T,
): { readonly [K in keyof T]: T[K][0] } {
  const out: Record<string, string> = {};
  for (const [key, [code, description]] of Object.entries(defs)) {
    if (!CODE_RE.test(code) || !code.startsWith(`${module}.`)) {
      throw new Error(`Invalid permission code "${code}" for module "${module}"`);
    }
    if (catalog.has(code)) throw new Error(`Duplicate permission code "${code}"`);
    catalog.set(code, { code, module, description });
    out[key] = code;
  }
  return out as { readonly [K in keyof T]: T[K][0] };
}

export function permissionCatalog(): PermissionDef[] {
  return [...catalog.values()].sort((a, b) => a.code.localeCompare(b.code));
}

export function isKnownPermission(code: string): boolean {
  return catalog.has(code);
}

/** Glob match used by seed role templates: `*` matches any run of characters. */
export function matchesPattern(code: string, pattern: string): boolean {
  const re = new RegExp(`^${pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
  return re.test(code);
}
