/**
 * Session-based local GPU worker — Playwright Chrome (RTX) + MJPEG stream + sync/export API.
 */
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import {
  ensureWindowsDiscreteGpuPreference,
  findChromeExecutable,
  resolveChromeDiscreteGpuArgs,
} from "./chrome-discrete-gpu.mjs";

const BOUNDARY = "mboxframe";
const FPS = 24;
const IDLE_DISPOSE_MS = 5 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function assertLocalhostUrl(rawUrl) {
  const u = new URL(rawUrl);
  if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1" && u.hostname !== "[::1]") {
    throw new Error("gpu worker: localhost only");
  }
  return u;
}

function buildWorkerPageUrl(shellPageUrl, sessionId, host) {
  const u = assertLocalhostUrl(shellPageUrl || `http://${host}/showcase.html`);
  u.searchParams.set("gpuRelaySource", "1");
  u.searchParams.set("gpuWorkerSession", sessionId);
  u.searchParams.set("fullGpu", "1");
  u.searchParams.set("localOnly", "1");
  u.searchParams.delete("forceGpuRelay");
  return u.toString();
}

class GpuWorkerSession {
  constructor(id, shellPageUrl, host) {
    this.id = id;
    this.shellPageUrl = shellPageUrl;
    this.workerUrl = buildWorkerPageUrl(shellPageUrl, id, host);
    this.page = null;
    this.ready = false;
    this.streaming = false;
    this.imageCount = 0;
    this.error = null;
    this.mjpegClients = new Set();
    this.captureLoop = null;
    this.idleTimer = null;
    this.lastActivity = Date.now();
  }

  touch() {
    this.lastActivity = Date.now();
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
    }
    this.idleTimer = setTimeout(() => {
      void this.dispose();
    }, IDLE_DISPOSE_MS);
  }

  async ensureBrowser(browser) {
    if (this.page && !this.page.isClosed()) {
      return;
    }
    if (this.page?.isClosed()) {
      this.page = null;
      this.ready = false;
    }
    this.page = await browser.newPage({
      viewport: { width: 960, height: 960 },
      deviceScaleFactor: 1,
    });
    await this.page.goto(this.workerUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await this.page.waitForSelector("canvas", { timeout: 120_000 });
    await this.page.waitForFunction(
      () => {
        const bridge = window.__MBOX_GPU_WORKER_BRIDGE__;
        return bridge?.isReady?.() === true;
      },
      { timeout: 180_000 }
    );
    this.ready = true;
    this.error = null;
    this.touch();
  }

  async applyControl(message) {
    if (message.type === "ping") {
      return { type: "pong" };
    }
    if (message.type === "setPlaying") {
      await this.page.evaluate((playing) => {
        window.__MBOX_GPU_WORKER_BRIDGE__?.setPlaying?.(playing);
      }, message.playing);
      return { ok: true };
    }
    if (message.type === "syncState") {
      await this.syncState(message.state);
      return { ok: true, ...this.status() };
    }
    throw new Error(`unknown control message: ${message.type}`);
  }

  async syncState(state) {
    this.touch();
    if (!this.page || this.page.isClosed()) {
      throw new Error("worker page not ready");
    }
    const ok = await this.page.evaluate(async (payload) => {
      const bridge = window.__MBOX_GPU_WORKER_BRIDGE__;
      if (!bridge?.setState) {
        return { ok: false, error: "bridge missing" };
      }
      try {
        await bridge.setState(payload);
        return { ok: true, imageCount: payload.images?.length ?? 0 };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }, state);
    if (!ok.ok) {
      throw new Error(ok.error ?? "sync failed");
    }
    this.imageCount = ok.imageCount ?? state.images?.length ?? 0;
    this.ready = true;
  }

  async exportMp4(request) {
    this.touch();
    if (!this.page || this.page.isClosed()) {
      throw new Error("worker page not ready");
    }
    const bytes = await this.page.evaluate(async (payload) => {
      const bridge = window.__MBOX_GPU_WORKER_BRIDGE__;
      if (!bridge?.runExport) {
        throw new Error("bridge export missing");
      }
      const blob = await bridge.runExport(payload);
      const buffer = await blob.arrayBuffer();
      return Array.from(new Uint8Array(buffer));
    }, request);
    return Buffer.from(bytes);
  }

  attachMjpegClient(res) {
    this.touch();
    this.mjpegClients.add(res);
    res.on("close", () => {
      this.mjpegClients.delete(res);
      if (this.mjpegClients.size === 0) {
        this.streaming = false;
      }
    });
    if (!this.captureLoop) {
      this.captureLoop = this.runMjpeg();
    }
  }

  async runMjpeg() {
    this.streaming = true;
    try {
      for (const res of this.mjpegClients) {
        if (!res.headersSent) {
          res.writeHead(200, {
            "Content-Type": `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Connection: "keep-alive",
            Pragma: "no-cache",
          });
        }
      }

      while (this.mjpegClients.size > 0) {
        const started = Date.now();
        if (!this.page || this.page.isClosed()) {
          await sleep(500);
          continue;
        }
        let frame;
        try {
          const canvas = this.page.locator("canvas").first();
          frame = await canvas.screenshot({ type: "jpeg", quality: 86 });
        } catch (error) {
          console.warn("[gpu-worker] capture failed", error?.message ?? error);
          await sleep(400);
          continue;
        }

        const header = `--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`;
        for (const res of [...this.mjpegClients]) {
          try {
            res.write(header);
            res.write(frame);
            res.write("\r\n");
          } catch {
            this.mjpegClients.delete(res);
          }
        }

        const elapsed = Date.now() - started;
        const wait = Math.max(0, Math.round(1000 / FPS) - elapsed);
        if (wait > 0) {
          await sleep(wait);
        }
      }
    } finally {
      this.streaming = false;
      this.captureLoop = null;
    }
  }

  status() {
    return {
      ready: this.ready,
      streaming: this.streaming,
      imageCount: this.imageCount,
      error: this.error,
    };
  }

  async dispose() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    for (const res of [...this.mjpegClients]) {
      try {
        res.end();
      } catch {
        // ignore
      }
    }
    this.mjpegClients.clear();
    try {
      await this.page?.close();
    } catch {
      // ignore
    }
    this.page = null;
    this.ready = false;
    this.streaming = false;
  }
}

class LocalGpuWorkerRegistry {
  constructor() {
    this.sessions = new Map();
    this.browser = null;
    this.browserPromise = null;
  }

  async getBrowser() {
    if (this.browser && !this.browser.isConnected()) {
      this.browser = null;
      this.browserPromise = null;
    }
    if (this.browser) {
      return this.browser;
    }
    if (!this.browserPromise) {
      this.browserPromise = (async () => {
        const chromePath = findChromeExecutable();
        if (chromePath) {
          ensureWindowsDiscreteGpuPreference(chromePath);
        }
        this.browser = await chromium.launch({
          headless: true,
          channel: "chrome",
          args: [
            ...resolveChromeDiscreteGpuArgs(),
            "--disable-software-rasterizer",
            "--enable-gpu-rasterization",
          ],
        });
        return this.browser;
      })();
    }
    return this.browserPromise;
  }

  createSession(shellPageUrl, host) {
    const id = randomUUID();
    const session = new GpuWorkerSession(id, shellPageUrl, host);
    this.sessions.set(id, session);
    return session;
  }

  getSession(id) {
    return this.sessions.get(id) ?? null;
  }

  async ensureSessionPage(session) {
    const browser = await this.getBrowser();
    await session.ensureBrowser(browser);
  }

  async deleteSession(id) {
    const session = this.sessions.get(id);
    if (!session) {
      return;
    }
    await session.dispose();
    this.sessions.delete(id);
  }
}

let registrySingleton = null;

export function getLocalGpuWorkerRegistry() {
  if (!registrySingleton) {
    registrySingleton = new LocalGpuWorkerRegistry();
  }
  return registrySingleton;
}

export async function handleGpuWorkerHttp(req, res, pathname, host) {
  const registry = getLocalGpuWorkerRegistry();

  if (pathname === "/__mbox/gpu-worker/session" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      const session = registry.createSession(body.shellPageUrl, host);
      const info = {
        sessionId: session.id,
        workerUrl: session.workerUrl,
        mjpegUrl: `/__mbox/gpu-worker/${session.id}/mjpg`,
        statusUrl: `/__mbox/gpu-worker/${session.id}/status`,
        controlUrl: `/__mbox/gpu-worker/${session.id}/control`,
      };
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify(info));
      void registry.ensureSessionPage(session).catch((error) => {
        session.error = String(error?.message ?? error);
        session.ready = false;
        console.warn("[gpu-worker] session bootstrap failed", session.error);
      });
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: String(error?.message ?? error) }));
    }
    return true;
  }

  const sessionMatch = pathname.match(/^\/__mbox\/gpu-worker\/([^/]+)(?:\/(.*))?$/);
  if (!sessionMatch) {
    return false;
  }

  const sessionId = sessionMatch[1];
  const action = sessionMatch[2] ?? "";
  const session = registry.getSession(sessionId);
  if (!session) {
    res.statusCode = 404;
    res.end("session not found");
    return true;
  }

  if (action === "status" && req.method === "GET") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify(session.status()));
    return true;
  }

  if (action === "sync" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      await registry.ensureSessionPage(session);
      await session.syncState(body);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify({ ok: true, ...session.status() }));
    } catch (error) {
      session.error = String(error?.message ?? error);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: session.error }));
    }
    return true;
  }

  if (action === "control" && req.method === "POST") {
    try {
      const body = await readJsonBody(req);
      await registry.ensureSessionPage(session);
      const result = await session.applyControl(body);
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(JSON.stringify(result));
    } catch (error) {
      session.error = String(error?.message ?? error);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: session.error }));
    }
    return true;
  }

  if (action === "export" && req.method === "POST") {
    try {
      await registry.ensureSessionPage(session);
      const body = await readJsonBody(req);
      const mp4 = await session.exportMp4(body);
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(mp4);
    } catch (error) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain");
      res.end(String(error?.message ?? error));
    }
    return true;
  }

  if (action === "mjpg" && req.method === "GET") {
    try {
      await registry.ensureSessionPage(session);
      void session.attachMjpegClient(res);
    } catch (error) {
      res.statusCode = 503;
      res.end(String(error?.message ?? error));
    }
    return true;
  }

  if (!action && req.method === "DELETE") {
    await registry.deleteSession(sessionId);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  res.statusCode = 404;
  res.end("not found");
  return true;
}

/** @deprecated legacy alias */
export function getLocalGpuPreviewRelay() {
  return getLocalGpuWorkerRegistry();
}

export { readJsonBody };
