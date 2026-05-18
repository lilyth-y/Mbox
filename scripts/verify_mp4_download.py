"""
Verify MP4 Download from KakaoTalk JPGs.
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
WEB_URL = os.getenv("WEB_URL", "http://localhost:5176")
PREVIEW_COUNT = int(os.getenv("KAKAO_PREVIEW_COUNT", "20"))
USE_BATCH = os.getenv("KAKAO_USE_BATCH", "true").lower() in ("1", "true", "yes")
PROCESS_TIMEOUT_MS = int(os.getenv("KAKAO_PROCESS_TIMEOUT_MS", "900000"))
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
    batch_button = page.get_by_role("button", name="data/asset 배치 처리")
    if not batch_button.is_visible(timeout=5_000):
        # Fallback to precise name
        batch_button = page.get_by_role("button", name="data/asset 배치 처리 (1GB 한도)")
    print("Running data/asset batch (20 KakaoTalk JPGs)...", flush=True)
    batch_button.click()
    wait_for_status(page, f"배치 처리가 완료되었습니다", PROCESS_TIMEOUT_MS)

def run_upload_flow(page, image_paths: list[Path]) -> None:
    count = len(image_paths)
    print(f"Uploading {count} file(s) via UI...", flush=True)
    file_input = page.locator('input[type="file"]').first
    file_input.set_input_files([str(path) for path in image_paths])
    upload_done = (
        "이미지 업로드 완료" if count == 1 else f"업로드 완료"
    )
    wait_for_status(page, upload_done, 60_000)
    page.get_by_role("button", name="분석·크롭 시작").click()
    process_done = (
        "이미지 분석·크롭이 완료되었습니다"
        if count == 1
        else f"분석·크롭이 완료되었습니다"
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

    launch_kwargs: dict = {"headless": True}
    if SLOW_MO_MS > 0:
        launch_kwargs["slow_mo"] = SLOW_MO_MS
        launch_kwargs["headless"] = False

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

        print("Navigating to 3D Cube...", flush=True)
        page.get_by_role("button", name="3D 큐브").click()
        page.get_by_text(f"재생 {process_count}장", exact=False).wait_for(timeout=120_000)
        
        print("Clicking MP4 Download...", flush=True)
        # Wait for the MP4 download button and click it
        download_button = page.get_by_role("button", name="MP4 생성").first
        download_button.wait_for(state="visible", timeout=10000)
        
        try:
            with page.expect_download(timeout=180000) as download_info:
                download_button.click()
            download = download_info.value
            save_path = OUTPUT_DIR / download.suggested_filename
            download.save_as(save_path)
            print(f"Download complete: {save_path}", flush=True)
        except PlaywrightTimeoutError as error:
            print(f"Download failed: {error}", file=sys.stderr)
            page.screenshot(path=OUTPUT_DIR / "kakao_mp4_timeout.png", full_page=True)
            browser.close()
            return 1
            
        browser.close()

    return 0

if __name__ == "__main__":
    raise SystemExit(main())
