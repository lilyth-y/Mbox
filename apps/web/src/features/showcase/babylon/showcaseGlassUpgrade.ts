/** Deferred lite crystal shell — default localhost preview (no ?fullGpu=1). */
let shellUpgradeInFlight = false;

let glassUpgradeSkipped = false;

let glassUpgradeReady = false;

export function resetShowcaseGlassUpgradeSession(): void {
  shellUpgradeInFlight = false;
  glassUpgradeSkipped = false;
  glassUpgradeReady = false;
}

export function isShowcaseShellUpgradeInFlight(): boolean {
  return shellUpgradeInFlight;
}

export function isShowcaseGlassUpgradeReady(): boolean {
  return glassUpgradeReady;
}

export function markShowcaseGlassUpgradeSkipped(): void {
  glassUpgradeSkipped = true;
}

export function isShowcaseGlassUpgradeSkipped(): boolean {
  return glassUpgradeSkipped;
}

export function markShowcaseGlassUpgradeReady(): void {
  glassUpgradeReady = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mbox-showcase-glass-ready"));
  }
}

export async function runShowcaseShellUpgrade<T>(work: () => Promise<T>): Promise<T | null> {
  if (glassUpgradeSkipped || glassUpgradeReady) {
    return null;
  }
  shellUpgradeInFlight = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mbox-showcase-glass-loading"));
  }
  try {
    return await work();
  } catch (error) {
    console.warn("[showcase] shell upgrade failed", error);
    markShowcaseGlassUpgradeSkipped();
    return null;
  } finally {
    shellUpgradeInFlight = false;
  }
}
