from __future__ import annotations

import sys
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ASSETS_DIR = Path(
    r"C:\Users\USER\.cursor\projects\c-startingup-TheHoloVision\assets"
)
WEB_URL = "http://localhost:5173"
DONE_TEXT = "이미지 처리 및 폴더 분류가 완료되었습니다."
CUBE_READY_TEXT = "큐브가 완벽하게 구성되었습니다"


def resolve_inputs() -> list[Path]:
    images = sorted(ASSETS_DIR.glob("*.png"))
    if len(images) < 4:
        raise FileNotFoundError(f"Expected at least 4 demo images in {ASSETS_DIR}")

    inputs = images[:4]
    while len(inputs) < 6:
        inputs.append(inputs[len(inputs) - 4])
    return inputs


def process_image(page, image_path: Path, *, first: bool) -> None:
    if first:
        page.goto(WEB_URL, wait_until="networkidle")

    page.locator('input[type="file"]').set_input_files(str(image_path))
    page.get_by_text("이미지 업로드 완료. 분석을 시작할 수 있습니다.").wait_for(timeout=30_000)
    page.get_by_role("button", name="분석 및 생성 시작").click()
    page.get_by_text(DONE_TEXT).wait_for(timeout=240_000)


def main() -> int:
    inputs = resolve_inputs()
    started = time.time()
    output_dir = ROOT / "experiments" / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})

        for index, image_path in enumerate(inputs, start=1):
            print(f"[{index}/{len(inputs)}] processing {image_path.name}", flush=True)
            try:
                process_image(page, image_path, first=index == 1)
            except PlaywrightTimeoutError as error:
                print(f"Timed out while processing {image_path.name}: {error}", file=sys.stderr)
                browser.close()
                return 1

        gallery_count = f"{len(inputs)}개 항목"

        page.get_by_role("button", name="3D 큐브").click()
        page.get_by_text("3D VISUALIZATION CUBE").wait_for(timeout=30_000)
        page.wait_for_timeout(2_000)

        try:
            page.get_by_text(CUBE_READY_TEXT).wait_for(timeout=30_000)
            cube_state = "complete"
        except PlaywrightTimeoutError:
            cube_state = "partial"

        page.screenshot(path=output_dir / "moda_cube_demo.png", full_page=True)
        browser.close()

    print(
        {
            "processedImages": len(inputs),
            "galleryCount": gallery_count,
            "cubeState": cube_state,
            "durationMs": int((time.time() - started) * 1000),
            "screenshot": "experiments/outputs/moda_cube_demo.png",
        },
        flush=True,
    )
    return 0 if cube_state == "complete" else 1


if __name__ == "__main__":
    raise SystemExit(main())
