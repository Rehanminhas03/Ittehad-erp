import { describe, expect, it } from 'vitest';
import { addDays, pakistanToday } from '../src/lib/dates';

describe('Pakistan calendar days', () => {
  it('is already the next day after midnight in Pakistan (19:00 UTC onwards)', () => {
    expect(pakistanToday(0, Date.parse('2026-09-27T20:30:00Z'))).toBe('2026-09-28'); // 01:30 in Pakistan
    expect(pakistanToday(0, Date.parse('2026-09-27T18:59:00Z'))).toBe('2026-09-27'); // 23:59 in Pakistan
  });
  it('counts days forward and back, across months', () => {
    expect(pakistanToday(7, Date.parse('2026-09-27T20:30:00Z'))).toBe('2026-10-05');
    expect(pakistanToday(-1, Date.parse('2026-10-01T00:30:00Z'))).toBe('2026-09-30');
    expect(addDays('2026-09-28', -29)).toBe('2026-08-30');
  });
});
