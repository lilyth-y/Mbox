# Human smoke — Crystal Showcase (실사 6장 · heart / cube)

코드 verify(9/9)와 별도로, **사람 눈**으로 “팔 만한가”를 보는 절차입니다.

## 준비

1. `npm install` · `npx playwright install chromium` (최초 1회)
2. 터미널 A: `npm run dev`
3. (선택) `npm run sync:backgrounds:local` — booth 배경 테스트 시

## 자동 스크린샷 캡처

```bash
npm run human-smoke:showcase
```

- **사진:** `data/asset/temp_…/KakaoTalk_*.jpg` **6장** (카톡 실사)
- **형상:** `heart` → `cube` 순
- **프리셋:** `rose_gold_premium` · 배경 `solid_black`

출력: `experiments/outputs/human-smoke/<타임스탬프>/`

| 파일 | 의미 |
|------|------|
| `02_canvas_upload_ready.png` | 업로드 직후 — 사진 부착·크롭 |
| `03_canvas_pull_hold.png` | **pull hold 베스트샷** (자동 타이밍) |
| `04_viewport_pull_hold.png` | UI 포함 전체 화면 |
| `CHECKLIST.md` | 사람용 체크표 |
| `manifest.json` | 자동 audit 수치 |

### 옵션

```bash
# heart만
MBOX_HUMAN_SMOKE_SHAPES=heart npm run human-smoke:showcase

# booth 배경 + mf001
MBOX_HUMAN_SMOKE_BG=booth npm run human-smoke:showcase
# (backdrop은 UI에서 mf001 선택 후 수동 캡처 권장)

# 브라우저 창 보이기
MBOX_HEADED=1 npm run human-smoke:showcase
```

## 사람이 보는 순서 (15분)

### 1. heart (6장 동시 업로드)

`heart/` 폴더 PNG를 **크게** 연다.

1. **02** — 6장 중 현재 프레임: 얼굴/피사체가 하트 실루엣 안에 **자연스러운가**
2. **03** — pull hold: “이 한 장면을 MP4 대표 컷으로 써도 되는가”
3. **04** — 전체 UI·여백과 함께 봤을 때 **저가 데모**처럼 보이지 않는가

체크 (`CHECKLIST.md` heart 열):

- ☐ 왜곡·잘림 없음  
- ☐ 구도 OK  
- ☐ 유리/반사 과하지 않음  
- ☐ pull이 팔 만한 장면  
- ☐ **종합: 시연 가능**

### 2. cube (동일 6장)

`cube/` 폴더 — 같은 순서로 **02 → 03 → 04**.

큐브는 **6면/내부 seam** — 모서리에서 사진 끊김·밝기 불균형 주의.

### 3. (선택) RTX Chrome 라이브

자동 캡처는 headless/SwiftShader일 수 있음. 최종 판단 전:

```
http://localhost:5173/showcase.html?localOnly=1&fullGpu=1&companionTarget=1&noPhysics=1
```

동일 6장 업로드 → heart/cube 수동 전환 → **30초 재생** 관찰.

## FAIL 기준 (사람)

다음 **하나라도** 해당하면 human FAIL (코드 PASS와 무관):

- 실사 얼굴이 심하게 찌그러짐·잘림  
- pull 구간이 “대표 컷”으로 쓸 수 없을 정도로 밋밋하거나 어색  
- 반사/유리가 사진을 가려 **피사체 식별이 어려움**  
- “웨딩/행사 부스에 틀어놓기 부끄럽다”는 직관  

## 기록

`CHECKLIST.md` 하단 메모 + 필요 시 `experiments/outputs/human-smoke/` 스크린샷을 팀 공유.

다음 단계(통과 시): `tall_rect`, `sphere`, booth+mf001 배경, MP4 export 1본 **TV 1:1 재생**.
