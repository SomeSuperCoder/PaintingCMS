# QA Gate Residuals — PaintingCMS
**Date:** 2026-08-13
**Source:** team/quality/qa-engineer (final QA gate)
**Priority:** low / medium
**Status:** pending

## 1. Web bundle: single 635 kB chunk (197 kB gzip)
**Priority:** medium · **Effort:** medium (1-4hr)
**Recommendation:** Code-split the web app (dynamic `import()` for routes/modals) — the production build emits one `index-*.js` of 634.73 kB (197.33 kB gzip), over the 500 kB warning threshold. Mobile-first TMA users would benefit from a smaller first paint.
**Rationale:** TMA runs inside Telegram's WebView on phones; a smaller initial chunk reduces cold-start on low-end devices.
**Evidence:** `pnpm --filter @painting/web build` output (vite v8.2.1): `dist/assets/index-*.js 634.73 kB │ gzip: 197.33 kB`, warning `Some chunks are larger than 500 kB after minification`.

## 2. Lint: 8 react-refresh warnings in UI files
**Priority:** low · **Effort:** quick (<1hr)
**Recommendation:** Silence/address `react-refresh/only-export-components` warnings in `apps/web/src/components/ui/{badge,button,tabs,toast}.tsx` and `routes.tsx` (they export non-component constants alongside components — a standard shadcn/ui pattern). Either split constants into separate modules or scope the rule off for generated UI files.
**Rationale:** Warnings are non-blocking but pollute `pnpm lint` output and can mask real issues.
**Evidence:** `pnpm lint` exit 0, "✖ 8 problems (0 errors, 8 warnings)".

## 3. Stale module doc comments in backend modules
**Priority:** low · **Effort:** quick (<1hr)
**Recommendation:** Update the doc comments in `apps/api/src/locations/locations.module.ts`, `paintings.module.ts`, `photos.module.ts` that still say "NOT registered in AppModule yet — a final integration microtask wires..." — all three ARE wired in the root composition and the app boots through them. Misleading comments cost future debugging time.
**Rationale:** Comments are part of the deliverable; stale ones actively mislead (they contributed to confidence that wiring was provisional).
**Evidence:** locations.module.ts:4-6, paintings.module.ts:5-7, photos.module.ts:2-3.
