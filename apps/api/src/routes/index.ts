import { Router } from "express";
import { assetsRouter } from "./assets.js";
import { workspaceRouter } from "./workspace.js";
import { analyzeImage, analyzeImageBatch } from "../services/gemini.js";
import { editImageBackground } from "../services/backgroundRemoval.js";
import type {
  AnalyzeBatchRequestBody,
  AnalyzeRequestBody,
  EditRequestBody,
} from "../services/types.js";

export const routesRouter = Router();

routesRouter.use(assetsRouter);
routesRouter.use("/workspace", workspaceRouter);

routesRouter.get("/health", (_req, res) => {
  res.json({ ok: true, service: "mbox-api" });
});

routesRouter.post("/analyze", async (req, res) => {
  try {
    const body = req.body as AnalyzeRequestBody;
    if (!body?.imageBase64) {
      res.status(400).json({ error: "imageBase64 is required." });
      return;
    }

    const metadata = await analyzeImage(body.imageBase64, body.mimeType, body.focusTarget);
    res.json({ metadata });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analyze request failed.";
    res.status(500).json({ error: message });
  }
});

routesRouter.post("/analyze/batch", async (req, res) => {
  try {
    const body = req.body as AnalyzeBatchRequestBody;
    if (!Array.isArray(body?.items) || body.items.length === 0) {
      res.status(400).json({ error: "items array is required." });
      return;
    }

    if (body.items.length > 32) {
      res.status(400).json({ error: "A maximum of 32 images can be analyzed per batch." });
      return;
    }

    for (const item of body.items) {
      if (!item?.id || !item?.imageBase64) {
        res.status(400).json({ error: "Each batch item requires id and imageBase64." });
        return;
      }
    }

    const results = await analyzeImageBatch(body.items, body.focusTarget);
    res.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Analyze batch request failed.";
    res.status(500).json({ error: message });
  }
});

routesRouter.post("/edit", async (req, res) => {
  try {
    const body = req.body as EditRequestBody;
    if (!body?.imageBase64 || !body?.label) {
      res.status(400).json({ error: "imageBase64 and label are required." });
      return;
    }

    const editMode = body.editMode ?? "generate_background";
    if (editMode === "generate_background" && !body.bgPrompt?.trim()) {
      res.status(400).json({ error: "bgPrompt is required for generate_background." });
      return;
    }

    const result = await editImageBackground(
      body.imageBase64,
      body.label,
      body.bgPrompt ?? "",
      body.mimeType,
      editMode,
      body.subjectBounds
    );
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Edit request failed.";
    res.status(500).json({ error: message });
  }
});
