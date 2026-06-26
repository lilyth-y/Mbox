/**
 * Upload render MP4 directly to GCS (avoids base64 POST size limits on API).
 */
export async function uploadRenderOutputToGcs(mp4Buffer, job) {
  const bucketName = process.env.GCS_VAULT_BUCKET?.trim();
  if (!bucketName) {
    throw new Error("GCS_VAULT_BUCKET is not configured.");
  }

  const safeWs = String(job.workspaceId ?? "default").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
  const safeJob = String(job.id).replace(/[^a-zA-Z0-9_-]/g, "_");
  const objectPath = `renders/${safeWs}/${safeJob}.mp4`;

  const { Storage } = await import("@google-cloud/storage");
  const file = new Storage().bucket(bucketName).file(objectPath);
  await file.save(mp4Buffer, {
    resumable: false,
    metadata: {
      contentType: "video/mp4",
      cacheControl: "private, max-age=3600",
    },
  });

  return objectPath;
}
