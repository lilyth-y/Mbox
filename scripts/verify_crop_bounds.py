from __future__ import annotations


def compute_crop_bounds(width: int, height: int, center_x_pct: float, center_y_pct: float) -> tuple[float, float, float]:
    center_x = (center_x_pct / 100) * width
    center_y = (center_y_pct / 100) * height
    size = min(width, height)

    sx = center_x - size / 2
    sy = center_y - size / 2

    if sx < 0:
        sx = 0
    if sy < 0:
        sy = 0
    if sx + size > width:
        sx = width - size
    if sy + size > height:
        sy = height - size

    return sx, sy, size


def main() -> int:
    cases = [
        (1024, 768, 50, 50),
        (1024, 768, 0, 0),
        (1024, 768, 100, 100),
        (500, 500, 90, 10),
    ]

    for width, height, cx, cy in cases:
        sx, sy, size = compute_crop_bounds(width, height, cx, cy)
        assert 0 <= sx <= width - size
        assert 0 <= sy <= height - size
        assert size == min(width, height)

    print("Crop bounds verification passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
