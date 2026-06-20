# 웨딩 홀로그램 오퍼레이터 (Wedding Hologram Operator)

이 폴더는 식장/전시장의 3D 홀로그램 팬 디스플레이에 송출할 고품질 `marriage.mp4` 비디오를 5~6번의 마우스 클릭만으로 신속히 렌더링하고 다운로드할 수 있는 **독립형 프런트엔드 단독 프로젝트**입니다.

## 🌟 주요 특징
- **웹 서버 배포 호환**: Vite 웹 앱의 `public` 디렉토리에 내장되어 있어, 빌드 및 배포 시 `http://localhost:5173/wedding-simple/index.html` 주소를 통해 즉각 접근 및 호스팅 가능합니다.
- **로컬 dev COEP**: 메인 Mbox 앱은 `@imgly/background-removal` WASM을 위해 `require-corp`를 사용합니다. wedding-simple은 Tailwind/Lucide CDN을 쓰므로 Vite dev/preview에서만 `/wedding-simple/*` 경로에 `COEP: unsafe-none`을 적용합니다 (`apps/web/vite.config.ts`).
- **고품격 웨딩 비주얼**: 칙칙한 디자인을 걷어내고, 샴페인 골드 & 로즈 골드의 메탈릭 광택과 은은한 로즈 핑크 네온 조명, 잔잔히 빛나는 배경 별무리 효과를 적용했습니다.
- **5-Click 스마트 빌더**:
  1. 사진 3~6장 선택 (업로드)
  2. AI 원클릭 자동 보정 시작 (배경 유지 · AI 초점·크롭)
  3. 로즈골드/크리스탈 프레임, 보석 하트/벚꽃 파티클 테마, 배경음악 프리셋 선택 (기본 완성형 세팅 제공)
  4. marriage.mp4 동영상 파일 내보내기 클릭
  5. 렌더링 완료 시 자동 다운로드

## 🚀 실행 방법
이 폴더의 `start.bat` 파일을 더블 클릭하면 자동으로 로컬 개발 서버가 구동 중인 브라우저 화면(`http://localhost:5173/wedding-simple/`)이 활성화됩니다.
또는 프로덕션 빌드 후 배포된 웹 주소의 `/wedding-simple/` 경로를 통해 서비스할 수 있습니다.
