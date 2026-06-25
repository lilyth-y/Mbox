import { CLOUD_CRYSTAL_OUTPUT_PROFILE, type CreateRenderJobRequest } from "@mbox/shared";
import {
  downloadRenderJobOutput,
  submitAndAwaitRenderJob,
} from "../../shared/lib/cloudRenderClient";
import { isCloudRenderBackend } from "../../shared/lib/renderBackend";
import type { ProcessedImage } from "../../shared/types";
import type { ShowcasePhysicsSceneHandle } from "./babylon/createShowcasePhysicsScene";
import { buildShowcaseRenderImageRefs } from "./buildShowcaseRenderImageRefs";
import { exportShowcaseMp4, type ShowcaseExportVideoOptions } from "./showcaseExportCapture";

export type RunShowcaseExportOptions = ShowcaseExportVideoOptions & {
  images?: ProcessedImage[];
};

export async function runShowcaseExport(
  handle: ShowcasePhysicsSceneHandle,
  params: RunShowcaseExportOptions
): Promise<{ filename: string }> {
  if (!isCloudRenderBackend()) {
    return exportShowcaseMp4(handle, params);
  }

  const images = params.images ?? [];
  const request: CreateRenderJobRequest = {
    kind: "crystal_showcase",
    processedImageRefs: buildShowcaseRenderImageRefs(images),
    outputProfile: CLOUD_CRYSTAL_OUTPUT_PROFILE,
    settings: {
      kind: "crystal_showcase",
      catalogOptions: { ...params.catalog },
      imageCount: params.imageCount,
      fallPhysicsEnabled: params.fallPhysicsEnabled,
      backdropMediaPath: params.backdropMediaPath ?? null,
    },
  };

  const job = await submitAndAwaitRenderJob(request);
  const filename = `mbox-showcase-${job.id}.mp4`;
  await downloadRenderJobOutput(job, filename);
  return { filename };
}
