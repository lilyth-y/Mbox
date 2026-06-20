/** Inline demo portraits when repo backgrounds are not present. */
export function createShowcaseDemoDataUrl(seed: number): string {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 768;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k=";
  }

  const hue = (seed * 47) % 360;
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
  grad.addColorStop(0, `hsl(${hue}, 28%, 22%)`);
  grad.addColorStop(0.55, `hsl(${hue + 18}, 22%, 14%)`);
  grad.addColorStop(1, `hsl(${hue + 8}, 18%, 8%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width * 0.5;
  const cy = canvas.height * (0.42 + (seed % 3) * 0.02);
  const rx = canvas.width * (0.17 + (seed % 2) * 0.02);
  const ry = canvas.height * 0.2;
  ctx.fillStyle = `hsla(${hue + 30}, 35%, 88%, 0.95)`;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `hsla(${hue + 10}, 30%, 72%, 0.9)`;
  ctx.beginPath();
  ctx.ellipse(cx, cy + ry * 1.55, rx * 1.35, ry * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();

  return canvas.toDataURL("image/jpeg", 0.9);
}
