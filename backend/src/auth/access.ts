import { type SQL, and, eq, inArray, or, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { TenantContext } from '../db/client';

/** One role assignment's reach for a permission. dealershipId null => global. */
export interface Grant {
  dealershipId: number | null;
  branchId: number | null;
}

export interface Scope {
  global: boolean;
  /** Dealerships reachable at dealership level. */
  dealershipIds: number[];
  /** Branch-level grants (with their dealership). */
  branches: { branchId: number; dealershipId: number }[];
}

/**
 * Target of a write. `branchId: undefined` means the entity has no branch concept, so a
 * branch-level grant in the same dealership covers it; `null` means the entity is branch-aware
 * but this row is dealership-wide, which only a dealership-level (or global) grant covers.
 */
export interface ScopeTarget {
  dealershipId: number;
  branchId?: number | null;
}

export interface AuthUser {
  id: number;
  email: string;
  fullName: string;
}

export class Access {
  constructor(
    readonly user: AuthUser,
    private readonly grants: ReadonlyMap<string, readonly Grant[]>,
  ) {}

  get userId(): number {
    return this.user.id;
  }

  permissionCodes(): string[] {
    return [...this.grants.keys()].sort();
  }

  grantsFor(code: string): readonly Grant[] {
    return this.grants.get(code) ?? [];
  }

  has(code: string): boolean {
    return this.grantsFor(code).length > 0;
  }

  hasAny(codes: readonly string[]): boolean {
    return codes.some((c) => this.has(c));
  }

  hasGlobal(code: string): boolean {
    return this.grantsFor(code).some((g) => g.dealershipId === null);
  }

  /** Union of the reach of every listed permission. */
  scope(...codes: string[]): Scope {
    const dealerships = new Set<number>();
    const branches = new Map<number, number>();
    for (const code of codes) {
      for (const g of this.grantsFor(code)) {
        if (g.dealershipId === null) return { global: true, dealershipIds: [], branches: [] };
        if (g.branchId === null) dealerships.add(g.dealershipId);
        else branches.set(g.branchId, g.dealershipId);
      }
    }
    return {
      global: false,
      dealershipIds: [...dealerships],
      branches: [...branches].map(([branchId, dealershipId]) => ({ branchId, dealershipId })),
    };
  }

  canIn(code: string, target: ScopeTarget): boolean {
    return this.grantsFor(code).some((g) => {
      if (g.dealershipId === null) return true;
      if (g.dealershipId !== target.dealershipId) return false;
      if (g.branchId === null) return true;
      if (target.branchId === undefined) return true;
      return g.branchId === target.branchId;
    });
  }

  /** RLS settings: every dealership reachable through any grant. */
  tenantContext(): TenantContext {
    const ids = new Set<number>();
    for (const grants of this.grants.values()) {
      for (const g of grants) {
        if (g.dealershipId === null) return { userId: this.userId, dealershipIds: 'all' };
        ids.add(g.dealershipId);
      }
    }
    return { userId: this.userId, dealershipIds: [...ids] };
  }
}

export interface ScopeColumns {
  dealership: AnyPgColumn;
  branch?: AnyPgColumn;
}

/** Translate a Scope into a WHERE condition over a table's tenant columns. */
export function scopeWhere(scope: Scope, cols: ScopeColumns): SQL {
  if (scope.global) return sql`true`;
  const parts: SQL[] = [];
  if (scope.dealershipIds.length) parts.push(inArray(cols.dealership, scope.dealershipIds));
  if (scope.branches.length) {
    if (cols.branch) {
      parts.push(inArray(cols.branch, scope.branches.map((b) => b.branchId)));
    } else {
      parts.push(inArray(cols.dealership, [...new Set(scope.branches.map((b) => b.dealershipId))]));
    }
  }
  if (!parts.length) return sql`false`;
  return parts.length === 1 ? parts[0]! : or(...parts)!;
}

/**
 * View condition for an owned entity: everything in `all` scope, plus own rows in `own` scope.
 */
export function viewWhere(
  access: Access,
  cols: ScopeColumns,
  perms: { view: string; viewOwn?: string },
  owner?: AnyPgColumn,
): SQL {
  const all = scopeWhere(access.scope(perms.view), cols);
  if (!perms.viewOwn || !owner) return all;
  const own = scopeWhere(access.scope(perms.viewOwn), cols);
  return or(all, and(own, eq(owner, access.userId)))!;
}
