#!/usr/bin/env python3
"""Remove solid studio background from fan-blade ornament PNGs (true alpha cutout)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DIRS = [
    ROOT / "apps/web/public/assets/fan-blade-ornaments",
    ROOT / "wedding-simple/assets/fan-blade-ornaments",
]

TOLERANCE = float(sys.argv[1]) if len(sys.argv) > 1 else 34.0
SHADOW_SAT_MAX = 26
MAX_SIDE = 768


def matte_rgba(arr: np.ndarray, tolerance: float) -> np.ndarray:
    rgb = arr[:, :, :3].astype(np.float32)
    h, w = rgb.shape[:2]
    corners = np.array(
        [rgb[0, 0], rgb[0, w - 1], rgb[h - 1, 0], rgb[h - 1, w - 1]], dtype=np.float32
    )
    bg = np.median(corners, axis=0)
    dist = np.linalg.norm(rgb - bg, axis=2)
    sat = rgb.max(axis=2) - rgb.min(axis=2)

    bg_like = (dist < tolerance) | ((dist < tolerance + 18.0) & (sat < SHADOW_SAT_MAX))
    # Studio drop shadows (gray, low saturation) — keep petals/leaves/gold.
    shadow = (sat < 34) & (dist < 58.0) & (~bg_like)
    alpha = arr[:, :, 3].astype(np.float32)
    alpha[bg_like | shadow] = 0.0

    feather = np.clip((dist - tolerance * 0.35) / max(tolerance * 0.85, 0.001), 0.0, 1.0)
    edge = (~bg_like) & (dist < tolerance + 14.0)
    alpha[edge] = np.minimum(alpha[edge], feather[edge] * 255.0)

    out = arr.copy()
    out[:, :, 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    return out


def trim_rose_head_only(arr: np.ndarray) -> np.ndarray:
    alpha = arr[:, :, 3]
    mask = alpha > 40
    if not mask.any():
        return arr
    ys, xs = np.where(mask)
    y0, y1 = int(ys.min()), int(ys.max())
    x0, x1 = int(xs.min()), int(xs.max())
    sub = mask[y0 : y1 + 1, x0 : x1 + 1]
    row_count = sub.shape[0]
    widths = sub.sum(axis=1).astype(np.float32)
    peak = float(widths.max())
    if peak <= 0:
        return arr

    peak_row = int(np.argmax(widths))
    upper_limit = max(peak_row, int(row_count * 0.42))
    head_bottom = 0
    for r in range(upper_limit + 1):
        if widths[r] >= peak * 0.85:
            head_bottom = r

    if head_bottom < peak_row * 0.5:
        streak = 0
        for r in range(peak_row + 1, min(row_count, peak_row + 120)):
            if widths[r] < peak * 0.88:
                streak += 1
                if streak >= 5:
                    head_bottom = r - 5
                    break
            else:
                streak = 0

    head_top = head_bottom
    for r in range(head_bottom + 1):
        if widths[r] >= peak * 0.35:
            head_top = r
            break

    out = arr.copy()
    cut_y = y0 + head_bottom + 1
    out[cut_y:, :, 3] = 0
    if y0 + head_top > 0:
        out[: y0 + head_top, :, 3] = 0

    head_mask = mask.copy()
    head_mask[: y0 + head_top, :] = False
    head_mask[cut_y:, :] = False
    if head_mask.any():
        hys, hxs = np.where(head_mask)
        hx0, hx1 = int(hxs.min()), int(hxs.max())
        hy0, hy1 = int(hys.min()), int(hys.max())
        pad = max(2, int(max(hx1 - hx0, hy1 - hy0) * 0.04))
        out[: max(0, hy0 - pad), :, 3] = 0
        out[hy1 + pad + 1 :, :, 3] = 0
        out[:, : max(0, hx0 - pad), 3] = 0
        out[:, hx1 + pad + 1 :, 3] = 0

    return out


def process_file(path: Path, tolerance: float) -> dict:
    im = Image.open(path).convert("RGBA")
    if max(im.size) > MAX_SIDE:
        im.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
    arr = np.array(im)
    before_opaque = int((arr[:, :, 3] > 250).sum())
    out = matte_rgba(arr, tolerance)
    if path.stem == "rose":
        out = trim_rose_head_only(out)
    transparent = int((out[:, :, 3] < 10).sum())
    opaque = int((out[:, :, 3] > 245).sum())
    Image.fromarray(out).save(path, format="PNG", optimize=True)
    return {
        "file": path.name,
        "size": list(im.size),
        "before_opaque_px": before_opaque,
        "transparent_px": transparent,
        "subject_opaque_px": opaque,
    }


def main() -> int:
    reports = []
    for directory in DIRS:
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.png")):
            reports.append({"path": str(path), **process_file(path, TOLERANCE)})

    if not reports:
        print("No PNG files found.", file=sys.stderr)
        return 1

    print(json.dumps({"tolerance": TOLERANCE, "files": reports}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
