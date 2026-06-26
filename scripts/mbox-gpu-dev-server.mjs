/**
 * Vite dev-only: local GPU worker API + legacy open-chrome helper.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { handleGpuWorkerHttp } from "./local-gpu-worker.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const OPEN_SCRIPT = join(root, "scripts/open-showcase-gpu.mjs");

function parseLocalhostUrl(rawUrl, host) {
  let targetUrl = rawUrl?.trim() || `http://${host}/showcase.html?localOnly=1&fullGpu=1`;
  const u = new URL(targetUrl);
  if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1" && u.hostname !== "[::1]") {
    throw new Error("localhost only");
  }
  if (u.searchParams.get("fullGpu") !== "1") u.searchParams.set("fullGpu", "1");
  if (u.searchParams.get("localOnly") !== "1") u.searchParams.set("localOnly", "1");
  if (u.searchParams.get("noPhysics") !== "1") u.searchParams.set("noPhysics", "1");
  return u.toString();
}

/** @returns {import('vite').Plugin} */
export function mboxGpuDevServer() {
  return {
    name: "mbox-gpu-dev-server",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0];
        const host = req.headers.host ?? "localhost:5173";

        if (pathname.startsWith("/__mbox/gpu-worker")) {
          void handleGpuWorkerHttp(req, res, pathname, host);
          return;
        }

        // Deprecated alias — redirect to session-based API via url param
        if (pathname === "/__mbox/dev/gpu-relay/mjpg") {
          const params = new URLSearchParams((req.url ?? "").split("?")[1] ?? "");
          let targetUrl;
          try {
            targetUrl = parseLocalhostUrl(params.get("url"), host);
          } catch (error) {
            res.statusCode = 400;
            res.end(String(error?.message ?? error));
            return;
          }
          void (async () => {
            const { getLocalGpuWorkerRegistry } = await import("./local-gpu-worker.mjs");
            const registry = getLocalGpuWorkerRegistry();
            const session = registry.createSession(targetUrl, host);
            try {
              await registry.ensureSessionPage(session);
              session.attachMjpegClient(res);
            } catch (error) {
              res.statusCode = 503;
              res.end(String(error?.message ?? error));
            }
          })();
          return;
        }

        if (pathname !== "/__mbox/dev/open-gpu-browser") {
          next();
          return;
        }
        if (req.method !== "POST" && req.method !== "GET") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }
        const params = new URLSearchParams((req.url ?? "").split("?")[1] ?? "");
        let targetUrl;
        try {
          targetUrl = parseLocalhostUrl(params.get("url"), host);
        } catch (error) {
          res.statusCode = 403;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
          return;
        }

        const child = spawn(process.execPath, [OPEN_SCRIPT], {
          cwd: root,
          env: { ...process.env, MBOX_WEB_URL: targetUrl },
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
        child.unref();

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.end(JSON.stringify({ ok: true, url: targetUrl }));
      });
    },
  };
}
