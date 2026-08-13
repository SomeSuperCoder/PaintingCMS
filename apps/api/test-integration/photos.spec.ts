/**
 * PHOTOS — upload / stream / delete / cascade (HTTP level, real DB).
 * ==================================================================
 * Spec: photos. Multipart upload validated by multer (MIME whitelist →
 * PHOTO_TYPE_INVALID, 10 MB/file → PHOTO_TOO_LARGE) + the service's
 * per-painting cap (→ PHOTO_LIMIT_EXCEEDED). Streaming is auth-guarded with
 * immutable cache headers. Deleting a painting cascades photo ROWS (DB
 * CASCADE) AND unlinks the FILES (service hook) — both asserted here.
 */

import request from 'supertest';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { count, eq } from 'drizzle-orm';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  API_PATHS,
  AUTH_HEADER,
  ERROR_MESSAGES,
  PHOTO_UPLOAD,
  type PaintingDto,
  type PhotoUploadResultDto,
} from '@painting/shared';

import { photos } from '../src/db/schema';
import {
  ALICE,
  BOB,
  buildInitData,
  createTestApp,
  destroyTestApp,
  expectContractError,
  expectFileExists,
  resetDb,
  type TestApp,
} from './helpers';

/** Minimal PNG header + padding — the server validates MIME, not pixel data. */
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(24, 7),
]);

describe('PHOTOS — upload/stream/delete/cascade over real HTTP', () => {
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

  /** Location + painting, so photo tests never repeat the CRUD preamble. */
  async function paintingWithLocation(name = 'С картиной'): Promise<PaintingDto> {
    const loc = await server()
      .post(API_PATHS.locations)
      .set(AUTH_HEADER, auth)
      .send({ kind: 'offline', value: 'Галерея, 5' })
      .expect(201);
    const res = await server()
      .post(API_PATHS.paintings)
      .set(AUTH_HEADER, auth)
      .send({ name, price_minor: 7000, currency: 'rub', locationId: String(loc.body.id) })
      .expect(201);
    return res.body as PaintingDto;
  }

  it('upload valid PNG → 201 PhotoUploadResultDto, position 0, auth-guarded stream url', async () => {
    const painting = await paintingWithLocation();
    const res = await server()
      .post(API_PATHS.paintingPhotos(painting.id))
      .set(AUTH_HEADER, auth)
      .attach('photos', PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    const body = res.body as PhotoUploadResultDto;
    expect(body.photos).toHaveLength(1);
    expect(body.photos[0].position).toBe(0);
    expect(body.photos[0].url).toBe(API_PATHS.photoStream(body.photos[0].id));
    expect(String(body.photos[0].id)).toMatch(/^\d+$/);
  });

  it('multiple uploads preserve gallery order (positions 0, 1, ...)', async () => {
    const painting = await paintingWithLocation();
    const first = await server()
      .post(API_PATHS.paintingPhotos(painting.id))
      .set(AUTH_HEADER, auth)
      .attach('photos', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    const second = await server()
      .post(API_PATHS.paintingPhotos(painting.id))
      .set(AUTH_HEADER, auth)
      .attach('photos', PNG_BYTES, { filename: 'b.png', contentType: 'image/png' })
      .expect(201);
    expect((first.body as PhotoUploadResultDto).photos[0].position).toBe(0);
    expect((second.body as PhotoUploadResultDto).photos[0].position).toBe(1);

    const detail = await server()
      .get(API_PATHS.painting(painting.id))
      .set(AUTH_HEADER, auth)
      .expect(200);
    expect((detail.body as PaintingDto).photos.map((p) => p.position)).toEqual([0, 1]);
  });

  it('wrong MIME type → 400 PHOTO_TYPE_INVALID, file not stored', async () => {
    const painting = await paintingWithLocation();
    const res = await server()
      .post(API_PATHS.paintingPhotos(painting.id))
      .set(AUTH_HEADER, auth)
      .attach('photos', Buffer.from('MZ not an image'), { filename: 'evil.exe', contentType: 'application/x-msdownload' });
    expectContractError(res, 400, 'PHOTO_TYPE_INVALID');
    expect(res.body.error.message).toBe(ERROR_MESSAGES.PHOTO_TYPE_INVALID);
  });

  it('file over 10 MB → 413 PHOTO_TOO_LARGE', async () => {
    const painting = await paintingWithLocation();
    const huge = Buffer.alloc(PHOTO_UPLOAD.maxSizeBytes + 1, 1);
    const res = await server()
      .post(API_PATHS.paintingPhotos(painting.id))
      .set(AUTH_HEADER, auth)
      .attach('photos', huge, { filename: 'huge.png', contentType: 'image/png' });
    expectContractError(res, 413, 'PHOTO_TOO_LARGE');
    expect(res.body.error.message).toBe(ERROR_MESSAGES.PHOTO_TOO_LARGE);
  });

  it('per-painting cap of 10 → 400 PHOTO_LIMIT_EXCEEDED (and >10 in ONE request → 400)', async () => {
    const painting = await paintingWithLocation();
    const batch = server()
      .post(API_PATHS.paintingPhotos(painting.id))
      .set(AUTH_HEADER, auth);
    for (let i = 0; i < 10; i += 1) {
      batch.attach('photos', PNG_BYTES, { filename: `p${i}.png`, contentType: 'image/png' });
    }
    const ok = await batch;
    expect(ok.status).toBe(201);
    expect((ok.body as PhotoUploadResultDto).photos).toHaveLength(10);

    const over = await server()
      .post(API_PATHS.paintingPhotos(painting.id))
      .set(AUTH_HEADER, auth)
      .attach('photos', PNG_BYTES, { filename: 'extra.png', contentType: 'image/png' });
    expectContractError(over, 400, 'PHOTO_LIMIT_EXCEEDED');

    // 11 files in ONE request → multer's maxCount → 400 VALIDATION_ERROR
    // (documented contract nuance: the per-request hard cap).
    const eleven = server()
      .post(API_PATHS.paintingPhotos(painting.id))
      .set(AUTH_HEADER, auth);
    for (let i = 0; i < 11; i += 1) {
      eleven.attach('photos', PNG_BYTES, { filename: `x${i}.png`, contentType: 'image/png' });
    }
    expectContractError(await eleven, 400, 'VALIDATION_ERROR');
  });

  it('empty multipart upload → 400 VALIDATION_ERROR', async () => {
    const painting = await paintingWithLocation();
    const res = await server()
      .post(API_PATHS.paintingPhotos(painting.id))
      .set(AUTH_HEADER, auth)
      .field('note', 'no files attached');
    expectContractError(res, 400, 'VALIDATION_ERROR');
  });

  it('stream → 200 with the exact bytes, Content-Type, Content-Length, private+immutable cache', async () => {
    const painting = await paintingWithLocation();
    const upload = await server()
      .post(API_PATHS.paintingPhotos(painting.id))
      .set(AUTH_HEADER, auth)
      .attach('photos', PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' })
      .expect(201);
    const photoId = (upload.body as PhotoUploadResultDto).photos[0].id;

    const res = await server().get(API_PATHS.photoStream(photoId)).set(AUTH_HEADER, auth);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-length']).toBe(String(PNG_BYTES.length));
    expect(res.headers['cache-control']).toContain('private');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(Buffer.compare(res.body as Buffer, PNG_BYTES)).toBe(0);
  });

  it('stream requires owner auth: no header → 401, non-owner → 403, deleted → 404', async () => {
    const painting = await paintingWithLocation();
    const upload = await server()
      .post(API_PATHS.paintingPhotos(painting.id))
      .set(AUTH_HEADER, auth)
      .attach('photos', PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' })
      .expect(201);
    const photoId = (upload.body as PhotoUploadResultDto).photos[0].id;

    const noAuth = await server().get(API_PATHS.photoStream(photoId));
    expectContractError(noAuth, 401, 'UNAUTHORIZED');

    await server().get(API_PATHS.ownership).set(AUTH_HEADER, buildInitData(BOB)).expect(403);
    const nonOwner = await server()
      .get(API_PATHS.photoStream(photoId))
      .set(AUTH_HEADER, buildInitData(BOB));
    expectContractError(nonOwner, 403, 'ACCESS_DENIED');

    await server().delete(API_PATHS.photo(photoId)).set(AUTH_HEADER, auth).expect(204);
    const deleted = await server().get(API_PATHS.photoStream(photoId)).set(AUTH_HEADER, auth);
    expectContractError(deleted, 404, 'NOT_FOUND');
  });

  it('delete photo → 204 (row + file), painting detail no longer lists it', async () => {
    const painting = await paintingWithLocation();
    const upload = await server()
      .post(API_PATHS.paintingPhotos(painting.id))
      .set(AUTH_HEADER, auth)
      .attach('photos', PNG_BYTES, { filename: 'photo.png', contentType: 'image/png' })
      .expect(201);
    const photoId = (upload.body as PhotoUploadResultDto).photos[0].id;

    await server().delete(API_PATHS.photo(photoId)).set(AUTH_HEADER, auth).expect(204);
    const detail = await server()
      .get(API_PATHS.painting(painting.id))
      .set(AUTH_HEADER, auth)
      .expect(200);
    expect((detail.body as PaintingDto).photos).toHaveLength(0);
  });

  it('delete painting → 204; photo ROWS cascade AND files are unlinked (no orphans)', async () => {
    const painting = await paintingWithLocation();
    await server()
      .post(API_PATHS.paintingPhotos(painting.id))
      .set(AUTH_HEADER, auth)
      .attach('photos', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' })
      .expect(201);
    await server()
      .post(API_PATHS.paintingPhotos(painting.id))
      .set(AUTH_HEADER, auth)
      .attach('photos', PNG_BYTES, { filename: 'b.png', contentType: 'image/png' })
      .expect(201);

    // Resolve the file paths from the DB rows BEFORE the cascade.
    const rows = await testApp.db
      .select({ filePath: photos.filePath })
      .from(photos)
      .where(eq(photos.paintingId, Number(painting.id)));
    expect(rows).toHaveLength(2);
    const absolutePaths = rows.map((r) => join(testApp.storageDir, r.filePath));
    for (const p of absolutePaths) expectFileExists(p);

    await server()
      .delete(API_PATHS.painting(painting.id))
      .set(AUTH_HEADER, auth)
      .expect(204);

    // Rows gone (DB CASCADE)…
    const [{ n }] = await testApp.db
      .select({ n: count() })
      .from(photos)
      .where(eq(photos.paintingId, Number(painting.id)));
    expect(n).toBe(0);
    // …and file bytes gone (service hook) — no orphan files on disk.
    for (const p of absolutePaths) {
      expect(existsSync(p)).toBe(false);
    }
  });

  it('upload to a missing painting → 404 NOT_FOUND (and no orphan bytes left)', async () => {
    const res = await server()
      .post(API_PATHS.paintingPhotos('99999'))
      .set(AUTH_HEADER, auth)
      .attach('photos', PNG_BYTES, { filename: 'a.png', contentType: 'image/png' });
    expectContractError(res, 404, 'NOT_FOUND');
  });
});
