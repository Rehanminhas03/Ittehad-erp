import { describe, expect, it } from 'vitest';
import { vehicleModel } from '../src/modules/master/models';
import { classifyQuery, normalizeCnic, normalizeIdentifier, normalizeMobile } from '../src/modules/master/normalize';
import { api, bearer, createDealership, createUser, owner, useTestDb } from './helpers';

useTestDb();

const ALL = [
  'master.customers.view', 'master.customers.create', 'master.customers.update',
  'master.vehicles.view', 'master.vehicles.create', 'master.vehicles.update', 'master.ownership.manage',
];

async function model() {
  const [m] = await owner.db.insert(vehicleModel).values({ brand: 'Hyundai', name: 'Tucson' }).returning();
  return m!.id;
}

async function setup() {
  const hyd = await createDealership('HYD');
  const jet = await createDealership('JET');
  const hydUser = await createUser([{ permissions: ALL, dealershipId: hyd.id }]);
  const jetUser = await createUser([{ permissions: ALL, dealershipId: jet.id }]);
  return { hyd, jet, hydUser, jetUser, modelId: await model() };
}

const newCustomer = (dealershipId: number, over: Record<string, unknown> = {}) => ({
  dealershipId,
  fullName: 'Ali Khan',
  mobile: '0300-1234567',
  ...over,
});

describe('normalisation', () => {
  it('treats every common Pakistani mobile format as the same number', () => {
    for (const v of ['0300-1234567', '03001234567', '+92 300 1234567', '923001234567', '0092-300-1234567', '3001234567']) {
      expect(normalizeMobile(v)).toBe('+923001234567');
    }
    expect(normalizeMobile('12')).toBeNull();
  });

  it('normalises CNIC and identifiers', () => {
    expect(normalizeCnic('35202-1234567-1')).toBe('3520212345671');
    expect(normalizeCnic('35202-123')).toBeNull();
    expect(normalizeIdentifier(' lea-1234 ')).toBe('LEA1234');
    expect(classifyQuery('35202-1234567-1').kinds).toContain('cnic');
  });
});

describe('customers', () => {
  it('rejects a duplicate mobile in any format, returning the existing record id', async () => {
    const { hyd, hydUser } = await setup();
    const first = await api.post('/api/master/customers').set(bearer(hydUser.token)).send(newCustomer(hyd.id));
    expect(first.status).toBe(201);
    expect(first.body.mobileNormalized).toBe('+923001234567');

    const dup = await api.post('/api/master/customers').set(bearer(hydUser.token)).send(newCustomer(hyd.id, { fullName: 'Someone Else', mobile: '+92 300 1234567' }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toMatchObject({ existingId: first.body.id, field: 'mobile' });
  });

  it('rejects a duplicate CNIC, and invalid mobile/CNIC input', async () => {
    const { hyd, hydUser } = await setup();
    await api.post('/api/master/customers').set(bearer(hydUser.token)).send(newCustomer(hyd.id, { cnic: '35202-1234567-1' })).expect(201);
    const dup = await api.post('/api/master/customers').set(bearer(hydUser.token)).send(newCustomer(hyd.id, { mobile: '0321-7654321', cnic: '3520212345671' }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.details.field).toBe('cnic');
    expect((await api.post('/api/master/customers').set(bearer(hydUser.token)).send(newCustomer(hyd.id, { mobile: 'abc' }))).status).toBe(422);
    expect((await api.post('/api/master/customers').set(bearer(hydUser.token)).send(newCustomer(hyd.id, { mobile: '0333-1111111', cnic: '123' }))).status).toBe(422);
  });

  it('keeps customers inside their dealership', async () => {
    const { hyd, jet, hydUser, jetUser } = await setup();
    const c = await api.post('/api/master/customers').set(bearer(hydUser.token)).send(newCustomer(hyd.id));
    // Same person at another dealership is a separate customer record there, not a duplicate.
    expect((await api.post('/api/master/customers').set(bearer(jetUser.token)).send(newCustomer(jet.id))).status).toBe(201);
    // ...but cannot be created in, or read from, a dealership outside the caller's scope.
    expect((await api.post('/api/master/customers').set(bearer(jetUser.token)).send(newCustomer(hyd.id, { mobile: '0333-0000000' }))).status).toBe(403);
    expect((await api.get(`/api/master/customers/${c.body.id}`).set(bearer(jetUser.token))).status).toBe(404);
    const list = await api.get('/api/master/customers').set(bearer(jetUser.token));
    expect(list.body.items.every((x: { dealershipId: number }) => x.dealershipId === jet.id)).toBe(true);
  });

  it('checks duplicates when a mobile number is edited', async () => {
    const { hyd, hydUser } = await setup();
    await api.post('/api/master/customers').set(bearer(hydUser.token)).send(newCustomer(hyd.id));
    const other = await api.post('/api/master/customers').set(bearer(hydUser.token)).send(newCustomer(hyd.id, { mobile: '0321-7654321' }));
    const res = await api.patch(`/api/master/customers/${other.body.id}`).set(bearer(hydUser.token)).send({ mobile: '03001234567' });
    expect(res.status).toBe(409);
  });
});

describe('vehicles: one identity across the group', () => {
  const car = (dealershipId: number, modelId: number, over: Record<string, unknown> = {}) => ({
    dealershipId,
    modelId,
    vin: 'kmh-j381-abcd12345',
    engineNo: 'g4na 998877',
    registrationNo: 'LEA-1234',
    modelYear: 2024,
    ...over,
  });

  it('stores normalised identifiers and blocks a duplicate in the same dealership', async () => {
    const { hyd, hydUser, modelId } = await setup();
    const res = await api.post('/api/master/vehicles').set(bearer(hydUser.token)).send(car(hyd.id, modelId));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ vin: 'KMHJ381ABCD12345', engineNo: 'G4NA998877', registrationNo: 'LEA1234', modelName: 'Hyundai Tucson' });
    const dup = await api.post('/api/master/vehicles').set(bearer(hydUser.token)).send(car(hyd.id, modelId, { vin: 'OTHERVIN123', engineNo: null, registrationNo: 'lea 1234' }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toMatchObject({ existingId: res.body.id, linked: true, field: 'registrationNo' });
  });

  it('never re-creates a vehicle registered at another dealership; offers linking instead', async () => {
    const { hyd, jet, hydUser, jetUser, modelId } = await setup();
    const v = await api.post('/api/master/vehicles').set(bearer(hydUser.token)).send(car(hyd.id, modelId));

    // Jetour cannot see it, and cannot create it again.
    expect((await api.get(`/api/master/vehicles/${v.body.id}`).set(bearer(jetUser.token))).status).toBe(404);
    const dup = await api.post('/api/master/vehicles').set(bearer(jetUser.token)).send(car(jet.id, modelId));
    expect(dup.status).toBe(409);
    expect(dup.body.error.details).toEqual({ linked: false, field: 'vin' });

    // Exact identifier links it; partial identifiers do not.
    expect((await api.post('/api/master/vehicles/link').set(bearer(jetUser.token)).send({ dealershipId: jet.id, identifier: 'LEA12' })).status).toBe(404);
    const linked = await api.post('/api/master/vehicles/link').set(bearer(jetUser.token)).send({ dealershipId: jet.id, identifier: 'lea-1234' });
    expect(linked.status).toBe(200);
    expect(linked.body.id).toBe(v.body.id);
    expect((await api.get(`/api/master/vehicles/${v.body.id}`).set(bearer(jetUser.token))).status).toBe(200);
    // Each side sees only its own dealership among the links.
    expect(linked.body.dealerships.map((d: { id: number }) => d.id)).toEqual([jet.id]);
  });

  it('lists only linked vehicles and searches identifiers in any format', async () => {
    const { hyd, jet, hydUser, jetUser, modelId } = await setup();
    await api.post('/api/master/vehicles').set(bearer(hydUser.token)).send(car(hyd.id, modelId)).expect(201);
    await api.post('/api/master/vehicles').set(bearer(jetUser.token)).send(car(jet.id, modelId, { vin: 'JETVIN0000001', engineNo: null, registrationNo: 'ICT-777' })).expect(201);
    const hydList = await api.get('/api/master/vehicles?q=lea-12').set(bearer(hydUser.token));
    expect(hydList.body.items.map((x: { registrationNo: string }) => x.registrationNo)).toEqual(['LEA1234']);
    expect((await api.get('/api/master/vehicles').set(bearer(hydUser.token))).body.total).toBe(1);
  });

  it('rejects edits that would clash with another vehicle', async () => {
    const { hyd, hydUser, modelId } = await setup();
    await api.post('/api/master/vehicles').set(bearer(hydUser.token)).send(car(hyd.id, modelId)).expect(201);
    const b = await api.post('/api/master/vehicles').set(bearer(hydUser.token)).send(car(hyd.id, modelId, { vin: 'SECOND12345', engineNo: null, registrationNo: null }));
    const res = await api.patch(`/api/master/vehicles/${b.body.id}`).set(bearer(hydUser.token)).send({ registrationNo: 'LEA-1234' });
    expect(res.status).toBe(409);
    const ok = await api.patch(`/api/master/vehicles/${b.body.id}`).set(bearer(hydUser.token)).send({ color: 'White' });
    expect(ok.status).toBe(200);
  });
});

describe('ownership', () => {
  it('records an owner and transfers ownership, closing the previous record', async () => {
    const { hyd, hydUser, modelId } = await setup();
    const a = await api.post('/api/master/customers').set(bearer(hydUser.token)).send(newCustomer(hyd.id));
    const b = await api.post('/api/master/customers').set(bearer(hydUser.token)).send(newCustomer(hyd.id, { fullName: 'Sara Ahmed', mobile: '0321-7654321' }));
    const v = await api
      .post('/api/master/vehicles')
      .set(bearer(hydUser.token))
      .send({ dealershipId: hyd.id, modelId, vin: 'OWNERVIN0001', ownerCustomerId: a.body.id });
    expect(v.body.currentOwner).toMatchObject({ customerId: a.body.id, fullName: 'Ali Khan' });

    const again = await api.post(`/api/master/vehicles/${v.body.id}/ownerships`).set(bearer(hydUser.token)).send({ customerId: a.body.id });
    expect(again.status).toBe(409);

    const t = await api.post(`/api/master/vehicles/${v.body.id}/ownerships`).set(bearer(hydUser.token)).send({ customerId: b.body.id });
    expect(t.status).toBe(201);
    expect(t.body).toHaveLength(2);
    expect(t.body[0]).toMatchObject({ customerId: b.body.id, endDate: null });
    expect(t.body[1].endDate).not.toBeNull();

    const cv = await api.get(`/api/master/customers/${a.body.id}/vehicles`).set(bearer(hydUser.token));
    expect(cv.body[0]).toMatchObject({ vehicleId: v.body.id });
    expect(cv.body[0].endDate).not.toBeNull();
  });

  it('cannot assign a customer from another dealership', async () => {
    const { hyd, jet, hydUser, jetUser, modelId } = await setup();
    const jc = await api.post('/api/master/customers').set(bearer(jetUser.token)).send(newCustomer(jet.id));
    const v = await api.post('/api/master/vehicles').set(bearer(hydUser.token)).send({ dealershipId: hyd.id, modelId, vin: 'SCOPEVIN0001' });
    const res = await api.post(`/api/master/vehicles/${v.body.id}/ownerships`).set(bearer(hydUser.token)).send({ customerId: jc.body.id });
    expect(res.status).toBe(404);
  });

  it("hides owner identity from users who cannot view that dealership's customers", async () => {
    const { hyd, hydUser, modelId } = await setup();
    const c = await api.post('/api/master/customers').set(bearer(hydUser.token)).send(newCustomer(hyd.id));
    const v = await api.post('/api/master/vehicles').set(bearer(hydUser.token)).send({ dealershipId: hyd.id, modelId, vin: 'PRIVACY00001', ownerCustomerId: c.body.id });
    const vehiclesOnly = await createUser([{ permissions: ['master.vehicles.view'], dealershipId: hyd.id }]);
    const res = await api.get(`/api/master/vehicles/${v.body.id}`).set(bearer(vehiclesOnly.token));
    expect(res.status).toBe(200);
    expect(res.body.currentOwner).toBeNull();
  });
});

describe('unified search', () => {
  it('finds customers by any mobile format or CNIC, and their vehicles', async () => {
    const { hyd, hydUser, modelId } = await setup();
    const c = await api.post('/api/master/customers').set(bearer(hydUser.token)).send(newCustomer(hyd.id, { cnic: '35202-1234567-1' }));
    await api.post('/api/master/vehicles').set(bearer(hydUser.token)).send({ dealershipId: hyd.id, modelId, vin: 'SEARCHVIN001', registrationNo: 'LEB-55', ownerCustomerId: c.body.id }).expect(201);

    for (const q of ['+92 300 1234567', '03001234567', '1234567', '35202-1234567-1', 'ali kh']) {
      const res = await api.get(`/api/master/search?q=${encodeURIComponent(q)}`).set(bearer(hydUser.token));
      expect(res.status, q).toBe(200);
      expect(res.body.customers.map((x: { id: number }) => x.id), q).toEqual([c.body.id]);
      expect(res.body.vehicles.map((x: { vin: string }) => x.vin), q).toEqual(['SEARCHVIN001']);
    }
    const exact = await api.get('/api/master/search?q=0300-1234567').set(bearer(hydUser.token));
    expect(exact.body.customers[0].exact).toBe(true);
  });

  it('finds vehicles by partial VIN / registration and flags exact matches', async () => {
    const { hyd, hydUser, modelId } = await setup();
    await api.post('/api/master/vehicles').set(bearer(hydUser.token)).send({ dealershipId: hyd.id, modelId, vin: 'KMHJ381ABCD12345', registrationNo: 'LEA-1234' }).expect(201);
    const partial = await api.get('/api/master/search?q=D12345').set(bearer(hydUser.token));
    expect(partial.body.vehicles).toHaveLength(1);
    expect(partial.body.vehicles[0].exact).toBe(false);
    const exact = await api.get('/api/master/search?q=lea 1234').set(bearer(hydUser.token));
    expect(exact.body.vehicles[0].exact).toBe(true);
  });

  it('reports exact group matches elsewhere (for linking) without exposing them in results', async () => {
    const { hyd, hydUser, jetUser, modelId } = await setup();
    await api.post('/api/master/vehicles').set(bearer(hydUser.token)).send({ dealershipId: hyd.id, modelId, vin: 'GROUPVIN0001', registrationNo: 'RIC-9' }).expect(201);
    const res = await api.get('/api/master/search?q=GROUPVIN0001').set(bearer(jetUser.token));
    expect(res.body.vehicles).toEqual([]);
    expect(res.body.groupMatches).toEqual([{ vin: 'GROUPVIN0001', registrationNo: 'RIC9', modelName: 'Hyundai Tucson', matchedOn: 'vin' }]);
    // Partial input never reveals vehicles from other dealerships.
    expect((await api.get('/api/master/search?q=GROUPVIN').set(bearer(jetUser.token))).body.groupMatches).toEqual([]);
    // Users who cannot link vehicles are not told about them either.
    const viewer = await createUser([{ permissions: ['master.vehicles.view'] }]);
    expect((await api.get('/api/master/search?q=GROUPVIN0001').set(bearer(viewer.token))).body.groupMatches).toEqual([]);
  });
});

describe('vehicle model catalogue', () => {
  it('is readable with the view permission but only globally managed', async () => {
    const d = await createDealership('A');
    const scoped = await createUser([{ permissions: ['master.models.view', 'master.models.manage'], dealershipId: d.id }]);
    const global = await createUser([{ permissions: ['master.models.view', 'master.models.manage'] }]);
    expect((await api.post('/api/master/vehicle-models').set(bearer(scoped.token)).send({ brand: 'Jetour', name: 'T2' })).status).toBe(403);
    expect((await api.post('/api/master/vehicle-models').set(bearer(global.token)).send({ brand: 'Jetour', name: 'T2' })).status).toBe(201);
    expect((await api.get('/api/master/vehicle-models').set(bearer(scoped.token))).body.total).toBe(1);
  });
});
