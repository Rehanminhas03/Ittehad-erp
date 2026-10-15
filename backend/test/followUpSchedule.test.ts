import { describe, expect, it } from 'vitest';
import { nextFollowUpAfter } from '../src/modules/sales/models';

describe('follow-up schedule', () => {
  it('is due on day 2, day 5 and about day 11, then complete', () => {
    const logged = '2026-10-13';
    const first = nextFollowUpAfter(0, logged);
    expect(first).toBe('2026-10-15');
    // The second is 3 days after the first call, the third 6 days after the second.
    expect(nextFollowUpAfter(1, first!)).toBe('2026-10-18');
    expect(nextFollowUpAfter(2, '2026-10-18')).toBe('2026-10-24');
    expect(nextFollowUpAfter(3, '2026-10-24')).toBeNull();
  });
});
