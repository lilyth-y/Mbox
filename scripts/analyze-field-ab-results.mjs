#!/usr/bin/env node
/**
 * Analyze field A/B guest survey responses vs lab EHI proxy.
 *
 *   npm run measure:field-ab-ehi     # lab proxy (prerequisite)
 *   npm run analyze:field-ab         # after collecting responses.jsonl
 *
 * Input:
 *   experiments/field-ab/responses.jsonl  (one JSON object per line)
 *   experiments/outputs/field_ab/ehi_proxy.json
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const responsesPath = process.env.FIELD_AB_RESPONSES ?? join(root, "experiments", "field-ab", "responses.jsonl");
const schemaPath = join(root, "experiments", "field-ab", "survey-schema.json");
const proxyPath = join(root, "experiments", "outputs", "field_ab", "ehi_proxy.json");
const outDir = join(root, "experiments", "outputs", "field_ab");

const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

function loadResponses() {
  if (!existsSync(responsesPath)) {
    return [];
  }
  return readFileSync(responsesPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch {
        throw new Error(`Invalid JSON on line ${index + 1} of ${responsesPath}`);
      }
    });
}

function computeGsi(response) {
  let weighted = 0;
  let totalWeight = 0;
  for (const question of schema.questions) {
    const value = Number(response.answers?.[question.id]);
    if (!Number.isFinite(value) || value < schema.scale.min || value > schema.scale.max) {
      continue;
    }
    weighted += value * question.weight;
    totalWeight += question.weight;
  }
  if (totalWeight <= 0) {
    return null;
  }
  return Number((weighted / totalWeight / schema.scale.max).toFixed(4));
}

function mean(values) {
  if (values.length === 0) {
    return null;
  }
  return Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(4));
}

function stddev(values) {
  if (values.length < 2) {
    return null;
  }
  const m = mean(values);
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / (values.length - 1);
  return Number(Math.sqrt(variance).toFixed(4));
}

/** Mann-Whitney U (two-sided p approx via normal). */
function mannWhitneyP(a, b) {
  if (a.length === 0 || b.length === 0) {
    return null;
  }
  const ranked = [...a.map((v) => ({ v, g: 0 })), ...b.map((v) => ({ v, g: 1 }))].sort(
    (x, y) => x.v - y.v
  );
  let rank = 1;
  for (let i = 0; i < ranked.length; ) {
    let j = i;
    while (j + 1 < ranked.length && ranked[j + 1].v === ranked[i].v) {
      j += 1;
    }
    const avgRank = (rank + (rank + (j - i))) / 2;
    for (let k = i; k <= j; k += 1) {
      ranked[k].rank = avgRank;
    }
    rank += j - i + 1;
    i = j + 1;
  }
  const n1 = a.length;
  const n2 = b.length;
  const R1 = ranked.filter((row) => row.g === 0).reduce((sum, row) => sum + row.rank, 0);
  const U1 = R1 - (n1 * (n1 + 1)) / 2;
  const U = Math.min(U1, n1 * n2 - U1);
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  if (sigma === 0) {
    return 1;
  }
  const z = Math.abs((U - mu) / sigma);
  const p = 2 * (1 - normalCdf(z));
  return Number(p.toFixed(4));
}

function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax));
  return sign * y;
}

function spearman(x, y) {
  if (x.length !== y.length || x.length < 2) {
    return null;
  }
  const rank = (arr) => {
    const order = arr.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(arr.length);
    let r = 1;
    for (let i = 0; i < order.length; ) {
      let j = i;
      while (j + 1 < order.length && order[j + 1].v === order[i].v) {
        j += 1;
      }
      const avg = (r + (r + (j - i))) / 2;
      for (let k = i; k <= j; k += 1) {
        ranks[order[k].i] = avg;
      }
      r += j - i + 1;
      i = j + 1;
    }
    return ranks;
  };
  const rx = rank(x);
  const ry = rank(y);
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < x.length; i += 1) {
    const a = rx[i] - mx;
    const b = ry[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) {
    return null;
  }
  return Number((num / Math.sqrt(dx * dy)).toFixed(4));
}

const responses = loadResponses();
const withGsi = responses
  .map((row) => ({ ...row, gsi: computeGsi(row) }))
  .filter((row) => row.gsi != null && (row.condition === "A" || row.condition === "B"));

const gsiA = withGsi.filter((row) => row.condition === "A").map((row) => row.gsi);
const gsiB = withGsi.filter((row) => row.condition === "B").map((row) => row.gsi);

let proxy = null;
if (existsSync(proxyPath)) {
  proxy = JSON.parse(readFileSync(proxyPath, "utf8"));
}

const conditionMeans = {
  A: { n: gsiA.length, gsiMean: mean(gsiA), gsiStd: stddev(gsiA) },
  B: { n: gsiB.length, gsiMean: mean(gsiB), gsiStd: stddev(gsiB) },
};

const tier2Target = 10;
const tier3Target = 30;
const tier =
  gsiA.length >= tier3Target && gsiB.length >= tier3Target
    ? 3
    : gsiA.length >= tier2Target && gsiB.length >= tier2Target
      ? 2
      : gsiA.length + gsiB.length > 0
        ? 1
        : 0;

const ehiByCondition = proxy
  ? {
      A: proxy.conditions?.find((row) => row.condition === "A")?.scores?.EHI ?? null,
      B: proxy.conditions?.find((row) => row.condition === "B")?.scores?.EHI ?? null,
    }
  : { A: null, B: null };

const sessionRows = [];
const bySession = new Map();
for (const row of withGsi) {
  const key = row.sessionId ?? "unknown";
  const bucket = bySession.get(key) ?? { condition: row.condition, gsi: [] };
  bucket.gsi.push(row.gsi);
  bySession.set(key, bucket);
}
for (const [sessionId, bucket] of bySession) {
  sessionRows.push({
    sessionId,
    condition: bucket.condition,
    gsiMean: mean(bucket.gsi),
    n: bucket.gsi.length,
    ehiProxy: ehiByCondition[bucket.condition],
  });
}

const ehiValues = sessionRows.map((row) => row.ehiProxy).filter((v) => v != null);
const gsiValues = sessionRows.map((row) => row.gsiMean).filter((v) => v != null);
const rankCorrelation =
  ehiValues.length === gsiValues.length && ehiValues.length >= 2
    ? spearman(ehiValues, gsiValues)
    : null;

const analysis = {
  generatedAt: new Date().toISOString(),
  tier,
  tierNote:
    tier === 0
      ? "No responses yet — collect surveys at venue."
      : tier === 1
        ? "Tier 1 smoke only — do not draw field conclusions."
        : tier === 2
          ? "Tier 2 pilot — directional comparison allowed."
          : "Tier 3 field — reportable comparison.",
  responsesPath,
  responseCount: withGsi.length,
  conditionMeans,
  mannWhitneyP: mannWhitneyP(gsiA, gsiB),
  deltaGsiMean:
    conditionMeans.A.gsiMean != null && conditionMeans.B.gsiMean != null
      ? Number((conditionMeans.B.gsiMean - conditionMeans.A.gsiMean).toFixed(4))
      : null,
  labProxy: proxy?.comparison ?? null,
  sessionLevelSpearman: {
    rho: rankCorrelation,
    sessionCount: sessionRows.length,
    note: "Session-mean GSI vs lab EHI proxy (2 conditions → exploratory only)",
  },
  hypothesisDirection:
    conditionMeans.B.gsiMean != null &&
    conditionMeans.A.gsiMean != null &&
    conditionMeans.B.gsiMean > conditionMeans.A.gsiMean
      ? "supports_B"
      : conditionMeans.B.gsiMean != null && conditionMeans.A.gsiMean != null
        ? "does_not_support_B"
        : "pending",
};

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "analysis.json"), JSON.stringify(analysis, null, 2));

const tex = `% Auto-generated field A/B analysis — ${analysis.generatedAt}
\\section{Entrance hologram field A/B (${analysis.tier === 0 ? "pending" : `Tier ${analysis.tier}`})}
\\begin{itemize}
  \\item Responses: ${analysis.responseCount} (A=${gsiA.length}, B=${gsiB.length})
  \\item Mean GSI: A=${conditionMeans.A.gsiMean ?? "—"}, B=${conditionMeans.B.gsiMean ?? "—"}
  \\item $\\Delta$GSI (B$-$A): ${analysis.deltaGsiMean ?? "—"}
  \\item Mann--Whitney $p$: ${analysis.mannWhitneyP ?? "—"}
  \\item Lab $\\Delta$EHI proxy: ${proxy?.comparison?.deltaEHI ?? "—"} (run \\texttt{npm run measure:field-ab-ehi})
  \\item Hypothesis direction: ${analysis.hypothesisDirection}
\\end{itemize}
`;
writeFileSync(join(outDir, "report.tex"), tex);

console.log("\n=== Field A/B analysis ===\n");
console.log(`Tier: ${analysis.tier} — ${analysis.tierNote}`);
console.log(`Responses: ${analysis.responseCount} (A=${gsiA.length}, B=${gsiB.length})`);
console.log(
  `Mean GSI: A=${conditionMeans.A.gsiMean ?? "—"} B=${conditionMeans.B.gsiMean ?? "—"} Δ=${analysis.deltaGsiMean ?? "—"}`
);
console.log(`Mann-Whitney p=${analysis.mannWhitneyP ?? "—"}`);
if (proxy) {
  console.log(`Lab ΔEHI (B−A): ${proxy.comparison.deltaEHI}`);
}
console.log(`Wrote ${join(outDir, "analysis.json")}`);
console.log(`Wrote ${join(outDir, "report.tex")}\n`);

if (analysis.responseCount === 0) {
  console.log("Hint: collect surveys via experiments/field-ab/survey.html → export JSONL → responses.jsonl");
  process.exit(0);
}

process.exit(tier >= 2 ? 0 : 1);
