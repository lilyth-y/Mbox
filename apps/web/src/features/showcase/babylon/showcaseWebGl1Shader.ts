/**
 * WebGL1 has no built-in derivatives; fwidth() needs GL_OES_standard_derivatives and
 * still fails on some ANGLE paths. Use fixed edge widths instead (user adjusts look in UI).
 */
export function stripFwidthForWebGl1(fragmentSource: string): string {
  return fragmentSource.replace(
    /max\(fwidth\([^)]+\)(?:\s*\*\s*[\d.]+)?,\s*([\d.]+)\)/g,
    "$1"
  );
}

export function resolveInnerPhotoShaderNames(preferWebGl1: boolean): {
  vertex: string;
  fragment: string;
} {
  if (preferWebGl1) {
    return { vertex: "jewelInnerPhoto", fragment: "jewelInnerPhotoWebGL1" };
  }
  return { vertex: "jewelInnerPhoto", fragment: "jewelInnerPhoto" };
}
