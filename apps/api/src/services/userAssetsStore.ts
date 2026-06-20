import { spawn } from "node:child_process";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const routesDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(routesDir, "../../../..");
export const userAssetsRoot = path.join(repoRoot, "data", "user-assets");

const ALLOWED_PREFIXES = ["bgm/", "background/images/", "background/videos/"] as const;

const UPLOAD_KIND_DIR: Record<string, string> = {
  bgm: "bgm",
  image: path.join("background", "images"),
  video: path.join("background", "videos"),
};

const UPLOAD_EXT: Record<string, Set<string>> = {
  bgm: new Set([".mp3", ".m4a", ".wav", ".aac"]),
  image: new Set([".jpg", ".jpeg", ".png", ".webp"]),
  video: new Set([".mp4", ".webm", ".mov", ".m4v"]),
};

function safeFilename(name: string): string {
  const base = path.basename(name).replace(/[^\w.\-()가-힣\s]/gi, "_").trim();
  if (!base || base === "." || base === "..") {
    throw new Error("Invalid filename.");
  }
  return base;
}

function resolveUserAssetRelative(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..")) {
    throw new Error("Invalid path.");
  }
  const allowed = ALLOWED_PREFIXES.some((prefix) => normalized.startsWith(prefix));
  if (!allowed) {
    throw new Error("Path must be under bgm/ or background/images|videos/.");
  }
  const absolute = path.resolve(userAssetsRoot, normalized);
  if (!absolute.startsWith(userAssetsRoot)) {
    throw new Error("Path escapes user-assets root.");
  }
  return normalized;
}

export function assertUserAssetsWriteAllowed(): void {
  const isProd = process.env.NODE_ENV === "production";
  const explicit = process.env.ALLOW_USER_ASSETS_WRITE?.trim().toLowerCase() === "true";
  if (isProd && !explicit) {
    throw new Error("User-assets write is disabled in production.");
  }
}

export async function syncUserAssetsCatalog(): Promise<void> {
  const script = path.join(repoRoot, "scripts", "generate-user-assets-catalog.mjs");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `sync:user-assets failed (${code})`));
    });
  });
}

export async function deleteUserAsset(relativePath: string): Promise<void> {
  assertUserAssetsWriteAllowed();
  const rel = resolveUserAssetRelative(relativePath);
  const absolute = path.join(userAssetsRoot, rel);
  await unlink(absolute);
  await syncUserAssetsCatalog();
}

export async function uploadUserAsset(
  kind: string,
  filename: string,
  buffer: Buffer
): Promise<{ relativePath: string }> {
  assertUserAssetsWriteAllowed();
  const dirRel = UPLOAD_KIND_DIR[kind];
  const allowedExt = UPLOAD_EXT[kind];
  if (!dirRel || !allowedExt) {
    throw new Error("kind must be bgm, image, or video.");
  }
  const safeName = safeFilename(filename);
  const ext = path.extname(safeName).toLowerCase();
  if (!allowedExt.has(ext)) {
    throw new Error(`Unsupported extension for ${kind}: ${ext}`);
  }
  const dirAbs = path.join(userAssetsRoot, dirRel);
  await mkdir(dirAbs, { recursive: true });
  const absolute = path.join(dirAbs, safeName);
  await writeFile(absolute, buffer);
  const relativePath = path.join(dirRel, safeName).replace(/\\/g, "/");
  await syncUserAssetsCatalog();
  return { relativePath };
}
