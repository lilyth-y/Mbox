from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "experiments" / "assets" / "web-varied"
MANIFEST_PATH = ROOT / "experiments" / "assets" / "web-varied-manifest.json"

SAMPLES = [
    {
        "id": "web-portrait-tall",
        "label": "portrait",
        "mimeType": "image/jpeg",
        "sourceUrl": "https://picsum.photos/seed/mbox-portrait/900/1600",
        "imageFile": "web-portrait-tall.jpg",
        "width": 900,
        "height": 1600,
    },
    {
        "id": "web-landscape-wide",
        "label": "landscape",
        "mimeType": "image/jpeg",
        "sourceUrl": "https://picsum.photos/seed/mbox-landscape/1920/1080",
        "imageFile": "web-landscape-wide.jpg",
        "width": 1920,
        "height": 1080,
    },
    {
        "id": "web-square",
        "label": "square",
        "mimeType": "image/jpeg",
        "sourceUrl": "https://picsum.photos/seed/mbox-square/1024/1024",
        "imageFile": "web-square.jpg",
        "width": 1024,
        "height": 1024,
    },
    {
        "id": "web-ultrawide",
        "label": "ultrawide",
        "mimeType": "image/jpeg",
        "sourceUrl": "https://picsum.photos/seed/mbox-ultrawide/2400/800",
        "imageFile": "web-ultrawide.jpg",
        "width": 2400,
        "height": 800,
    },
    {
        "id": "web-small-offset",
        "label": "small",
        "mimeType": "image/jpeg",
        "sourceUrl": "https://picsum.photos/seed/mbox-small/480/360",
        "imageFile": "web-small-offset.jpg",
        "width": 480,
        "height": 360,
    },
]


def download(url: str, destination: Path, timeout: int = 60) -> None:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "mbox-asset-fetch/1.0"},
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        destination.write_bytes(response.read())


def verify_dimensions(path: Path, expected_width: int, expected_height: int) -> tuple[int, int]:
    try:
        from PIL import Image
    except ImportError as error:
        raise RuntimeError("Pillow is required to verify downloaded image dimensions.") from error

    with Image.open(path) as image:
        width, height = image.size

    if width != expected_width or height != expected_height:
        raise ValueError(
            f"{path.name}: expected {expected_width}x{expected_height}, got {width}x{height}"
        )

    return width, height


def main() -> int:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    manifest_samples: list[dict] = []
    started = time.time()

    for sample in SAMPLES:
        destination = ASSET_DIR / sample["imageFile"]
        if not destination.exists():
            download(sample["sourceUrl"], destination)
            time.sleep(0.4)

        width, height = verify_dimensions(destination, sample["width"], sample["height"])
        manifest_samples.append(
            {
                "id": sample["id"],
                "label": sample["label"],
                "mimeType": sample["mimeType"],
                "sourceUrl": sample["sourceUrl"],
                "imagePath": str(destination.relative_to(ROOT)).replace("\\", "/"),
                "width": width,
                "height": height,
                "bytes": destination.stat().st_size,
            }
        )

    manifest = {
        "tier": "web_varied",
        "description": "Public web images with mixed aspect ratios for focus and crop validation.",
        "source": "https://picsum.photos/",
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "samples": manifest_samples,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print(json.dumps({"manifest": str(MANIFEST_PATH), "samples": len(manifest_samples), "durationMs": int((time.time() - started) * 1000)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
