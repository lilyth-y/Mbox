import { Router } from "express";
import {
  assertUserAssetsWriteAllowed,
  deleteUserAsset,
  syncUserAssetsCatalog,
  uploadUserAsset,
} from "../services/userAssetsStore.js";

export const userAssetsRouter = Router();

userAssetsRouter.post("/sync", async (_req, res) => {
  try {
    assertUserAssetsWriteAllowed();
    await syncUserAssetsCatalog();
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed.";
    res.status(message.includes("disabled") ? 403 : 500).json({ error: message });
  }
});

userAssetsRouter.post("/upload", async (req, res) => {
  try {
    const body = req.body as { kind?: string; filename?: string; dataBase64?: string };
    const kind = body?.kind?.trim();
    const filename = body?.filename?.trim();
    const dataBase64 = body?.dataBase64;
    if (!kind || !filename || typeof dataBase64 !== "string") {
      res.status(400).json({ error: "kind, filename, and dataBase64 are required." });
      return;
    }
    const buffer = Buffer.from(dataBase64, "base64");
    if (buffer.length === 0) {
      res.status(400).json({ error: "Empty file." });
      return;
    }
    const result = await uploadUserAsset(kind, filename, buffer);
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    const status = message.includes("disabled") ? 403 : message.includes("Invalid") ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

userAssetsRouter.delete("/", async (req, res) => {
  try {
    const relativePath = typeof req.query.path === "string" ? req.query.path : "";
    if (!relativePath) {
      res.status(400).json({ error: "path query is required." });
      return;
    }
    await deleteUserAsset(relativePath);
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delete failed.";
    const status =
      message.includes("disabled") ? 403 : message.includes("Invalid") || message.includes("ENOENT") ? 400 : 500;
    res.status(status).json({ error: message });
  }
});
