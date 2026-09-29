import { describe, expect, it } from 'vitest';
import { formatValue } from './format';
import { presetRange } from './period';

describe('dashboard helpers', () => {
  it('formats values by their declared format', () => {
    expect(formatValue('12.345', 'percent')).toBe('12.3%');
    expect(formatValue('5', 'hours')).toBe('5.0 h');
    expect(formatValue(1234, 'number')).toMatch(/1,234/);
    expect(formatValue('9400000.00', 'money')).toMatch(/9,400,000/);
    expect(formatValue(null, 'percent')).toBe('—');
  });

  it('resolves period presets on the local calendar', () => {
    const d = new Date(2026, 8, 23); // 23 Sep 2026
    expect(presetRange('this_month', d)).toEqual({ from: '2026-09-01', to: '2026-09-23' });
    expect(presetRange('last_month', d)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(presetRange('this_year', d)).toEqual({ from: '2026-01-01', to: '2026-09-23' });
    expect(presetRange('last_90', d)).toEqual({ from: '2026-06-26', to: '2026-09-23' });
  });
});
