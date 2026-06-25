import type { Engine } from "@babylonjs/core/Engines/engine";

type ResumeFn = () => void;

const resumeByEngine = new WeakMap<Engine, ResumeFn>();
const pauseDepthByEngine = new WeakMap<Engine, number>();

export function registerShowcaseRenderResume(engine: Engine, resume: ResumeFn): void {
  resumeByEngine.set(engine, resume);
}

export function unregisterShowcaseRenderResume(engine: Engine): void {
  resumeByEngine.delete(engine);
  pauseDepthByEngine.delete(engine);
}

export function pauseShowcaseRender(engine: Engine): void {
  const depth = (pauseDepthByEngine.get(engine) ?? 0) + 1;
  pauseDepthByEngine.set(engine, depth);
  if (depth === 1) {
    engine.stopRenderLoop();
  }
}

export function resumeShowcaseRender(engine: Engine): void {
  const depth = Math.max(0, (pauseDepthByEngine.get(engine) ?? 0) - 1);
  if (depth === 0) {
    pauseDepthByEngine.delete(engine);
    resumeByEngine.get(engine)?.();
  } else {
    pauseDepthByEngine.set(engine, depth);
  }
}

export async function withPausedShowcaseRender<T>(
  engine: Engine,
  fn: () => Promise<T>
): Promise<T> {
  pauseShowcaseRender(engine);
  try {
    return await fn();
  } finally {
    resumeShowcaseRender(engine);
  }
}
