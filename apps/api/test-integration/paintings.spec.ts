/**
 * PAINTINGS — CRUD + validation (HTTP level, real DB).
 * =====================================================
 * Spec: paintings. Create requires name/price/currency + exactly one
 * location (locationId from the bank — inline newLocation is rejected by
 * forbidNonWhitelisted per the current DTO). PATCH is partial: every field
 * optional (@IsOptional — the regression the DTO fix flipped from RED to
 * GREEN in the unit suite; asserted here over HTTP). All invalid inputs
 * surface the CONTRACT 400 envelope, never a 500.
 */

import request from 'supertest';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  API_PATHS,
  AUTH_HEADER,
  ERROR_MESSAGES,
  type PaintingDto,
  type PaintingListItemDto,
} from '@painting/shared';

import {
  ALICE,
  BOB,
  buildInitData,
  createTestApp,
  destroyTestApp,
  expectContractError,
  resetDb,
  type TestApp,
} from './helpers';

describe('PAINTINGS — CRUD + contract validation over real HTTP', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(testApp.db);
  });

  afterAll(async () => {
    await destroyTestApp(testApp);
  });

  const server = () => request(testApp.app.getHttpServer());
  const auth = buildInitData(ALICE);

  /** Create a location bank + painting in one call; returns both bodies. */
  async function createPainting(
    overrides: Partial<{
      name: string;
      price_minor: number;
      currency: 'rub' | 'usd' | 'eur';
      locationId: string;
    }> = {},
  ): Promise<{ painting: PaintingDto; location: { id: string } }> {
    const loc = await server()
      .post(API_PATHS.locations)
      .set(AUTH_HEADER, auth)
      .send({ kind: 'offline', value: 'ул. Ленина, 1' })
      .expect(201);
    const painting = await server()
      .post(API_PATHS.paintings)
      .set(AUTH_HEADER, auth)
      .send({
        name: 'Утренний свет',
        price_minor: 5000,
        currency: 'rub',
        locationId: String(loc.body.id),
        ...overrides,
      });
    return { painting: painting.body as PaintingDto, location: loc.body as { id: string } };
  }

  it('create → 201, Location header, full DTO shape (currency enum, price_minor, location, photos[])', async () => {
    const loc = await server()
      .post(API_PATHS.locations)
      .set(AUTH_HEADER, auth)
      .send({ kind: 'online', value: 'https://shop.example.com' })
      .expect(201);

    const res = await server()
      .post(API_PATHS.paintings)
      .set(AUTH_HEADER, auth)
      .send({ name: 'Море', price_minor: 12000, currency: 'eur', locationId: String(loc.body.id) });

    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/paintings/${res.body.id}`);
    const body = res.body as PaintingDto;
    expect(body.name).toBe('Море');
    expect(body.price_minor).toBe(12000);
    expect(body.currency).toBe('eur');
    expect(body.location).toEqual({ id: String(loc.body.id), kind: 'online', value: 'https://shop.example.com' });
    expect(body.photos).toEqual([]);
    expect(new Date(body.createdAt).getTime()).not.toBeNaN();
    expect(new Date(body.updatedAt).getTime()).not.toBeNaN();
  });

  it('list is newest-first with location summary', async () => {
    const first = await createPainting({ name: 'Первая' });
    const second = await createPainting({ name: 'Вторая' });
    expect(Number(second.painting.id)).toBeGreaterThan(Number(first.painting.id));

    const res = await server().get(API_PATHS.paintings).set(AUTH_HEADER, auth).expect(200);
    const list = res.body as PaintingListItemDto[];
    expect(list.map((p) => p.name)).toEqual(['Вторая', 'Первая']);
    expect(list[0].location.value).toBe('ул. Ленина, 1');
    expect(list[0].firstPhoto).toBeNull();
    expect(list[0].photoCount).toBe(0);
  });

  it('get by id → 200 full detail', async () => {
    const { painting } = await createPainting();
    const res = await server()
      .get(API_PATHS.painting(painting.id))
      .set(AUTH_HEADER, auth)
      .expect(200);
    expect((res.body as PaintingDto).id).toBe(painting.id);
  });

  it('REGRESSION (DTO fix): single-field PATCH updates only that field', async () => {
    const { painting } = await createPainting({ name: 'Старое имя', price_minor: 9000 });
    const res = await server()
      .patch(API_PATHS.painting(painting.id))
      .set(AUTH_HEADER, auth)
      .send({ name: 'Новое имя' });
    expect(res.status).toBe(200);
    const body = res.body as PaintingDto;
    expect(body.name).toBe('Новое имя');
    // Untouched fields survive.
    expect(body.price_minor).toBe(9000);
    expect(body.currency).toBe('rub');
  });

  it('REGRESSION (DTO fix): empty PATCH {} is a valid no-op, 200 unchanged', async () => {
    const { painting } = await createPainting({ name: 'Неизменное' });
    const res = await server()
      .patch(API_PATHS.painting(painting.id))
      .set(AUTH_HEADER, auth)
      .send({});
    expect(res.status).toBe(200);
    expect((res.body as PaintingDto).name).toBe('Неизменное');
  });

  it('delete → 204; subsequent get → 404 NOT_FOUND', async () => {
    const { painting } = await createPainting();
    await server()
      .delete(API_PATHS.painting(painting.id))
      .set(AUTH_HEADER, auth)
      .expect(204);
    const res = await server()
      .get(API_PATHS.painting(painting.id))
      .set(AUTH_HEADER, auth);
    expectContractError(res, 404, 'NOT_FOUND');
    expect(res.body.error.message).toBe(ERROR_MESSAGES.NOT_FOUND);
  });

  it('non-existent / malformed painting ids → 404, never 500', async () => {
    const missing = await server().get(API_PATHS.painting('99999')).set(AUTH_HEADER, auth);
    expectContractError(missing, 404, 'NOT_FOUND');
    const malformed = await server().get(API_PATHS.painting('abc')).set(AUTH_HEADER, auth);
    expectContractError(malformed, 404, 'NOT_FOUND');
  });

  it('locationId referencing a missing location → 404 (service re-check, never FK 500)', async () => {
    const res = await server()
      .post(API_PATHS.paintings)
      .set(AUTH_HEADER, auth)
      .send({ name: 'Без места', price_minor: 100, currency: 'rub', locationId: '99999' });
    expectContractError(res, 404, 'NOT_FOUND');
  });

  it('VALIDATION (400 contract, never 500): missing name / negative price / float price / bad currency / missing location / bad locationId / extra field / newLocation / too-long name', async () => {
    const cases: Array<{ name: string; body: Record<string, unknown>; field: string }> = [
      { name: 'missing name', body: { price_minor: 1, currency: 'rub', locationId: '1' }, field: 'name' },
      { name: 'empty name', body: { name: '   ', price_minor: 1, currency: 'rub', locationId: '1' }, field: 'name' },
      { name: 'name too long (201 chars)', body: { name: 'а'.repeat(201), price_minor: 1, currency: 'rub', locationId: '1' }, field: 'name' },
      { name: 'missing price', body: { name: 'X', currency: 'rub', locationId: '1' }, field: 'price_minor' },
      { name: 'negative price', body: { name: 'X', price_minor: -1, currency: 'rub', locationId: '1' }, field: 'price_minor' },
      { name: 'float price', body: { name: 'X', price_minor: 1.5, currency: 'rub', locationId: '1' }, field: 'price_minor' },
      { name: 'bad currency', body: { name: 'X', price_minor: 1, currency: 'gbp', locationId: '1' }, field: 'currency' },
      { name: 'missing locationId', body: { name: 'X', price_minor: 1, currency: 'rub' }, field: 'locationId' },
      { name: 'non-numeric locationId', body: { name: 'X', price_minor: 1, currency: 'rub', locationId: 'abc' }, field: 'locationId' },
      { name: 'extra unknown field', body: { name: 'X', price_minor: 1, currency: 'rub', locationId: '1', hacked: true }, field: 'hacked' },
      { name: 'inline newLocation (current DTO rejects)', body: { name: 'X', price_minor: 1, currency: 'rub', newLocation: { kind: 'offline', value: 'А' } }, field: 'newLocation' },
    ];

    for (const c of cases) {
      const res = await server()
        .post(API_PATHS.paintings)
        .set(AUTH_HEADER, auth)
        .send(c.body);
      expectContractError(res, 400, 'VALIDATION_ERROR');
      expect(res.body.error.fieldErrors?.[c.field]).toBeDefined();
      // Per-field messages are Russian, never English/stack. The guard
      // matches JS error serializations ("Error: <msg>") and stack-frame
      // separators (" at <file>:<line>") — NOT the contract's own
      // "fieldErrors" key (which /Error/ matched case-sensitively once the
      // ValidationPipe fix made invalid bodies emit the contract envelope).
      expect(JSON.stringify(res.body)).not.toMatch(/Error:| at /);
    }
  });

  it('non-owner cannot CRUD paintings → 403 ACCESS_DENIED', async () => {
    await server().get(API_PATHS.ownership).set(AUTH_HEADER, buildInitData(ALICE)).expect(200);
    const res = await server()
      .get(API_PATHS.paintings)
      .set(AUTH_HEADER, buildInitData(BOB));
    expectContractError(res, 403, 'ACCESS_DENIED');
  });
});
