/** Yield the main thread between heavy raster passes (shape change / preload). */
export function yieldJewelPhotoRaster(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(() => resolve(), { timeout: 32 });
      return;
    }
    window.setTimeout(resolve, 0);
  });
}
