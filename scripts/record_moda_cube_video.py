from __future__ import annotations

import shutil
import sys
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

from demo_moda_cube import CUBE_READY_TEXT, DONE_TEXT, WEB_URL, process_image, resolve_inputs

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "experiments" / "outputs"
VIDEO_PATH = OUTPUT_DIR / "moda_cube_demo.webm"
CUBE_RECORD_MS = 12_000


def main() -> int:
    inputs = resolve_inputs()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    started = time.time()

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir=str(OUTPUT_DIR / "video_tmp"),
            viewport={"width": 1440, "height": 960},
        )
        page = context.new_page()

        for index, image_path in enumerate(inputs, start=1):
            print(f"[{index}/{len(inputs)}] processing {image_path.name}", flush=True)
            try:
                process_image(page, image_path, first=index == 1)
            except PlaywrightTimeoutError as error:
                print(f"Timed out while processing {image_path.name}: {error}", file=sys.stderr)
                page.close()
                context.close()
                browser.close()
                return 1

        page.get_by_role("button", name="3D 큐브").click()
        page.get_by_text("3D VISUALIZATION CUBE").wait_for(timeout=30_000)
        page.get_by_text(CUBE_READY_TEXT).wait_for(timeout=30_000)
        page.wait_for_timeout(CUBE_RECORD_MS)

        recorded = page.video.path() if page.video else None
        page.close()
        context.close()
        browser.close()

    if not recorded:
        print("Playwright did not return a recorded video path.", file=sys.stderr)
        return 1

    shutil.move(recorded, VIDEO_PATH)
    shutil.rmtree(OUTPUT_DIR / "video_tmp", ignore_errors=True)

    print(
        {
            "processedImages": len(inputs),
            "cubeState": "complete",
            "durationMs": int((time.time() - started) * 1000),
            "video": str(VIDEO_PATH.relative_to(ROOT)).replace("\\", "/"),
        },
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
