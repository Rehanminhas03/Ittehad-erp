import { useMemo } from 'react';
import type { Me } from '@/features/auth/authApi.generated';
import { useAppSelector } from './store';

export type Dealership = Me['dealerships'][number];
export type Branch = Me['branches'][number];

export interface PermissionApi {
  /** Signed-in user's id (for "own record" checks). */
  userId: number | null;
  /** Holds any of the codes anywhere. */
  can(codes: string | readonly string[]): boolean;
  isGlobal(code: string): boolean;
  /**
   * Mirrors the server's scope rule. `branchId` undefined = entity without a branch concept
   * (a branch-level grant in that dealership covers it); null = dealership-wide row.
   */
  canIn(code: string, dealershipId: number, branchId?: number | null): boolean;
  dealershipsFor(code: string): Dealership[];
  branchesFor(code: string, dealershipId?: number | null): Branch[];
}

/**
 * UI gating only (hiding buttons/links the server would reject anyway).
 * The server is the authority for every permission check.
 */
export function buildPermissionApi(me: Me | null): PermissionApi {
  const perms = new Map((me?.permissions ?? []).map((p) => [p.code, p]));
  const dealerships = me?.dealerships ?? [];
  const branches = me?.branches ?? [];
  const branchDealership = new Map(branches.map((b) => [b.id, b.dealershipId]));

  const canIn: PermissionApi['canIn'] = (code, dealershipId, branchId) => {
    const p = perms.get(code);
    if (!p) return false;
    if (p.global || p.dealershipIds.includes(dealershipId)) return true;
    if (branchId === undefined) return p.branchIds.some((b) => branchDealership.get(b) === dealershipId);
    return branchId !== null && p.branchIds.includes(branchId);
  };

  return {
    userId: me?.user.id ?? null,
    can: (codes) => (typeof codes === 'string' ? [codes] : codes).some((c) => perms.has(c)),
    isGlobal: (code) => !!perms.get(code)?.global,
    canIn,
    dealershipsFor: (code) => dealerships.filter((d) => canIn(code, d.id)),
    branchesFor: (code, dealershipId) =>
      branches.filter((b) => (dealershipId == null || b.dealershipId === dealershipId) && canIn(code, b.dealershipId, b.id)),
  };
}

export function usePermission(): PermissionApi {
  const me = useAppSelector((s) => s.auth.me);
  return useMemo(() => buildPermissionApi(me), [me]);
}
