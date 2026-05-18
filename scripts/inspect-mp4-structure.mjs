#!/usr/bin/env node
/**
 * Inspect ISO BMFF (MP4) layout without ffprobe — moov position, brands, tracks hint.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const targets = process.argv.slice(2);
const defaultDir = join(process.cwd(), "experiments", "outputs");

function findAtom(buffer, type, start = 0) {
  const t = Buffer.from(type, "ascii");
  for (let i = start; i + 8 <= buffer.length; i += 1) {
    if (buffer[i + 4] === t[0] && buffer[i + 5] === t[1] && buffer[i + 6] === t[2] && buffer[i + 7] === t[3]) {
      const size = buffer.readUInt32BE(i);
      return { offset: i, size: size > 0 ? size : buffer.length - i };
    }
  }
  return null;
}

function inspect(path) {
  const buffer = readFileSync(path);
  const ftyp = findAtom(buffer, "ftyp");
  const moov = findAtom(buffer, "moov");
  const mdat = findAtom(buffer, "mdat");
  const mfra = findAtom(buffer, "mfra");
  const brands = ftyp
    ? buffer
        .subarray(ftyp.offset + 8, ftyp.offset + Math.min(ftyp.size, 32))
        .toString("ascii")
        .replace(/[^\x20-\x7e]/g, ".")
    : "n/a";

  const layout =
    moov && mdat
      ? moov.offset < mdat.offset
        ? "faststart-ish (moov before mdat)"
        : "moov-after-mdat (may not seek until full download)"
      : moov
        ? "moov-only-fragment?"
        : "no-moov (likely broken)";

  return {
    path,
    bytes: buffer.length,
    brands,
    layout,
    fragmented: mfra ? "yes (mfra)" : "no",
    moovOffset: moov?.offset ?? -1,
    mdatOffset: mdat?.offset ?? -1,
  };
}

const files =
  targets.length > 0
    ? targets
    : readdirSync(defaultDir)
        .filter((name) => name.endsWith(".mp4"))
        .map((name) => join(defaultDir, name))
        .filter((path) => statSync(path).isFile());

if (files.length === 0) {
  console.error("No MP4 files found.");
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  try {
    const r = inspect(file);
    console.log(JSON.stringify(r, null, 2));
    if (r.layout.includes("no-moov") || r.layout.includes("moov-after-mdat")) {
      failed += 1;
    }
  } catch (error) {
    failed += 1;
    console.log(JSON.stringify({ path: file, error: String(error) }, null, 2));
  }
}
process.exit(failed > 0 ? 1 : 0);
