import { describe, expect, it } from 'vitest';
import { sourceLink } from '../permissions';
import { amountOrBlank, drCr } from './format';

describe('accounts format helpers', () => {
  it('shows balances with Dr / Cr and blanks zero amounts', () => {
    expect(drCr('36000.00')).toMatch(/36,000.*Dr$/);
    expect(drCr('-9000000.00')).toMatch(/9,000,000.*Cr$/);
    expect(drCr('0.00')).not.toMatch(/Dr|Cr/);
    expect(amountOrBlank('0.00')).toBe('');
    expect(amountOrBlank('1250.50')).toMatch(/1,250\.5/);
  });

  it('links journal sources to their documents', () => {
    expect(sourceLink('job_card', 7)).toBe('/service/job-cards/7');
    expect(sourceLink('goods_receipt', 3)).toBe('/parts/goods-receipts/3');
    expect(sourceLink('opening_stock', 0)).toBeNull();
    expect(sourceLink(null, 5)).toBeNull();
  });
});
