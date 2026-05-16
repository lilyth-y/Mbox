from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "experiments" / "outputs" / "tier1_smoke" / "result.json"


def main() -> int:
    if not OUTPUT.exists():
        print("Tier 1 output is missing. Run scripts/run_experiment.py first.")
        return 1

    payload = json.loads(OUTPUT.read_text(encoding="utf-8"))
    assert payload["health"]["ok"] is True
    assert payload["tier"] == "tier1_smoke"
    assert isinstance(payload["samples"], list)
    print("Tier 1 verification passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
