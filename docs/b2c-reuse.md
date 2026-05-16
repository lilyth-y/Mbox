# B2C reuse map (future)

The current repo is optimized for an **internal ≤5 user pilot**. The same monorepo can grow into B2C if you **extend** rather than rewrite.

## Keep as-is (product core)

| Layer | Path | Why |
|-------|------|-----|
| Image pipeline contract | `packages/shared` | Analyze/edit types, categories, crop policy |
| Gemini boundary | `apps/api` | Keys and prompts never in the browser |
| Web UX flow | `apps/web` | Upload → gallery → postprocess → cube |
| Experiments | `experiments/`, `scripts/` | Tier 1–3 regression for model/prompt changes |

## Internal pilot → B2C: swap these

| Internal (now) | B2C (later) |
|----------------|-------------|
| Shared `API_KEY` in Vite build | User session (OAuth) + server-issued token |
| `X-Workspace-Id` header (manual) | `userId` / `orgId` from auth middleware |
| File vault `WORKSPACE_DATA_DIR` | Object storage + DB metadata (Postgres/Supabase) |
| Single Cloud Run instance | Horizontally scaled API + shared bucket |
| Corp VPN / IAP | Public CDN + WAF + rate limits per user |
| No billing | Stripe / usage metering on analyze & edit calls |

## API surface to preserve

Keep these routes stable so `apps/web` needs minimal changes:

- `POST /analyze`, `POST /analyze/batch`, `POST /edit`
- `GET /workspace/bootstrap`, vault/meta/events endpoints

B2C adds **auth middleware** in front of existing handlers; do not fork business logic into a second API.

## Suggested B2C phases

1. **Auth** — Verify JWT on API; remove `VITE_API_KEY`; web uses login redirect.
2. **Storage** — Implement `VaultStore` interface (file → GCS); same JSON shape for `ProcessedImage`.
3. **Tenancy** — Map `workspaceId` → `accountId`; row-level security in DB.
4. **Billing** — Meter `/analyze` and `/edit`; hard caps per plan.
5. **Public web** — New marketing site; app subdomain; stricter RAI and upload limits.

## What not to do during internal pilot

- Do not embed Gemini in `apps/web`.
- Do not fork crop/analysis logic out of `packages/shared`.
- Do not store vault only in `localStorage` if you expect B2C persistence — use `VITE_USE_SERVER_VAULT=true` now to validate server paths.

## Code touchpoints for B2C

| Concern | File(s) |
|---------|---------|
| Vault backend | `apps/api/src/services/workspaceStore.ts` → extract interface |
| API auth | `apps/api/src/middleware/apiKeyAuth.ts` → add `sessionAuth.ts` |
| Client headers | `apps/web/src/shared/api/headers.ts` → Bearer from session |
| Runtime flags | `apps/web/src/shared/config/runtime.ts` |

Internal pilot proves the pipeline; B2C mainly adds **identity, storage scale, and money**.
