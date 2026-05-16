from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RUBRIC = ROOT / "experiments" / "tier2_subset" / "rubric.json"


def main() -> int:
    payload = json.loads(RUBRIC.read_text(encoding="utf-8"))
    assert payload["tier"] == "tier2_subset"
    assert len(payload["dimensions"]) >= 4
    assert payload["status"] == "rubric_recorded_pending_gemini_key"
    print("Tier 2 rubric verification passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
