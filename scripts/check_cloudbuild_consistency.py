#!/usr/bin/env python3
"""
Static consistency checks for Cloud Build + mbox monorepo.
Run from repo root: python scripts/check_cloudbuild_consistency.py
"""
from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8")


def fail(msg: str) -> None:
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def ok(msg: str) -> None:
    print(f"OK: {msg}")


def main() -> None:
    cb = read(ROOT / "cloudbuild.yaml")
    doc = read(ROOT / "docs" / "deploy-cloud-build.md")
    pkg = read(ROOT / "package.json")
    docker = read(ROOT / "apps" / "api" / "Dockerfile")

    # 1) cloudbuild: bash must escape $ for local vars (Cloud Build treats $VAR as substitution)
    if "${IMG}" in cb or "${img}" in cb.lower():
        fail("cloudbuild.yaml: use $$img (or similar) — ${IMG} is parsed as a Cloud Build substitution.")
    if "$$img" not in cb:
        fail("cloudbuild.yaml: expected $$img escapes for docker push / run deploy image ref.")
    ok("cloudbuild.yaml uses $$img for bash-only image refs (not parsed as substitutions).")
    if "api-public-invoke" not in cb:
        fail("cloudbuild.yaml should include api-public-invoke step (allUsers run.invoker when unauthenticated)")
    ok("cloudbuild includes api-public-invoke for IAM consistency")

    # 2) substitutions declared in YAML are documented
    declared = set(re.findall(r"^\s+(_[A-Z0-9_]+):", cb, flags=re.MULTILINE))
    for name in sorted(declared):
        if name not in doc:
            fail(f"Substitution {name} is in cloudbuild.yaml but not mentioned in docs/deploy-cloud-build.md")
    ok(f"All {len(declared)} cloudbuild substitution keys appear in deploy-cloud-build.md")

    # 3) workspace names
    for needle in ("@mbox/shared", "@mbox/web", "@mbox/api"):
        if needle not in cb:
            fail(f"cloudbuild.yaml missing workspace reference {needle}")
    if "@mbox/api" not in docker or "@mbox/shared" not in docker:
        fail("Dockerfile must use @mbox/api and @mbox/shared")
    ok("Dockerfile workspace names match @mbox/*")

    # 4) WORKSPACE path + incremental TS guard (Cloud Build tarball)
    gci = read(ROOT / ".gcloudignore")
    if "/var/lib/mbox/workspaces" not in cb:
        fail("cloudbuild Run env must set WORKSPACE_DATA_DIR=/var/lib/mbox/workspaces")
    if "/var/lib/mbox/workspaces" not in docker:
        fail("Dockerfile WORKSPACE_DATA_DIR must stay /var/lib/mbox/workspaces")
    if "**/*.tsbuildinfo" not in gci:
        fail(".gcloudignore must ignore **/*.tsbuildinfo (exclude dist/ without clearing tsbuildinfo breaks tsc)")
    if "rm -f packages/shared/tsconfig.tsbuildinfo" not in docker:
        fail("Dockerfile should rm shared/api tsconfig.tsbuildinfo before tsc builds (incremental emit guard)")
    ok("WORKSPACE paths, .gcloudignore tsbuildinfo, and Dockerfile tsbuildinfo guard align")

    # 5) default secret id
    if not re.search(r"_API_KEY_SECRET:\s*mbox-api-key", cb):
        fail("Expected default _API_KEY_SECRET: mbox-api-key in cloudbuild.yaml")
    ok("default API key secret id present")

    # 6) npm run build locally (tier-1 sanity)
    npm = shutil.which("npm") or shutil.which("npm.cmd")
    if not npm:
        fail("npm not found on PATH (install Node.js or use a shell where npm is available)")
    try:
        subprocess.run(
            [npm, "run", "build"],
            cwd=ROOT,
            check=True,
            timeout=600,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
    except subprocess.CalledProcessError as e:
        fail(f"npm run build failed: {e.stderr[:2000]}")
    except FileNotFoundError:
        fail("npm executable missing")
    ok("npm run build succeeds")

    print("All consistency checks passed.")


if __name__ == "__main__":
    main()
