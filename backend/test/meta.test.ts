import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseLeadFields, parsePages, verifySignature } from '../src/modules/integrations/meta';

describe('Meta lead ads webhook helpers', () => {
  it('accepts a body signed with the app secret, and nothing else', () => {
    const body = Buffer.from('{"object":"page"}');
    const good = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`;
    expect(verifySignature(body, good, 'secret')).toBe(true);
    expect(verifySignature(body, good, 'other')).toBe(false);
    expect(verifySignature(Buffer.from('{"object":"x"}'), good, 'secret')).toBe(false);
    expect(verifySignature(body, undefined, 'secret')).toBe(false);
    expect(verifySignature(undefined, good, 'secret')).toBe(false);
    expect(verifySignature(body, 'sha256=zz', 'secret')).toBe(false);
  });

  it('reads the customer from the lead form answers', () => {
    const f = parseLeadFields([
      { name: 'full_name', values: ['Islam Afridi'] },
      { name: 'phone_number', values: ['p:+923339999940'] },
      { name: 'email', values: ['islam@example.com'] },
      { name: 'city', values: ['Rawalpindi'] },
      { name: 'which_model_are_you_interested_in?', values: ['X70 Plus'] },
    ]);
    expect(f).toMatchObject({ name: 'Islam Afridi', rawPhone: '+923339999940', email: 'islam@example.com', city: 'Rawalpindi' });
    expect(f.answers['which_model_are_you_interested_in?']).toBe('X70 Plus');
  });

  it('builds the name from first and last name, and tolerates missing answers', () => {
    expect(parseLeadFields([{ name: 'first_name', values: ['Ali'] }, { name: 'last_name', values: ['Raza'] }, { name: 'phone', values: ['0300 1234567'] }])).toMatchObject({
      name: 'Ali Raza',
      rawPhone: '0300 1234567',
    });
    expect(parseLeadFields([])).toMatchObject({ name: null, rawPhone: null, email: null, city: null });
  });

  it('reads META_PAGES and skips incomplete entries', () => {
    expect(parsePages(undefined)).toEqual([]);
    expect(parsePages('[{"pageId":"1","dealership":"JET-ITH","accessToken":"t"},{"pageId":"2"}]')).toEqual([
      { pageId: '1', dealership: 'JET-ITH', accessToken: 't' },
    ]);
  });
});
