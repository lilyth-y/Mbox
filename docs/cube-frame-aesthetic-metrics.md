# Cube frame aesthetic metrics (FQI)

Quantitative verification that the 3D cube **photo frame shader** reads as polished wedding product UI—not just “non-blank canvas.”

## Why this exists

`verify:cube-frames` only checks screenshots exist and the canvas is painted. It does **not** measure frame band contrast, mat separation, accent lines, or preset palette fidelity.

**FQI (Frame Quality Index)** is a lab proxy (0–1). It is **not** guest preference; pair with field surveys for product validation.

## Metric stack

| Code | Name | Meaning |
|------|------|---------|
| **FBT** | `frameBandTexture` | Luminance variation in outer frame band (decorative texture visible) |
| **MFS** | `matFrameSeparation` | ΔE between outer frame band and photo core (frame “pop”) |
| **ALS** | `accentLineStrength` | Gradient peak at photo inset ring |
| **SYM** | `lateralSymmetry` | Left/right frame band balance |
| **SBJ** | `subjectPreservation` | Photo core variance (subject not washed flat) |
| **PAL** | `paletteFidelity` | Frame band mean color vs preset design accent |

**FQI** = weighted geometric mean of the six components (see `cubeFrameAestheticMetrics.ts`).

UV band geometry follows hologram mode constants in `photoFrameGlsl.ts` (`photoInset`, `matInset`, `frameWidth` × `frameScale`).

## Evaluation tiers

| Tier | Method | Pass criteria |
|------|--------|---------------|
| **1** | Synthetic buffers (`synthesizeReferenceFrameBuffer`) | All 5 presets FQI ≥ 0.80; broken flat buffer FQI ≤ 0.55 |
| **2** | Headless WebGL face render (`measure-cube-frame-fqi`) | All presets pass gate thresholds in `experiments/cube-frame-aesthetic/thresholds.json` |
| **3** | Playwright capture on live cube tab (`measure:cube-frame-fqi:capture`) | Same gates on real showcase screenshots (optional; needs dev server) |

## Commands

```bash
# Tier 1 unit gate (CI-safe, no browser)
npm run verify:cube-frame-fqi

# Tier 2 lab render (WebGL via Playwright fixture page)
npm run measure:cube-frame-fqi

# Tier 2 CI gate
npm run measure:cube-frame-fqi:gate

# Tier 3 live app capture (dev server required)
npm run dev   # separate terminal
npm run measure:cube-frame-fqi:capture
```

Outputs: `experiments/outputs/cube_frame_aesthetic/analysis.json`, `report.tex`.

## Limits (honest bounds)

- FQI measures **2D face appearance** at showcase-like framing, not full cube motion or garland ornaments.
- Palette targets are **design references**, not measured guest ratings.
- Tier 3 can drift with lighting/particles; Tier 2 is the regression gate.
- A high FQI does **not** prove “beautiful”—it proves frame structure matches product spec. Use field A/B for satisfaction.

## Next after FQI

1. Field A/B Tier 2 pilot (`docs/field-ab-entrance-hologram.md`)
2. Caption showcase QA on exported MP4
3. EHI gate regression (`measure:entrance-ehi:gate` currently failing in dev)
