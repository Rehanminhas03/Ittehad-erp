import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { attachRealtime, closeRealtime } from '../src/lib/realtime';
import { api, app, bearer, createDealership, createUser, owner, roleByName, useTestDb } from './helpers';

useTestDb();

type Login = Awaited<ReturnType<typeof createUser>>;
async function staff(roleName: string, dealershipId: number): Promise<Login> {
  const u = await createUser();
  await owner.db.userRole.create({ data: { userId: u.user.id, roleId: await roleByName(roleName), dealershipId } });
  return u;
}

// A real server with the socket attached, as in production (server.ts).
let url = '';
const server = app.listen(0);
beforeAll(() => {
  attachRealtime(server);
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  closeRealtime();
  server.close();
});

const open = (token: string) =>
  new Promise<Socket>((resolve, reject) => {
    const s = connect(url, { path: '/socket.io', auth: { token }, transports: ['websocket'], reconnection: false });
    s.once('connect', () => resolve(s));
    s.once('connect_error', (e) => reject(e));
  });
const next = (s: Socket) =>
  new Promise<{ notification: { id: number; title: string; actorName: string | null; href: string | null } }>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('no notification received')), 5000);
    s.once('notification:new', (payload) => {
      clearTimeout(t);
      resolve(payload);
    });
  });

describe('notifications', () => {
  it('pushes a change live to everyone else at the dealership, with the task, the person and a link', async () => {
    const d = await createDealership('HYD');
    const other = await createDealership('JET');
    const model = await owner.db.vehicleModel.create({ data: { brand: 'Hyundai', name: 'Tucson' } });
    const sales1 = await staff('Salesperson', d.id);
    const manager = await staff('Sales Manager', d.id);
    const elsewhere = await staff('Salesperson', other.id);

    const live = await open(manager.token);
    const arriving = next(live);
    const lead = await api
      .post('/api/sales/leads')
      .set(bearer(sales1.token))
      .send({ dealershipId: d.id, prospectName: 'Ayesha Khan', prospectMobile: '03001234567', interestedModelId: model!.id });
    expect(lead.status).toBe(201);
    const { notification } = await arriving;
    expect(notification).toMatchObject({ title: 'New lead added', actorName: sales1.user.fullName, href: `/sales/leads/${lead.body.id}` });
    // No customer details in notifications.
    expect(JSON.stringify(notification)).not.toContain('Ayesha');
    live.disconnect();

    const list = (who: Login, q = '') => api.get(`/api/notifications${q}`).set(bearer(who.token));
    expect((await list(manager)).body).toMatchObject({ total: 1, unread: 1, items: [{ title: 'New lead added' }] });
    // Not the person who did it, and nobody at another dealership.
    expect((await list(sales1)).body.total).toBe(0);
    expect((await list(elsewhere)).body.total).toBe(0);

    // Mark as read, unread filter, delete (own only).
    const id = (await list(manager)).body.items[0].id as number;
    expect((await api.post(`/api/notifications/${id}/read`).set(bearer(elsewhere.token))).body.unread).toBe(0);
    expect((await list(manager)).body.unread).toBe(1); // someone else cannot mark it
    expect((await api.post(`/api/notifications/${id}/read`).set(bearer(manager.token))).body).toEqual({ unread: 0 });
    expect((await list(manager, '?unread=true')).body.total).toBe(0);
    expect((await api.get('/api/notifications/unread-count').set(bearer(manager.token))).body).toEqual({ unread: 0 });
    expect((await api.delete(`/api/notifications/${id}`).set(bearer(elsewhere.token))).status).toBe(404);
    expect((await api.delete(`/api/notifications/${id}`).set(bearer(manager.token))).status).toBe(200);
    expect((await list(manager)).body.total).toBe(0);
  });

  it('one notification per action (the most meaningful), paged 10 at a time; sign-ins are not broadcast', async () => {
    const d = await createDealership('HYD');
    const am = await staff('Assistant Manager', d.id);
    const manager = await staff('Sales Manager', d.id);
    // Importing 12 variant codes is one action: one notification ("12 records").
    const rows = Array.from({ length: 12 }, (_, i) => ({ code: `CODE${i + 10}`, description: `Variant ${i}` }));
    await api.post('/api/sales/variants/import').set(bearer(am.token)).send({ dealershipId: d.id, rows }).expect(200);
    const first = (await api.get('/api/notifications').set(bearer(manager.token))).body;
    expect(first.total).toBe(1);
    expect(first.items[0]).toMatchObject({ title: 'New variant code added', detail: expect.stringContaining('12 records') });

    // Eleven more actions: page 1 has 10, page 2 the rest.
    for (let i = 0; i < 11; i++) {
      await api.post('/api/sales/variants').set(bearer(am.token)).send({ dealershipId: d.id, code: `EXTRA${i + 10}`, description: 'Extra' }).expect(201);
    }
    const page1 = (await api.get('/api/notifications?page=1&pageSize=10').set(bearer(manager.token))).body;
    const page2 = (await api.get('/api/notifications?page=2&pageSize=10').set(bearer(manager.token))).body;
    expect([page1.items.length, page2.items.length, page1.total, page1.unread]).toEqual([10, 2, 12, 12]);
    await api.post('/api/notifications/read-all').set(bearer(manager.token)).expect(200);
    expect((await api.get('/api/notifications/unread-count').set(bearer(manager.token))).body.unread).toBe(0);
  });

  it('refuses a socket without a valid token', async () => {
    await expect(open('not-a-token')).rejects.toThrow();
  });
});
