import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { Engine } from "@babylonjs/core/Engines/engine";
import { EngineStore } from "@babylonjs/core/Engines/engineStore";
import { isShowcaseAutomationSession } from "../showcaseAutomation";
import { isLocalGpuExportSession } from "../../../shared/lib/renderExportProfile";

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

export function isWebGLAvailable(): boolean {
  return probeWebGLSupport().usable;
}

export type WebGLProbeResult = {
  webgl2: boolean;
  webgl1: boolean;
  usable: boolean;
  babylonIsSupported: boolean;
  electronShell: boolean;
};

/** Native canvas probe (independent of Babylon cache). */
export function probeWebGLSupport(): WebGLProbeResult {
  let webgl2 = false;
  let webgl1 = false;
  try {
    const canvas = document.createElement("canvas");
    webgl2 = !!canvas.getContext("webgl2");
    webgl1 = !!(
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl")
    );
  } catch {
    // leave false
  }
  const electronShell = /\bElectron\b/i.test(navigator.userAgent);
  const usable = webgl2 || webgl1;
  return {
    webgl2,
    webgl1,
    usable,
    babylonIsSupported: Engine.IsSupported,
    electronShell,
  };
}

export function isShowcaseElectronPreviewShell(): boolean {
  return probeWebGLSupport().electronShell;
}

export type WebGLHelpContext = {
  /** Babylon/WebGL had started before this failure (context lost vs never supported). */
  hadLiveContext?: boolean;
};

export function buildShowcaseWebGLHelp(message: string, ctx?: WebGLHelpContext): string[] {
  const probe = probeWebGLSupport();
  const lines: string[] = [];
  const webglNeverStarted =
    /webgl not supported/i.test(message) ||
    (/webgl/i.test(message) && !probe.usable && ctx?.hadLiveContext !== true);

  if (probe.electronShell) {
    lines.push(
      "Cursor/VS Code 등 Electron 내장 미리보기는 WebGL이 꺼져 있는 경우가 많습니다.",
      "아래 「Chrome/Edge에서 열기」로 시스템 브라우저에서 여세요. (내장 탭에서는 3D가 동작하지 않을 수 있습니다.)"
    );
    return lines;
  }

  if (webglNeverStarted) {
    lines.push(
      "이 브라우저에서 WebGL 컨텍스트를 만들지 못했습니다. (컨텍스트 끊김이 아닙니다.)",
      "Chrome 설정 → 시스템 → 「하드웨어 가속 사용」을 켠 뒤 브라우저를 완전히 종료하고 다시 열어 주세요."
    );
    lines.push(
      "chrome://gpu 에서 WebGL · WebGL2 가 Disabled 가 아닌지 확인해 주세요."
    );
    lines.push(
      "콘솔(F12)에 다음을 붙여 넣어 true/true 가 나오면 WebGL 자체는 정상입니다: " +
        "(()=>{const c=document.createElement('canvas');return{webgl2:!!c.getContext('webgl2'),webgl:!!c.getContext('webgl')}})()"
    );
    return lines;
  }

  const contextLost =
    /context lost/i.test(message) ||
    (!probe.usable && ctx?.hadLiveContext === true);
  if (contextLost) {
    lines.push(
      "WebGL은 시작됐지만 렌더링 중 컨텍스트가 끊겼습니다. (PC WebGL 고장이 아닐 수 있습니다.)",
      "Ctrl+Shift+R 로 새로고침하거나, Chrome/Edge를 완전히 종료한 뒤 다시 열어 주세요."
    );
    if (import.meta.env.DEV) {
      lines.push(
        "브라우저 탭만 닫아도 Vite dev 서버(node)가 5173~5175 포트에 남을 수 있습니다. 터미널에서 npm run dev 를 모두 끄고 하나만 다시 실행하세요.",
        "터미널에 표시된 포트(예: http://localhost:5176/showcase.html)만 사용하세요."
      );
    } else {
      lines.push(
        "다른 3D·영상 탭을 모두 닫고 이 페이지만 다시 열어 주세요.",
        "미리보기가 계속 실패해도 클라우드 MP4 생성(배포 설정 시)은 별도로 시도할 수 있습니다."
      );
    }
    return lines;
  }

  if (!/webgl/i.test(message)) {
    lines.push(message);
    return lines;
  }

  if (!probe.usable) {
    lines.push("이 브라우저에서 WebGL 테스트 컨텍스트를 만들지 못했습니다.");
    lines.push(
      "chrome://gpu 에서 WebGL · WebGL2 가 Disabled 가 아닌지, 하드웨어 가속이 켜져 있는지 확인해 주세요."
    );
    lines.push(
      "콘솔(F12)에 다음을 붙여 넣어 true/true 가 나오면 WebGL 자체는 정상입니다: " +
        "(()=>{const c=document.createElement('canvas');return{webgl2:!!c.getContext('webgl2'),webgl:!!c.getContext('webgl')}})()"
    );
    return lines;
  }

  lines.push(
    "WebGL은 지원되지만 미리보기 canvas에 붙이지 못했습니다.",
    "다른 3D 탭을 닫고 새로고침해 보세요."
  );
  return lines;
}

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

/** Windows / ?safe=1 — simplified GPU tier + WebGL recovery (not a photo count cap). */
export function isShowcaseLowGpuHost(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("fullGpu") === "1") {
    return false;
  }
  if (params.get("safe") === "1") {
    return true;
  }
  const platform = navigator.platform ?? "";
  const ua = navigator.userAgent ?? "";
  return /Win/i.test(platform) || /Windows/i.test(ua);
}

/** Windows + Havok + video backdrop often triggers consecutive CONTEXT_LOST without this. */
export function shouldUseConservativeShowcaseWebGl(): boolean {
  return isShowcaseLowGpuHost();
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

export function isShowcaseCanvasContextLost(canvas: HTMLCanvasElement): boolean {
  try {
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    if (!gl) {
      return false;
    }
    return (gl as WebGLRenderingContext).isContextLost?.() === true;
  } catch {
    return false;
  }
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

export function createShowcaseBabylonEngine(
  canvas: HTMLCanvasElement,
  forceLowPower = false,
  forceWebGl1 = false
): Engine {
  disposeBabylonEnginesForCanvas(canvas);

  const automation = isShowcaseAutomationSession();
  const localGpuExport = isLocalGpuExportSession();

  const useWebGl1 = forceWebGl1 === true;

  if (useWebGl1) {
    return new Engine(canvas, true, {
      preserveDrawingBuffer: automation ? true : false,
      stencil: false,
      antialias: false,
      alpha: false,
      powerPreference: "default",
      disableWebGL2Support: true,
    });
  }

  const safeMode =
    forceLowPower ||
    (typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("safe") === "1");

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
  const optionsList = automation
    ? baseList.map((opt) => ({ ...opt, preserveDrawingBuffer: true }))
    : baseList;

  for (const options of optionsList) {
    try {
      const engine = new Engine(canvas, true, options);
      if (localGpuExport) {
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
  throw new Error("WebGL not supported");
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

export function formatShowcaseWebGLError(message: string): string {
  return buildShowcaseWebGLHelp(message).join(" ");
}
