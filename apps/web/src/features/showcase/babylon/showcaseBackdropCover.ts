/** object-fit: cover UV transform for fullscreen backdrop textures. */
export type BackdropCoverTransform = {
  uScale: number;
  vScale: number;
  uOffset: number;
  vOffset: number;
};

export function computeBackdropCoverTransform(
  mediaAspect: number,
  viewAspect: number
): BackdropCoverTransform {
  const media = Math.max(mediaAspect, 0.01);
  const view = Math.max(viewAspect, 0.01);

  if (media > view) {
    const uScale = view / media;
    return { uScale, vScale: 1, uOffset: (1 - uScale) * 0.5, vOffset: 0 };
  }

  const vScale = media / view;
  return { uScale: 1, vScale, uOffset: 0, vOffset: (1 - vScale) * 0.5 };
}
