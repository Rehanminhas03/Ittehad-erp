import { describe, expect, it } from 'vitest';
import type { Me } from '@/features/auth/authApi.generated';
import { buildPermissionApi } from './usePermission';

const me: Me = {
  user: { id: 1, email: 'a@b.c', fullName: 'A', phone: null },
  dealerships: [
    { id: 1, code: 'HYD', name: 'Hyundai Islamabad', brand: 'Hyundai' },
    { id: 2, code: 'JET', name: 'Jetour Ittehad', brand: 'Jetour' },
  ],
  branches: [
    { id: 10, dealershipId: 1, code: 'MAIN', name: 'Hyundai Main' },
    { id: 20, dealershipId: 2, code: 'MAIN', name: 'Jetour Main' },
    { id: 21, dealershipId: 2, code: 'B2', name: 'Jetour B2' },
  ],
  permissions: [
    { code: 'core.users.view', global: true, dealershipIds: [], branchIds: [] },
    { code: 'core.branches.view', global: false, dealershipIds: [1], branchIds: [] },
    { code: 'core.branches.update', global: false, dealershipIds: [], branchIds: [21] },
  ],
};

describe('buildPermissionApi (mirrors server scope rules)', () => {
  const p = buildPermissionApi(me);

  it('can() is any-of', () => {
    expect(p.can('core.users.view')).toBe(true);
    expect(p.can(['core.roles.view', 'core.branches.view'])).toBe(true);
    expect(p.can('core.roles.view')).toBe(false);
  });

  it('global grants cover every dealership', () => {
    expect(p.isGlobal('core.users.view')).toBe(true);
    expect(p.canIn('core.users.view', 2)).toBe(true);
  });

  it('dealership grants cover only that dealership', () => {
    expect(p.canIn('core.branches.view', 1, 10)).toBe(true);
    expect(p.canIn('core.branches.view', 2, 20)).toBe(false);
  });

  it('branch grants cover only that branch, or branch-less entities in its dealership', () => {
    expect(p.canIn('core.branches.update', 2, 21)).toBe(true);
    expect(p.canIn('core.branches.update', 2, 20)).toBe(false);
    expect(p.canIn('core.branches.update', 2, null)).toBe(false);
    expect(p.canIn('core.branches.update', 2)).toBe(true);
    expect(p.canIn('core.branches.update', 1)).toBe(false);
  });

  it('lists reachable dealerships and branches per permission', () => {
    expect(p.dealershipsFor('core.branches.view').map((d) => d.id)).toEqual([1]);
    expect(p.dealershipsFor('core.branches.update').map((d) => d.id)).toEqual([2]);
    expect(p.branchesFor('core.branches.update').map((b) => b.id)).toEqual([21]);
    expect(p.branchesFor('core.users.view', 2).map((b) => b.id)).toEqual([20, 21]);
  });

  it('anonymous users can do nothing', () => {
    const anon = buildPermissionApi(null);
    expect(anon.can('core.users.view')).toBe(false);
    expect(anon.dealershipsFor('core.users.view')).toEqual([]);
  });
});
