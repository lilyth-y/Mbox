# 사용자 에셋 폴더

앱 **미디어 → 내 파일** 탭에서 끌어다 놓거나, 이 폴더에 직접 넣은 뒤 **목록 새로고침** (또는 `npm run sync:user-assets`) 하면 선택·삭제할 수 있습니다.

| 폴더 | 넣을 파일 | 용도 |
|------|-----------|------|
| `bgm/` | `.mp3` | 큐브·웨딩 MP4 배경음 |
| `background/images/` | `.jpg` `.png` `.webp` | 화면 전체 배경 이미지 |
| `background/videos/` | `.mp4` `.webm` `.mov` | 화면 전체 배경 동영상 |

앱: **3D 큐브** 또는 **웨딩 심플** → **내 파일** 탭 · 썸네일 **✕** 로 삭제 (wedding-simple 업로드 사진과 동일 UX).

합성 CLI:

```powershell
.\scripts\composite_rose_cube_video.ps1 -ListUserAssets
.\scripts\composite_rose_cube_video.ps1 -BgmName "my-song.mp3" -BackgroundName "rose.mp4"
```
