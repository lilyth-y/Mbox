import { Router } from "express";
import express from "express";
import type { Request, Response } from "express";
import type {
  CreateEventRequest,
  PresignVaultAssetRequest,
  PutCategoryAssignmentsRequest,
  PutVaultRequest,
  PutWorkspaceMetaRequest,
  VaultAssetSlot,
} from "@mbox/shared";
import {
  buildVaultObjectPath,
  createVaultUploadUrl,
  isGcsVaultEnabled,
  streamVaultObject,
  uploadVaultObject,
} from "../services/gcsVaultStorage.js";
import {
  assertSafeVaultObjectPath,
} from "../services/vaultMediaAccess.js";
import {
  bootstrapWorkspace,
  createEvent,
  deleteEvent,
  loadCategoryAssignments,
  loadEventVault,
  loadWorkspaceMeta,
  resolveWorkspaceId,
  saveCategoryAssignments,
  saveEventVault,
  saveWorkspaceMeta,
  touchEvent,
} from "../services/workspaceStore.js";

export const workspaceRouter = Router();

const vaultMediaRawBody = express.raw({
  type: () => true,
  limit: process.env.API_JSON_LIMIT ?? "64mb",
});

function workspaceIdFromRequest(req: { header: (name: string) => string | undefined }): string {
  return resolveWorkspaceId(req.header("x-workspace-id"));
}

function vaultMediaObjectPathFromRequest(req: { params: Record<string, string> }): string {
  return decodeURIComponent(req.params[0] ?? req.params["0"] ?? "");
}

function applyVaultMediaCors(req: Request, res: Response): void {
  const origin = req.header("origin")?.trim();
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-API-Key, Authorization");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
}

workspaceRouter.options("/vault-media/*", (req, res) => {
  applyVaultMediaCors(req, res);
  res.sendStatus(204);
});

workspaceRouter.get("/vault-media/*", async (req, res) => {
  try {
    applyVaultMediaCors(req, res);
    if (!isGcsVaultEnabled()) {
      res.status(503).json({ error: "GCS vault is not configured on this API." });
      return;
    }
    const objectPath = vaultMediaObjectPathFromRequest(req);
    if (!objectPath) {
      res.status(400).json({ error: "Vault object path is required." });
      return;
    }
    assertSafeVaultObjectPath(objectPath);
    await streamVaultObject(objectPath, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vault media read failed.";
    res.status(500).json({ error: message });
  }
});

workspaceRouter.put("/vault-media/*", vaultMediaRawBody, async (req, res) => {
  try {
    applyVaultMediaCors(req, res);
    if (!isGcsVaultEnabled()) {
      res.status(503).json({ error: "GCS vault is not configured on this API." });
      return;
    }
    const objectPath = vaultMediaObjectPathFromRequest(req);
    if (!objectPath) {
      res.status(400).json({ error: "Vault object path is required." });
      return;
    }
    assertSafeVaultObjectPath(objectPath);
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    if (body.length === 0) {
      res.status(400).json({ error: "Vault upload body is required." });
      return;
    }
    const contentType = req.header("content-type")?.trim() || "image/jpeg";
    await uploadVaultObject(objectPath, body, contentType);
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vault media upload failed.";
    res.status(500).json({ error: message });
  }
});

workspaceRouter.get("/bootstrap", async (req, res) => {
  try {
    const workspaceId = workspaceIdFromRequest(req);
    const payload = await bootstrapWorkspace(workspaceId);
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workspace bootstrap failed.";
    res.status(500).json({ error: message });
  }
});

workspaceRouter.get("/meta", async (req, res) => {
  try {
    const workspaceId = workspaceIdFromRequest(req);
    const meta = await loadWorkspaceMeta(workspaceId);
    res.json(meta);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workspace meta load failed.";
    res.status(500).json({ error: message });
  }
});

workspaceRouter.put("/meta", async (req, res) => {
  try {
    const body = req.body as PutWorkspaceMetaRequest;
    if (!Array.isArray(body?.events) || !body.activeEventId) {
      res.status(400).json({ error: "events and activeEventId are required." });
      return;
    }
    const workspaceId = workspaceIdFromRequest(req);
    await saveWorkspaceMeta(workspaceId, {
      events: body.events,
      activeEventId: body.activeEventId,
    });
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workspace meta save failed.";
    res.status(500).json({ error: message });
  }
});

workspaceRouter.get("/events/:eventId/vault", async (req, res) => {
  try {
    const workspaceId = workspaceIdFromRequest(req);
    const vault = await loadEventVault(workspaceId, req.params.eventId);
    res.json({ images: vault });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vault load failed.";
    res.status(500).json({ error: message });
  }
});

workspaceRouter.post("/events/:eventId/vault/presign", async (req, res) => {
  try {
    if (!isGcsVaultEnabled()) {
      res.status(503).json({ error: "GCS vault is not configured on this API." });
      return;
    }

    const body = req.body as PresignVaultAssetRequest;
    if (!Array.isArray(body?.assets) || body.assets.length === 0) {
      res.status(400).json({ error: "assets array is required." });
      return;
    }

    const workspaceId = workspaceIdFromRequest(req);
    const eventId = req.params.eventId;
    const uploads = await Promise.all(
      body.assets.map(async (asset) => {
        const slot = asset.slot as VaultAssetSlot;
        const contentType = asset.contentType?.trim() || "image/jpeg";
        const objectPath = buildVaultObjectPath(workspaceId, eventId, asset.imageId, slot);
        const signed = await createVaultUploadUrl(objectPath, contentType);
        return {
          imageId: asset.imageId,
          slot,
          objectPath,
          uploadUrl: signed.uploadUrl,
          readUrl: signed.readUrl,
        };
      })
    );

    res.json({ uploads });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vault presign failed.";
    res.status(500).json({ error: message });
  }
});

workspaceRouter.put("/events/:eventId/vault", async (req, res) => {
  try {
    const body = req.body as PutVaultRequest;
    if (!Array.isArray(body?.images)) {
      res.status(400).json({ error: "images array is required." });
      return;
    }
    const workspaceId = workspaceIdFromRequest(req);
    const eventId = req.params.eventId;
    await saveEventVault(workspaceId, eventId, body.images);
    const events = await touchEvent(workspaceId, eventId);
    res.json({ ok: true, events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Vault save failed.";
    res.status(500).json({ error: message });
  }
});

workspaceRouter.get("/events/:eventId/category-assignments", async (req, res) => {
  try {
    const workspaceId = workspaceIdFromRequest(req);
    const assignments = await loadCategoryAssignments(workspaceId, req.params.eventId);
    res.json({ assignments });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Assignments load failed.";
    res.status(500).json({ error: message });
  }
});

workspaceRouter.put("/events/:eventId/category-assignments", async (req, res) => {
  try {
    const body = req.body as PutCategoryAssignmentsRequest;
    if (!body?.assignments || typeof body.assignments !== "object") {
      res.status(400).json({ error: "assignments object is required." });
      return;
    }
    const workspaceId = workspaceIdFromRequest(req);
    await saveCategoryAssignments(workspaceId, req.params.eventId, body.assignments);
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Assignments save failed.";
    res.status(500).json({ error: message });
  }
});

workspaceRouter.post("/events", async (req, res) => {
  try {
    const body = req.body as CreateEventRequest;
    if (!body?.name?.trim()) {
      res.status(400).json({ error: "name is required." });
      return;
    }
    const workspaceId = workspaceIdFromRequest(req);
    const event = await createEvent(workspaceId, body);
    res.status(201).json({ event });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Event create failed.";
    res.status(500).json({ error: message });
  }
});

workspaceRouter.delete("/events/:eventId", async (req, res) => {
  try {
    const workspaceId = workspaceIdFromRequest(req);
    const meta = await deleteEvent(workspaceId, req.params.eventId);
    res.json(meta);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Event delete failed.";
    const status = message.includes("At least one") ? 400 : 500;
    res.status(status).json({ error: message });
  }
});
