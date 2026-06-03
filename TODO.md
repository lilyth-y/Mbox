## Entrance hologram (EHI experiment 2026-06-02)

- [x] EHI baseline + iterative tuning — **PASS** EHI=1.0124 (`npm run measure:entrance-ehi`)
- [x] RSI rotation sweep — **PASS** RSI=1.0 @ `yaw_cw` (`npm run measure:rotation-rsi`)
- [x] Ralph loop EHI+RSI — **done** (`npm run ralph:entrance-hologram`)
- [ ] Field A/B: guest satisfaction vs EHI proxy at real wedding entrance
- [ ] Optional cutout path for hero couple silhouette (`applyBackgroundRemoval` toggle in wedding UI)
- [ ] Entrance BGM (`Bridal Chorus`) in React wedding dashboard
- [ ] Turntable template exposure in `WeddingSimpleDashboard` (post-EHI separate KPI)
- [ ] Merge or remove orphan `WeddingHallDashboard.tsx`
- [ ] Visual swim check on flat photos without depth map at export parallax $\times 0.50$

## Verified later

- [ ] Decide whether full processed-gallery persistence should move from in-memory state to browser storage.
- [ ] Add category rename/delete once MVP flow is stable.
- [ ] Evaluate Unity or AR extensions after web MVP acceptance.

## Research follow-ups

- [ ] Run Tier 3 full comparison after Tier 2 subset metrics are recorded in `research/report.tex`.
- [ ] Add automated visual diff tooling for crop quality review.
- [ ] Score `focus_on_subject` and `aesthetic_framing` on the web-varied asset set after qualitative Tier 2 review.
