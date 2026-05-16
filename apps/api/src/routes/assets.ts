import { Router } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const routesDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(routesDir, "../../../..");
const dataAssetRoot = path.resolve(repoRoot, "data/asset");
const dataAssetManifestPath = path.resolve(
  repoRoot,
  "experiments/assets/data-asset-manifest.json"
);

export const assetsRouter = Router();

function resolveAssetPath(relativePath: string): string {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolute = path.resolve(repoRoot, normalized);
  if (!absolute.startsWith(dataAssetRoot)) {
    throw new Error("Asset path is outside data/asset.");
  }
  return absolute;
}

assetsRouter.get("/asset-manifest/data-asset", async (_req, res) => {
  try {
    const manifest = await readFile(dataAssetManifestPath, "utf-8");
    res.type("application/json").send(manifest);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read asset manifest.";
    res.status(500).json({ error: message });
  }
});

assetsRouter.get("/asset-image", async (req, res) => {
  try {
    const imagePath = req.query.path;
    if (typeof imagePath !== "string" || !imagePath) {
      res.status(400).json({ error: "path query parameter is required." });
      return;
    }

    const absolute = resolveAssetPath(imagePath);
    const buffer = await readFile(absolute);
    const extension = path.extname(absolute).toLowerCase();
    const mimeType =
      extension === ".png"
        ? "image/png"
        : extension === ".webp"
          ? "image/webp"
          : "image/jpeg";

    res.type(mimeType).send(buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to read asset image.";
    res.status(500).json({ error: message });
  }
});
