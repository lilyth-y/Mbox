from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "experiments" / "assets"
OUTPUTS = ROOT / "experiments" / "outputs"
DEFAULT_MANIFEST = ASSETS / "original-sample-manifest.json"
MAX_API_IMAGE_EDGE = 1536
ALLOWED_CATEGORIES = {
    "인물",
    "커플",
    "가족",
    "반려동물",
    "음식",
    "풍경",
    "행사",
    "기타",
}


def prepare_image_payload(image_path: Path, mime_type: str) -> tuple[bytes, str]:
    try:
        from io import BytesIO

        from PIL import Image
    except ImportError:
        return image_path.read_bytes(), mime_type

    with Image.open(image_path) as image:
        rgb = image.convert("RGB")
        width, height = rgb.size
        longest_edge = max(width, height)
        if longest_edge > MAX_API_IMAGE_EDGE:
            scale = MAX_API_IMAGE_EDGE / longest_edge
            rgb = rgb.resize(
                (max(1, int(width * scale)), max(1, int(height * scale))),
                Image.Resampling.LANCZOS,
            )

        buffer = BytesIO()
        rgb.save(buffer, format="JPEG", quality=82)
        return buffer.getvalue(), "image/jpeg"


def validate_analyze_metadata(metadata: dict, sample: dict) -> list[str]:
    issues: list[str] = []
    category = metadata.get("category")
    confidence = metadata.get("categoryConfidence")

    if not isinstance(category, str) or category not in ALLOWED_CATEGORIES:
        issues.append(f"invalid category: {category!r}")

    if not isinstance(confidence, (int, float)):
        issues.append(f"missing categoryConfidence: {confidence!r}")
    elif confidence < 0 or confidence > 1:
        issues.append(f"categoryConfidence out of range: {confidence!r}")

    expected = sample.get("expectedSuggestedCategory")
    if expected and category != expected:
        issues.append(f"expectedSuggestedCategory mismatch: {expected!r} != {category!r}")

    return issues


def load_env_files() -> None:
    for env_path in (ROOT / "apps" / "api" / ".env", ROOT / ".env"):
        if not env_path.exists():
            continue
        for line in env_path.read_text(encoding="utf-8").splitlines():
            stripped = line.strip()
            if not stripped or stripped.startswith("#") or "=" not in stripped:
                continue
            key, value = stripped.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def fetch_json(url: str, payload: dict | None = None, timeout: int = 120) -> dict:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"} if payload is not None else {},
        method="GET" if payload is None else "POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def resolve_image_path(sample: dict) -> Path:
    if "imagePath" in sample:
        path = ROOT / sample["imagePath"]
    elif "imageFile" in sample:
        path = ASSETS / sample["imageFile"]
    else:
        raise KeyError("Sample must define imagePath or imageFile.")

    if not path.exists():
        raise FileNotFoundError(f"Sample image not found: {path}")
    return path


def resolve_mime_type(sample: dict, image_path: Path) -> str:
    if sample.get("mimeType"):
        return sample["mimeType"]
    guessed, _ = mimetypes.guess_type(image_path.name)
    return guessed or "application/octet-stream"


def ensure_png(path: Path, color: tuple[int, int, int]) -> None:
    if path.exists():
        return

    try:
        from PIL import Image
    except ImportError:
        path.write_bytes(
            base64.b64decode(
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2ZP6YAAAAASUVORK5CYII="
            )
        )
        return

    image = Image.new("RGB", (64, 64), color)
    image.save(path, format="PNG")


def run_tier1(api_base: str, manifest_path: Path, full_e2e: bool) -> dict:
    OUTPUTS.mkdir(parents=True, exist_ok=True)
    tier_dir = OUTPUTS / "tier1_smoke"
    tier_dir.mkdir(parents=True, exist_ok=True)

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    if manifest_path.name == "sample-manifest.json":
        ensure_png(ASSETS / "synthetic-center.png", (220, 38, 38))
        ensure_png(ASSETS / "synthetic-offset.png", (37, 99, 235))

    started = time.time()
    health = fetch_json(f"{api_base}/health")
    result: dict = {
        "tier": "tier1_smoke",
        "manifest": str(manifest_path.relative_to(ROOT)).replace("\\", "/"),
        "apiBase": api_base,
        "health": health,
        "samples": [],
        "durationMs": 0,
    }

    provider_ready = bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_CLOUD_PROJECT"))
    for sample in manifest["samples"]:
        image_path = resolve_image_path(sample)
        mime_type = resolve_mime_type(sample, image_path)
        sample_result = {
            "id": sample["id"],
            "imagePath": str(image_path.relative_to(ROOT)).replace("\\", "/"),
            "bytes": image_path.stat().st_size,
            "status": "manifest-only",
        }

        if provider_ready:
            image_bytes, prepared_mime_type = prepare_image_payload(image_path, mime_type)
            image_base64 = base64.b64encode(image_bytes).decode("ascii")
            try:
                analyze_started = time.time()
                analyze = fetch_json(
                    f"{api_base}/analyze",
                    {"imageBase64": image_base64, "mimeType": prepared_mime_type},
                )
                sample_result["analyze"] = analyze
                sample_result["analyzeLatencyMs"] = int((time.time() - analyze_started) * 1000)
                metadata = analyze.get("metadata", {})
                validation_issues = validate_analyze_metadata(metadata, sample)
                if validation_issues:
                    sample_result["validationIssues"] = validation_issues
                    sample_result["status"] = "analyze-invalid"
                else:
                    sample_result["status"] = "analyze-ok"

                if full_e2e and sample_result["status"] == "analyze-ok":
                    metadata = analyze["metadata"]
                    edit_started = time.time()
                    edit = fetch_json(
                        f"{api_base}/edit",
                        {
                            "imageBase64": image_base64,
                            "label": metadata["label"],
                            "bgPrompt": metadata["bgPrompt"],
                            "mimeType": prepared_mime_type,
                        },
                    )
                    sample_result["edit"] = {
                        "mimeType": edit["mimeType"],
                        "imageBase64Length": len(edit["imageBase64"]),
                    }
                    sample_result["editLatencyMs"] = int((time.time() - edit_started) * 1000)
                    sample_result["status"] = "edit-ok"
            except urllib.error.HTTPError as error:
                sample_result["status"] = "failed"
                sample_result["error"] = error.read().decode("utf-8")
            except urllib.error.URLError as error:
                sample_result["status"] = "failed"
                sample_result["error"] = str(error.reason)

        result["samples"].append(sample_result)

    result["durationMs"] = int((time.time() - started) * 1000)
    result["validationFailures"] = sum(
        1 for sample in result["samples"] if sample.get("status") == "analyze-invalid"
    )
    output_path = tier_dir / "result.json"
    output_path.write_text(json.dumps(result, indent=2), encoding="utf-8")
    return result


def main() -> int:
    load_env_files()

    parser = argparse.ArgumentParser()
    parser.add_argument("--tier", default="tier1_smoke")
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST))
    parser.add_argument("--api-base", default=os.getenv("VITE_API_BASE_URL", "http://localhost:8787"))
    parser.add_argument("--full-e2e", action="store_true")
    args = parser.parse_args()

    if args.tier != "tier1_smoke":
        print(f"Unsupported tier: {args.tier}", file=sys.stderr)
        return 1

    manifest_path = Path(args.manifest)
    if not manifest_path.is_absolute():
        manifest_path = ROOT / manifest_path

    result = run_tier1(args.api_base.rstrip("/"), manifest_path, args.full_e2e)
    print(json.dumps(result, indent=2))
    if not result["health"].get("ok"):
        return 1
    if result.get("validationFailures"):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
