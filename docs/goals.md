# mbox Goals

## Product goal

mbox turns uploaded images into analyzed, cropped 1024x1024 assets, optional background removal or generation, post-processing, and 3D presentation. The cube uses all images that fit within the presentation byte budget.

The pipeline is not only technical normalization—it is **output-format normalization** (predictable deliverables), then **lovable** presentation (motion, templates, polish), **persuasion** (artifacts you can show stakeholders), and **semantic association** (labels, categories, events, focus intent). See `experiments/assets/deliverables-spec.json` → `productIntent`.

**Canonical input:** KakaoTalk download JPGs under `data/asset/temp_1778692001076.-1818431043/` (`experiments/assets/data-asset-manifest.json`, 20 samples). All deliverables are generated from these files—not from pre-made MP4 exports.

**Output forms:** processed gallery, 1024 assets, and presentation exports (e.g. square cube MP4). The five presentation effects and five background templates stay fixed.

## MVP scope

- Upload, analyze, optional preprocess background removal, crop, gallery, category assignment, post-processing, and cube tabs
- Gemini access only through `apps/api`
- Shared API contract types in `packages/shared`
- Korean-first status messaging
- In-memory processed gallery with browser `localStorage` for category catalog and user assignments

## Internal pilot (current target)

- One company, about **5 users**, corp network or VPN
- Server workspace vault (`VITE_USE_SERVER_VAULT`) and shared API key — see [deploy-internal.md](deploy-internal.md)
- Event/project separation per shoot or campaign

## Out of scope (internal pilot)

- Unity, AR, or physical holographic displays
- Per-user accounts, SSO, and billing
- Full category CRUD beyond add, assign, and apply AI suggestion
- Public B2C launch — architecture notes in [b2c-reuse.md](b2c-reuse.md)

## Out of scope (B2C — later)

- Consumer auth, payments, multi-tenant scale, and public CDN hardening

## Evaluation tiers

1. Tier 1: pipeline smoke on fixed samples
2. Tier 2: small-set quality review for labels, centers, prompts, crops, and category suggestions
3. Tier 3: full latency and success-rate comparison on fixed inputs
