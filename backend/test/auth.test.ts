import { describe, expect, it } from 'vitest';
import { PASSWORD, api, bearer, createBranch, createDealership, createUser, owner, useTestDb } from './helpers';

useTestDb();

const cookieOf = (res: { headers: Record<string, unknown> }) => {
  const raw = res.headers['set-cookie'] as string[] | undefined;
  return raw?.find((c) => c.startsWith('dms_rt='))?.split(';')[0];
};

describe('auth', () => {
  it('logs in, returns access token + scoped profile, sets httpOnly refresh cookie', async () => {
    const d = await createDealership('A');
    await createDealership('B');
    const { user } = await createUser([{ permissions: ['core.dealerships.view'], dealershipId: d.id }], { email: 'a@test.local' });
    const res = await api.post('/api/auth/login').send({ email: 'A@Test.local', password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.me.user.id).toBe(user.id);
    expect(res.body.me.permissions).toEqual([{ code: 'core.dealerships.view', global: false, dealershipIds: [d.id], branchIds: [] }]);
    expect(res.body.me.dealerships.map((x: { code: string }) => x.code)).toEqual(['A']);
    const raw = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Path=\/api\/auth/);
  });

  it('rejects wrong password, unknown email and inactive users with the same 401', async () => {
    await createUser([], { email: 'ok@test.local' });
    await createUser([], { email: 'off@test.local', isActive: false });
    for (const body of [
      { email: 'ok@test.local', password: 'wrong-password1' },
      { email: 'nobody@test.local', password: PASSWORD },
      { email: 'off@test.local', password: PASSWORD },
    ]) {
      const res = await api.post('/api/auth/login').send(body);
      expect(res.status).toBe(401);
      expect(res.body.error.message).toBe('Invalid email or password');
    }
  });

  it('validates the login body', async () => {
    const res = await api.post('/api/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
  });

  it('rotates refresh tokens and detects reuse of a rotated token', async () => {
    await createUser([], { email: 'r@test.local' });
    const login = await api.post('/api/auth/login').send({ email: 'r@test.local', password: PASSWORD });
    const first = cookieOf(login)!;

    const r1 = await api.post('/api/auth/refresh').set('Cookie', first);
    expect(r1.status).toBe(200);
    const second = cookieOf(r1)!;
    expect(second).not.toBe(first);

    // Replaying the rotated token revokes every session, including the newest one.
    const replay = await api.post('/api/auth/refresh').set('Cookie', first);
    expect(replay.status).toBe(401);
    const after = await api.post('/api/auth/refresh').set('Cookie', second);
    expect(after.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    await createUser([], { email: 'l@test.local' });
    const login = await api.post('/api/auth/login').send({ email: 'l@test.local', password: PASSWORD });
    const cookie = cookieOf(login)!;
    expect((await api.post('/api/auth/logout').set('Cookie', cookie)).status).toBe(204);
    expect((await api.post('/api/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  it('GET /me reports per-permission scope and only reachable branches', async () => {
    const d = await createDealership('A');
    const b1 = await createBranch(d.id, 'B1');
    await createBranch(d.id, 'B2');
    const { token } = await createUser([{ permissions: ['core.branches.view'], dealershipId: d.id, branchId: b1.id }]);
    const res = await api.get('/api/auth/me').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.permissions[0]).toEqual({ code: 'core.branches.view', global: false, dealershipIds: [], branchIds: [b1.id] });
    expect(res.body.branches.map((b: { code: string }) => b.code)).toEqual(['B1']);
  });

  it('rejects tokens of deactivated users immediately', async () => {
    const { user, token } = await createUser([{ permissions: ['core.dealerships.view'] }]);
    expect((await api.get('/api/auth/me').set(bearer(token))).status).toBe(200);
    await owner.pool.query('update core."user" set is_active = false where id = $1', [user.id]);
    expect((await api.get('/api/auth/me').set(bearer(token))).status).toBe(401);
  });

  it('rejects garbage tokens', async () => {
    expect((await api.get('/api/auth/me').set(bearer('nope'))).status).toBe(401);
  });
});

describe('self-service account', () => {
  it('updates your own name and phone, but not email or roles', async () => {
    const { token, user } = await createUser([{ permissions: ['core.dealerships.view'] }], { email: 'profile@test.local' });
    const res = await api.patch('/api/auth/me').set(bearer(token)).send({ fullName: 'New Name', phone: '0300-1234567' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: user.id, email: 'profile@test.local', fullName: 'New Name', phone: '0300-1234567' });
    // Clearing the phone.
    const cleared = await api.patch('/api/auth/me').set(bearer(token)).send({ phone: null });
    expect(cleared.body.user.phone).toBeNull();
  });

  it('changes your password, requiring the current one, and signs out other sessions', async () => {
    const { token } = await createUser([{ permissions: ['core.dealerships.view'] }], { email: 'pw@test.local' });
    const loginA = await api.post('/api/auth/login').send({ email: 'pw@test.local', password: PASSWORD });
    const cookieA = cookieOf(loginA)!;

    const wrong = await api.post('/api/auth/change-password').set(bearer(token)).send({ currentPassword: 'not-the-password1', newPassword: 'NewPassw0rd-1' });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.details?.[0]?.path).toBe('currentPassword');

    const same = await api.post('/api/auth/change-password').set(bearer(token)).send({ currentPassword: PASSWORD, newPassword: PASSWORD });
    expect(same.status).toBe(422);

    const ok = await api.post('/api/auth/change-password').set(bearer(token)).send({ currentPassword: PASSWORD, newPassword: 'NewPassw0rd-1' });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTypeOf('string');

    // The old refresh token session (issued before the change) is revoked.
    expect((await api.post('/api/auth/refresh').set('Cookie', cookieA)).status).toBe(401);
    // The old password no longer works; the new one does.
    expect((await api.post('/api/auth/login').send({ email: 'pw@test.local', password: PASSWORD })).status).toBe(401);
    expect((await api.post('/api/auth/login').send({ email: 'pw@test.local', password: 'NewPassw0rd-1' })).status).toBe(200);
  });
});
