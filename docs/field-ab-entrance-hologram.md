# Field A/B: 입구 홀로그램 — 게스트 만족 vs EHI proxy

Lab tuning(EHI ≥ 1.0, RSI @ `yaw_cw`)은 완료. **현장에서** proxy가 게스트 체감과 맞는지 검증한다.

## 가설

- **H1:** Condition B (production `entrance_processional`)의 평균 GSI > Condition A (`wedding_default` control)
- **H2:** Lab EHI proxy (B − A) 방향과 현장 ΔGSI 방향이 일치

## 조건 정의 (변수 1개: motion/export profile)

| | A Control | B Treatment |
|---|-----------|-------------|
| Fan profile | `wedding_default` | `entrance_processional` |
| Hologram export parallax | ×0.22 | ×0.50 |
| Focus pulse export | 0 | ×0.35 |
| Rotation | `yaw_cw` | `yaw_cw` |
| 고정 | 동일 사진·BGM·디스플레이 밝기/볼륨 | 동일 |

Manifest: [`experiments/field-ab/condition-manifest.json`](../experiments/field-ab/condition-manifest.json)

## 측정 지표

| 지표 | 출처 | 범위 |
|------|------|------|
| **EHI** (proxy) | `npm run measure:field-ab-ehi` | lab, target ≥ 1.0 (B) |
| **RSI** (proxy) | same JSON | lab, target ≥ 1.0 (B) |
| **GSI** (Guest Satisfaction Index) | 5문항 가중 평균 / 5 | 현장 0..1 |

설문 스키마: [`experiments/field-ab/survey-schema.json`](../experiments/field-ab/survey-schema.json)

## Tier 평가 (현장)

| Tier | n (조건당) | 용도 |
|------|------------|------|
| 1 | 0~9 | 스크립트·운영 스모크만 |
| 2 | ≥10 | 방향성 비교 (pilot) |
| 3 | ≥30 | 보고서 반영 |

**Tier 1 lab (선행):**

```bash
npm run measure:field-ab-ehi
```

**Tier 2+ 현장:**

1. MP4 A/B export (`/wedding-simple/` 또는 WeddingSimpleDashboard)
2. 30분 블록 교대 재생 + [`survey.html`](../experiments/field-ab/survey.html)
3. JSONL → `experiments/field-ab/responses.jsonl`
4. `npm run analyze:field-ab`

## MP4 export (오퍼레이터)

**B (기본):** WeddingSimpleDashboard — `entrance_processional`, hologram ON, export.

**A (control):** 동일 사진으로 fan profile만 `wedding_default`로 export (parallax/focus pulse는 export preset A에 맞게).

## 분석 산출물

- `experiments/outputs/field_ab/ehi_proxy.json` — lab
- `experiments/outputs/field_ab/analysis.json` — 현장
- `experiments/outputs/field_ab/report.tex` — LaTeX snippet

## 윤리 / 현장

- 익명·자발 응답, 거절 가능
- 사진/영상은 해당 예식 동의 범위 내
- leading 질문·보상 조건부 만족도 금지

## 미해결 / 리스크

- **Lab EHI gate:** 현장 전 `npm run measure:entrance-ehi:gate` PASS 확인 (회귀 시 motion/spike 측정 점검)
- **n 작으면** p-value unreliable → Tier 2는 방향만
- **Hall confound:** 혼잡도·조도 세션 간 차이 → 세션 로그 필수
- **EHI proxy ≠ GSI:** proxy는 motion KPI; GSI는 전체 연출(꽃 테두리·BGM 등) 포함 가능 → [`TODO.md`](../TODO.md)에 confound 기록

## 관련 명령

```bash
npm run measure:field-ab-ehi      # lab proxy A vs B
npm run analyze:field-ab        # guest JSONL analysis
npm run measure:entrance-ehi:gate # production regression
npm run measure:rotation-rsi:gate
```
