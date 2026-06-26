import { Router } from "express";
import type { CreateRenderJobRequest, RenderJobKind, RenderJobStatus } from "@mbox/shared";
import { resolveWorkspaceId } from "../services/workspaceStore.js";
import {
  attachRenderJobOutput,
  createRenderJob,
  finalizeRenderJobOutput,
  getRenderJob,
  listRenderJobsByStatus,
  resolveLocalRenderOutputPath,
  updateRenderJobStatus,
} from "../services/renderJobStore.js";
import { enqueueInlineRenderWorker } from "../services/renderWorker.js";

export const renderRouter = Router();

const VALID_KINDS: RenderJobKind[] = ["crystal_showcase"];

function validateCreateBody(body: CreateRenderJobRequest): string | null {
  if (!body?.kind || !VALID_KINDS.includes(body.kind)) {
    return "kind must be crystal_showcase.";
  }
  if (!Array.isArray(body.processedImageRefs) || body.processedImageRefs.length === 0) {
    return "processedImageRefs array is required.";
  }
  if (!body.settings || body.settings.kind !== body.kind) {
    return "settings.kind must match request kind.";
  }
  return null;
}

renderRouter.post("/jobs", async (req, res) => {
  try {
    const body = req.body as CreateRenderJobRequest;
    const validationError = validateCreateBody(body);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    const workspaceId = resolveWorkspaceId(
      (body.workspaceId ?? req.header("X-Workspace-Id")) as string | undefined
    );
    const job = await createRenderJob(workspaceId, body);
    enqueueInlineRenderWorker(job);
    res.status(201).json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Create render job failed.";
    res.status(500).json({ error: message });
  }
});

renderRouter.get("/jobs", async (req, res) => {
  try {
    const status = (req.query.status as string | undefined)?.trim();
    if (status !== "queued") {
      res.status(400).json({ error: "Only status=queued is supported for listing." });
      return;
    }
    const jobs = await listRenderJobsByStatus("queued");
    res.json({ jobs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "List render jobs failed.";
    res.status(500).json({ error: message });
  }
});

renderRouter.get("/jobs/:jobId", async (req, res) => {
  try {
    const job = await getRenderJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "Render job not found." });
      return;
    }
    res.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Get render job failed.";
    res.status(500).json({ error: message });
  }
});

renderRouter.get("/jobs/:jobId/output", async (req, res) => {
  try {
    const job = await getRenderJob(req.params.jobId);
    if (!job || job.status !== "done") {
      res.status(404).json({ error: "Render output not ready." });
      return;
    }
    const localPath = resolveLocalRenderOutputPath(req.params.jobId);
    const { createReadStream, existsSync } = await import("node:fs");
    if (!existsSync(localPath)) {
      res.status(404).json({ error: "Local render file missing." });
      return;
    }
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "private, max-age=3600");
    createReadStream(localPath).pipe(res);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stream render output failed.";
    res.status(500).json({ error: message });
  }
});

renderRouter.patch("/jobs/:jobId/status", async (req, res) => {
  try {
    const status = req.body?.status as RenderJobStatus | undefined;
    if (!status) {
      res.status(400).json({ error: "status is required." });
      return;
    }
    const expectedStatus = req.body?.expectedStatus as RenderJobStatus | undefined;
    const job = await updateRenderJobStatus(
      req.params.jobId,
      status,
      {
        progress: typeof req.body?.progress === "number" ? req.body.progress : undefined,
        error: typeof req.body?.error === "string" ? req.body.error : undefined,
        outputPath: typeof req.body?.outputPath === "string" ? req.body.outputPath : undefined,
        outputUrl: typeof req.body?.outputUrl === "string" ? req.body.outputUrl : undefined,
      },
      expectedStatus ? { expectedStatus } : undefined
    );
    if (!job) {
      const existing = await getRenderJob(req.params.jobId);
      if (!existing) {
        res.status(404).json({ error: "Render job not found." });
        return;
      }
      res.status(409).json({ error: "Render job status conflict.", job: existing });
      return;
    }
    res.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update render job failed.";
    res.status(500).json({ error: message });
  }
});

renderRouter.post("/jobs/:jobId/finalize", async (req, res) => {
  try {
    const objectPath = req.body?.objectPath;
    if (typeof objectPath !== "string" || !objectPath.trim()) {
      res.status(400).json({ error: "objectPath is required." });
      return;
    }
    const job = await finalizeRenderJobOutput(req.params.jobId, objectPath.trim());
    if (!job) {
      res.status(404).json({ error: "Render job not found." });
      return;
    }
    res.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Finalize render job failed.";
    res.status(500).json({ error: message });
  }
});

renderRouter.post("/jobs/:jobId/output", async (req, res) => {
  try {
    const base64 = req.body?.base64;
    let buffer: Buffer;
    if (typeof base64 === "string" && base64.length > 0) {
      buffer = Buffer.from(base64, "base64");
    } else if (Buffer.isBuffer(req.body)) {
      buffer = req.body;
    } else {
      res.status(400).json({ error: "base64 field is required." });
      return;
    }
    if (buffer.length < 1024) {
      res.status(400).json({ error: "MP4 body too small." });
      return;
    }
    const apiBase = `${req.protocol}://${req.get("host")}`;
    const job = await attachRenderJobOutput(req.params.jobId, buffer, apiBase);
    if (!job) {
      res.status(404).json({ error: "Render job not found." });
      return;
    }
    res.json({ job });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Attach render output failed.";
    res.status(500).json({ error: message });
  }
});
