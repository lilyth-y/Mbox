/**
 * Ralph loop gate for entrance hologram KPI.
 * Reads .cursor/ralph/entrance-hologram/prompt.md criteria and re-runs checks.
 *
 *   node scripts/ralph-entrance-hologram.mjs
 *   RALPH_MAX_ITERATIONS=50 node scripts/ralph-entrance-hologram.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "experiments", "outputs", "entrance_ehi");
const logPath = join(outDir, "ralph_loop.log");
const DONE_SIGNAL = "done";
const MAX_ITERATIONS = Number(process.env.RALPH_MAX_ITERATIONS ?? 50);

mkdirSync(outDir, { recursive: true });

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

function appendLog(line) {
  writeFileSync(logPath, `${line}\n`, { flag: "a" });
}

const CHECKS = [
  {
    id: "rotation-sweep",
    label: "Rotation mode RSI sweep",
    run: () => run("npx", ["tsx", "scripts/measure-rotation-satisfaction.mjs", "--sweep"]),
  },
  {
    id: "rsi-gate",
    label: "Rotation satisfaction gate (yaw_cw)",
    run: () => run("npx", ["tsx", "scripts/measure-rotation-satisfaction.mjs", "--gate"]),
  },
  {
    id: "ehi-gate",
    label: "EHI production gate",
    run: () => run("npx", ["tsx", "scripts/measure-entrance-ehi.mjs", "--gate"]),
  },
  {
    id: "fan-timeline",
    label: "Fan timeline verify",
    run: () => run("npx", ["tsx", "scripts/verify-fan-timeline.mjs"]),
  },
  {
    id: "fan-choreography",
    label: "Fan choreography verify",
    run: () => run("npx", ["tsx", "scripts/verify-fan-choreography.mjs"]),
  },
];

function allChecksPass(results) {
  return results.every((r) => r.ok);
}

writeFileSync(logPath, `# Ralph loop started ${new Date().toISOString()}\n`, "utf8");

let iteration = 0;
let lastResults = [];

while (iteration < MAX_ITERATIONS) {
  iteration += 1;
  console.log(`\n--- Ralph iteration ${iteration}/${MAX_ITERATIONS} ---\n`);
  appendLog(`\n## iteration ${iteration}`);

  lastResults = CHECKS.map((check) => {
    const result = check.run();
    const status = result.ok ? "PASS" : "FAIL";
    console.log(`[${status}] ${check.label} (exit ${result.status})`);
    appendLog(`- ${check.id}: ${status} (exit ${result.status})`);
    if (!result.ok && result.stderr.trim()) {
      appendLog(`  stderr: ${result.stderr.trim().slice(0, 500)}`);
    }
    return { ...check, ...result, status };
  });

  if (allChecksPass(lastResults)) {
    const artifacts = [
      join(outDir, "attempt_log.json"),
      join(outDir, "report.tex"),
      join(root, "TODO.md"),
    ];
    const missing = artifacts.filter((p) => !existsSync(p));
    if (missing.length > 0) {
      console.log(`[FAIL] Missing artifacts: ${missing.join(", ")}`);
      appendLog(`- artifacts: FAIL missing ${missing.join(", ")}`);
    } else {
      console.log("\nAll Ralph checks passed.");
      appendLog("- artifacts: PASS");
      console.log(DONE_SIGNAL);
      appendLog(DONE_SIGNAL);
      process.exit(0);
    }
  }

  // Script-only loop: no auto-fix — stop after first failing pass to avoid cost burn.
  // Re-invoke the agent with this prompt.md to fix and re-run.
  if (iteration >= 1 && !allChecksPass(lastResults)) {
    console.error(
      `\nRalph gate failed on iteration ${iteration}. Fix issues and re-run:\n` +
        `  npm run ralph:entrance-hologram\n`
    );
    appendLog("HALT: awaiting fix (script-only mode, no auto-patch)");
    process.exit(1);
  }
}

console.error(`Ralph max_iterations (${MAX_ITERATIONS}) reached without completion.`);
appendLog(`HALT: max_iterations ${MAX_ITERATIONS}`);
process.exit(1);
