# Mbox — Crystal Showcase only

Single product surface: **Crystal Showcase** (`showcase.html`).

## Local dev

```bash
npm run dev
npm run dev:urls
```

- Showcase: `http://localhost:5173/showcase.html`
- Cursor: edit shell + RTX Chrome companion (see [zero-cost-local.md](./zero-cost-local.md))
- Chrome GPU: `npm run open:showcase-gpu`

## Verify

```bash
npm run verify:showcase-manifest
npm run verify:gpu-worker-parity
npm run verify:render-job-crystal
```

## Related

- [crystal-architecture.md](./crystal-architecture.md)
- [zero-cost-local.md](./zero-cost-local.md)
- [cloud-render-spec.md](./cloud-render-spec.md) — `crystal_showcase` jobs only
