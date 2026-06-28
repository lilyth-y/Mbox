# 상품화(commercial_launch) 문제 정의

목표: `SHOWCASE_CURRENT_CONTENT_TARGET = commercial_launch` — 키오스크·LED·대량 납품 가능한 품질.

## 상태 요약 (2026-06-28)

| 영역 | 자동 검증 | 인간 판매 가능 | 블로커 |
|------|-----------|----------------|--------|
| 파이프라인 스테이지 maturity | 9/9 PASS | — | 없음 |
| WYSIWYG export (2160²) | PASS | 미확인 (TV 재생) | 현장 1:1 미검 |
| 100장 photo batch | PASS (합성 corpus) | 미확인 | **실사 Kakao 미검** |
| 6형상 live gate | PASS | heart OK, **cube pull-hold FAIL** | `photo_duplicate_face` |
| 부스/LED 색역 | 코드 PASS | 미확인 | 현장 A/B 없음 |
| 클라우드 render job | PASS (로컬 worker) | — | gcloud/Vertex 미검 |
| 내부 파일럿 배포 | — | — | `deploy-internal.md` 미실행 |

**결론:** CI는 green이지만 **판매 히어로 프레임(cube pull-hold)** 과 **실사 배치**가 상품화 블로커.

---

## P0 — 판매 불가 (zero-tolerance)

### P0-1 `photo_duplicate_face` (cube pull-hold)

- **상태:** portrait pull-hero 레이어 + hold 구간 6면 숨김 구현
- **검증:** `npm run human-smoke:showcase` — cube pull-hold에 실사 웨딩 프레임 노출 (2026-06-28)
- **남은 작업:** audit 타이밍·`inPullHold` 동기화 정교화, 6형상 확장

### P0-2 실사 photo batch (100% 합격 요구)

- **증상:** `verify:showcase-photo-batch`는 ffmpeg 합성 100장만 검증
- **판제:** Kakao 실사 20장+ 업로드 audit + human-smoke 6형상
- **해결:** `data/asset/` 실사 corpus 경로를 batch gate에 옵션 추가

---

## P1 — 출시 전 필수

### P1-1 인간 판매 가능 게이트 (human sellability)

- 자동 luma/variance ≠ 구매욕·얼굴 프레이밍
- `human-smoke:showcase` + CHECKLIST.md 수동 sign-off 프로세스 필요
- 6형상 전체(현재 heart+cube만) 확장

### P1-2 WYSIWYG 현장 1:1

- 미리보기 vs MP4 vs LED/TV 재생 3-way 비교 (booth preset)
- `verify:showcase-commercial:e2e`는 픽셀 Δluma만 — 색역·감마는 미검

### P1-3 내부 파일럿 배포 E2E

- `docs/deploy-internal.md` 따라 API+web+worker 실제 URL에서 render job 1건

---

## P2 — 출시 후·연구

- Field A/B guest satisfaction (TODO.md)
- FQI Tier 3 live capture
- Vertex `/analyze` 로컬 gcloud 연동

---

## 해결 우선순위

1. **P0-1** cube face visibility 복구 + automated gate
2. **P0-2** 실사 20장 batch verify 스크립트
3. **P1-1** human-smoke 6형상 + sellability checklist
4. **P1-2** booth MP4 TV smoke
5. **P1-3** internal deploy validation

## 명령어

```bash
npm run dev                                    # 전제
npm run verify:showcase-commercial:e2e         # 9/9 자동 게이트
npm run human-smoke:showcase                   # 실사 Kakao heart+cube
MBOX_HUMAN_SMOKE_SHAPES=cube npm run human-smoke:showcase  # cube만
```
