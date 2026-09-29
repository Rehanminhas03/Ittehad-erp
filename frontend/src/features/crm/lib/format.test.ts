import { describe, expect, it } from 'vitest';
import { formatCnic, prefillFromQuery } from './format';

describe('crm format helpers', () => {
  it('formats a 13-digit CNIC and leaves other values alone', () => {
    expect(formatCnic('3520212345671')).toBe('35202-1234567-1');
    expect(formatCnic(null)).toBe('—');
    expect(formatCnic('abc')).toBe('abc');
  });

  it('guesses which create form a search string belongs to', () => {
    expect(prefillFromQuery('0300-1234567').customer).toEqual({ mobile: '0300-1234567' });
    expect(prefillFromQuery('35202-1234567-1').customer).toEqual({ cnic: '35202-1234567-1' });
    expect(prefillFromQuery('LEA-1234').vehicle).toEqual({ registrationNo: 'LEA-1234' });
    expect(prefillFromQuery('KMHJ381ABCD12345').vehicle).toEqual({ vin: 'KMHJ381ABCD12345' });
    expect(prefillFromQuery('Ali Khan').customer).toEqual({ fullName: 'Ali Khan' });
  });
});
