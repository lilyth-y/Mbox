#!/usr/bin/env npx tsx
/**
 * Runtime cube face integrity — mounts real presentationScene rigs (not grep).
 *
 *   npx tsx scripts/verify-cube-face-integrity.ts
 */
import * as THREE from "three";

const meta = import.meta as ImportMeta & { env?: { BASE_URL?: string } };
meta.env ??= { BASE_URL: "/" };

import type { ProcessedImage } from "../apps/web/src/shared/types.ts";
import { resolvePresentationBackgroundPlateUrl } from "@mbox/shared";

const PNG_MIME =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPG_MIME =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA8A/9k=";

type Scenario = {
  id: string;
  images: ProcessedImage[];
  plateTextures?: Array<THREE.Texture | null>;
  subjectForegroundTextures?: Array<THREE.Texture | null>;
  voluMaxDepthEnabled?: boolean;
};

function makeSolidTexture(rgb: [number, number, number], size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    data[i * 4] = rgb[0]!;
    data[i * 4 + 1] = rgb[1]!;
    data[i * 4 + 2] = rgb[2]!;
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}

function makeAlphaMatteTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const inside = x > size * 0.25 && x < size * 0.75 && y > size * 0.2 && y < size * 0.85;
      data[i] = 220;
      data[i + 1] = 180;
      data[i + 2] = 140;
      data[i + 3] = inside ? 255 : 0;
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.format = THREE.RGBAFormat;
  texture.needsUpdate = true;
  return texture;
}

function makeTestImage(id: number, partial: Partial<ProcessedImage> = {}): ProcessedImage {
  return {
    id,
    url: JPG_MIME,
    preparedUrl: JPG_MIME,
    originalUrl: JPG_MIME,
    label: `test-${id}`,
    aiSuggestedCategory: "portrait",
    categoryConfidence: 1,
    center: { x: 50, y: 50 },
    focus: { x: 50, y: 50, strength: 0.5 },
    preprocessMode: "original",
    subject: {
      detected: true,
      confidence: 1,
      bounds: { x: 20, y: 10, width: 60, height: 80 },
    },
    depth: {
      gridSize: 8,
      subjectDepth: 0.5,
      values: Array.from({ length: 64 }, () => 0.5),
    },
    byteSize: 1024,
    ...partial,
  };
}

function texturesForImages(images: ProcessedImage[]): THREE.Texture[] {
  const palette: Array<[number, number, number]> = [
    [210, 90, 90],
    [90, 170, 110],
    [90, 120, 210],
    [210, 170, 70],
    [170, 90, 190],
    [70, 190, 190],
  ];
  return images.map((_, index) => makeSolidTexture(palette[index % palette.length]!));
}

function platesForImages(images: ProcessedImage[], faceTextures: THREE.Texture[]): THREE.Texture[] {
  return images.map((image, index) => {
    const plateUrl = resolvePresentationBackgroundPlateUrl(image);
    if (image.backgroundPlateUrl || plateUrl !== image.url) {
      return makeSolidTexture([40, 40, 48]);
    }
    return faceTextures[index] ?? makeSolidTexture([128, 128, 128]);
  });
}

function buildScenario(id: string, imagePartials: Array<Partial<ProcessedImage>>): Scenario {
  const images = imagePartials.map((partial, index) => makeTestImage(index + 1, partial));
  const textures = texturesForImages(images);
  const plateTextures = platesForImages(images, textures);
  return { id, images, plateTextures, subjectForegroundTextures: images.map(() => null) };
}

const scenarios: Scenario[] = [
  buildScenario("plain-3-no-plate-metadata", [{}, {}, {}]),
  {
    ...buildScenario(
      "six-with-baked-plates",
      Array.from({ length: 6 }, () => ({
        backgroundPlateUrl: JPG_MIME,
        backgroundPlateTheme: "original" as const,
      }))
    ),
    images: Array.from({ length: 6 }, (_, index) =>
      makeTestImage(index + 1, {
        backgroundPlateUrl: JPG_MIME,
        backgroundPlateTheme: "original",
      })
    ),
  },
  (() => {
    const matte = makeAlphaMatteTexture();
    const images = [1, 2, 3].map((id) =>
      makeTestImage(id, {
        backgroundPlateUrl: JPG_MIME,
        subjectForegroundUrl: PNG_MIME,
        voluMaxForegroundKind: "ai_cutout",
        voluMaxPrepared: true,
        preprocessMode: "volumax",
      })
    );
    return {
      id: "volumax-cutout-mesh",
      images,
      plateTextures: images.map(() => makeSolidTexture([30, 32, 38])),
      subjectForegroundTextures: images.map(() => matte),
      voluMaxDepthEnabled: false,
    };
  })(),
];

async function main(): Promise<void> {
  const { createPresentationScene } = await import(
    "../apps/web/src/features/cube/presentationScene.ts"
  );
  const { auditAllCubeFaceRigs } = await import(
    "../apps/web/src/features/cube/cubeFaceIntegrity.ts"
  );

  const results: Array<{ id: string; ok: boolean; report: ReturnType<typeof auditAllCubeFaceRigs> }> =
    [];

  for (const scenario of scenarios) {
    const textures = texturesForImages(scenario.images);
    const plateTextures = scenario.plateTextures ?? platesForImages(scenario.images, textures);
    const subjectForegroundTextures =
      scenario.subjectForegroundTextures ?? scenario.images.map(() => null);

    const scene = createPresentationScene(
      "cube_focus",
      scenario.images,
      textures,
      plateTextures,
      "rose_gold",
      false,
      "none",
      scenario.voluMaxDepthEnabled ?? false,
      subjectForegroundTextures,
      null,
      "octahedron",
      { lightweight: true }
    );

    const report = scene.auditFaceIntegrity?.() ?? auditAllCubeFaceRigs([]);
    scene.dispose();

    results.push({ id: scenario.id, ok: report.ok, report });

    if (!report.ok) {
      console.error(
        `FAIL [${scenario.id}]`,
        JSON.stringify(
          report.entries.filter((entry) => !entry.ok),
          null,
          2
        )
      );
    } else {
      console.log(`OK   [${scenario.id}] 6/6 faces fg+bg`);
    }
  }

  const plateUrlCases = [
    {
      label: "uses baked plate",
      input: { backgroundPlateUrl: JPG_MIME, url: PNG_MIME },
      expect: JPG_MIME,
    },
    {
      label: "falls back to face url",
      input: { url: JPG_MIME },
      expect: JPG_MIME,
    },
  ];

  for (const { label, input, expect } of plateUrlCases) {
    const resolved = resolvePresentationBackgroundPlateUrl(input);
    if (resolved !== expect) {
      console.error(
        `FAIL plate-url ${label}: got ${resolved.slice(0, 40)} expected ${expect.slice(0, 40)}`
      );
      process.exit(1);
    }
  }

  const allOk = results.every((result) => result.ok);
  console.log(
    JSON.stringify(
      {
        ok: allOk,
        scenarios: results.map(({ id, ok, report }) => ({
          id,
          ok,
          issueCount: report.issueCount,
          modes: report.entries.map((entry) => entry.mode),
        })),
      },
      null,
      2
    )
  );

  if (!allOk) {
    console.error("verify-cube-face-integrity: FAIL");
    process.exit(1);
  }
  console.log("verify-cube-face-integrity: OK (runtime scene mount)");
}

void main();
