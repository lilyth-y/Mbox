# Rotation comfort boundary — 폭주 vs 시선·미학 (lab)

Lab study mapping **objective runaway** (EHI spikes) against **attention/comfort proxies** (RSI). Human beauty requires field Tier 3.

## Primary KPI (/goal)

**NRAB** — Non-Runaway Attention Band membership for production config:

```
rotation_spike_count = 0
RSI ≥ 1.0
step0ShowcaseMeanYawRate ∈ [2.0, 4.5] °/s
```

| | |
|--|--|
| **Target** | Production (`entrance_processional` + `yaw_cw`, showcaseSpin=0.03, retreat=1.25) ∈ NRAB |
| **Theoretical best (lab)** | Full RSI sweet band at spike=0; human GSI unbounded here |
| **Command** | `npm run research:rotation-comfort-boundary` |

## What “폭주” means here (lab, not guest words)

| Signal | Rule | Meaning |
|--------|------|---------|
| **rotation_spike_count** | Consecutive frames: euler Δ>12° **or** Δ/Δt>120°/s | Kinematic jerk — vestibular / tracking failure proxy |
| **Legacy baseline** | `wedding_default` + `mixed`, old 2-rev approach easeOutQuart | Hundreds of spikes (see `analysis.json`) |
| **Retreat linear cap** | 120°/s × 4.4s ≈ **1.47 rev** total retreat+handoff | Above this, spikes return even with quaternion spin |

Showcase spin is **not** the runaway source when linear; retreat/handoff linear yaw rate is.

## What “시선·미학” means here (layered)

| Layer | Metric | Measures | Does **not** measure |
|-------|--------|----------|----------------------|
| **Attention (motion)** | RSI `V_score` | step0 showcase yaw ∈ [2, 4.5]°/s | “beautiful”, brand taste |
| **Comfort (motion)** | RSI `J_score`, `F_score` | smooth yaw, zero spikes | nausea in elderly guests |
| **Hologram depth** | EHI `D_score` | export parallax vs 0.035 ref | composition |
| **Frame polish** | FQI | mat/frame shader structure | motion, garland |
| **Human beauty** | GSI (field A/B) | guest satisfaction | **Tier 3 not run — Goal NOT reached for human validation** |

**Honest bound:** Lab can prove **non-runaway + trackable spin + frame spec**. It **cannot** prove aesthetic beauty without guests (`docs/field-ab-entrance-hologram.md`).

## Production placement

| Phase | Yaw | Guest-facing read |
|-------|-----|-------------------|
| approach | 0 | “펼쳐진다” — no turntable yet |
| showcase step0 | ~3°/s CW | slow turntable — **attention without whip** |
| retreat+handoff | ~102°/s linear | energetic exit — **not** showcase speed |

## Sweeps

`scripts/research-rotation-comfort-boundary.mjs`:

1. **Showcase spin revs** @ retreat=1.25 → NRAB band on spin axis  
2. **Retreat handoff revs** @ showcase=0.03 → first spike threshold  
3. **Legacy** wedding_default+mixed → runaway count  

Outputs: `experiments/outputs/rotation_comfort_boundary/analysis.json`, `report.tex`.

## Next (Tier 3)

Field A/B: correlate GSI with NRAB + FQI; test whether guests label >120°/s retreat as “빠르다” vs “어지럽다”.

## Phase 1 polish (2026-06)

- Retreat: first 40% retreat+handoff yaw frozen; 0.85 rev delayed spin (`entranceRetreatHandoffSpinU`).
- Step>0: parallax/focus peak ×0.6 vs step0 (hero hierarchy).
- Orbital gallery: `ORBITAL_EHI_ANGULAR_MUL=0.28`, step boundary continuity, hold `cameraDolly=1.0` — `npm run verify:orbital-ehi-spikes`.
