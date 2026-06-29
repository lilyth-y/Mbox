import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { Engine } from "@babylonjs/core/Engines/engine";
import { EngineStore } from "@babylonjs/core/Engines/engineStore";
import { isShowcaseAutomationSession } from "../showcaseAutomation";
import {
  isEmbeddedIdeShell,
  isGpuSafeMode,
  isLocalGpuSession,
} from "../../../shared/lib/gpuSession";

type EngineOptions = ConstructorParameters<typeof Engine>[2];

const SHOWCASE_ENGINE_OPTIONS: EngineOptions[] = [
  {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: false,
    alpha: true,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  },
  {
    preserveDrawingBuffer: false,
    stencil: true,
    antialias: true,
    alpha: true,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  },
  {
    preserveDrawingBuffer: true,
    stencil: false,
    antialias: false,
    alpha: true,
    premultipliedAlpha: false,
    powerPreference: "default",
  },
  {
    preserveDrawingBuffer: true,
    stencil: false,
    antialias: false,
    alpha: false,
    powerPreference: "default",
    disableWebGL2Support: true,
  },
];

/** Drop leaked Babylon engines still bound to this canvas (HMR / fast catalog reload). */
export function disposeBabylonEnginesForCanvas(canvas: HTMLCanvasElement): void {
  for (const engine of EngineStore.Instances.slice()) {
    if (engine.getRenderingCanvas() === canvas) {
      engine.stopRenderLoop();
      engine.dispose();
    }
  }
}

/** Emergency cleanup — ensure only one Babylon engine lives (context-loss recovery). */
export function disposeAllBabylonEngines(): void {
  for (const engine of EngineStore.Instances.slice()) {
    try {
      engine.stopRenderLoop();
      engine.dispose();
    } catch {
      // ignore
    }
  }
}

export type GpuProbeResult = {
  gpu2: boolean;
  gpu1: boolean;
  usable: boolean;
  babylonIsSupported: boolean;
  embeddedIde: boolean;
  /** @deprecated use embeddedIde */
  electronShell: boolean;
};

/** @deprecated use GpuProbeResult */
export type WebGLProbeResult = GpuProbeResult;

const GPU_CONTEXT_ATTRS: WebGLContextAttributes = {
  failIfMajorPerformanceCaveat: false,
  powerPreference: "high-performance",
};

/** Native canvas probe (independent of Babylon cache). */
export function probeGpuSupport(): GpuProbeResult {
  let gpu2 = false;
  let gpu1 = false;
  try {
    const canvas2 = document.createElement("canvas");
    gpu2 = !!canvas2.getContext("webgl2", GPU_CONTEXT_ATTRS);
  } catch {
    // leave false
  }
  try {
    const canvas1 = document.createElement("canvas");
    gpu1 = !!(
      canvas1.getContext("webgl", GPU_CONTEXT_ATTRS) ||
      canvas1.getContext("experimental-webgl", GPU_CONTEXT_ATTRS)
    );
  } catch {
    // leave false
  }
  const embeddedIde = isEmbeddedIdeShell();
  const usable = gpu2 || gpu1;
  return {
    gpu2,
    gpu1,
    usable,
    babylonIsSupported: Engine.IsSupported,
    embeddedIde,
    electronShell: embeddedIde,
  };
}

/** @deprecated use probeGpuSupport */
export const probeWebGLSupport = probeGpuSupport;

export function isWebGLAvailable(): boolean {
  return probeGpuSupport().usable;
}

export function isShowcaseElectronPreviewShell(): boolean {
  return isEmbeddedIdeShell();
}

export type GpuHelpContext = {
  /** GPU context had started before this failure (context lost vs never supported). */
  hadLiveContext?: boolean;
  /** Hard-rebuild / init-retry count this page session. */
  recoveryAttempts?: number;
};

/** @deprecated use GpuHelpContext */
export type WebGLHelpContext = GpuHelpContext;

export function buildShowcaseGpuHelp(message: string, ctx?: GpuHelpContext): string[] {
  const probe = probeGpuSupport();
  const lines: string[] = [];
  const recoveryAttempts = ctx?.recoveryAttempts ?? 0;
  const gpuNeverStarted =
    /webgl not supported|gpu not supported/i.test(message) ||
    (/gpu|webgl/i.test(message) && !probe.usable && ctx?.hadLiveContext !== true);

  if (
    recoveryAttempts >= 1 &&
    !probe.usable &&
    (/webgl not supported|gpu not supported/i.test(message) || ctx?.hadLiveContext === true)
  ) {
    lines.push(
      "로컬 GPU는 시작됐지만 재시도 과정에서 WebGL 컨텍스트가 고갈되었습니다.",
      "Chrome을 완전히 종료(작업 관리자에서 chrome.exe 전부)한 뒤, 3D·영상 탭 없이 이 페이지만 다시 열어 주세요."
    );
    if (import.meta.env.DEV) {
      lines.push(
        "Playwright·자동 검사용 Chrome이 GPU를 점유 중일 수 있습니다. 검사 스크립트를 끈 뒤 다시 시도하세요."
      );
    }
    lines.push("chrome://gpu 에서 WebGL2가 Disabled 가 아닌지도 확인해 주세요.");
    return lines;
  }

  if (probe.embeddedIde && isLocalGpuSession() && !probe.usable) {
    lines.push(
      "Cursor 내장 브라우저는 WebGL을 제공하지 않습니다. 로컬 GPU Worker가 미리보기를 중계합니다.",
      "「로컬 GPU 중계」 표시 후 화면이 나오면 정상입니다. dev 서버가 실행 중이어야 합니다."
    );
    return lines;
  }

  if (probe.embeddedIde && !isLocalGpuSession()) {
    lines.push(
      "내장 IDE 미리보기에서는 로컬 GPU가 비활성화되어 있을 수 있습니다.",
      "localhost URL에 ?fullGpu=1&localOnly=1 을 붙이거나 시스템 Chrome에서 여세요."
    );
    return lines;
  }

  if (gpuNeverStarted) {
    lines.push(
      "이 브라우저에서 로컬 GPU 컨텍스트를 만들지 못했습니다. (렌더 중 끊김이 아닙니다.)",
      "Chrome 설정 → 시스템 → 「하드웨어 가속 사용」을 켠 뒤 브라우저를 완전히 종료하고 다시 열어 주세요."
    );
    lines.push("chrome://gpu 에서 GPU 가속이 Disabled 가 아닌지 확인해 주세요.");
    return lines;
  }

  const contextLost =
    /context lost/i.test(message) ||
    (!probe.usable && ctx?.hadLiveContext === true);
  if (contextLost) {
    lines.push(
      "로컬 GPU는 시작됐지만 렌더링 중 컨텍스트가 끊겼습니다.",
      "Ctrl+Shift+R 로 새로고침하거나, Chrome/Edge를 완전히 종료한 뒤 다시 열어 주세요."
    );
    if (import.meta.env.DEV) {
      lines.push(
        "브라우저 탭만 닫아도 Vite dev 서버가 5173~5175 포트에 남을 수 있습니다. npm run dev:stop 후 하나만 다시 실행하세요.",
        "터미널에 표시된 포트(예: http://localhost:5173/showcase.html)만 사용하세요."
      );
    } else {
      lines.push(
        "다른 3D·영상 탭을 모두 닫고 이 페이지만 다시 열어 주세요.",
        "미리보기가 계속 실패해도 클라우드 MP4 생성(배포 설정 시)은 별도로 시도할 수 있습니다."
      );
    }
    return lines;
  }

  if (!/gpu|webgl/i.test(message)) {
    lines.push(message);
    return lines;
  }

  if (!probe.usable) {
    lines.push("이 브라우저에서 GPU 테스트 컨텍스트를 만들지 못했습니다.");
    lines.push("chrome://gpu 에서 가속이 켜져 있는지 확인해 주세요.");
    return lines;
  }

  lines.push(
    "GPU는 지원되지만 미리보기 canvas에 붙이지 못했습니다.",
    "다른 3D 탭을 닫고 새로고침해 보세요."
  );
  return lines;
}

/** @deprecated use buildShowcaseGpuHelp */
export const buildShowcaseWebGLHelp = buildShowcaseGpuHelp;

export async function waitForCanvasLayout(
  canvas: HTMLCanvasElement,
  timeoutMs = 8_000
): Promise<void> {
  const hasSize = () => canvas.clientWidth > 0 && canvas.clientHeight > 0;
  if (hasSize()) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      observer.disconnect();
      if (ok) {
        resolve();
      } else {
        reject(new Error("미리보기 영역 크기를 읽을 수 없습니다. 창 크기를 조절한 뒤 새로고침해 주세요."));
      }
    };

    const observer = new ResizeObserver(() => {
      if (hasSize()) {
        finish(true);
      }
    });
    observer.observe(canvas);

    const poll = () => {
      if (hasSize()) {
        finish(true);
        return;
      }
      if (Date.now() >= deadline) {
        finish(false);
        return;
      }
      requestAnimationFrame(poll);
    };
    requestAnimationFrame(poll);
  });
}

/** @deprecated use isLocalGpuPreview from shared/lib/localGpuPreview */
export const isShowcaseLocalGpuPreview = isLocalGpuSession;

/** @deprecated use isGpuSafeMode from shared/lib/gpuSession */
export function isShowcaseLowGpuHost(): boolean {
  return isGpuSafeMode();
}

/** @deprecated use isGpuSafeMode */
export function shouldUseConservativeShowcaseWebGl(): boolean {
  return isGpuSafeMode();
}

export function isBabylonGlContextLost(engine: Engine): boolean {
  try {
    const gl = (engine as unknown as { _gl?: WebGLRenderingContext })._gl;
    if (!gl) {
      return false;
    }
    return gl.isContextLost?.() === true;
  } catch {
    return false;
  }
}

/**
 * Never call `canvas.getContext()` here — it binds a WebGL context on the showcase
 * canvas and makes subsequent Babylon `Engine` creation fail with "WebGL not supported".
 */
export function isShowcaseCanvasContextLost(
  _canvas: HTMLCanvasElement,
  engine?: Engine | null
): boolean {
  if (!engine || engine.isDisposed) {
    return false;
  }
  return isBabylonGlContextLost(engine);
}

export type GpuStableFrameResult = "stable" | "cancelled" | "context_lost";

/** Wait for consecutive animation frames without context loss (preview stability gate). */
export async function waitForGpuStableFrames(
  engine: Engine,
  frameCount: number,
  shouldContinue?: () => boolean,
  maxWaitMs = 15_000
): Promise<GpuStableFrameResult> {
  const deadline = Date.now() + maxWaitMs;
  let stable = 0;

  while (stable < frameCount && Date.now() < deadline) {
    if (shouldContinue && !shouldContinue()) {
      return "cancelled";
    }
    if (isBabylonGlContextLost(engine)) {
      return "context_lost";
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (shouldContinue && !shouldContinue()) {
      return "cancelled";
    }
    if (isBabylonGlContextLost(engine)) {
      stable = 0;
      continue;
    }
    stable += 1;
  }

  if (shouldContinue && !shouldContinue()) {
    return "cancelled";
  }
  return isBabylonGlContextLost(engine) ? "context_lost" : "stable";
}

export function createAppBabylonEngine(
  canvas: HTMLCanvasElement,
  forceWebGl1 = false
): Engine {
  const lowPower =
    !isLocalGpuSession() && isGpuSafeMode();
  return createShowcaseBabylonEngine(canvas, lowPower, forceWebGl1);
}

export function createShowcaseBabylonEngine(
  canvas: HTMLCanvasElement,
  forceLowPower = false,
  forceWebGl1 = false
): Engine {
  disposeBabylonEnginesForCanvas(canvas);

  const automation = isShowcaseAutomationSession();
  const localGpuPath = isLocalGpuSession();

  const useWebGl1 = forceWebGl1 === true;

  if (useWebGl1) {
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: automation ? true : false,
      stencil: false,
      antialias: false,
      alpha: false,
      powerPreference: "default",
      disableWebGL2Support: true,
    });
    try {
      (engine.getCaps() as { parallelShaderCompile?: unknown }).parallelShaderCompile = null;
    } catch {
      // ignore
    }
    return engine;
  }

  const safeMode = forceLowPower || isGpuSafeMode();

  let lastError: unknown;
  const baseList = safeMode
    ? [
        {
          preserveDrawingBuffer: automation ? true : false,
          stencil: false,
          antialias: false,
          alpha: false,
          powerPreference: "default",
        } satisfies EngineOptions,
        {
          preserveDrawingBuffer: automation ? true : false,
          stencil: false,
          antialias: false,
          alpha: false,
          powerPreference: "default",
          disableWebGL2Support: true,
        } satisfies EngineOptions,
        ...SHOWCASE_ENGINE_OPTIONS,
      ]
    : SHOWCASE_ENGINE_OPTIONS;

  // Headless cloud workers need preserveDrawingBuffer for captureStream frames.
  // Local ANGLE export must not — it doubles VRAM during jewel shader compile and triggers CONTEXT_LOST.
  let optionsList = automation
    ? baseList.map((opt) => ({ ...opt, preserveDrawingBuffer: true }))
    : baseList;

  if (localGpuPath && !automation) {
    optionsList = [...optionsList].sort((a, b) => {
      const aa = a?.antialias ? 1 : 0;
      const bb = b?.antialias ? 1 : 0;
      return bb - aa;
    });
  }

  for (const options of optionsList) {
    try {
      const engine = new Engine(canvas, true, options);
      if (localGpuPath || forceLowPower) {
        try {
          (engine.getCaps() as { parallelShaderCompile?: unknown }).parallelShaderCompile = null;
        } catch {
          // ignore
        }
      }
      return engine;
    } catch (error) {
      lastError = error;
      disposeBabylonEnginesForCanvas(canvas);
    }
  }

  if (lastError instanceof Error) {
    disposeAllBabylonEngines();
    throw lastError;
  }
  disposeAllBabylonEngines();
  throw new Error("GPU not supported");
}

export function isShowcaseEngineWebGl1(engine: AbstractEngine): boolean {
  try {
    const gl = (engine as unknown as { _gl?: WebGLRenderingContext })._gl;
    if (!gl) {
      return false;
    }
    return !(
      typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext
    );
  } catch {
    return false;
  }
}

export function formatShowcaseGpuError(message: string): string {
  return buildShowcaseGpuHelp(message).join(" ");
}

/** @deprecated use formatShowcaseGpuError */
export function formatShowcaseWebGLError(message: string): string {
  return formatShowcaseGpuError(message);
}
