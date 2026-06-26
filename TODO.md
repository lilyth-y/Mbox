## Crystal cloud migration (2026-06-22)

- [x] Docs: crystal-architecture, render-pipelines, legacy-cube, cloud-render-spec
- [x] `packages/shared` RenderJob types
- [x] Default entry → showcase.html; studio.html for legacy
- [x] RenderBackend local|cloud abstraction
- [x] API POST/GET `/render/jobs` + worker scripts
- [x] `verify:render-job-crystal`, `verify:render-job-cube`
- [x] M1: Cloud render live — legacy local export dev/QA only
- [ ] M2: wedding-simple redirect or deprecation banner
- [x] M3: Remove fanMotion.js duplicate, retire cube-core bundle
- [ ] M4: Archive studio MPA

## Composite rose + cube (2026-06-10)

- [x] Tier-1 KPI suite — `npm run experiment:composite-tier1` (9/11 PASS)
- [x] Segment trim fix + concat + npm scripts + catalog entry
- [x] Tier-2: hybrid BlendMode (ColorKey 0–60s, Screen 60s+) full re-render
- [x] Tier-2: default `-BgmPath apps/web/public/bgm/piano-slideshow.mp3` in composite script
- [ ] Cube scale visual QA — edge-luma metric insensitive; compare 1.0 / 1.25 / 1.5 with FQI
- [x] Mbox app UI: cube scale slider + segment length wired to `composite:rose-cube`
- [x] Catalog display label for `2026_06_10 11_31.mp4` (not raw filename)
- [ ] EHI on composite export path (E10 FAIL — separate from entrance `marriage.mp4`)

## Entrance hologram (EHI experiment 2026-06-02)

- [x] EHI baseline + iterative tuning — **PASS** EHI=1.0124 (`npm run measure:entrance-ehi`)
- [x] RSI rotation sweep — **PASS** RSI=1.0 @ `yaw_cw` (`npm run measure:rotation-rsi`)
- [x] Ralph loop EHI+RSI — **done** (`npm run ralph:entrance-hologram`)
- [x] Per-photo showcase captions (한 줄 하단, manual input, MP4 baked)
- [ ] Field A/B: guest satisfaction vs EHI proxy at real wedding entrance
  - [x] Protocol + operator checklist — `docs/field-ab-entrance-hologram.md`, `experiments/field-ab/`
  - [x] Lab EHI proxy A vs B — `npm run measure:field-ab-ehi`
  - [x] Lab rotation comfort boundary (NRAB) — `npm run research:rotation-comfort-boundary`, `docs/rotation-comfort-boundary.md`
  - [ ] Tier 3 GSI vs NRAB/FQI correlation (human beauty — lab cannot PASS alone)
  - [x] Guest survey + analysis pipeline — `survey.html`, `npm run analyze:field-ab`
  - [ ] Tier 2 pilot (n≥10 per condition) at venue
  - [ ] Tier 3 field report in `experiments/outputs/field_ab/report.tex`
- [x] Optional cutout path for hero couple silhouette (`applyBackgroundRemoval` toggle in wedding UI)
- [x] Entrance BGM (`Bridal Chorus`) in React wedding dashboard
- [x] Turntable template exposure in `WeddingSimpleDashboard` (post-EHI separate KPI)
- [x] Merge or remove orphan `WeddingHallDashboard.tsx`
- [ ] Visual swim check on flat photos without depth map at export parallax $\times 0.50$

## Cube frame aesthetic (FQI)

- [x] Metric spec + tier plan — `docs/cube-frame-aesthetic-metrics.md`, `packages/shared/src/cubeFrameAestheticMetrics.ts`
- [x] Tier 1 synthetic gate — `npm run verify:cube-frame-fqi`
- [x] Tier 2 WebGL lab measure — `npm run measure:cube-frame-fqi:gate` **PASS** (2026-06-07)
- [ ] Tier 3 live cube-tab capture + guest preference correlation
- [ ] Garland/ornament layer included in FQI extension (currently face shader only)

## Verified later

- [ ] Decide whether full processed-gallery persistence should move from in-memory state to browser storage.
- [ ] Add category rename/delete once MVP flow is stable.
- [ ] Evaluate Unity or AR extensions after web MVP acceptance.

## Research follow-ups

- [ ] Run Tier 3 full comparison after Tier 2 subset metrics are recorded in `research/report.tex`.
- [ ] Add automated visual diff tooling for crop quality review.
- [ ] Score `focus_on_subject` and `aesthetic_framing` on the web-varied asset set after qualitative Tier 2 review.
