import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Bucket } from "@google-cloud/storage";
import type {
  CreateRenderJobRequest,
  ProcessedImageRef,
  RenderJobKind,
  RenderJobRecord,
  RenderJobStatus,
} from "@mbox/shared";
import {
  isTerminalRenderJobStatus,
  resolveRenderOutputProfile,
} from "@mbox/shared";
import {
  createVaultReadUrl,
  isGcsVaultEnabled,
  uploadVaultObject,
} from "./gcsVaultStorage.js";

const DATA_DIR = process.env.RENDER_JOB_DATA_DIR ?? path.join(process.cwd(), "data", "render-jobs");
const OUTPUT_DIR = path.join(DATA_DIR, "outputs");
const JOB_GCS_PREFIX = "render-jobs";

function safeJobId(jobId: string): string {
  return jobId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function jobPath(jobId: string): string {
  return path.join(DATA_DIR, `${safeJobId(jobId)}.json`);
}

function jobGcsObjectPath(jobId: string): string {
  return `${JOB_GCS_PREFIX}/${safeJobId(jobId)}.json`;
}

async function getGcsBucket(): Promise<Bucket | null> {
  if (!isGcsVaultEnabled()) {
    return null;
  }
  const { Storage } = await import("@google-cloud/storage");
  const bucketName = process.env.GCS_VAULT_BUCKET?.trim();
  if (!bucketName) {
    return null;
  }
  return new Storage().bucket(bucketName);
}

function createJobId(): string {
  return `render-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function buildRenderOutputObjectPath(workspaceId: string, jobId: string): string {
  const safeWs = workspaceId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const safeJob = jobId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `renders/${safeWs}/${safeJob}.mp4`;
}

export function resolveLocalRenderOutputPath(jobId: string): string {
  const safeJob = jobId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(OUTPUT_DIR, `${safeJob}.mp4`);
}

async function ensureDataDir(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
}

async function readJob(jobId: string): Promise<RenderJobRecord | null> {
  const bucket = await getGcsBucket();
  if (bucket) {
    try {
      const file = bucket.file(jobGcsObjectPath(jobId));
      const [exists] = await file.exists();
      if (!exists) {
        return null;
      }
      const [raw] = await file.download();
      return JSON.parse(raw.toString("utf8")) as RenderJobRecord;
    } catch {
      return null;
    }
  }

  try {
    const raw = await readFile(jobPath(jobId), "utf8");
    return JSON.parse(raw) as RenderJobRecord;
  } catch {
    return null;
  }
}

async function writeJob(job: RenderJobRecord): Promise<void> {
  job.updatedAt = Date.now();
  const payload = JSON.stringify(job);

  const bucket = await getGcsBucket();
  if (bucket) {
    await uploadVaultObject(jobGcsObjectPath(job.id), Buffer.from(payload, "utf8"), "application/json");
    return;
  }

  await ensureDataDir();
  await writeFile(jobPath(job.id), payload, "utf8");
}

async function enrichProcessedImageRefs(refs: ProcessedImageRef[]): Promise<ProcessedImageRef[]> {
  const enriched: ProcessedImageRef[] = [];
  for (const ref of refs) {
    const next: ProcessedImageRef = { ...ref };
    if (!next.url && next.vaultPath && isGcsVaultEnabled()) {
      try {
        next.url = await createVaultReadUrl(next.vaultPath);
      } catch {
        // keep vaultPath only
      }
    }
    enriched.push(next);
  }
  return enriched;
}

export async function createRenderJob(
  workspaceId: string,
  body: CreateRenderJobRequest
): Promise<RenderJobRecord> {
  const now = Date.now();
  const kind: RenderJobKind = body.kind;
  const job: RenderJobRecord = {
    id: createJobId(),
    kind,
    status: "queued",
    workspaceId,
    processedImageRefs: await enrichProcessedImageRefs(body.processedImageRefs),
    settings: body.settings,
    outputProfile: resolveRenderOutputProfile(kind, body.outputProfile),
    createdAt: now,
    updatedAt: now,
    progress: 0,
  };
  await writeJob(job);
  return job;
}

export async function getRenderJob(jobId: string): Promise<RenderJobRecord | null> {
  return readJob(jobId);
}

export async function listRenderJobsByStatus(
  status: RenderJobStatus,
  limit = 8
): Promise<RenderJobRecord[]> {
  const bucket = await getGcsBucket();
  if (bucket) {
    const [files] = await bucket.getFiles({ prefix: `${JOB_GCS_PREFIX}/` });
    const jobs: RenderJobRecord[] = [];
    for (const file of files) {
      if (!file.name.endsWith(".json")) {
        continue;
      }
      try {
        const [raw] = await file.download();
        const job = JSON.parse(raw.toString("utf8")) as RenderJobRecord;
        if (job.status === status) {
          jobs.push(job);
        }
      } catch {
        // skip corrupt
      }
    }
    jobs.sort((a, b) => a.createdAt - b.createdAt);
    return jobs.slice(0, limit);
  }

  await ensureDataDir();
  const files = await readdir(DATA_DIR);
  const jobs: RenderJobRecord[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(path.join(DATA_DIR, file), "utf8");
      const job = JSON.parse(raw) as RenderJobRecord;
      if (job.status === status) {
        jobs.push(job);
      }
    } catch {
      // skip corrupt
    }
  }
  jobs.sort((a, b) => a.createdAt - b.createdAt);
  return jobs.slice(0, limit);
}

export async function updateRenderJobStatus(
  jobId: string,
  status: RenderJobStatus,
  patch: Partial<Pick<RenderJobRecord, "error" | "progress" | "outputPath" | "outputUrl">> = {},
  options?: { expectedStatus?: RenderJobStatus }
): Promise<RenderJobRecord | null> {
  const job = await readJob(jobId);
  if (!job) return null;
  if (options?.expectedStatus && job.status !== options.expectedStatus) {
    return null;
  }
  job.status = status;
  if (patch.error !== undefined) job.error = patch.error;
  if (patch.progress !== undefined) job.progress = patch.progress;
  if (patch.outputPath !== undefined) job.outputPath = patch.outputPath;
  if (patch.outputUrl !== undefined) job.outputUrl = patch.outputUrl;
  await writeJob(job);
  return job;
}

export async function finalizeRenderJobOutput(
  jobId: string,
  objectPath: string
): Promise<RenderJobRecord | null> {
  const job = await readJob(jobId);
  if (!job) {
    return null;
  }
  if (!objectPath.startsWith("renders/") || objectPath.includes("..")) {
    return markRenderJobFailed(jobId, "Invalid render output path.");
  }

  try {
    const outputUrl = await createVaultReadUrl(objectPath);
    return updateRenderJobStatus(jobId, "done", {
      outputPath: objectPath,
      outputUrl,
      progress: 100,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Finalize failed.";
    return markRenderJobFailed(jobId, message);
  }
}

export async function attachRenderJobOutput(
  jobId: string,
  mp4Buffer: Buffer,
  apiBaseUrl?: string
): Promise<RenderJobRecord | null> {
  const job = await readJob(jobId);
  if (!job) return null;

  await updateRenderJobStatus(jobId, "encoding", { progress: 90 });

  try {
    if (isGcsVaultEnabled()) {
      const objectPath = buildRenderOutputObjectPath(job.workspaceId, job.id);
      await uploadVaultObject(objectPath, mp4Buffer, "video/mp4");
      const outputUrl = await createVaultReadUrl(objectPath);
      return updateRenderJobStatus(jobId, "done", {
        outputPath: objectPath,
        outputUrl,
        progress: 100,
      });
    }

    await mkdir(OUTPUT_DIR, { recursive: true });
    const localPath = resolveLocalRenderOutputPath(jobId);
    await writeFile(localPath, mp4Buffer);
    const base = (apiBaseUrl ?? process.env.API_PUBLIC_BASE_URL ?? "http://localhost:8787").replace(
      /\/$/,
      ""
    );
    const outputUrl = `${base}/render/jobs/${jobId}/output`;
    return updateRenderJobStatus(jobId, "done", {
      outputPath: localPath,
      outputUrl,
      progress: 100,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return updateRenderJobStatus(jobId, "failed", { error: message });
  }
}

export async function markRenderJobFailed(
  jobId: string,
  error: string
): Promise<RenderJobRecord | null> {
  return updateRenderJobStatus(jobId, "failed", { error });
}

export function isRenderJobFinished(job: RenderJobRecord): boolean {
  return isTerminalRenderJobStatus(job.status);
}
