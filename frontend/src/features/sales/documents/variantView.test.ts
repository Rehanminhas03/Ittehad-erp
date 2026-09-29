import { describe, expect, it } from 'vitest';
import { parseVariantRows } from './variantView';

describe('parseVariantRows (paste from Excel)', () => {
  it('reads tab-separated Code / Description rows and skips the header', () => {
    const text = 'Code\tDescription\nNX4FL16THAW\tTUCSON HEV 1598CC 6A/T AWD SIGNATURE\r\nhr26s7fd\tPorter H100 2607cc Diesel S7 FD\n\n';
    expect(parseVariantRows(text)).toEqual([
      { code: 'NX4FL16THAW', description: 'TUCSON HEV 1598CC 6A/T AWD SIGNATURE' },
      { code: 'HR26S7FD', description: 'Porter H100 2607cc Diesel S7 FD' },
    ]);
  });
  it('accepts a code followed by spaces, and ignores rows without a description', () => {
    expect(parseVariantRows('DN8FLN25T   SONATA N LINE 2497CC\nLONELYCODE')).toEqual([{ code: 'DN8FLN25T', description: 'SONATA N LINE 2497CC' }]);
  });
});
