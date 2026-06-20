#!/usr/bin/env node
/**
 * Smoke: IndexedDB vault persists VoluMax foreground / composite blob URLs.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const vaultSrc = readFileSync(
  join(root, "apps/web/src/features/events/indexedDbVault.ts"),
  "utf8"
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(
  /type ImageUrlField[\s\S]*subjectForegroundUrl[\s\S]*faceCompositeUrl/.test(vaultSrc),
  "ImageUrlField must include subjectForegroundUrl and faceCompositeUrl"
);
assert(
  /const URL_FIELDS[\s\S]*"subjectForegroundUrl"[\s\S]*"faceCompositeUrl"/.test(vaultSrc),
  "URL_FIELDS must list VoluMax URL fields"
);
assert(
  /subjectForegroundUrl: _subjectForegroundUrl/.test(vaultSrc),
  "planImageStorage must strip subjectForegroundUrl from inline meta"
);
assert(
  /faceCompositeUrl: _faceCompositeUrl/.test(vaultSrc),
  "planImageStorage must strip faceCompositeUrl from inline meta"
);
assert(
  /subjectForegroundUrl:\s*urls\.subjectForegroundUrl\s*\?\?\s*meta\.subjectForegroundUrl/.test(
    vaultSrc
  ),
  "deserializeImage must fall back to inline meta subjectForegroundUrl"
);
assert(
  /faceCompositeUrl:\s*urls\.faceCompositeUrl\s*\?\?\s*meta\.faceCompositeUrl/.test(vaultSrc),
  "deserializeImage must fall back to inline meta faceCompositeUrl"
);
assert(
  /backgroundPlateUrl:\s*urls\.backgroundPlateUrl\s*\?\?\s*meta\.backgroundPlateUrl/.test(
    vaultSrc
  ),
  "deserializeImage must fall back to inline meta backgroundPlateUrl"
);
assert(/repairLoadedVaultImages/.test(vaultSrc), "loadEventVault must repair stale VoluMax flags");

const integritySrc = readFileSync(
  join(root, "apps/web/src/shared/lib/voluMaxVaultIntegrity.ts"),
  "utf8"
);
assert(/auditVoluMaxVaultIntegrity/.test(integritySrc), "vault integrity audit must exist");
assert(/repairLoadedVaultImages/.test(integritySrc), "vault repair must exist");

const cloudSrc = readFileSync(
  join(root, "apps/web/src/features/events/cloudVaultSync.ts"),
  "utf8"
);
assert(/"subjectForegroundUrl"/.test(cloudSrc), "cloud vault must sync subjectForegroundUrl");

console.log("verify-vault-volumax-fields: OK");
