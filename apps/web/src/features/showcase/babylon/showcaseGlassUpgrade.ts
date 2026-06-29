/** True while deferred crystal-shell shaders compile (non-fatal on context loss). */
let shellUpgradeInFlight = false;

let glassUpgradeSkipped = false;

export function isShowcaseShellUpgradeInFlight(): boolean {
  return shellUpgradeInFlight;
}

export function markShowcaseGlassUpgradeSkipped(): void {
  glassUpgradeSkipped = true;
}

export function isShowcaseGlassUpgradeSkipped(): boolean {
  return glassUpgradeSkipped;
}

export async function runShowcaseShellUpgrade<T>(work: () => Promise<T>): Promise<T | null> {
  if (glassUpgradeSkipped) {
    return null;
  }
  shellUpgradeInFlight = true;
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
