export function arrayBufferToDataUrl(buffer: ArrayBuffer, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
        return;
      }
      reject(new Error("Failed to encode asset image."));
    };
    reader.onerror = () => reject(new Error("Failed to encode asset image."));
    reader.readAsDataURL(new Blob([buffer], { type: mimeType }));
  });
}
