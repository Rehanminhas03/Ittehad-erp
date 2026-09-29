import { describe, expect, it } from 'vitest';
import { describeActivity } from './describe';

const e = (entityType: string, action: string, extra: Partial<{ entityLabel: string | null; changes: unknown; entityId: string }> = {}) => ({
  entityType,
  action,
  entityId: extra.entityId ?? '7',
  entityLabel: extra.entityLabel ?? null,
  changes: extra.changes ?? null,
});

describe('describeActivity', () => {
  it('describes sign-ins and problems', () => {
    expect(describeActivity(e('core.user', 'login'))).toMatchObject({ title: 'Signed in', kind: 'sign_in' });
    expect(describeActivity(e('core.user', 'logout'))).toMatchObject({ title: 'Signed out' });
    expect(describeActivity(e('core.user', 'login.failed'))).toMatchObject({ title: 'Failed sign-in attempt', kind: 'sign_in_problem' });
    expect(describeActivity(e('core.user', 'login.blocked'))).toMatchObject({ kind: 'sign_in_problem' });
  });

  it('describes lead work with the customer name and a link', () => {
    expect(describeActivity(e('sales.lead', 'create', { entityLabel: 'Ayesha Khan' }))).toMatchObject({ title: 'Logged lead Ayesha Khan', href: '/sales/leads/7' });
    expect(describeActivity(e('sales.lead', 'follow_up', { entityLabel: 'Ayesha Khan', changes: { outcome: 'interested', remarks: 'Test drive' } }))).toMatchObject({
      title: 'Recorded a follow-up on Ayesha Khan',
      detail: 'Interested · “Test drive”',
    });
    expect(describeActivity(e('sales.lead', 'transition:convert', { entityLabel: 'Ayesha Khan' })).title).toBe('Converted Ayesha Khan');
  });

  it('describes staff management by the manager', () => {
    expect(describeActivity(e('core.user', 'update', { entityLabel: 'Ali', changes: { isActive: { from: true, to: false } } })).title).toBe('Deactivated Ali');
    expect(describeActivity(e('core.user', 'update', { entityLabel: 'Ali', changes: { password: 'reset' } })).title).toBe('Reset the password of Ali');
    expect(describeActivity(e('core.user', 'role.assign', { entityLabel: 'Ali', changes: { roleName: 'Salesperson' } }))).toMatchObject({ title: 'Gave Ali a role', detail: 'Salesperson' });
  });

  it('describes quotations and PPF forms: issued, sold and corrected', () => {
    expect(describeActivity(e('sales.quotation', 'create', { entityId: '7', entityLabel: 'HYD-QT-2026-00001', changes: { totalAmount: '9350000.00' } }))).toMatchObject({
      title: 'Issued vehicle quotation HYD-QT-2026-00001',
      detail: 'PKR 9,350,000',
      kind: 'document',
      href: '/sales/quotations/7',
    });
    expect(describeActivity(e('sales.ppf_form', 'create', { entityId: '3', entityLabel: 'HYD-PF-2026-00001', changes: { totalAmount: '330000.00' } }))).toMatchObject({
      title: 'Sold PPF — voucher HYD-PF-2026-00001',
      href: '/sales/ppf-forms/3',
    });
    expect(
      describeActivity(e('sales.ppf_form', 'update', { entityLabel: 'HYD-PF-2026-00001', changes: { amount: { from: '100000.00', to: '150000' }, totalAmount: { from: '100000.00', to: '150000.00' } } })),
    ).toMatchObject({ title: 'Corrected PPF voucher HYD-PF-2026-00001', detail: 'amount · now PKR 150,000' });
  });

  it('falls back to something readable for anything unknown', () => {
    expect(describeActivity(e('service.visit', 'create', { entityLabel: 'V-1' })).title).toBe('Create visit V-1');
  });
});
