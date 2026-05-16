import { Router } from "express";
import type {
  CreateEventRequest,
  PutCategoryAssignmentsRequest,
  PutVaultRequest,
  PutWorkspaceMetaRequest,
} from "@mbox/shared";
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

function workspaceIdFromRequest(req: { header: (name: string) => string | undefined }): string {
  return resolveWorkspaceId(req.header("x-workspace-id"));
}

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
