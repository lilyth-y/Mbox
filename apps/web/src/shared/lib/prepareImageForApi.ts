import { API_JPEG_QUALITY, MAX_API_IMAGE_EDGE } from "@mbox/shared";

export interface PreparedApiImage {
  mimeType: string;
  base64: string;
  dataUrl: string;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image for API preparation."));
    image.src = url;
  });
}

export async function prepareImageForApi(dataUrl: string): Promise<PreparedApiImage> {
  const image = await loadImage(dataUrl);
  const longestEdge = Math.max(image.width, image.height);
  const scale = longestEdge > MAX_API_IMAGE_EDGE ? MAX_API_IMAGE_EDGE / longestEdge : 1;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas context is unavailable.");
  }

  context.drawImage(image, 0, 0, width, height);
  const preparedDataUrl = canvas.toDataURL("image/jpeg", API_JPEG_QUALITY);
  const [, base64] = preparedDataUrl.split(",");
  if (!base64) {
    throw new Error("Failed to encode prepared API image.");
  }

  return {
    mimeType: "image/jpeg",
    base64,
    dataUrl: preparedDataUrl,
  };
}
