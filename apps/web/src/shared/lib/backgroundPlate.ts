function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image for background plate."));
    image.src = dataUrl;
  });
}

/** Blurred fill plate for dual-layer cube parallax (background layer). */
export async function createBackgroundPlateDataUrl(
  sourceDataUrl: string,
  size = 1024,
  blurPx = 32
): Promise<string> {
  const image = await loadImage(sourceDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context is unavailable.");
  }

  const scale = Math.max(size / image.width, size / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const offsetX = (size - drawWidth) / 2;
  const offsetY = (size - drawHeight) / 2;

  context.filter = `blur(${blurPx}px) saturate(1.12) brightness(1.04)`;
  context.drawImage(image, offsetX, offsetY, drawWidth, drawHeight);
  context.filter = "none";
  context.fillStyle = "rgba(72, 38, 48, 0.18)";
  context.fillRect(0, 0, size, size);
  context.fillStyle = "rgba(255, 232, 220, 0.12)";
  context.fillRect(0, 0, size, size);

  return canvas.toDataURL("image/jpeg", 0.82);
}
