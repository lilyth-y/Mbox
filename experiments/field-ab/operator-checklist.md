# Field A/B — 입구 홀로그램 현장 체크리스트

현장 오퍼레이터용. 상세 프로토콜: [docs/field-ab-entrance-hologram.md](../docs/field-ab-entrance-hologram.md)

## 사전 (D-1)

- [ ] `npm run measure:field-ab-ehi` 실행 → `experiments/outputs/field_ab/ehi_proxy.json` 확인 (B > A)
- [ ] Condition A / B 각각 `marriage.mp4` export (동일 사진 3~6장, 동일 BGM·볼륨)
- [ ] 디스플레이: 밝기·색온도·볼륨 A/B 세션 간 **변경 금지**
- [ ] 태블릿에 `experiments/field-ab/survey.html` 오프라인 열기 (또는 `/experiments/field-ab/survey.html` 호스트)

## 세션 시작 (30분 블록)

| 항목 | A (Control) | B (Treatment) |
|------|-------------|---------------|
| Fan profile | `wedding_default` | `entrance_processional` |
| Export parallax | ×0.22 | ×0.50 |
| Focus pulse | OFF | ×0.35 |
| Rotation | `yaw_cw` | `yaw_cw` |

- [ ] 세션 ID 기록: `YYYY-MM-DD-venue-blockN`
- [ ] MP4 파일명 / export 시각 기록
- [ ] 첫 10분: 설문 **수집 안 함** (안정화)

## 게스트 설문

- [ ] 입구 통과 후 **30~60초** 시청한 게스트만
- [ ] 5문항 Likert (1~5) — tablet `survey.html`
- [ ] Tier 2 목표: 조건당 **10명** / Tier 3: **30명**

## 세션 종료

- [ ] JSONL 내보내기 → `experiments/field-ab/responses.jsonl`에 merge
- [ ] `npm run analyze:field-ab` 실행
- [ ] `experiments/outputs/field_ab/analysis.json` + `report.tex` 확인

## 금지 (연구 무결성)

- 한 세션에서 A/B 동시 재생
- A/B 외 제3 연출 혼합
- 설문 전 큐브/연출 설명 (leading)
- KPI threshold / 설문 문항 mid-study 변경
