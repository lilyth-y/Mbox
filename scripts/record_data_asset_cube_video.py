"""
Save the 20-image cube presentation under experiments/outputs/.

Runs the full pipeline (batch → cube screenshot → browser-recorded MP4/WebM download).
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> int:
    env = {**os.environ}
    env.setdefault("WEB_URL", "http://localhost:5173")
    return subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "run_data_asset_cube_e2e.py")],
        cwd=ROOT,
        env=env,
        check=False,
    ).returncode


if __name__ == "__main__":
    raise SystemExit(main())
