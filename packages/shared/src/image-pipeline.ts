export const DEPTH_GRID_SIZE = 16;

/** Smaller edge = faster Vertex analysis (mobile-friendly). */
export const MAX_API_IMAGE_EDGE = 960;

export const API_JPEG_QUALITY = 0.78;

export const DEFAULT_VERTEX_LOCATION = "asia-northeast3";

/**
 * Vertex models that return IMAGE are not hosted in asia-northeast3.
 * Background removal uses browser segmentation or server matte (see BACKGROUND_REMOVAL_PROVIDER).
 */
export const DEFAULT_EDIT_MODEL = "gemini-2.5-flash-image";
