from __future__ import annotations

import json
import os
import time
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "experiments" / "outputs"
MANIFEST_PATH = ROOT / "experiments" / "assets" / "data-asset-manifest.json"
WEB_URL = os.getenv("WEB_URL", "http://localhost:4173")
BATCH_ERROR_TEXT = "배치 처리 중 오류"
SEGMENT_MS = 1_500 + 900 + 2_000 + 600
BATCH_TIMEOUT_MIN_MS = 3_600_000
BATCH_TIMEOUT_PER_IMAGE_MS = 480_000


def load_expected_image_count() -> int:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    samples = manifest.get("samples", [])
    if not samples:
        raise ValueError(f"No samples found in {MANIFEST_PATH}")
    return len(samples)


def resolve_batch_timeout_ms(expected_count: int) -> int:
    override = os.getenv("BATCH_TIMEOUT_MS")
    if override:
        return int(override)
    return max(BATCH_TIMEOUT_MIN_MS, expected_count * BATCH_TIMEOUT_PER_IMAGE_MS)


def main() -> int:
    expected_count = load_expected_image_count()
    batch_done_text = f"data/asset 배치 처리가 완료되었습니다. {expected_count}장"
    batch_timeout_ms = resolve_batch_timeout_ms(expected_count)
    cube_sequence_ms = expected_count * SEGMENT_MS

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    started = time.time()
    result: dict = {
        "webUrl": WEB_URL,
        "expectedImageCount": expected_count,
        "batchTimeoutMs": batch_timeout_ms,
        "batchStatus": "pending",
        "cubeStatus": "pending",
        "videoStatus": "pending",
    }

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})

        try:
            page.goto(WEB_URL, wait_until="networkidle")
            page.get_by_role("button", name="data/asset 배치 처리 (1GB 한도)").click()
            page.get_by_text(batch_done_text, exact=False).wait_for(timeout=batch_timeout_ms)
            page.get_by_text(f"{expected_count}개", exact=False).wait_for(timeout=30_000)
            result["batchStatus"] = "ok"
        except PlaywrightTimeoutError as error:
            result["batchStatus"] = "failed"
            result["error"] = str(error)
            page.screenshot(path=OUTPUT_DIR / "data_asset_batch_timeout.png", full_page=True)
            status_text = ""
            try:
                status_text = page.locator("p.italic").last.inner_text(timeout=5_000)
            except PlaywrightTimeoutError:
                pass
            if status_text:
                result["lastStatus"] = status_text
            if page.get_by_text(BATCH_ERROR_TEXT, exact=False).is_visible():
                result["batchErrorVisible"] = True
            browser.close()
            write_result(result, started)
            return 1

        try:
            page.get_by_role("button", name="3D 큐브").click()
            page.get_by_text(f"재생 {expected_count}장").wait_for(timeout=60_000)
            result["cubeStatus"] = "ok"
            page.screenshot(path=OUTPUT_DIR / "data_asset_cube_20.png", full_page=True)
        except PlaywrightTimeoutError as error:
            result["cubeStatus"] = "failed"
            result["error"] = str(error)
            browser.close()
            write_result(result, started)
            return 1

        try:
            video_path = OUTPUT_DIR / f"data_asset_cube_{expected_count}.webm"
            download_timeout_ms = cube_sequence_ms + 180_000
            with page.expect_download(timeout=download_timeout_ms) as download_info:
                page.get_by_role("button", name="MP4 생성").click()
                page.get_by_text("MP4 생성 파일이 준비되었습니다", exact=False).wait_for(
                    timeout=download_timeout_ms
                )
            download = download_info.value
            suggested_name = download.suggested_filename or ""
            if suggested_name.lower().endswith(".mp4"):
                video_path = OUTPUT_DIR / f"data_asset_cube_{expected_count}.mp4"
            elif suggested_name.lower().endswith(".webm"):
                video_path = OUTPUT_DIR / f"data_asset_cube_{expected_count}.webm"
            download.save_as(video_path)
            result["videoStatus"] = "ok"
            result["videoPath"] = str(video_path.relative_to(ROOT)).replace("\\", "/")
        except PlaywrightTimeoutError as error:
            result["videoStatus"] = "failed"
            result["error"] = str(error)
            browser.close()
            write_result(result, started)
            return 1

        browser.close()

    write_result(result, started)
    return 0 if all(result[key] == "ok" for key in ("batchStatus", "cubeStatus", "videoStatus")) else 1


def write_result(result: dict, started: float) -> None:
    result["durationMs"] = int((time.time() - started) * 1000)
    output_path = OUTPUT_DIR / "data_asset_cube_20_result.json"
    output_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(result, indent=2), flush=True)


if __name__ == "__main__":
    raise SystemExit(main())
