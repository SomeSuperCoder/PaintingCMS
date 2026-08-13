# E2E suite: 4 outdated tests — fixes proven, needed before final commit
**Date:** 2026-08-13
**Source:** QA Engineer (qa-gate-rerun)
**Priority:** high
**Status:** pending
**Effort:** quick (<1hr)

## Recommendation
Fix 4 outdated E2E tests so the suite reaches 10/10 GREEN. All four are test-side defects — zero project issues surfaced by the re-run. Fixes proven against the current code:

1. `apps/web/e2e/02-painting-crud.spec.ts:55` — photo-count assertion. Replace `getByRole('img', { name: photoAlt })` count 2 with: main img count 1 + thumbnail buttons `getByRole('button', { name: new RegExp(photoAlt(NAME)) })` count 2 (thumbnail imgs have `alt=""`; the accessible name lives on the button aria-label — by design in photo-gallery.tsx).
2. `apps/web/e2e/03-location-reuse.spec.ts:43` — currency control is a RadioGroup (role=radio, painting-form-core.tsx:281). Change `getByRole('button', { name: S.currencyUsd })` → `getByRole('radio', ...)` (02 already uses the radio locator).
3. `apps/web/e2e/06-a11y-smoke.spec.ts:24,37` — order dependency: 04 transfers ownership to USER_B, so after it OWNER_A is denied. Open 06 as `OWNER_B` (the current owner post-04) for both the catalog and transfer-dialog tests, OR run 06 before 04 (then catalog still needs 03's data → use OWNER_B).

## Rationale
The suite is the user-journey gate. Acceptance criteria all pass, but the suite stays red until these are fixed; the final commit should ride on a green 10/10 run.

## Evidence
- Trace `apps/web/test-results/02-*/trace.zip` → POST /paintings/1/photos + GET /photos/1/stream + GET /photos/2/stream (2 photos stored+rendered).
- `apps/web/src/components/paintings/photo-gallery.tsx:41-65` (main img alt, thumbnails alt="", button aria-label).
- `apps/web/src/components/paintings/painting-form-core.tsx:281-300` (RadioGroup currency).
- `apps/web/e2e/04-transfer-ownership.spec.ts` end state (A loses access; B owner).
- Full run log: /tmp/qa2-e2e-full.log (10 tests, 6 pass / 4 fail).
