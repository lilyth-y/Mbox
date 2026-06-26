# Render Pipelines

Mbox has **two MP4 render pipelines**. Crystal is the main product path; cube_focus is legacy entrance video.

## Overview

| Pipeline | Engine | Status | Output | FPS | Resolution |
|----------|--------|--------|--------|-----|------------|
| **Crystal Showcase** | Babylon.js + Havok | **Main** | `mbox-showcase.mp4` | 60 | 1080² (render 2048+) |
| **cube_focus entrance** | Three.js fan | **Legacy** | `mbox-cube_focus.mp4` | 30 | 1024² or 2048² |

Both support **local** (browser `MediaRecorder`) and **cloud** (`POST /render/jobs`) backends. Default: `local`.

## Crystal Showcase pipeline

### Code paths

| Stage | File |
|-------|------|
| Duration | `computeShowcaseExportDurationMs()` in `showcaseExportCapture.ts` |
| Backdrop warm | `showcaseExportBackdrop.ts` |
| Composite stream | `showcaseExportCompositeStream.ts` |
| Encode | `cubeRecorder.ts` (`MediaRecorder`) |
| Verify | `showcaseExportVerification.ts` |

### Spec (`showcaseExportSpecs.ts`)

- `SHOWCASE_DEVICE_EXPORT_SIZE` = 1080
- `SHOWCASE_EXPORT_MIN_RENDER_SIZE` = 2048
- `SHOWCASE_EXPORT_FPS` = 60
- H.264 bitrate ~12 Mbps @ 1080²

### Inputs

- `ProcessedImage[]` (up to 20)
- `ShowcaseCatalogOptions` (shape, crystal colors, backdrop)
- Optional backdrop video path (`backgroundMediaPath`)

### Pipeline animation

Stages in `apps/web/src/features/showcase/pipeline/stages/` driven by `showcasePipelineDirector.ts`.

### Cloud worker page

`/showcase.html?renderJob=1` with `window.__MBOX_RENDER_JOB__` payload (see [cloud-render-spec.md](./cloud-render-spec.md)).

---

## cube_focus entrance pipeline (legacy)

### Code paths

| Stage | File |
|-------|------|
| Motion sampling | `cubeFanTimeline.ts`, `fanRotationComposer.ts`, `fanTransform.ts` |
| Export clock | `fanExportRotation.ts` (`CUBE_EXPORT_RECORD_FPS = 30`) |
| Capture | `cubeExportCapture.ts` — manual `captureStream(0)` frame pump |
| BGM mux | `bgm/compositeStreamWithBgm.ts` |
| 2nd-pass composite | `scripts/composite_rose_cube_video.ps1` (FFmpeg ColorKey/Screen/Hybrid) |

### Inputs

- `ProcessedImage[]` (6 faces for full cube)
- Settings from `packages/shared/src/cubePresentationDefaults.ts`
- Optional BGM track, optional background plate for FFmpeg composite

### Cloud worker page

`/cube-render.html` with `window.__MBOX_RENDER_JOB__` (thin legacy export MPA).

---

## Backend selection

```typescript
// apps/web — VITE_RENDER_BACKEND=local|cloud (default: local)
import { resolveRenderBackend } from "./shared/lib/renderBackend";
```

| Backend | Crystal | cube_focus |
|---------|---------|------------|
| `local` | `exportShowcaseMp4()` in browser | `CubeView` / `WeddingSimpleDashboard` MediaRecorder |
| `cloud` | `submitRenderJob()` → poll → download URL | same API, `kind: cube_focus_entrance` |

---

## Post-export FFmpeg composite (cube_focus only)

Crystal bakes backdrop into the export stream. cube_focus exports foreground on black; optional second step:

```bash
npm run composite:video
```

Settings UI: `apps/web/src/features/composite/WorkflowVideoCompositePanel.tsx`

Cloud workers can run the same FFmpeg filters as a post-process step (`compositeMode` in job settings).

---

## Verification scripts

| Group | Scripts |
|-------|---------|
| Crystal | `verify:showcase-*`, `verify:showcase-commercial:e2e` |
| Legacy cube | `verify:cube-frames`, `verify:wedding-simple` |
| Cloud render | `verify:render-job-crystal`, `verify:render-job-cube` |

See [legacy-cube.md](./legacy-cube.md) for deprecation policy.
