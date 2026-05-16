/**
 * Smoke-check hosted mbox: static assets, API health, CORS, optional browser pipeline.
 *
 *   node scripts/verify-hosted-deploy.mjs
 *   MBOX_SKIP_BROWSER=1 node scripts/verify-hosted-deploy.mjs
 */
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB_URL =
  process.env.MBOX_WEB_URL ??
  "https://mbox-web-newmedia-496107.storage.googleapis.com/index.html";
const API_URL =
  process.env.MBOX_API_BASE_URL ??
  "https://mbox-api-118689443638.asia-northeast3.run.app";
const WEB_ORIGIN = new URL(WEB_URL).origin;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checks = [];

function record(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  const mark = ok ? "OK" : "FAIL";
  console.log(`[${mark}] ${name}${detail ? `: ${detail}` : ""}`);
}

async function fetchStatus(url, init) {
  const res = await fetch(url, { ...init, redirect: "follow" });
  return { status: res.status, ok: res.ok, res };
}

try {
  const index = await fetchStatus(WEB_URL);
  record("web index.html", index.ok, String(index.status));

  const html = await (await fetch(WEB_URL)).text();
  const scriptMatch = html.match(/src="(\.\/assets\/[^"]+\.js)"/);
  const cssMatch = html.match(/href="(\.\/assets\/[^"]+\.css)"/);
  if (!scriptMatch) {
    record("web bundle script tag", false, "missing ./assets/*.js in index.html");
  } else {
    const scriptUrl = new URL(scriptMatch[1], WEB_URL).href;
    const script = await fetchStatus(scriptUrl);
    record("web JS bundle", script.ok, `${script.status} ${scriptMatch[1]}`);
  }
  if (!cssMatch) {
    record("web bundle css tag", false, "missing ./assets/*.css");
  } else {
    const cssUrl = new URL(cssMatch[1], WEB_URL).href;
    const css = await fetchStatus(cssUrl);
    record("web CSS bundle", css.ok, `${css.status} ${cssMatch[1]}`);
  }

  const health = await fetchStatus(`${API_URL}/health`);
  record("api /health", health.ok, String(health.status));

  const corsProbe = await fetch(`${API_URL}/health`, {
    method: "OPTIONS",
    headers: {
      Origin: WEB_ORIGIN,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type,x-api-key",
    },
  });
  const allowOrigin = corsProbe.headers.get("access-control-allow-origin");
  const corsOk =
    corsProbe.status === 204 || corsProbe.status === 200
      ? allowOrigin === WEB_ORIGIN || allowOrigin === "*"
      : false;
  record(
    "api CORS preflight",
    corsOk,
    `status=${corsProbe.status} allow-origin=${allowOrigin ?? "(none)"} expected=${WEB_ORIGIN}`,
  );

  if (process.env.MBOX_SKIP_BROWSER !== "1") {
    const key = process.env.MBOX_API_KEY;
    if (!key) {
      record("browser e2e", false, "set MBOX_API_KEY or MBOX_SKIP_BROWSER=1");
    } else {
      const e2e = spawnSync(
        process.execPath,
        ["scripts/e2e-hosted-pipeline.mjs"],
        {
          cwd: root,
          env: { ...process.env, MBOX_SKIP_MP4: "1", MBOX_WEB_URL: WEB_URL },
          encoding: "utf8",
          timeout: Number(process.env.MBOX_E2E_TIMEOUT_MS ?? 300_000),
        },
      );
      const ok = e2e.status === 0;
      record("browser pipeline (no MP4)", ok, ok ? "" : (e2e.stderr || e2e.stdout || "").trim().slice(0, 400));
    }
  }
} catch (error) {
  record("verify runner", false, error instanceof Error ? error.message : String(error));
}

const failed = checks.filter((c) => !c.ok);
console.log(
  JSON.stringify(
    { ok: failed.length === 0, webUrl: WEB_URL, apiUrl: API_URL, checks },
    null,
    2,
  ),
);
process.exit(failed.length === 0 ? 0 : 1);
