"""
Quick preview from KakaoTalk JPGs (data-asset-manifest).

Default: 20-image data/asset batch (fast when API cache is warm), then 3D cube.
Set KAKAO_PREVIEW_COUNT=3 to upload fewer files via the UI instead.

Requires: npm run dev (web :5173, API :8787)
"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "experiments" / "outputs"
MANIFEST_PATH = ROOT / "experiments" / "assets" / "data-asset-manifest.json"
KAKAO_DIR = ROOT / "data" / "asset" / "temp_1778692001076.-1818431043"
WEB_URL = os.getenv("WEB_URL", "http://localhost:5173")
PREVIEW_COUNT = int(os.getenv("KAKAO_PREVIEW_COUNT", "20"))
USE_BATCH = os.getenv("KAKAO_USE_BATCH", "true").lower() in ("1", "true", "yes")
HOLD_MS = int(os.getenv("KAKAO_PREVIEW_HOLD_MS", "120000"))
PROCESS_TIMEOUT_MS = int(os.getenv("KAKAO_PROCESS_TIMEOUT_MS", "900000"))
# Milliseconds between Playwright actions (0 = off). Makes browser automation easier to follow.
SLOW_MO_MS = int(os.getenv("KAKAO_SLOW_MO_MS", "0"))


def load_kakao_paths(limit: int) -> list[Path]:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    paths: list[Path] = []
    for sample in manifest.get("samples", []):
        relative = sample.get("imagePath", "")
        path = ROOT / relative.replace("/", os.sep)
        if path.is_file():
            paths.append(path)
        if len(paths) >= limit:
            break
    if not paths:
        paths = sorted(KAKAO_DIR.glob("KakaoTalk_*.jpg"))[:limit]
    if not paths:
        raise FileNotFoundError(f"No KakaoTalk JPGs under {KAKAO_DIR}")
    return paths


def read_header_status(page) -> str:
    try:
        return page.locator("header p.italic").first.inner_text(timeout=5_000)
    except PlaywrightTimeoutError:
        return ""


def wait_for_status(page, pattern: str, timeout_ms: int) -> None:
    page.get_by_text(pattern, exact=False).wait_for(timeout=timeout_ms)


def run_batch_flow(page, count: int) -> None:
    batch_button = page.get_by_role("button", name="data/asset 배치 처리 (1GB 한도)")
    if not batch_button.is_visible(timeout=5_000):
        raise RuntimeError(
            "Batch button not visible. Set VITE_LOCALHOST_DEMO=true or VITE_ENABLE_DEV_ASSET_BATCH=true, then restart web."
        )
    print("Running data/asset batch (20 KakaoTalk JPGs)...", flush=True)
    batch_button.click()
    wait_for_status(page, f"배치 처리가 완료되었습니다. {count}장", PROCESS_TIMEOUT_MS)


def run_upload_flow(page, image_paths: list[Path]) -> None:
    count = len(image_paths)
    print(f"Uploading {count} file(s) via UI...", flush=True)
    file_input = page.locator('input[type="file"]').first
    file_input.set_input_files([str(path) for path in image_paths])
    upload_done = (
        "이미지 업로드 완료" if count == 1 else f"{count}장 업로드 완료"
    )
    wait_for_status(page, upload_done, 60_000)
    page.get_by_role("button", name="분석·크롭 시작").click()
    process_done = (
        "이미지 분석·크롭이 완료되었습니다"
        if count == 1
        else f"{count}장 분석·크롭이 완료되었습니다"
    )
    wait_for_status(page, process_done, PROCESS_TIMEOUT_MS)


def main() -> int:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    manifest_count = len(manifest.get("samples", []))
    use_batch = USE_BATCH and PREVIEW_COUNT >= manifest_count

    if use_batch:
        image_paths = load_kakao_paths(manifest_count)
        process_count = manifest_count
    else:
        image_paths = load_kakao_paths(PREVIEW_COUNT)
        process_count = len(image_paths)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"KakaoTalk source: {KAKAO_DIR}", flush=True)
    for path in image_paths[:5]:
        print(f"  - {path.name}", flush=True)
    if len(image_paths) > 5:
        print(f"  ... +{len(image_paths) - 5} more", flush=True)

    launch_kwargs: dict = {"headless": False}
    if SLOW_MO_MS > 0:
        launch_kwargs["slow_mo"] = SLOW_MO_MS

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(**launch_kwargs)
        page = browser.new_page(viewport={"width": 1440, "height": 960})
        page.goto(WEB_URL, wait_until="networkidle")

        try:
            if use_batch:
                run_batch_flow(page, process_count)
            else:
                run_upload_flow(page, image_paths)
        except PlaywrightTimeoutError as error:
            status = read_header_status(page)
            print(f"Processing failed: {error}", file=sys.stderr)
            if status:
                print(f"Last status: {status}", file=sys.stderr)
            page.screenshot(path=OUTPUT_DIR / "kakao_preview_timeout.png", full_page=True)
            browser.close()
            return 1

        page.get_by_role("button", name="3D 큐브").click()
        page.get_by_text(f"재생 {process_count}장", exact=False).wait_for(timeout=120_000)
        page.screenshot(path=OUTPUT_DIR / "kakao_preview_cube.png", full_page=True)
        print(f"Cube ready: {OUTPUT_DIR / 'kakao_preview_cube.png'}", flush=True)
        print("Browser open - use MP4 download in the cube tab to export a file.", flush=True)
        if HOLD_MS > 0:
            page.wait_for_timeout(HOLD_MS)
        browser.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
