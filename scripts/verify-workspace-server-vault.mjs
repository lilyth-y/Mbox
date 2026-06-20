#!/usr/bin/env node
/**
 * Server workspace API: isolated meta, active event, vault, assignments per X-Workspace-Id.
 * Prereq: npm run dev (API on :8787) or API_URL env.
 *
 *   node scripts/verify-workspace-server-vault.mjs
 */
import assert from "node:assert/strict";
import { readFile, readdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { waitForApiReady } from "./lib/wait-for-api.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const API_URL = (process.env.API_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const DATA_DIR =
  process.env.WORKSPACE_DATA_DIR ??
  join(root, "apps", "api", "data", "workspaces");
const RUN_ID = Date.now().toString(36);
const WS_A = `verify-ws-a-${RUN_ID}`;
const WS_B = `verify-ws-b-${RUN_ID}`;
const WS_SANITIZED = "verify/slash-ws".replace(/[^a-zA-Z0-9_-]/g, "_");

const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==";

let passed = 0;
let failed = 0;

function ok(name, detail = "") {
  passed += 1;
  console.log(`[OK] ${name}${detail ? `: ${detail}` : ""}`);
}

function fail(name, error) {
  failed += 1;
  const message = error instanceof Error ? error.message : String(error);
  console.log(`[FAIL] ${name}: ${message}`);
}

async function check(name, fn) {
  try {
    const detail = await fn();
    ok(name, detail);
    return true;
  } catch (error) {
    fail(name, error);
    return false;
  }
}

async function workspaceApi(workspaceId, path, options = {}) {
  const response = await fetch(`${API_URL}/workspace${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Workspace-Id": workspaceId,
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} → ${response.status}: ${text.slice(0, 240)}`);
  }
  return text ? JSON.parse(text) : null;
}

function stubImage(id, label) {
  return {
    id,
    label,
    url: TINY_JPEG,
    preparedUrl: TINY_JPEG,
    originalUrl: TINY_JPEG,
    aiSuggestedCategory: "portrait",
    categoryConfidence: 0.9,
    center: { x: 50, y: 50 },
    focus: { x: 50, y: 50, strength: 1 },
    preprocessMode: "original",
    subject: { bounds: { x0: 10, y0: 10, x1: 90, y1: 90 } },
    depth: { enabled: false },
    byteSize: 128,
  };
}

function workspaceRoot(workspaceId) {
  const safe = workspaceId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(DATA_DIR, safe);
}

await check("API /health", async () => {
  await waitForApiReady(API_URL, 120_000);
  return API_URL;
});

let bootstrapA;
let bootstrapB;
let eventA2;

await check("bootstrap isolates default workspaces", async () => {
  bootstrapA = await workspaceApi(WS_A, "/bootstrap");
  bootstrapB = await workspaceApi(WS_B, "/bootstrap");
  assert.ok(Array.isArray(bootstrapA.events) && bootstrapA.events.length >= 1);
  assert.ok(Array.isArray(bootstrapB.events) && bootstrapB.events.length >= 1);
  assert.notEqual(bootstrapA.activeEventId, bootstrapB.activeEventId);
  return `A=${bootstrapA.activeEventId.slice(0, 12)}… B=${bootstrapB.activeEventId.slice(0, 12)}…`;
});

await check("create event sets active + empty vault (workspace A)", async () => {
  const created = await workspaceApi(WS_A, "/events", {
    method: "POST",
    body: JSON.stringify({ name: "Verify Event A2", description: "server vault smoke" }),
  });
  eventA2 = created.event;
  assert.ok(eventA2?.id);
  const meta = await workspaceApi(WS_A, "/meta");
  assert.equal(meta.activeEventId, eventA2.id);
  const vault = await workspaceApi(WS_A, `/events/${encodeURIComponent(eventA2.id)}/vault`);
  assert.deepEqual(vault.images, []);
  return eventA2.id;
});

await check("vault write/read on workspace A", async () => {
  const image = stubImage(9101, "marker-workspace-a");
  await workspaceApi(WS_A, `/events/${encodeURIComponent(eventA2.id)}/vault`, {
    method: "PUT",
    body: JSON.stringify({ images: [image] }),
  });
  const vault = await workspaceApi(WS_A, `/events/${encodeURIComponent(eventA2.id)}/vault`);
  assert.equal(vault.images.length, 1);
  assert.equal(vault.images[0].label, "marker-workspace-a");
  return `${vault.images.length} image`;
});

await check("workspace B vault stays isolated", async () => {
  const activeB = bootstrapB.activeEventId;
  const vault = await workspaceApi(WS_B, `/events/${encodeURIComponent(activeB)}/vault`);
  const labels = vault.images.map((image) => image.label);
  assert.ok(!labels.includes("marker-workspace-a"));
  return labels.length ? `B has ${labels.length} unrelated image(s)` : "B vault empty";
});

let eventB2;

await check("workspace B vault + assignments isolated", async () => {
  const created = await workspaceApi(WS_B, "/events", {
    method: "POST",
    body: JSON.stringify({ name: "Verify Event B2" }),
  });
  eventB2 = created.event;
  const image = stubImage(9201, "marker-workspace-b");
  await workspaceApi(WS_B, `/events/${encodeURIComponent(eventB2.id)}/vault`, {
    method: "PUT",
    body: JSON.stringify({ images: [image] }),
  });
  await workspaceApi(WS_B, `/events/${encodeURIComponent(eventB2.id)}/category-assignments`, {
    method: "PUT",
    body: JSON.stringify({ assignments: { "9201": { userCategory: "신부" } } }),
  });

  const vaultA = await workspaceApi(WS_A, `/events/${encodeURIComponent(eventA2.id)}/vault`);
  assert.ok(!vaultA.images.some((entry) => entry.label === "marker-workspace-b"));

  const assignmentsB = await workspaceApi(
    WS_B,
    `/events/${encodeURIComponent(eventB2.id)}/category-assignments`
  );
  assert.equal(assignmentsB.assignments["9201"]?.userCategory, "신부");

  const assignmentsA = await workspaceApi(
    WS_A,
    `/events/${encodeURIComponent(eventA2.id)}/category-assignments`
  );
  assert.equal(assignmentsA.assignments["9201"]?.userCategory, undefined);

  return "vault + category assignments separated";
});

await check("PUT /meta persists active event switch (workspace A)", async () => {
  const firstEventId = bootstrapA.activeEventId;
  assert.notEqual(firstEventId, eventA2.id);
  const metaNow = await workspaceApi(WS_A, "/meta");
  assert.ok(metaNow.events.some((event) => event.id === eventA2.id));

  await workspaceApi(WS_A, "/meta", {
    method: "PUT",
    body: JSON.stringify({ events: metaNow.events, activeEventId: firstEventId }),
  });
  let meta = await workspaceApi(WS_A, "/meta");
  assert.equal(meta.activeEventId, firstEventId);

  await workspaceApi(WS_A, "/meta", {
    method: "PUT",
    body: JSON.stringify({ events: meta.events, activeEventId: eventA2.id }),
  });
  meta = await workspaceApi(WS_A, "/meta");
  assert.equal(meta.activeEventId, eventA2.id);

  const onDisk = (await readFile(join(workspaceRoot(WS_A), "active-event.txt"), "utf8")).trim();
  assert.equal(onDisk, eventA2.id);
  return `active-event.txt=${onDisk.slice(0, 16)}…`;
});

await check("bootstrap returns active vault + assignments", async () => {
  const payload = await workspaceApi(WS_A, "/bootstrap");
  assert.equal(payload.activeEventId, eventA2.id);
  assert.ok(Array.isArray(payload.vault));
  assert.equal(payload.vault[0]?.label, "marker-workspace-a");
  assert.ok(payload.categoryAssignments && typeof payload.categoryAssignments === "object");
  return `${payload.vault.length} vault row(s)`;
});

await check("workspace id sanitization matches on-disk path", async () => {
  await workspaceApi("verify/slash-ws", "/bootstrap");
  const catalogPath = join(workspaceRoot(WS_SANITIZED), "catalog.json");
  await readFile(catalogPath, "utf8");
  return catalogPath;
});

await check("cleanup verify workspace dirs", async () => {
  const entries = await readdir(DATA_DIR, { withFileTypes: true }).catch(() => []);
  const targets = new Set([WS_A, WS_B, WS_SANITIZED]);
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name.startsWith("verify-ws-") || entry.name === WS_SANITIZED) {
      targets.add(entry.name);
    }
  }
  for (const workspaceId of targets) {
    await rm(workspaceRoot(workspaceId), { recursive: true, force: true });
  }
  return `removed ${targets.size} test workspace(s)`;
});

console.log(`\nverify-workspace-server-vault: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
