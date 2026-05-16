from __future__ import annotations

import base64
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
API = "http://localhost:8787"
WEB = "http://localhost:5173"
IMAGE = ROOT / "data/asset/temp_1778692001076.-1818431043/KakaoTalk_20260505_131306132_01.jpg"
DONE = "data/asset 배치 처리가 완료되었습니다. 20장"


def get(path: str) -> tuple[int, str]:
    req = urllib.request.Request(f"{API}{path}")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, resp.read(500).decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read(500).decode("utf-8", errors="replace")


def post_json(path: str, body: dict, timeout: int = 120) -> tuple[int, dict | str]:
    payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        f"{API}{path}",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw)
    except urllib.error.HTTPError as error:
        return error.code, error.read(2000).decode("utf-8", errors="replace")
    except Exception as error:
        return 0, str(error)


def main() -> int:
    print("=== API checks ===", flush=True)
    status, body = get("/health")
    print(f"health: {status} {body}", flush=True)

    status, body = get("/asset-manifest/data-asset")
    print(f"manifest: {status} sample={body[:120]!r}", flush=True)

    status, body = get(
        "/asset-image?path="
        + urllib.parse.quote("data/asset/temp_1778692001076.-1818431043/KakaoTalk_20260505_131306132_01.jpg")
    )
    print(f"asset-image: {status} bytes={len(body) if status == 200 else body[:200]}", flush=True)

    if not IMAGE.exists():
        print(f"Missing local image: {IMAGE}", file=sys.stderr)
        return 1

    b64 = base64.b64encode(IMAGE.read_bytes()).decode("ascii")
    started = time.time()
    status, result = post_json("/analyze", {"imageBase64": b64, "mimeType": "image/jpeg"}, timeout=180)
    print(f"analyze: {status} in {time.time() - started:.1f}s", flush=True)
    if isinstance(result, dict) and "metadata" in result:
        print(f"  label={result['metadata'].get('label')}", flush=True)
    else:
        print(f"  error={result!r}", flush=True)
        return 1

    started = time.time()
    status, result = post_json(
        "/analyze/batch",
        {
            "items": [
                {"id": "kakao-01", "imageBase64": b64, "mimeType": "image/jpeg"},
                {"id": "kakao-02", "imageBase64": b64, "mimeType": "image/jpeg"},
            ],
            "focusTarget": "",
        },
        timeout=300,
    )
    print(f"analyze/batch: {status} in {time.time() - started:.1f}s", flush=True)
    if isinstance(result, dict):
        for item in result.get("results", []):
            print(
                f"  {item.get('id')}: "
                f"{'ok' if item.get('metadata') else 'fail'} "
                f"{item.get('error', '')}",
                flush=True,
            )
    else:
        print(f"  error={result!r}", flush=True)
        return 1

    print("\n=== Playwright UI probe (600s) ===", flush=True)
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("playwright not installed; skipping UI probe", flush=True)
        return 0

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})
        page.goto(WEB, wait_until="networkidle", timeout=60_000)
        page.get_by_role("button", name="data/asset 배치 처리 (1GB 한도)").click()
        deadline = time.time() + 600
        last_status = ""
        while time.time() < deadline:
            status_el = page.locator("p.italic").last
            if status_el.count():
                text = status_el.inner_text(timeout=1000)
                if text != last_status:
                    print(f"  status: {text}", flush=True)
                    last_status = text
            if page.get_by_text(DONE, exact=False).is_visible():
                print("  batch done text visible", flush=True)
                browser.close()
                return 0
            if page.get_by_text("20개", exact=False).is_visible():
                print("  gallery count visible (batch complete)", flush=True)
                browser.close()
                return 0
            if page.get_by_text("배치 처리 중 오류", exact=False).is_visible():
                print("  batch error visible", flush=True)
                browser.close()
                return 1
            page.wait_for_timeout(2000)
        print("  timed out waiting for batch completion (600s)", flush=True)
        browser.close()
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
