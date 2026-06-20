#!/usr/bin/env node
/**
 * Exa deep search for presentation quality upgrades (optional — needs EXA_API_KEY).
 * Writes scripts/research/exa-presentation-quality.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const outDir = join(root, "scripts/research");
const outFile = join(outDir, "exa-presentation-quality.json");

const apiKey = process.env.EXA_API_KEY;
if (!apiKey) {
  console.warn("EXA_API_KEY not set — writing stub from bundled queries only.");
  const stub = {
    source: "stub",
    note: "Set EXA_API_KEY and re-run for live Exa deep search.",
    queries: [
      "Three.js hologram Fresnel rim shader selective bloom best practices",
      "WebGL procedural galaxy nebula FBM starfield shader performance",
      "Three.js presentation orbit camera showcase hold easing",
    ],
    recommendedModules: [
      "galaxy_background: FBM nebula + layered stars",
      "hologram_fresnel_rim: rim + scanlines",
      "selective_bloom: pmndrs layer bloom",
    ],
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outFile, JSON.stringify(stub, null, 2));
  console.log(`Wrote ${outFile}`);
  process.exit(0);
}

const queries = [
  "Three.js hologram Fresnel rim glow shader tutorial 2024 2025",
  "WebGL procedural starfield nebula FBM additive blending Three.js",
  "Three.js selective bloom postprocessing pmndrs performance",
];

const results = [];

for (const query of queries) {
  const response = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      type: "deep",
      numResults: 5,
      contents: { highlights: { maxCharacters: 1200 } },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Exa search failed (${response.status}): ${text.slice(0, 400)}`);
  }

  const data = await response.json();
  results.push({ query, resultCount: data.results?.length ?? 0, results: data.results ?? [] });
}

const payload = {
  source: "exa",
  searchedAt: new Date().toISOString(),
  queries,
  results,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, JSON.stringify(payload, null, 2));
console.log(`exa-presentation-quality: OK → ${outFile}`);
