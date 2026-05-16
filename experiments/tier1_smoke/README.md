# Tier 1 Smoke

Tier 1 validates that the API proxy and client contract are reachable before any quality review.

## Checks

1. `GET /health` returns `ok: true`.
2. Fixed sample manifest under `experiments/assets/original-sample-manifest.json` is readable.
3. Original KakaoTalk JPGs are read from `data/asset/temp_1778692001076.-1818431043/`.
4. Optional analyze/edit calls run when Vertex ADC or `GEMINI_API_KEY` is configured.

## Run

```bash
python scripts/run_experiment.py --tier tier1_smoke
python scripts/run_experiment.py --tier tier1_smoke --full-e2e
```

Outputs are written to `experiments/outputs/tier1_smoke/`.
