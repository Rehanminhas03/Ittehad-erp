import { describe, expect, it } from 'vitest';
import { activeNavItem } from './Sidebar';

const LINKS = ['/', '/activity', '/sales/leads', '/sales/leads?escalated=true&range=all', '/sales/orders', '/sales/orders?live=true', '/sales/track-record'];

describe('activeNavItem: exactly one menu item is highlighted', () => {
  it('Leads and Duplicate customers are told apart by the filter', () => {
    expect(activeNavItem(LINKS, '/sales/leads', '')).toBe('/sales/leads');
    expect(activeNavItem(LINKS, '/sales/leads', '?range=7d')).toBe('/sales/leads');
    expect(activeNavItem(LINKS, '/sales/leads', '?escalated=true')).toBe('/sales/leads?escalated=true&range=all');
    expect(activeNavItem(LINKS, '/sales/leads', '?range=all&escalated=true')).toBe('/sales/leads?escalated=true&range=all');
    // Another period on Duplicate customers keeps it highlighted.
    expect(activeNavItem(LINKS, '/sales/leads', '?range=7d&escalated=true')).toBe('/sales/leads?escalated=true&range=all');
    expect(activeNavItem(LINKS, '/sales/leads', '?range=all')).toBe('/sales/leads');
  });
  it('a record page keeps its list highlighted; the dashboard only on its own page', () => {
    expect(activeNavItem(LINKS, '/sales/leads/42', '')).toBe('/sales/leads');
    expect(activeNavItem(LINKS, '/sales/orders', '?live=true')).toBe('/sales/orders?live=true');
    expect(activeNavItem(LINKS, '/sales/orders', '?status=approved')).toBe('/sales/orders');
    expect(activeNavItem(LINKS, '/', '')).toBe('/');
    expect(activeNavItem(LINKS, '/sales/track-record', '')).toBe('/sales/track-record');
    expect(activeNavItem(LINKS, '/unknown', '')).toBeNull();
  });
});
