# Verification script groups

Scripts in root `package.json` are grouped by product lifecycle.

## Crystal (main CI)

Primary product — run on every Crystal change.

| Script | Purpose |
|--------|---------|
| `verify:showcase-manifest` | Content manifest |
| `verify:showcase-commercial` | Commercial goals |
| `verify:showcase-commercial:e2e` | Browser E2E export |
| `verify:showcase-shapes` | Shape catalog |
| `verify:showcase-shapes:live` | Live shape audit |
| `verify:showcase-rotate-ease` | Rotate easing |
| `generate:showcase-qa-corpus` | QA corpus |

## Legacy cube (regression until deprecation)

Frozen Three.js cube_focus + wedding-simple — bugfix verification only.

| Script | Purpose |
|--------|---------|
| `verify:cube-frames` | Frame + MP4 export |
| `verify:wedding-simple` | Wedding E2E |
| `verify:cube-presentation` | Full presentation suite |
| `verify:cube-presentation:fast` | Fast presentation gates |
| `verify:wedding-simple-react` | React wedding entry |
| `verify:local` | Local batch (cube + bg removal) |

## Cloud render

Server-side MP4 jobs — requires `npm run dev` (API + web) and optional `node scripts/render-worker.mjs`.

| Script | Purpose |
|--------|---------|
| `verify:render-job-crystal` | Crystal job lifecycle |
| `verify:render-job-cube` | cube_focus job lifecycle |
| `render-worker` (direct) | `node scripts/render-worker.mjs` poll daemon |

See [cloud-render-spec.md](./cloud-render-spec.md) and [legacy-cube.md](./legacy-cube.md).
