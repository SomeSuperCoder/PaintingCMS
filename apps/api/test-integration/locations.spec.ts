/**
 * LOCATIONS — bank CRUD + the in-use 409 (HTTP level, real DB).
 * ==============================================================
 * Spec: locations. Offline = street address; online = http/https URL
 * validated at the DTO layer (invalid URL → 400 LOCATION_URL_INVALID). A
 * location referenced by any painting cannot be deleted — the FK RESTRICT
 * surfaces as 409 LOCATION_IN_USE with the affected paintings in
 * details.paintings (never a raw DB error / 500).
 */

import request from 'supertest';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  API_PATHS,
  AUTH_HEADER,
  ERROR_MESSAGES,
  FIELD_ERROR_MESSAGES,
  type LocationDto,
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

describe('LOCATIONS — bank CRUD + in-use protection over real HTTP', () => {
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

  it('create offline → 201 LocationDto with ISO timestamps', async () => {
    const res = await server()
      .post(API_PATHS.locations)
      .set(AUTH_HEADER, auth)
      .send({ kind: 'offline', value: 'Москва, ул. Арбат, 12' });
    expect(res.status).toBe(201);
    const body = res.body as LocationDto;
    expect(body.kind).toBe('offline');
    expect(body.value).toBe('Москва, ул. Арбат, 12');
    expect(new Date(body.createdAt).getTime()).not.toBeNaN();
    expect(new Date(body.updatedAt).getTime()).not.toBeNaN();
  });

  it('create online with a valid http(s) URL → 201', async () => {
    const res = await server()
      .post(API_PATHS.locations)
      .set(AUTH_HEADER, auth)
      .send({ kind: 'online', value: 'https://gallery.example.org/catalog' });
    expect(res.status).toBe(201);
    expect((res.body as LocationDto).kind).toBe('online');
  });

  it('create online with an INVALID URL → 400 LOCATION_URL_INVALID (Russian field message)', async () => {
    const res = await server()
      .post(API_PATHS.locations)
      .set(AUTH_HEADER, auth)
      .send({ kind: 'online', value: 'not-a-url' });
    expectContractError(res, 400, 'VALIDATION_ERROR');
    expect(res.body.error.message).toBe(ERROR_MESSAGES.VALIDATION_ERROR);
    expect(res.body.error.fieldErrors.value).toContain(FIELD_ERROR_MESSAGES.LOCATION_URL_INVALID);
  });

  it('offline empty / whitespace value → 400 LOCATION_VALUE_REQUIRED (never DB CHECK 500)', async () => {
    for (const value of ['', '   ']) {
      const res = await server()
        .post(API_PATHS.locations)
        .set(AUTH_HEADER, auth)
        .send({ kind: 'offline', value });
      expectContractError(res, 400, 'VALIDATION_ERROR');
      expect(res.body.error.fieldErrors.value).toContain(FIELD_ERROR_MESSAGES.LOCATION_VALUE_REQUIRED);
    }
  });

  it('invalid kind → 400 LOCATION_KIND_INVALID', async () => {
    const res = await server()
      .post(API_PATHS.locations)
      .set(AUTH_HEADER, auth)
      .send({ kind: 'mailing', value: 'x' });
    expectContractError(res, 400, 'VALIDATION_ERROR');
    expect(res.body.error.fieldErrors.kind).toContain(FIELD_ERROR_MESSAGES.LOCATION_KIND_INVALID);
  });

  it('list → all locations, oldest first (stable dropdown order)', async () => {
    await server().post(API_PATHS.locations).set(AUTH_HEADER, auth).send({ kind: 'offline', value: 'Первый' }).expect(201);
    await server().post(API_PATHS.locations).set(AUTH_HEADER, auth).send({ kind: 'online', value: 'https://second.example.com' }).expect(201);
    const res = await server().get(API_PATHS.locations).set(AUTH_HEADER, auth).expect(200);
    const list = res.body as LocationDto[];
    expect(list.map((l) => l.value)).toEqual(['Первый', 'https://second.example.com']);
  });

  it('PATCH single field (value) → 200 updated; other fields untouched', async () => {
    const created = await server()
      .post(API_PATHS.locations)
      .set(AUTH_HEADER, auth)
      .send({ kind: 'offline', value: 'Старый адрес' });
    const res = await server()
      .patch(API_PATHS.location(created.body.id))
      .set(AUTH_HEADER, auth)
      .send({ value: 'Новый адрес' });
    expect(res.status).toBe(200);
    const body = res.body as LocationDto;
    expect(body.value).toBe('Новый адрес');
    expect(body.kind).toBe('offline');
  });

  it('PATCH {} is a valid no-op (DTO @IsOptional regression), 200 unchanged', async () => {
    const created = await server()
      .post(API_PATHS.locations)
      .set(AUTH_HEADER, auth)
      .send({ kind: 'offline', value: 'Без изменений' });
    const res = await server()
      .patch(API_PATHS.location(created.body.id))
      .set(AUTH_HEADER, auth)
      .send({});
    expect(res.status).toBe(200);
    expect((res.body as LocationDto).value).toBe('Без изменений');
  });

  it('PATCH/DELETE a missing location → 404 NOT_FOUND', async () => {
    const patch = await server()
      .patch(API_PATHS.location('99999'))
      .set(AUTH_HEADER, auth)
      .send({ value: 'x' });
    expectContractError(patch, 404, 'NOT_FOUND');
    const del = await server().delete(API_PATHS.location('99999')).set(AUTH_HEADER, auth);
    expectContractError(del, 404, 'NOT_FOUND');
  });

  it('delete an UNUSED location → 204, then 404', async () => {
    const created = await server()
      .post(API_PATHS.locations)
      .set(AUTH_HEADER, auth)
      .send({ kind: 'offline', value: 'Свободный адрес' });
    await server().delete(API_PATHS.location(created.body.id)).set(AUTH_HEADER, auth).expect(204);
    const res = await server()
      .get(API_PATHS.locations)
      .set(AUTH_HEADER, auth)
      .expect(200);
    expect((res.body as LocationDto[])).toHaveLength(0);
  });

  it('delete a location IN USE → 409 LOCATION_IN_USE with the affected painting in details', async () => {
    const loc = await server()
      .post(API_PATHS.locations)
      .set(AUTH_HEADER, auth)
      .send({ kind: 'offline', value: 'Занятый адрес' })
      .expect(201);
    const painting = await server()
      .post(API_PATHS.paintings)
      .set(AUTH_HEADER, auth)
      .send({ name: 'Картина на месте', price_minor: 1000, currency: 'rub', locationId: String(loc.body.id) })
      .expect(201);

    const res = await server()
      .delete(API_PATHS.location(loc.body.id))
      .set(AUTH_HEADER, auth);
    expectContractError(res, 409, 'LOCATION_IN_USE');
    expect(res.body.error.message).toBe(ERROR_MESSAGES.LOCATION_IN_USE);
    expect(res.body.error.details.paintings).toEqual([
      { id: painting.body.id, name: 'Картина на месте' },
    ]);
  });

  it('non-owner cannot touch locations → 403', async () => {
    await server().get(API_PATHS.ownership).set(AUTH_HEADER, buildInitData(ALICE)).expect(200);
    const res = await server()
      .get(API_PATHS.locations)
      .set(AUTH_HEADER, buildInitData(BOB));
    expectContractError(res, 403, 'ACCESS_DENIED');
  });
});
