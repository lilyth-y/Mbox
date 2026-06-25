import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";

export type ShowcaseInitPhase =
  | "engine"
  | "chapel"
  | "holo_textures"
  | "havok"
  | "camera_lights"
  | "backdrop"
  | "director"
  | "stable_frames"
  | "jewel_spawn";

export type ShowcaseInitPhaseRecord = {
  phase: ShowcaseInitPhase;
  ms: number;
  gpuBytesEstimate?: number;
  detail?: string;
};

export type ShowcaseSceneResourceSnapshot = {
  meshCount: number;
  materialCount: number;
  textureCount: number;
  textureGpuBytesEstimate: number;
  hardwareScalingLevel: number;
  renderWidth: number;
  renderHeight: number;
  drawCallsLastFrame: number | null;
};

export type ShowcaseResourceReport = {
  enabled: boolean;
  kinematicPreview: boolean;
  gpuTier: string;
  phases: ShowcaseInitPhaseRecord[];
  network: {
    wasmKb: number | null;
    babylonJsKb: number | null;
    onnxWasmKb: number | null;
    videoKb: number | null;
  };
  scene: ShowcaseSceneResourceSnapshot | null;
  totalInitMs: number;
  recommendations: string[];
};

const PHASE_BUDGET_MS: Record<ShowcaseInitPhase, number> = {
  engine: 120,
  chapel: 400,
  holo_textures: 600,
  havok: 800,
  camera_lights: 150,
  backdrop: 200,
  director: 100,
  stable_frames: 500,
  jewel_spawn: 400,
};

let active = false;
let t0 = 0;
let phaseStart = 0;
const phases: ShowcaseInitPhaseRecord[] = [];

export function isShowcaseResourceProfilingEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return (
    new URLSearchParams(window.location.search).get("profile") === "1" ||
    Boolean((window as unknown as { __MBOX_SHOWCASE_PROFILE__?: boolean }).__MBOX_SHOWCASE_PROFILE__) ||
    Boolean((window as unknown as { __MBOX_LOCAL_GPU_EXPORT__?: boolean }).__MBOX_LOCAL_GPU_EXPORT__)
  );
}

export function startShowcaseInitProfile(): void {
  if (!isShowcaseResourceProfilingEnabled()) {
    return;
  }
  active = true;
  t0 = performance.now();
  phaseStart = t0;
  phases.length = 0;
}

export function markShowcaseInitPhase(
  phase: ShowcaseInitPhase,
  detail?: string,
  gpuBytesEstimate?: number
): void {
  const now = performance.now();
  if (!active) {
    if (phase !== "jewel_spawn") {
      return;
    }
    phases.push({
      phase,
      ms: Math.round(now - (t0 || now)),
      detail,
      gpuBytesEstimate,
    });
    if (typeof window !== "undefined") {
      const existing = (
        window as unknown as { __MBOX_SHOWCASE_RESOURCE_REPORT__?: ShowcaseResourceReport }
      ).__MBOX_SHOWCASE_RESOURCE_REPORT__;
      if (existing) {
        existing.phases = [...phases];
      }
    }
    return;
  }
  phases.push({
    phase,
    ms: Math.round(now - phaseStart),
    detail,
    gpuBytesEstimate,
  });
  phaseStart = now;
}

function estimateTextureGpuBytes(scene: Scene): number {
  let bytes = 0;
  for (const tex of scene.textures) {
    const size = tex.getSize();
    const w = size.width ?? 0;
    const h = size.height ?? 0;
    bytes += w * h * 4;
  }
  return bytes;
}

export function snapshotShowcaseSceneResources(
  engine: Engine,
  scene: Scene
): ShowcaseSceneResourceSnapshot {
  const canvas = engine.getRenderingCanvas();
  return {
    meshCount: scene.meshes.length,
    materialCount: scene.materials.length,
    textureCount: scene.textures.length,
    textureGpuBytesEstimate: estimateTextureGpuBytes(scene),
    hardwareScalingLevel: engine.getHardwareScalingLevel(),
    renderWidth: canvas?.width ?? 0,
    renderHeight: canvas?.height ?? 0,
    drawCallsLastFrame: null,
  };
}

function readNetworkKb(): ShowcaseResourceReport["network"] {
  const resources = performance.getEntriesByType("resource");
  const sumKb = (pred: (name: string) => boolean) => {
    let kb = 0;
    for (const entry of resources) {
      if (!pred(entry.name)) {
        continue;
      }
      const size =
        "transferSize" in entry
          ? (entry as PerformanceResourceTiming).transferSize || 0
          : 0;
      kb += Math.round(size / 1024);
    }
    return kb || null;
  };
  return {
    wasmKb: sumKb((n) => n.includes("HavokPhysics.wasm")),
    babylonJsKb: sumKb((n) => /babylon/i.test(n) && n.endsWith(".js")),
    onnxWasmKb: sumKb((n) => n.includes("ort-wasm") || n.includes("onnx")),
    videoKb: sumKb((n) => /\.mp4/i.test(n)),
  };
}

function buildRecommendations(
  phaseRows: ShowcaseInitPhaseRecord[],
  scene: ShowcaseSceneResourceSnapshot | null,
  network: ShowcaseResourceReport["network"]
): string[] {
  const tips: string[] = [];
  const byPhase = Object.fromEntries(phaseRows.map((row) => [row.phase, row])) as Partial<
    Record<ShowcaseInitPhase, ShowcaseInitPhaseRecord>
  >;

  if ((byPhase.havok?.ms ?? 0) > PHASE_BUDGET_MS.havok) {
    tips.push(
      `havok ${byPhase.havok?.ms}ms — WASM ${network.wasmKb ?? "?"}KB; defer physics until after first stable frame or use ?physics=0`
    );
  }
  if ((byPhase.chapel?.ms ?? 0) > PHASE_BUDGET_MS.chapel) {
    tips.push(
      `chapel ${byPhase.chapel?.ms}ms — lower panoramaCanvasSize / skip PhotoDome (${byPhase.chapel?.detail ?? ""})`
    );
  }
  if ((byPhase.holo_textures?.ms ?? 0) > PHASE_BUDGET_MS.holo_textures) {
    tips.push(
      `holo_textures ${byPhase.holo_textures?.ms}ms — reduce textureMaxEdge (${byPhase.holo_textures?.detail ?? ""})`
    );
  }
  if ((scene?.textureGpuBytesEstimate ?? 0) > 12 * 1024 * 1024) {
    tips.push(
      `texture VRAM ~${Math.round((scene?.textureGpuBytesEstimate ?? 0) / (1024 * 1024))}MB — cap cubeTextureSize / env cubemap`
    );
  }
  if ((network.videoKb ?? 0) > 0) {
    tips.push(`backdrop video ${network.videoKb}KB transferred — disable DOM video on preview`);
  }
  if ((byPhase.jewel_spawn?.ms ?? 0) > PHASE_BUDGET_MS.jewel_spawn) {
    tips.push(
      `jewel_spawn ${byPhase.jewel_spawn?.ms}ms — reduce shader layers / shell inner (${byPhase.jewel_spawn?.detail ?? ""})`
    );
  }
  if (tips.length === 0) {
    tips.push("All phases within budget — no automatic downgrade suggested.");
  }
  return tips;
}

export function finalizeShowcaseResourceReport(input: {
  kinematicPreview: boolean;
  gpuTier: string;
  scene?: Scene | null;
  engine?: Engine | null;
}): ShowcaseResourceReport {
  const totalInitMs = active ? Math.round(performance.now() - t0) : 0;
  const network = readNetworkKb();
  const scene =
    input.scene && input.engine
      ? snapshotShowcaseSceneResources(input.engine, input.scene)
      : null;
  const report: ShowcaseResourceReport = {
    enabled: active,
    kinematicPreview: input.kinematicPreview,
    gpuTier: input.gpuTier,
    phases: [...phases],
    network,
    scene,
    totalInitMs,
    recommendations: buildRecommendations(phases, scene, network),
  };

  if (active && typeof window !== "undefined") {
    (window as unknown as { __MBOX_SHOWCASE_RESOURCE_REPORT__?: ShowcaseResourceReport }).__MBOX_SHOWCASE_RESOURCE_REPORT__ =
      report;
    console.table(phases.map((p) => ({ phase: p.phase, ms: p.ms, detail: p.detail ?? "" })));
    console.info("[showcase] resource report", report);
  }

  active = false;
  return report;
}

export function markShowcaseJewelSpawn(detail: string, gpuBytesEstimate?: number): void {
  markShowcaseInitPhase("jewel_spawn", detail, gpuBytesEstimate);
  if (!active || typeof window === "undefined") {
    return;
  }
  const engine = (
    window as unknown as {
      __MBOX_SHOWCASE_PROFILE_ENGINE__?: Engine;
      __MBOX_SHOWCASE_PROFILE_SCENE__?: Scene;
    }
  ).__MBOX_SHOWCASE_PROFILE_ENGINE__;
  const scene = (
    window as unknown as {
      __MBOX_SHOWCASE_PROFILE_SCENE__?: Scene;
    }
  ).__MBOX_SHOWCASE_PROFILE_SCENE__;
  if (engine && scene) {
    const existing = (window as unknown as { __MBOX_SHOWCASE_RESOURCE_REPORT__?: ShowcaseResourceReport })
      .__MBOX_SHOWCASE_RESOURCE_REPORT__;
    if (existing) {
      existing.phases = [...phases];
      existing.scene = snapshotShowcaseSceneResources(engine, scene);
      existing.recommendations = buildRecommendations(
        existing.phases,
        existing.scene,
        existing.network
      );
    }
  }
}

export function bindShowcaseProfileScene(engine: Engine, scene: Scene): void {
  if (!isShowcaseResourceProfilingEnabled() || typeof window === "undefined") {
    return;
  }
  const w = window as unknown as {
    __MBOX_SHOWCASE_PROFILE_ENGINE__?: Engine;
    __MBOX_SHOWCASE_PROFILE_SCENE__?: Scene;
  };
  w.__MBOX_SHOWCASE_PROFILE_ENGINE__ = engine;
  w.__MBOX_SHOWCASE_PROFILE_SCENE__ = scene;
}
