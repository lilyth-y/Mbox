import { CubePlayer } from './cube-core.js?v=volumax-bg5';

// Local API port — keep aligned with packages/shared/src/devPorts.ts (API_PORT in .env)
const MBOX_API_DEV_PORT = 8787;

// API BASE CONFIG (Dynamically resolve cloud/deployment host origin if not file:// or localhost)
const CLOUD_RUN_API_URL = 'https://mbox-api-118689443638.asia-northeast3.run.app';
const CLOUD_API_KEY = 'mbox-prod-j5WzZTkM3KLekOEkox7rmKamTqUf9gky';
const urlParams = new URLSearchParams(window.location.search);
const paramApiUrl = urlParams.get('api_url');
let API_BASE_URL = paramApiUrl || `http://localhost:${MBOX_API_DEV_PORT}`;
let API_KEY_HEADER = '';
const isLocalIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(window.location.hostname);
if (!paramApiUrl && window.location.protocol !== 'file:') {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    API_BASE_URL = `http://localhost:${MBOX_API_DEV_PORT}`;
  } else if (isLocalIP) {
    // LAN: same host, dev API port (override with ?api_url= if API_PORT changed)
    API_BASE_URL = `http://${window.location.hostname}:${MBOX_API_DEV_PORT}`;
  } else {
    // 프로덕션(GCS, CDN 등) — Cloud Run URL 고정
    API_BASE_URL = CLOUD_RUN_API_URL;
    API_KEY_HEADER = CLOUD_API_KEY;
  }
}
if (API_BASE_URL.includes('run.app')) {
  API_KEY_HEADER = CLOUD_API_KEY;
}

function apiHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Workspace-Id': 'default', ...extra };
  if (API_KEY_HEADER) headers['x-api-key'] = API_KEY_HEADER;
  return headers;
}
const IMAGE_SIZE = 1024;
const EXPORT_CANVAS_SIZE = 1024;
const MAX_API_IMAGE_EDGE = 1024;
const API_JPEG_QUALITY = 0.85;

// -------------------------------------------------------
// IMGLY BACKGROUND REMOVAL (Browser WASM — accurate person silhouette)
// -------------------------------------------------------
const IMGLY_VERSION = '1.7.0';
const IMGLY_CDN = `https://staticimgly.com/@imgly/background-removal-data/${IMGLY_VERSION}/dist/`;
const IMGLY_ESM_URL = `https://esm.sh/@imgly/background-removal@${IMGLY_VERSION}`;

const IMGLY_MODEL_FALLBACKS = ['isnet_fp16', 'isnet_quint8', 'isnet'];

let _imglyModule = null;
let _imglyPreloadPromise = null;

async function loadImglyModule() {
  if (_imglyModule) return _imglyModule;
  _imglyModule = await import(IMGLY_ESM_URL);
  return _imglyModule;
}

async function preloadImglyRemoval(onStatus) {
  if (_imglyPreloadPromise) return _imglyPreloadPromise;
  _imglyPreloadPromise = (async () => {
    onStatus?.('누끼 AI 모델 준비 중 (최초 1회)...');
    const { preload } = await loadImglyModule();
    await preload({
      publicPath: IMGLY_CDN,
      model: IMGLY_MODEL_FALLBACKS[0],
      device: 'gpu',
      proxyToWorker: true,
    });
    onStatus?.('누끼 AI 모델 준비 완료');
  })().catch((err) => {
    _imglyPreloadPromise = null;
    throw err;
  });
  return _imglyPreloadPromise;
}

async function removeBackgroundViaApi(dataUrl, subjectBounds, label, onStatus) {
  try {
    onStatus?.('서버 AI 누끼 처리 중...');
    const prepared = await prepareImageForApi(dataUrl);
    const editRes = await fetch(`${API_BASE_URL}/edit`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        imageBase64: prepared.base64,
        mimeType: prepared.mimeType,
        label: label || 'Photo',
        editMode: 'remove_background',
        subjectBounds: subjectBounds || undefined,
      }),
    });
    if (!editRes.ok) return null;
    const editData = await editRes.json();
    return `data:${editData.mimeType || 'image/png'};base64,${editData.imageBase64}`;
  } catch (err) {
    console.warn('[VoluMax] API 누끼 실패:', err);
    return null;
  }
}

/**
 * Remove background using browser WASM (accurate person silhouette).
 * Falls back to API matte — never returns soft-rectangle matte.
 */
async function removeBackgroundBrowser(dataUrl, onStatus, subjectBounds, label) {
  const { removeBackground } = await loadImglyModule();
  for (const model of IMGLY_MODEL_FALLBACKS) {
    for (const device of ['gpu', 'cpu']) {
      try {
        onStatus?.(`브라우저 AI 누끼 (${model}/${device})...`);
        const resultBlob = await removeBackground(dataUrl, {
          publicPath: IMGLY_CDN,
          model,
          device,
          proxyToWorker: true,
          output: { format: 'image/png', quality: 0.94 },
        });
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(resultBlob);
        });
      } catch (err) {
        console.warn(`[imgly] ${model}/${device} failed:`, err);
      }
    }
  }
  return removeBackgroundViaApi(dataUrl, subjectBounds, label, onStatus);
}

const CUBE_PRESENTATION_DEFAULTS =
  typeof window !== 'undefined' && window.MBOX_CUBE_PRESENTATION_DEFAULTS
    ? window.MBOX_CUBE_PRESENTATION_DEFAULTS
    : {
        presentationEffectId: 'cube_focus',
        framePresetId: 'rose_gold',
        customFrameColor: '',
        gradientColorCycle: false,
        backgroundTheme: 'original',
        particleTheme: 'none',
        bgmTrackId: 'none',
        hologramMode: false,
        voluMaxDepthEnabled: false,
        voluMaxAiForegroundCutout: true,
        voluMaxAutoPrepareLayers: false,
        cubeRotationMode: 'yaw_cw',
        fanSpeed: 1
      };

let state = {
  step: 1, // 1: upload, 2: processing, 3: preview & export
  sourceImages: [], // base64 strings
  processedImages: [], // Array of { id, url, backgroundPlateUrl, center, focus, etc. }
  settings: { ...CUBE_PRESENTATION_DEFAULTS },
  isRecording: false,
  nextImageIndex: 6,
  recordingStartTime: 0
};

// PRESET STYLES
/** HTML color input → Three.js hex (parseInt('#fff','0x') is broken and yields black). */
function parseFrameColorHex(input) {
  if (!input || typeof input !== 'string') return null;
  const hex = input.trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return parseInt(hex, 16);
}

const FRAME_PRESETS = {
  rose_gold: {
    name: 'Rose Gold',
    outerColor: 0xe5b3b3,
    innerColor: 0xdfb386,
    metalness: 0.95,
    roughness: 0.15
  },
  silver_crystal: {
    name: 'Silver Crystal',
    outerColor: 0xe2e8f0,
    innerColor: 0xffffff,
    metalness: 0.98,
    roughness: 0.05
  },
  antique_bronze: {
    name: 'Bronze Metal',
    outerColor: 0x8c6239,
    innerColor: 0xdfb386,
    metalness: 0.9,
    roughness: 0.25
  }
};

// UI ELEMENTS
const fileInput = document.getElementById('file-input');
const dropZone = document.getElementById('drop-zone');
const selectedImagesWrap = document.getElementById('selected-images-wrap');
const thumbnailsGrid = document.getElementById('thumbnails-grid');
const photoCountSpan = document.getElementById('photo-count');
const clearAllBtn = document.getElementById('clear-all-btn');
const startAiBtn = document.getElementById('start-ai-btn');

const step1View = document.getElementById('step-1-view');
const step2View = document.getElementById('step-2-view');
const step3View = document.getElementById('step-3-view');

const processingStatus = document.getElementById('processing-status');
const progressBar = document.getElementById('progress-bar');
const progressIndicator = document.getElementById('progress-indicator');

const canvasContainer = document.getElementById('canvas-container');
const exportBtn = document.getElementById('export-btn');
const resetBtn = document.getElementById('reset-btn');
const recordingStatus = document.getElementById('recording-status');

const dot1 = document.getElementById('dot-1');
const dot2 = document.getElementById('dot-2');
const dot3 = document.getElementById('dot-3');
const label1 = document.getElementById('label-1');
const label2 = document.getElementById('label-2');
const label3 = document.getElementById('label-3');

// INITIALIZE EVENT LISTENERS
window.addEventListener('DOMContentLoaded', () => {
  setupUploadListeners();
  setupConfigListeners();
  renderBackgroundAssetPicker();
  document.querySelectorAll('[data-rotation]').forEach((btn) => {
    const mode = btn.getAttribute('data-rotation');
    btn.classList.toggle('active', mode === (state.settings.cubeRotationMode || 'auto'));
  });
});

// IMAGE PREPARATION HELPERS
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지 로드 실패'));
    img.src = url;
  });
}

// Compress and resize image for fast API execution
async function prepareImageForApi(dataUrl) {
  const img = await loadImage(dataUrl);
  const longestEdge = Math.max(img.width, img.height);
  const scale = longestEdge > MAX_API_IMAGE_EDGE ? MAX_API_IMAGE_EDGE / longestEdge : 1;
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(img, 0, 0, width, height);

  const preparedDataUrl = canvas.toDataURL('image/jpeg', API_JPEG_QUALITY);
  const base64 = preparedDataUrl.split(',')[1];
  return { mimeType: 'image/jpeg', base64 };
}

const FOCUS_CENTER_OFFSETS = {
  centered: { x: 0, y: 0 },
  rule_of_thirds: { x: 0, y: -4 },
  offset: { x: 0, y: 0 },
  edge_weighted: { x: 0, y: 0 },
};

function applyFocusCenter(center, focus) {
  if (!focus?.onPrimarySubject) {
    return center;
  }
  const offset = FOCUS_CENTER_OFFSETS[focus.centering] || FOCUS_CENTER_OFFSETS.centered;
  return {
    x: Math.min(100, Math.max(0, center.x + offset.x)),
    y: Math.min(100, Math.max(0, center.y + offset.y)),
  };
}

function computeCropBounds(width, height, center, focus) {
  const focused = applyFocusCenter(center, focus);
  const cx = (focused.x / 100) * width;
  const cy = (focused.y / 100) * height;
  let size = Math.min(width, height);
  if (focus?.onPrimarySubject) {
    size *= 0.9;
  }
  let sx = cx - size / 2;
  let sy = cy - size / 2;
  if (sx < 0) sx = 0;
  if (sy < 0) sy = 0;
  if (sx + size > width) sx = width - size;
  if (sy + size > height) sy = height - size;
  return { sx, sy, size };
}

function createMotionSeedFromImages(images) {
  if (window.WeddingSimpleFan) {
    return window.WeddingSimpleFan.createMotionSeed(images);
  }
  let hash = 0;
  images.forEach((image, index) => {
    hash = (Math.imul(hash, 31) + (image.id || index)) | 0;
  });
  return hash;
}



// Smart square cropping
async function cropImage(url, center, focus) {
  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = IMAGE_SIZE;
  canvas.height = IMAGE_SIZE;
  const ctx = canvas.getContext('2d');

  const { sx, sy, size } = computeCropBounds(img.width, img.height, center, focus);
  ctx.drawImage(img, sx, sy, size, size, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
  return canvas.toDataURL('image/png');
}

function resolveBackgroundAssetPublicUrl(relativePath) {
  const normalized = String(relativePath || '').replace(/^\/+/, '').replace(/\\/g, '/');
  if (normalized.startsWith('user-assets/')) {
    const rest = normalized.slice('user-assets/'.length);
    return `/user-assets/${rest.split('/').map(encodeURIComponent).join('/')}`;
  }
  return `/backgrounds/${normalized.split('/').map(encodeURIComponent).join('/')}`;
}

function resolveBackgroundCatalogAssetPath(collectionId, file) {
  if (String(collectionId).startsWith('사용자_')) {
    return `user-assets/${file}`;
  }
  return `${collectionId}/${file}`;
}

async function loadBackgroundAssetCatalog() {
  const response = await fetch('/backgrounds/catalog.json', { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`배경 카탈로그 로드 실패 (${response.status})`);
  }
  return response.json();
}

function renderBackgroundAssetPicker() {
  const host = document.getElementById('background-asset-picker');
  if (!host) return;
  host.innerHTML = '<p class="text-[10px] text-white/40">파일 배경 목록 불러오는 중…</p>';
  loadBackgroundAssetCatalog()
    .then((catalog) => {
      if (!catalog.collections?.length) {
        host.innerHTML = '<p class="text-[10px] text-white/40">data/background 에 이미지 폴더가 없습니다.</p>';
        return;
      }
      let collectionId = catalog.collections[0].id;
      const render = () => {
        const collection = catalog.collections.find((c) => c.id === collectionId) || catalog.collections[0];
        host.innerHTML = '';
        const title = document.createElement('p');
        title.className = 'text-[10px] text-white/50';
        title.textContent = '화면 전체 배경 (큐브 뒤)';
        host.appendChild(title);

        const tabs = document.createElement('div');
        tabs.className = 'flex flex-wrap gap-1.5';
        catalog.collections.forEach((entry) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = `opt-btn text-[10px] py-1 px-2 ${entry.id === collectionId ? 'active' : ''}`;
          btn.textContent = `${entry.label} (${entry.items.length})`;
          btn.addEventListener('click', () => {
            collectionId = entry.id;
            render();
          });
          tabs.appendChild(btn);
        });
        host.appendChild(tabs);

        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-4 gap-2 max-h-48 overflow-y-auto mt-2';
        collection.items.forEach((item) => {
          const assetPath = resolveBackgroundCatalogAssetPath(collection.id, item.file);
          const isVideo = item.kind === 'video' || /\.(mp4|webm|mov|m4v)$/i.test(item.file);
          const selected = state.settings.viewportBackdropPath === assetPath;
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.title = item.file;
          btn.className = `relative aspect-square overflow-hidden rounded-lg border ${selected ? 'border-gold ring-2 ring-gold/40' : 'border-white/10'}`;
          if (isVideo) {
            const video = document.createElement('video');
            video.src = resolveBackgroundAssetPublicUrl(assetPath);
            video.muted = true;
            video.loop = true;
            video.playsInline = true;
            video.preload = 'metadata';
            video.className = 'w-full h-full object-cover';
            btn.appendChild(video);
            const badge = document.createElement('span');
            badge.className = 'absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[8px] font-bold text-gold';
            badge.textContent = 'MP4';
            btn.appendChild(badge);
          } else {
            const img = document.createElement('img');
            img.src = resolveBackgroundAssetPublicUrl(assetPath);
            img.alt = item.file;
            img.loading = 'lazy';
            img.className = 'w-full h-full object-cover';
            btn.appendChild(img);
          }
          btn.addEventListener('click', () => {
            state.settings.viewportBackdropPath = assetPath;
            if (cubePlayer) {
              cubePlayer.updateSettings({ viewportBackdropPath: assetPath });
            }
            render();
          });
          grid.appendChild(btn);
        });
        host.appendChild(grid);
      };
      render();
    })
    .catch((err) => {
      host.innerHTML = `<p class="text-[10px] text-amber-300/80">${err.message}</p>`;
    });
}

// Blurred fill plate for dual-layer cube parallax with theme synthesis
function resolveOriginalPlateSource(entry) {
  if (!entry) return null;
  if (entry.preCropSourceUrl) return entry.preCropSourceUrl;
  if (entry.originalUrl) return entry.originalUrl;
  const fg = resolveSubjectForegroundUrl(entry);
  if (fg && isTransparentMatteDataUrl(fg) && entry.url === fg) {
    return null;
  }
  return entry.url || null;
}

/** Debug-only URL fingerprint (no payload). */
function debugUrlMeta(url) {
  if (!url) return null;
  const mime = url.startsWith('data:') ? url.slice(5, url.indexOf(';')) : 'path';
  return { mime, len: url.length, head: url.slice(0, 24) };
}

async function debugSampleMatteStats(dataUrl) {
  if (!dataUrl) return null;
  try {
    const img = await loadImage(dataUrl);
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size).data;
    let opaque = 0;
    let transparent = 0;
    let sumLum = 0;
    const n = pixels.length / 4;
    for (let i = 0; i < pixels.length; i += 4) {
      const lum = 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      if (pixels[i + 3] < 20) {
        transparent += 1;
      } else {
        opaque += 1;
        sumLum += lum;
      }
    }
    return {
      opaqueRatio: opaque / n,
      transparentRatio: transparent / n,
      meanOpaqueLum: opaque > 0 ? sumLum / opaque : 0,
      meanLum: (sumLum + transparent * 0) / Math.max(1, opaque),
    };
  } catch {
    return null;
  }
}

async function debugSamplePlateLuma(dataUrl) {
  if (!dataUrl) return null;
  try {
    const img = await loadImage(dataUrl);
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const pixels = ctx.getImageData(0, 0, size, size).data;
    let sum = 0;
    const n = pixels.length / 4;
    for (let i = 0; i < pixels.length; i += 4) {
      sum += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    }
    return { meanLum: sum / n };
  } catch {
    return null;
  }
}

function debugLog(location, message, data, hypothesisId) {
  const entry = {
    sessionId: '1c96c9',
    runId: window.__mboxDebugRunId || 'pre-fix',
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
  };
  if (typeof window !== 'undefined') {
    window.__mboxDebugRing = window.__mboxDebugRing || [];
    window.__mboxDebugRing.push(entry);
    try {
      localStorage.setItem('mboxDebugRing', JSON.stringify(window.__mboxDebugRing.slice(-80)));
    } catch {
      /* ignore quota */
    }
  }
}

function drawImageToPlateSquare(context, img, size, center, focus) {
  if (center && typeof center.x === 'number') {
    const { sx, sy, size: cropSize } = computeCropBounds(img.width, img.height, center, focus);
    context.drawImage(img, sx, sy, cropSize, cropSize, 0, 0, size, size);
    return;
  }
  const scale = Math.max(size / img.width, size / img.height);
  const drawWidth = img.width * scale;
  const drawHeight = img.height * scale;
  const offsetX = (size - drawWidth) / 2;
  const offsetY = (size - drawHeight) / 2;
  context.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
}

async function createBackgroundPlate(url, size = 1024, blurPx = 32, options = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  const theme = state.settings.backgroundTheme || 'original';
  const img = await loadImage(url);
  const forceBlurForDepth = Boolean(options.forceBlurForDepth);
  const depthBlurPx = options.depthBlurPx ?? 22;
  const { center, focus } = options;

  if (theme === 'original' && !forceBlurForDepth) {
    drawImageToPlateSquare(context, img, size, center, focus);
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  if (theme === 'original' && forceBlurForDepth) {
    context.filter = `blur(${depthBlurPx}px) saturate(1.08) brightness(1.02)`;
    drawImageToPlateSquare(context, img, size, center, focus);
    context.filter = 'none';
    context.fillStyle = 'rgba(255, 248, 242, 0.12)';
    context.fillRect(0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.9);
  }

  // 1. Draw blurred source image base
  context.filter = `blur(${blurPx}px) saturate(1.1) brightness(1.0)`;
  drawImageToPlateSquare(context, img, size, center, focus);
  context.filter = 'none';

  if (theme === 'original_blurred') {
    // Default warm romantic wedding overlays
    context.fillStyle = 'rgba(72, 38, 48, 0.22)';
    context.fillRect(0, 0, size, size);
    context.fillStyle = 'rgba(255, 232, 220, 0.15)';
    context.fillRect(0, 0, size, size);
  } else if (theme === 'romantic_garden') {
    // Romantic Garden: overlay rose pink & botanical green gradient
    const grad = context.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, 'rgba(253, 244, 245, 0.4)'); // pale pink
    grad.addColorStop(0.5, 'rgba(251, 207, 232, 0.35)'); // rose gold
    grad.addColorStop(1, 'rgba(209, 250, 229, 0.45)'); // mint green
    context.fillStyle = grad;
    context.fillRect(0, 0, size, size);

    // Draw bokeh rose floral sparkles
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = 25 + Math.random() * 65;
      const bokehGrad = context.createRadialGradient(x, y, 0, x, y, radius);
      bokehGrad.addColorStop(0, 'rgba(251, 113, 133, 0.35)');
      bokehGrad.addColorStop(0.5, 'rgba(244, 114, 182, 0.12)');
      bokehGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      context.fillStyle = bokehGrad;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  } else if (theme === 'classic_hall') {
    // Classic Hall: Golden luxury champagne gradient
    const grad = context.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, 'rgba(42, 28, 18, 0.5)'); // dark gold
    grad.addColorStop(0.6, 'rgba(223, 179, 134, 0.3)'); // champagne
    grad.addColorStop(1, 'rgba(255, 248, 235, 0.45)'); // warm cream
    context.fillStyle = grad;
    context.fillRect(0, 0, size, size);

    // Draw elegant light shaft beams
    context.fillStyle = 'rgba(255, 244, 214, 0.08)';
    for (let i = 0; i < 4; i++) {
      const topX = 150 + Math.random() * 700;
      context.beginPath();
      context.moveTo(topX - 35, 0);
      context.lineTo(topX + 35, 0);
      context.lineTo(topX + 180 + Math.random() * 120, size);
      context.lineTo(topX - 180 - Math.random() * 120, size);
      context.closePath();
      context.fill();
    }
  } else if (theme === 'starry_night') {
    // Starry Galaxy: deep indigo violet gradient
    const grad = context.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, 'rgba(20, 10, 36, 0.65)'); // deep violet
    grad.addColorStop(0.5, 'rgba(10, 8, 28, 0.55)'); // night indigo
    grad.addColorStop(1, 'rgba(3, 2, 8, 0.75)'); // space black
    context.fillStyle = grad;
    context.fillRect(0, 0, size, size);

    // Draw shining stars with glowing centers
    for (let i = 0; i < 35; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = 3 + Math.random() * 12;
      const starGrad = context.createRadialGradient(x, y, 0, x, y, radius);
      starGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      starGrad.addColorStop(0.2, 'rgba(238, 242, 255, 0.8)');
      starGrad.addColorStop(0.6, 'rgba(129, 140, 248, 0.25)'); // soft indigo glow
      starGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = starGrad;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }

  return canvas.toDataURL('image/jpeg', 0.85);
}

/** VoluMax foreground: soft subject matte on original photo (no full 누끼). */
async function createSubjectForegroundVoluMax(photoDataUrl, bounds, size = IMAGE_SIZE) {
  const image = await loadImage(photoDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const scale = Math.max(size / image.width, size / image.height);
  const drawW = image.width * scale;
  const drawH = image.height * scale;
  const offsetX = (size - drawW) / 2;
  const offsetY = (size - drawH) / 2;
  context.drawImage(image, offsetX, offsetY, drawW, drawH);

  const bx0 = offsetX + (bounds.x0 / 100) * drawW;
  const bx1 = offsetX + (bounds.x1 / 100) * drawW;
  const by0 = offsetY + (bounds.y0 / 100) * drawH;
  const by1 = offsetY + (bounds.y1 / 100) * drawH;
  const pad = Math.max(14, Math.min(drawW, drawH) * 0.065);

  const mask = document.createElement('canvas');
  mask.width = size;
  mask.height = size;
  const maskContext = mask.getContext('2d');
  maskContext.fillStyle = '#000';
  maskContext.fillRect(0, 0, size, size);
  maskContext.filter = `blur(${pad}px)`;
  maskContext.fillStyle = '#fff';
  const rw = bx1 - bx0 + pad * 2;
  const rh = by1 - by0 + pad * 2;
  const rx = bx0 - pad;
  const ry = by0 - pad;
  if (typeof maskContext.roundRect === 'function') {
    maskContext.beginPath();
    maskContext.roundRect(rx, ry, rw, rh, pad);
    maskContext.fill();
  } else {
    maskContext.fillRect(rx, ry, rw, rh);
  }
  maskContext.filter = 'none';

  context.globalCompositeOperation = 'destination-in';
  context.drawImage(mask, 0, 0);
  context.globalCompositeOperation = 'source-over';
  return canvas.toDataURL('image/png');
}

function resolveSubjectBounds(metadata) {
  if (metadata?.subjectBounds) return metadata.subjectBounds;
  if (metadata?.subject?.bounds) return metadata.subject.bounds;
  return { x0: 12, y0: 8, x1: 88, y1: 92 };
}

function clampPct(v) {
  return Math.min(100, Math.max(0, v));
}

function hasUsefulSubjectBounds(bounds) {
  const w = bounds.x1 - bounds.x0;
  const h = bounds.y1 - bounds.y0;
  const area = w * h;
  return w >= 10 && h >= 12 && area >= 150 && area <= 85 * 85;
}

function remapSubjectBoundsForSquareCrop(imageWidth, imageHeight, crop, bounds) {
  if (crop.size <= 0 || imageWidth <= 0 || imageHeight <= 0) {
    return { x0: 28, y0: 12, x1: 72, y1: 92 };
  }
  const mapX = (pct) => (((pct / 100) * imageWidth - crop.sx) / crop.size) * 100;
  const mapY = (pct) => (((pct / 100) * imageHeight - crop.sy) / crop.size) * 100;
  let x0 = mapX(bounds.x0);
  let x1 = mapX(bounds.x1);
  let y0 = mapY(bounds.y0);
  let y1 = mapY(bounds.y1);
  if (x0 > x1) [x0, x1] = [x1, x0];
  if (y0 > y1) [y0, y1] = [y1, y0];
  x0 = clampPct(x0);
  x1 = clampPct(x1);
  y0 = clampPct(y0);
  y1 = clampPct(y1);
  if (x1 <= 2 || x0 >= 98 || y1 <= 2 || y0 >= 98 || x1 - x0 < 4 || y1 - y0 < 4) {
    return { x0: 28, y0: 12, x1: 72, y1: 92 };
  }
  return { x0, y0, x1, y1 };
}

async function resolveFaceBoundsForEntry(entry) {
  const raw = entry.subject?.bounds || entry.subjectBounds || resolveSubjectBounds(entry);
  const source = entry.preCropSourceUrl || entry.originalUrl;
  if (!source) {
    return hasUsefulSubjectBounds(raw) ? raw : { x0: 28, y0: 12, x1: 72, y1: 92 };
  }
  const img = await loadImage(source);
  const crop = computeCropBounds(img.width, img.height, entry.center, entry.focus);
  const remapped = remapSubjectBoundsForSquareCrop(img.width, img.height, crop, raw);
  return hasUsefulSubjectBounds(remapped) ? remapped : { x0: 28, y0: 12, x1: 72, y1: 92 };
}

function resolveSubjectForegroundUrl(img) {
  if (!img) return null;
  if (img.subjectForegroundUrl) return img.subjectForegroundUrl;
  if (img.preprocessMode === 'background_removed' || img.preprocessMode === 'volumax') {
    return img.url || null;
  }
  return null;
}

/** VoluMax fg must be PNG/WebP with alpha so the bg plate shows through. */
function isTransparentMatteDataUrl(url) {
  if (!url) return false;
  if (url.startsWith('data:image/png') || url.startsWith('data:image/webp')) return true;
  return /\.png(\?|#|$)/i.test(url);
}

function isAiCutoutForeground(img) {
  if (!img) return false;
  if (img.voluMaxForegroundKind === 'soft_matte') return false;
  if (img.voluMaxForegroundKind === 'ai_cutout') return true;
  if (img.preprocessMode === 'background_removed') return true;
  if (img.preprocessMode === 'volumax' && img.voluMaxPrepared) return true;
  return false;
}

function imageHasVoluMaxLayers(img) {
  if (!img?.backgroundPlateUrl) return false;
  const fg = resolveSubjectForegroundUrl(img);
  if (!fg || !isTransparentMatteDataUrl(fg)) return false;
  if (img.backgroundPlateUrl === fg) return false;
  return isAiCutoutForeground(img);
}

function needsVoluMaxLayerBuild(requireDepthOn = true) {
  if (state.processedImages.length === 0) {
    return false;
  }
  if (requireDepthOn && !voluMaxDepthOptionEnabled()) {
    return false;
  }
  if (state.settings.voluMaxAiForegroundCutout) {
    return state.processedImages.some((img) => !isAiCutoutForeground(img) || !img.backgroundPlateUrl);
  }
  return countVoluMaxLayers() < state.processedImages.length;
}

function countVoluMaxLayers() {
  return state.processedImages.filter((img) => imageHasVoluMaxLayers(img)).length;
}

/** Dual-layer stack when VoluMax layers exist (bg plate + transparent fg). */
function shouldShowVoluMaxDualLayer(img) {
  return imageHasVoluMaxLayers(img);
}

/** Z parallax on showcase hold — requires depth toggle ON. */
function imageUsesVoluMaxParallax(img) {
  return Boolean(state.settings.voluMaxDepthEnabled && imageHasVoluMaxLayers(img));
}

/** @deprecated use shouldShowVoluMaxDualLayer / imageUsesVoluMaxParallax */
function imageUsesVoluMax(img) {
  return shouldShowVoluMaxDualLayer(img);
}

function hasDistinctForegroundLayer(img) {
  return img?.preprocessMode === 'background_removed';
}

function useVoluMaxForegroundMatte(img) {
  if (!img) return false;
  if (hasDistinctForegroundLayer(img)) return true;
  const b = img.subject?.bounds || img.subjectBounds;
  return b ? hasUsefulSubjectBounds(b) : false;
}

function pickVoluMaxForegroundUrl(image) {
  if (!image) return null;
  const fg = resolveSubjectForegroundUrl(image);
  return fg && isTransparentMatteDataUrl(fg) ? fg : null;
}

function voluMaxDepthOptionEnabled() {
  return Boolean(state.settings.voluMaxDepthEnabled);
}

function getFxFramework() {
  return typeof window !== 'undefined' && window.MBOX_CUBE_EFFECT_FRAMEWORK
    ? window.MBOX_CUBE_EFFECT_FRAMEWORK
    : { originalPlateBlurPx: 22 };
}

function setVoluMaxProgress(message, imageNumber, totalImages) {
  const text =
    imageNumber != null && totalImages != null
      ? `[${imageNumber}/${totalImages}] ${message}`
      : message;
  if (processingStatus) processingStatus.textContent = text;
  const volStatus = document.getElementById('volumax-status');
  if (volStatus) volStatus.textContent = text;
}

async function prepareVoluMaxLayers(
  originalSourceUrl,
  finalPhoto,
  bounds,
  metadata,
  imageNumber,
  totalImages,
  options = {}
) {
  const useAiCutout = options.useAiCutout !== false;
  const plateSource = originalSourceUrl || (isTransparentMatteDataUrl(finalPhoto) ? null : finalPhoto);
  if (!plateSource) {
    throw new Error('원본 사진(preCropSourceUrl)이 없어 배경 plate를 만들 수 없습니다.');
  }
  const plateTheme = state.settings.backgroundTheme || 'original';
  const depthBlurPx = getFxFramework().originalPlateBlurPx ?? 22;
  const forceBlurForDepth = plateTheme !== 'original';

  const backgroundPlateUrl = await createBackgroundPlate(plateSource, 1024, 32, {
    forceBlurForDepth,
    depthBlurPx,
    center: metadata?.center,
    focus: metadata?.focus,
  });

  let subjectForegroundUrl = null;
  let voluMaxPrepared = false;
  let voluMaxForegroundKind = 'none';

  if (isTransparentMatteDataUrl(finalPhoto) && metadata?.preprocessMode === 'background_removed') {
    subjectForegroundUrl = finalPhoto;
    voluMaxPrepared = true;
    voluMaxForegroundKind = 'ai_cutout';
  }

  if (!voluMaxPrepared && useAiCutout) {
    setVoluMaxProgress('VoluMax AI 누끼(인물 실루엣) 중…', imageNumber, totalImages);
    const fgCutout = await removeBackgroundBrowser(
      plateSource,
      (msg) => setVoluMaxProgress(msg, imageNumber, totalImages),
      bounds,
      metadata?.label
    );
    if (fgCutout) {
      subjectForegroundUrl = await cropImage(fgCutout, metadata.center, metadata.focus);
      voluMaxPrepared = isTransparentMatteDataUrl(subjectForegroundUrl);
      if (voluMaxPrepared) {
        voluMaxForegroundKind = 'ai_cutout';
      }
    }
  }

  if (!voluMaxPrepared && !useAiCutout) {
    const matteBounds = hasUsefulSubjectBounds(bounds)
      ? bounds
      : { x0: 28, y0: 12, x1: 72, y1: 92 };
    try {
      setVoluMaxProgress('소프트 matte (AI OFF) 적용 중…', imageNumber, totalImages);
      subjectForegroundUrl = await createSubjectForegroundVoluMax(finalPhoto, matteBounds);
      voluMaxPrepared = isTransparentMatteDataUrl(subjectForegroundUrl);
      if (voluMaxPrepared) {
        voluMaxForegroundKind = 'soft_matte';
      }
    } catch (err) {
      console.warn('[VoluMax] soft matte failed:', err);
    }
  }

  if (!voluMaxPrepared) {
    subjectForegroundUrl = subjectForegroundUrl || finalPhoto;
    if (useAiCutout) {
      setVoluMaxProgress(
        `[${imageNumber}/${totalImages}] AI 누끼 실패 — 사각형 폴백 없이 원본 사용`,
        imageNumber,
        totalImages
      );
    }
  }

  const layerProbe = {
    backgroundPlateUrl,
    subjectForegroundUrl,
    voluMaxForegroundKind,
    voluMaxPrepared,
    preprocessMode: metadata?.preprocessMode,
    url: finalPhoto,
  };
  const [plateLuma, fgMatte] = await Promise.all([
    debugSamplePlateLuma(backgroundPlateUrl),
    debugSampleMatteStats(subjectForegroundUrl),
  ]);
  debugLog(
    'app.js:prepareVoluMaxLayers',
    'layers built',
    {
      imageNumber,
      plateSourceKind: plateSource === originalSourceUrl ? 'original' : 'fallback',
      plateMeta: debugUrlMeta(plateSource),
      bgMeta: debugUrlMeta(backgroundPlateUrl),
      fgMeta: debugUrlMeta(subjectForegroundUrl),
      plateSameAsFg: backgroundPlateUrl === subjectForegroundUrl,
      voluMaxPrepared,
      voluMaxForegroundKind,
      appDualLayer: imageHasVoluMaxLayers(layerProbe),
      plateMeanLum: plateLuma?.meanLum ?? null,
      fgOpaqueRatio: fgMatte?.opaqueRatio ?? null,
      fgTransparentRatio: fgMatte?.transparentRatio ?? null,
    },
    'A,C,J'
  );

  return { backgroundPlateUrl, subjectForegroundUrl, voluMaxPrepared, voluMaxForegroundKind };
}

let isPreparingVoluMaxLayers = false;

async function runVoluMaxOneClick() {
  if (state.processedImages.length === 0) {
    alert('먼저 사진을 업로드하고 AI 처리를 완료하세요.');
    return;
  }
  if (state.step < 3) {
    alert('3단계 미리보기로 이동한 뒤 원클릭을 사용하세요.');
    return;
  }
  if (isPreparingVoluMaxLayers) return;

  state.settings.voluMaxDepthEnabled = true;
  state.settings.voluMaxAiForegroundCutout = true;
  syncVoluMaxCheckboxesFromSettings();
  updateVoluMaxStatus();

  const result = await ensureVoluMaxLayers({
    showProgress: true,
    allowDepthOff: false,
    forceRebuild: true,
    useAiCutout: true,
  });
  if (state.step === 3 && cubePlayer) {
    buildHologramCube();
  } else if (state.step === 3) {
    setupThreeScene();
  }
  updateVoluMaxStatus();

  if (result.ok) {
    const n = countVoluMaxLayers();
    const total = state.processedImages.length;
    const statusEl = document.getElementById('volumax-status');
    if (statusEl) {
      statusEl.textContent = `원클릭 완료 ${n}/${total}면 · AI 누끼 + 원본 배경 plate · 정면 정지에서 시차`;
    }
  }
}

async function ensureVoluMaxLayers(options = {}) {
  const {
    showProgress = true,
    allowDepthOff = false,
    forceRebuild = false,
    useAiCutout = true,
  } = options;
  if (state.processedImages.length === 0) {
    return { ok: false, reason: 'no_images' };
  }
  if (!allowDepthOff && !voluMaxDepthOptionEnabled()) {
    return { ok: false, reason: 'depth_off' };
  }
  if (!forceRebuild && !needsVoluMaxLayerBuild() && countVoluMaxLayers() > 0) {
    updateVoluMaxStatus();
    return { ok: true, reason: 'already_ready' };
  }
  if (isPreparingVoluMaxLayers) {
    return { ok: false, reason: 'busy' };
  }

  isPreparingVoluMaxLayers = true;
  const prepareBtn = document.getElementById('prepare-volumax-btn');
  const statusEl = document.getElementById('volumax-status');
  if (prepareBtn) prepareBtn.setAttribute('disabled', 'true');
  if (showProgress && statusEl) {
    statusEl.textContent = 'VoluMax 레이어 준비 중… (AI 누끼 + 원본 블러 배경)';
  }

  try {
    if (useAiCutout) {
      try {
        await preloadImglyRemoval((msg) => {
          if (showProgress && statusEl) statusEl.textContent = msg;
        });
      } catch (preloadErr) {
        console.warn('[VoluMax] imgly preload skipped:', preloadErr);
      }
    }
    await regenerateBackgroundPlates({ useAiCutout });
    buildHologramCube();
    updateVoluMaxStatus();
    return { ok: countVoluMaxLayers() > 0, reason: 'built' };
  } catch (err) {
    console.error('[VoluMax] layer build failed:', err);
    if (statusEl) {
      statusEl.textContent = `레이어 준비 실패: ${err.message || err}`;
    }
    return { ok: false, reason: 'error', error: err };
  } finally {
    isPreparingVoluMaxLayers = false;
    if (prepareBtn) prepareBtn.removeAttribute('disabled');
    refreshVoluMaxOneClickButtons();
  }
}

async function restoreBackgroundPlatesOnly(options = {}) {
  const { showProgress = true } = options;
  if (state.processedImages.length === 0) {
    return { ok: false, reason: 'no_images' };
  }
  const statusEl = document.getElementById('volumax-status');
  const restoreBtn = document.getElementById('restore-bg-plate-btn');
  if (restoreBtn) restoreBtn.setAttribute('disabled', 'true');
  if (showProgress && statusEl) {
    statusEl.textContent = '원본 배경 plate 복원 중…';
  }

  try {
    const plateTheme = state.settings.backgroundTheme || 'original';
    const depthBlurPx = getFxFramework().originalPlateBlurPx ?? 22;
    for (const entry of state.processedImages) {
      const originalSource = resolveOriginalPlateSource(entry);
      if (!originalSource) continue;
      entry.backgroundPlateUrl = await createBackgroundPlate(originalSource, 1024, 32, {
        forceBlurForDepth: plateTheme !== 'original',
        depthBlurPx,
        center: entry.center,
        focus: entry.focus,
      });
    }
    if (cubePlayer) {
      cubePlayer.updateSettings({ images: state.processedImages });
    }
    if (state.step === 3) {
      buildHologramCube();
    }
    updateVoluMaxStatus();
    if (showProgress && statusEl) {
      statusEl.textContent = `원본 배경 plate 복원 완료 · ${countVoluMaxLayers()}/${state.processedImages.length}면 2레이어`;
    }
    return { ok: true };
  } catch (err) {
    console.error('[VoluMax] restore background plate failed:', err);
    if (statusEl) {
      statusEl.textContent = `배경 복원 실패: ${err.message || err}`;
    }
    return { ok: false, error: err };
  } finally {
    if (restoreBtn) restoreBtn.removeAttribute('disabled');
  }
}

async function regenerateBackgroundPlates(options = {}) {
  const { useAiCutout = true } = options;
  const total = state.sourceImages.length;
  for (let i = 0; i < total; i++) {
    const entry = state.processedImages[i];
    if (!entry) continue;

    const originalSource = resolveOriginalPlateSource(entry);
    if (!originalSource) {
      console.warn('[VoluMax] skip plate rebuild — missing original source for', entry.label);
      continue;
    }
    const bounds = await resolveFaceBoundsForEntry(entry);
    entry.subjectBounds = bounds;
    if (entry.subject) entry.subject.bounds = bounds;

    const layers = await prepareVoluMaxLayers(
      originalSource,
      entry.url,
      bounds,
      {
        center: entry.center,
        focus: entry.focus,
        preprocessMode: entry.preprocessMode,
        label: entry.label,
      },
      i + 1,
      total,
      { useAiCutout }
    );
    entry.backgroundPlateUrl = layers.backgroundPlateUrl;
    entry.subjectForegroundUrl = layers.subjectForegroundUrl;
    entry.voluMaxPrepared = layers.voluMaxPrepared;
    entry.voluMaxForegroundKind = layers.voluMaxForegroundKind || 'none';
    entry.faceCompositeUrl = entry.url;
    if (layers.voluMaxPrepared && layers.voluMaxForegroundKind === 'ai_cutout') {
      entry.preprocessMode = 'volumax';
    }

    debugLog(
      'app.js:regenerateBackgroundPlates',
      'entry updated',
      {
        index: i,
        label: entry.label,
        hasPreCrop: Boolean(entry.preCropSourceUrl),
        originalMeta: debugUrlMeta(originalSource),
        faceUrlMeta: debugUrlMeta(entry.url),
        bgMeta: debugUrlMeta(entry.backgroundPlateUrl),
        fgMeta: debugUrlMeta(entry.subjectForegroundUrl),
        plateSameAsFg: entry.backgroundPlateUrl === entry.subjectForegroundUrl,
        voluMaxForegroundKind: entry.voluMaxForegroundKind,
        appDualLayer: imageHasVoluMaxLayers(entry),
      },
      'A,D'
    );
  }

  debugLog(
    'app.js:regenerateBackgroundPlates',
    'batch complete',
    {
      layerCount: countVoluMaxLayers(),
      total: state.processedImages.length,
      hasCubePlayer: Boolean(cubePlayer),
    },
    'D'
  );

  if (cubePlayer) {
    cubePlayer.updateSettings({ images: state.processedImages });
  }
  updateVoluMaxStatus();
}

// STEP 1: UPLOAD & FILE HANDLING
function setupUploadListeners() {
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-gold');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-gold');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-gold');
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
    handleFiles(files);
  });

  fileInput.addEventListener('change', (e) => {
    const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
    handleFiles(files);
  });

  clearAllBtn.addEventListener('click', () => {
    state.sourceImages = [];
    updateThumbnails();
  });

  startAiBtn.addEventListener('click', () => {
    if (state.sourceImages.length >= 3) {
      runAiPipeline();
    }
  });
}

async function handleFiles(files) {
  const remainingSlots = 20 - state.sourceImages.length;
  if (remainingSlots <= 0) return;

  const validFiles = files.slice(0, remainingSlots);
  const base64Promises = validFiles.map(file => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.readAsDataURL(file);
    });
  });

  const base64Urls = await Promise.all(base64Promises);
  state.sourceImages = [...state.sourceImages, ...base64Urls].slice(0, 20);
  updateThumbnails();
}

function updateThumbnails() {
  thumbnailsGrid.innerHTML = '';
  
  if (state.sourceImages.length > 0) {
    selectedImagesWrap.classList.remove('hidden');
    photoCountSpan.textContent = state.sourceImages.length;
    
    state.sourceImages.forEach((src, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'thumbnail-box';
      
      const img = document.createElement('img');
      img.src = src;
      
      const removeBtn = document.createElement('button');
      removeBtn.innerHTML = '✕';
      removeBtn.className = 'remove-btn';
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        state.sourceImages = state.sourceImages.filter((_, i) => i !== idx);
        updateThumbnails();
      };
      
      wrapper.appendChild(img);
      wrapper.appendChild(removeBtn);
      thumbnailsGrid.appendChild(wrapper);
    });

    if (state.sourceImages.length >= 3) {
      startAiBtn.removeAttribute('disabled');
    } else {
      startAiBtn.setAttribute('disabled', 'true');
    }
  } else {
    selectedImagesWrap.classList.add('hidden');
    startAiBtn.setAttribute('disabled', 'true');
  }
}

// STEP 2: AI PIPELINE (ANALYZE & CROP — background kept)
async function runAiPipeline() {
  console.log("Current API_BASE_URL:", API_BASE_URL);
  state.step = 2;
  step1View.classList.add('hidden');
  step2View.classList.remove('hidden');
  
  dot1.className = 'step-dot completed';
  dot1.innerHTML = '✓';
  label1.className = 'text-xs font-bold text-white/50';
  dot2.className = 'step-dot active';
  label2.className = 'text-xs font-bold text-gold';

  const totalImages = state.sourceImages.length;
  progressBar.style.width = '0%';
  progressIndicator.textContent = `0 / ${totalImages} 완료`;
  
  state.processedImages = [];

  try {
    for (let i = 0; i < totalImages; i++) {
      const base64Src = state.sourceImages[i];
      const imageNumber = i + 1;
      
      // Resize and convert image for fast transmission
      processingStatus.textContent = `[${imageNumber}/${totalImages}] AI 인물 및 구도 분석 준비 중...`;
      const prepared = await prepareImageForApi(base64Src);
      
      // 1. Analyze Image
      processingStatus.textContent = `[${imageNumber}/${totalImages}] AI 인물 분석 및 구도 최적화 중...`;
      const analyzeRes = await fetch(`${API_BASE_URL}/analyze`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ 
          imageBase64: prepared.base64, 
          mimeType: prepared.mimeType 
        })
      });
      
      if (!analyzeRes.ok) throw new Error('AI 분석 API 연결 실패');
      const analyzeData = await analyzeRes.json();
      const metadata = analyzeData.metadata;

      let mattedDataUrl = null;
      const keepOriginalBg = (state.settings.backgroundTheme || 'original') === 'original';
      if (!keepOriginalBg) {
        processingStatus.textContent = `[${imageNumber}/${totalImages}] AI 누끼(인물 실루엣 분리) 중...`;
        mattedDataUrl = await removeBackgroundBrowser(
          base64Src,
          (msg) => { processingStatus.textContent = `[${imageNumber}/${totalImages}] ${msg}`; }
        );
        if (!mattedDataUrl) {
          try {
            processingStatus.textContent = `[${imageNumber}/${totalImages}] 서버 누끼 처리 중(폴백)...`;
            const editRes = await fetch(`${API_BASE_URL}/edit`, {
              method: 'POST',
              headers: apiHeaders(),
              body: JSON.stringify({
                imageBase64: prepared.base64,
                mimeType: prepared.mimeType,
                label: metadata.label || `Photo_${imageNumber}`,
                editMode: 'remove_background',
                subjectBounds: metadata.subjectBounds,
              })
            });
            if (editRes.ok) {
              const editData = await editRes.json();
              mattedDataUrl = `data:${editData.mimeType || 'image/png'};base64,${editData.imageBase64}`;
            }
          } catch (apiErr) {
            console.warn(`[${imageNumber}] 서버 누끼도 실패 — 원본으로 계속:`, apiErr);
          }
        }
      }

      // 3. Crop, VoluMax layers (원본 배경 플레이트 + 인물 matte)
      processingStatus.textContent = `[${imageNumber}/${totalImages}] 연출용 크롭 및 VoluMax 레이어 준비 중...`;

      let finalPhoto, preprocessMode;
      if (mattedDataUrl) {
        finalPhoto = await cropImage(mattedDataUrl, metadata.center, metadata.focus);
        preprocessMode = 'background_removed';
      } else {
        finalPhoto = await cropImage(base64Src, metadata.center, metadata.focus);
        preprocessMode = 'original';
      }

      const preCropSourceUrl = base64Src;
      const bounds = await resolveFaceBoundsForEntry({
        preCropSourceUrl,
        center: metadata.center,
        focus: metadata.focus,
        subject: metadata.subject,
        subjectBounds: resolveSubjectBounds(metadata),
      });
      let backgroundPlateUrl;
      let subjectForegroundUrl;
      let voluMaxPrepared;
      let voluMaxForegroundKind = 'none';
      if (preprocessMode === 'background_removed') {
        const plateTheme = state.settings.backgroundTheme || 'original';
        backgroundPlateUrl = await createBackgroundPlate(preCropSourceUrl, 1024, 32, {
          forceBlurForDepth: plateTheme !== 'original',
          depthBlurPx: getFxFramework().originalPlateBlurPx ?? 22,
          center: metadata.center,
          focus: metadata.focus,
        });
        subjectForegroundUrl = finalPhoto;
        voluMaxPrepared = isTransparentMatteDataUrl(finalPhoto);
        if (voluMaxPrepared) {
          preprocessMode = 'volumax';
          voluMaxForegroundKind = 'ai_cutout';
        }
      } else if (state.settings.voluMaxDepthEnabled) {
        const layers = await prepareVoluMaxLayers(
          preCropSourceUrl,
          finalPhoto,
          bounds,
          { ...metadata, preprocessMode },
          imageNumber,
          totalImages,
          { useAiCutout: state.settings.voluMaxAiForegroundCutout !== false }
        );
        backgroundPlateUrl = layers.backgroundPlateUrl;
        subjectForegroundUrl = layers.subjectForegroundUrl;
        voluMaxPrepared = layers.voluMaxPrepared;
        voluMaxForegroundKind = layers.voluMaxForegroundKind || 'none';
        if (voluMaxPrepared) {
          preprocessMode = 'volumax';
        }
      } else {
        backgroundPlateUrl = finalPhoto;
        subjectForegroundUrl = finalPhoto;
        voluMaxPrepared = false;
      }

      state.processedImages.push({
        id: Date.now() + i,
        url: finalPhoto,
        preCropSourceUrl,
        faceCompositeUrl: finalPhoto,
        backgroundPlateUrl,
        subjectForegroundUrl,
        voluMaxPrepared,
        voluMaxForegroundKind,
        subjectBounds: bounds,
        subject: { ...metadata.subject, bounds },
        preprocessMode,
        center: metadata.center,
        focus: metadata.focus,
        label: metadata.label || `Photo_${imageNumber}`
      });

      // Update progress
      const percent = Math.round(((i + 1) / totalImages) * 100);
      progressBar.style.width = `${percent}%`;
      progressIndicator.textContent = `${i + 1} / ${totalImages} 완료`;
    }

    initStep3();

  } catch (err) {
    console.error(err);
    alert(`AI 자동 연출 가공 중 실패했습니다: ${err.message}`);
    // Rollback to Step 1
    state.step = 1;
    step2View.classList.add('hidden');
    step1View.classList.remove('hidden');
    dot1.className = 'step-dot active';
    dot1.innerHTML = '1';
    label1.className = 'text-xs font-bold text-gold';
    dot2.className = 'step-dot';
    label2.className = 'text-xs font-bold text-white/30';
  }
}

// STEP 3: PREVIEW & CUSTOM CONFIG (Three.js Simulation)
let cubePlayer = null;

async function initStep3() {
  state.step = 3;
  step2View.classList.add('hidden');
  step3View.classList.remove('hidden');

  dot2.className = 'step-dot completed';
  dot2.innerHTML = '✓';
  label2.className = 'text-xs font-bold text-white/50';
  dot3.className = 'step-dot active';
  label3.className = 'text-xs font-bold text-gold';

  syncVoluMaxCheckboxesFromSettings();
  updateVoluMaxStatus();
  refreshVoluMaxOneClickButtons();

  const wantsAiCutout = state.settings.voluMaxAiForegroundCutout !== false;
  const layersMissing = countVoluMaxLayers() < state.processedImages.length;
  if (wantsAiCutout && layersMissing) {
    state.settings.voluMaxDepthEnabled = true;
    syncVoluMaxCheckboxesFromSettings();
    await ensureVoluMaxLayers({ showProgress: true, useAiCutout: true });
    debugLog(
      'app.js:initStep3',
      'auto-prepared volumax layers',
      { layerCount: countVoluMaxLayers(), total: state.processedImages.length },
      'D'
    );
  } else if (needsVoluMaxLayerBuild()) {
    await ensureVoluMaxLayers({ showProgress: true });
  }

  requestAnimationFrame(() => setupThreeScene());
}

function updateVoluMaxStatus() {
  const el = document.getElementById('volumax-status');
  const prepareBtn = document.getElementById('prepare-volumax-btn');
  if (!el) return;
  const total = state.processedImages.length;
  const layerCount = countVoluMaxLayers();
  const depthOn = voluMaxDepthOptionEnabled();
  const depthLabel = depthOn ? '깊이 분리 ON' : '깊이 분리 OFF';
  const showPrepareBtn = total > 0 && (layerCount < total || isPreparingVoluMaxLayers);

  refreshVoluMaxOneClickButtons();

  if (prepareBtn) {
    prepareBtn.classList.toggle('hidden', !showPrepareBtn);
    if (isPreparingVoluMaxLayers) {
      prepareBtn.textContent = '레이어 준비 중…';
    } else {
      prepareBtn.textContent = '레이어만 다시 준비';
    }
  }

  if (isPreparingVoluMaxLayers) {
    el.textContent = 'VoluMax 레이어 준비 중… (AI 누끼 + 원본 블러 배경)';
    return;
  }
  if (depthOn && layerCount >= total && total > 0) {
    el.textContent = `VoluMax ${layerCount}/${total}면 · ${depthLabel} · AI 누끼 + 블러 원본 배경`;
  } else if (depthOn && total > 0) {
    el.textContent = `${depthLabel} — 레이어 ${layerCount}/${total}장 · 아래 버튼으로 즉시 준비`;
  } else if (!depthOn && layerCount > 0) {
    el.textContent = `${depthLabel} (레이어 ${layerCount}장 보관) — 켜면 시차 연출`;
  } else if (total > 0) {
    el.textContent = `${depthLabel} — 단일 면 (큐브에 사진 밀착)`;
  } else {
    el.textContent = depthLabel;
  }
}

function syncVoluMaxCheckboxesFromSettings() {
  const s = state.settings;
  document.querySelectorAll('.volumax-depth-cb').forEach((el) => {
    el.checked = Boolean(s.voluMaxDepthEnabled);
  });
  document.querySelectorAll('.volumax-ai-cb').forEach((el) => {
    el.checked = Boolean(s.voluMaxAiForegroundCutout);
  });
  document.querySelectorAll('.volumax-auto-cb').forEach((el) => {
    el.checked = Boolean(s.voluMaxAutoPrepareLayers);
  });
}

function bindVoluMaxCheckboxListeners() {
  document.querySelectorAll('.volumax-depth-cb').forEach((el) => {
    el.addEventListener('change', async (e) => {
      const checked = e.target.checked;
      state.settings.voluMaxDepthEnabled = checked;
      document.querySelectorAll('.volumax-depth-cb').forEach((cb) => {
        cb.checked = checked;
      });
      if (!checked) {
        state.settings.voluMaxAiForegroundCutout = false;
        state.settings.voluMaxAutoPrepareLayers = false;
        syncVoluMaxCheckboxesFromSettings();
      } else if (state.step === 3 && state.processedImages.length > 0) {
        await ensureVoluMaxLayers({ showProgress: true });
      }
      updateVoluMaxStatus();
      if (state.step === 3) {
        buildHologramCube();
        if (cubePlayer) {
          cubePlayer.updateSettings({
            voluMaxDepthEnabled: state.settings.voluMaxDepthEnabled,
            images: state.processedImages,
          });
        }
      }
    });
  });

  document.querySelectorAll('.volumax-ai-cb').forEach((el) => {
    el.addEventListener('change', (e) => {
      state.settings.voluMaxAiForegroundCutout = e.target.checked;
      if (e.target.checked) {
        state.settings.voluMaxDepthEnabled = true;
        syncVoluMaxCheckboxesFromSettings();
      }
      syncVoluMaxCheckboxesFromSettings();
    });
  });

  document.querySelectorAll('.volumax-auto-cb').forEach((el) => {
    el.addEventListener('change', (e) => {
      state.settings.voluMaxAutoPrepareLayers = e.target.checked;
      if (e.target.checked) {
        state.settings.voluMaxDepthEnabled = true;
        syncVoluMaxCheckboxesFromSettings();
      }
      syncVoluMaxCheckboxesFromSettings();
    });
  });

  const prepareBtn = document.getElementById('prepare-volumax-btn');
  if (prepareBtn) {
    prepareBtn.addEventListener('click', () => {
      void ensureVoluMaxLayers({ showProgress: true, allowDepthOff: true });
    });
  }

  const restoreBgBtn = document.getElementById('restore-bg-plate-btn');
  if (restoreBgBtn) {
    restoreBgBtn.addEventListener('click', () => {
      void restoreBackgroundPlatesOnly({ showProgress: true });
    });
  }

  document.querySelectorAll('.volumax-oneclick-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      void runVoluMaxOneClick();
    });
    btn.disabled = state.step < 3;
  });
}

function refreshVoluMaxOneClickButtons() {
  document.querySelectorAll('.volumax-oneclick-btn').forEach((btn) => {
    btn.disabled = state.step < 3 || state.processedImages.length === 0 || isPreparingVoluMaxLayers;
  });
}

function setupThreeScene() {
  if (cubePlayer) cubePlayer.dispose();

  cubePlayer = new CubePlayer({
    container: canvasContainer,
    images: state.processedImages,
    presentationEffectId: state.settings.presentationEffectId || 'cube_focus',
    framePresetId: state.settings.framePresetId || 'rose_gold',
    customFrameColor: state.settings.customFrameColor || '',
    gradientColorCycle: Boolean(state.settings.gradientColorCycle),
    backgroundTheme: state.settings.backgroundTheme || 'original',
    particleTheme: state.settings.particleTheme || 'none',
    bgmTrackId: state.settings.bgmTrackId || 'none',
    hologramMode: false,
    voluMaxDepthEnabled: state.settings.voluMaxDepthEnabled || false,
    viewportBackdropPath: state.settings.viewportBackdropPath || null,
    cubeRotationMode: state.settings.cubeRotationMode || 'yaw_cw',
    fanSpeed: state.settings.fanSpeed || 1
  });

  // Handle window resize
  window.addEventListener('resize', () => {
    if (cubePlayer) cubePlayer.resize();
  });
}

function buildHologramCube() {
  if (cubePlayer) {
    cubePlayer.updateSettings({
      framePresetId: state.settings.framePresetId,
      customFrameColor: state.settings.customFrameColor,
      gradientColorCycle: Boolean(state.settings.gradientColorCycle),
      voluMaxDepthEnabled: state.settings.voluMaxDepthEnabled,
      images: state.processedImages,
    });
  }
}

function buildParticles() {
  if (cubePlayer) {
    cubePlayer.updateSettings({
      particleTheme: state.settings.particleTheme
    });
  }
}

function syncOptionButtonsFromSettings() {
  const s = state.settings;
  const syncGroup = (attr, value) => {
    document.querySelectorAll(`[${attr}]`).forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute(attr) === value);
    });
  };
  syncGroup('data-particle', s.particleTheme || 'none');
  syncGroup('data-bgm', s.bgmTrackId || 'none');
  syncGroup('data-bg-theme', s.backgroundTheme || 'original');
  syncGroup('data-effect', s.presentationEffectId || 'cube_focus');
  syncGroup('data-preset', s.framePresetId || 'rose_gold');
  syncGroup('data-rotation', s.cubeRotationMode || 'yaw_cw');
}

// SETUP CONFIG PANEL INTERFACES
function setupConfigListeners() {
  const fanSpeedRange = document.getElementById('fan-speed-range');
  const fanSpeedLabel = document.getElementById('fan-speed-label');
  if (fanSpeedRange && fanSpeedLabel) {
    fanSpeedRange.value = String(state.settings.fanSpeed ?? 1);
    fanSpeedLabel.textContent = `${Number(fanSpeedRange.value).toFixed(2)}×`;
    fanSpeedRange.addEventListener('input', (e) => {
      state.settings.fanSpeed = Number(e.target.value);
      fanSpeedLabel.textContent = `${state.settings.fanSpeed.toFixed(2)}×`;
      if (state.step === 3) setupThreeScene();
    });
  }

  syncVoluMaxCheckboxesFromSettings();
  bindVoluMaxCheckboxListeners();

  syncOptionButtonsFromSettings();
  document.querySelectorAll('[data-rotation]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('[data-rotation]').forEach((b) => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      state.settings.cubeRotationMode = e.currentTarget.getAttribute('data-rotation');
      if (state.step === 3) setupThreeScene();
    });
  });

  // Effect select
  document.querySelectorAll('[data-effect]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('[data-effect]').forEach(b => b.classList.remove('active'));
      const trigger = e.currentTarget;
      trigger.classList.add('active');
      state.settings.presentationEffectId = trigger.getAttribute('data-effect');
      // Full scene rebuild: geometry, carousel index, drag rotation baseline
      setupThreeScene();
    });
  });

  // Preset select
  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('[data-preset]').forEach(b => b.classList.remove('active'));
      const trigger = e.currentTarget;
      trigger.classList.add('active');
      state.settings.framePresetId = trigger.getAttribute('data-preset');

      // Reset custom color when preset is clicked, and sync picker value
      state.settings.customFrameColor = '';
      const picker = document.getElementById('frame-color-picker');
      if (picker) {
        const pr = FRAME_PRESETS[state.settings.framePresetId];
        const hexStr = '#' + pr.outerColor.toString(16).padStart(6, '0');
        picker.value = hexStr;
      }

      buildHologramCube();
    });
  });

  // Custom frame color picker listener
  const frameColorPicker = document.getElementById('frame-color-picker');
  if (frameColorPicker) {
    frameColorPicker.addEventListener('input', (e) => {
      state.settings.customFrameColor = e.target.value;
      buildHologramCube();
    });
  }

  const frameGradientToggle = document.getElementById('frame-gradient-cycle');
  if (frameGradientToggle) {
    frameGradientToggle.checked = Boolean(state.settings.gradientColorCycle);
    frameGradientToggle.addEventListener('change', (e) => {
      state.settings.gradientColorCycle = e.target.checked;
      buildHologramCube();
    });
  }

  // Background Theme select listener
  document.querySelectorAll('[data-bg-theme]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      document.querySelectorAll('[data-bg-theme]').forEach(b => b.classList.remove('active'));
      const trigger = e.currentTarget;
      trigger.classList.add('active');
      state.settings.backgroundTheme = trigger.getAttribute('data-bg-theme');

      // Update UI and regenerate plates with spin animation loading state
      const exportBtn = document.getElementById('export-btn');
      const originalText = exportBtn.innerHTML;
      exportBtn.setAttribute('disabled', 'true');
      exportBtn.innerHTML = `<i data-lucide="loader" class="w-5 h-5 animate-spin"></i> 배경 합성 중...`;
      if (window.lucide) window.lucide.createIcons();

      await regenerateBackgroundPlates();
      if (state.step === 3) {
        buildHologramCube();
      }

      exportBtn.removeAttribute('disabled');
      exportBtn.innerHTML = originalText;
      if (window.lucide) window.lucide.createIcons();
    });
  });

  // Particle select
  document.querySelectorAll('[data-particle]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('[data-particle]').forEach(b => b.classList.remove('active'));
      const trigger = e.currentTarget;
      trigger.classList.add('active');
      state.settings.particleTheme = trigger.getAttribute('data-particle');
      buildParticles();
    });
  });

  // BGM select
  document.querySelectorAll('[data-bgm]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('[data-bgm]').forEach(b => b.classList.remove('active'));
      const trigger = e.currentTarget;
      trigger.classList.add('active');
      state.settings.bgmTrackId = trigger.getAttribute('data-bgm');
    });
  });

  // Reset Button
  resetBtn.addEventListener('click', () => {
    state.step = 1;
    state.sourceImages = [];
    state.processedImages = [];
    
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    
    step3View.classList.add('hidden');
    step1View.classList.remove('hidden');

    dot1.className = 'step-dot active';
    dot1.innerHTML = '1';
    label1.className = 'text-xs font-bold text-gold';
    dot2.className = 'step-dot';
    label2.className = 'text-xs font-bold text-white/30';
    dot3.className = 'step-dot';
    label3.className = 'text-xs font-bold text-white/30';

    updateThumbnails();
  });

  // Video Export (marriage.mp4)
  exportBtn.addEventListener('click', handleVideoExport);
}

// Web Audio API Synthesized Wedding BGM (Canon in D)
class CanonSynth {
  constructor(audioCtx, destination) {
    this.ctx = audioCtx;
    this.dest = destination;
    this.notes = {
      'D3': 146.83, 'A3': 220.00, 'Bm3': 246.94, 'F#3': 185.00, 'G3': 196.00,
      'D4': 293.66, 'A4': 440.00, 'Bm4': 493.88, 'F#4': 369.99, 'G4': 392.00,
      'C#4': 277.18, 'C#5': 554.37, 'D5': 587.33, 'E5': 659.25, 'F#5': 739.99,
      'G5': 783.99, 'A5': 880.00, 'B5': 987.77, 'C#6': 1109.73, 'D6': 1174.66
    };
    this.progression = [
      { bass: 'D3', melody: ['D5', 'F#5', 'A5', 'D6'] },
      { bass: 'A3', melody: ['C#5', 'E5', 'A5', 'C#6'] },
      { bass: 'Bm3', melody: ['D5', 'F#5', 'B5', 'D6'] },
      { bass: 'F#3', melody: ['C#5', 'F#5', 'A5', 'C#6'] },
      { bass: 'G3', melody: ['B4', 'D5', 'G5', 'B5'] },
      { bass: 'D3', melody: ['A4', 'D5', 'F#5', 'A5'] },
      { bass: 'G3', melody: ['B4', 'D5', 'G5', 'B5'] },
      { bass: 'A3', melody: ['C#5', 'E5', 'A5', 'C#6'] }
    ];
  }

  playNote(freq, startTime, duration, vol = 0.25) {
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.value = freq;

    osc2.type = 'sine';
    osc2.frequency.value = freq * 2; 

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration - 0.02);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.dest);
    
    // Also output to physical speakers so the operator hears BGM while exporting!
    gain.connect(this.ctx.destination);

    osc1.start(startTime);
    osc1.stop(startTime + duration);
    
    osc2.start(startTime);
    osc2.stop(startTime + duration);
  }

  start(tempoBpm = 78) {
    const stepDuration = 60 / tempoBpm;
    let time = this.ctx.currentTime + 0.1;
    
    const playMeasure = (progIndex) => {
      const chord = this.progression[progIndex];
      const bassFreq = this.notes[chord.bass];
      if (bassFreq) this.playNote(bassFreq, time, stepDuration * 3.5, 0.4);

      chord.melody.forEach((noteName, idx) => {
        const noteFreq = this.notes[noteName];
        if (noteFreq) {
          const noteTime = time + idx * (stepDuration * 0.5);
          this.playNote(noteFreq, noteTime, stepDuration * 1.4, 0.18);
        }
      });
      time += stepDuration * 2;
    };

    let progIdx = 0;
    // Schedule 16 measures to fully cover 15 seconds video length
    for (let i = 0; i < 16; i++) {
      playMeasure(progIdx);
      progIdx = (progIdx + 1) % this.progression.length;
    }
  }

  stop() {
    // Standard cleanup handled by context closing
  }
}

class BridalChorusSynth {
  constructor(audioCtx, destination) {
    this.ctx = audioCtx;
    this.dest = destination;
    this.notes = {
      'D3': 146.83, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94, 'C4': 261.63,
      'D4': 293.66, 'E4': 329.63, 'F#4': 369.99, 'G4': 392.00, 'A4': 440.00,
      'B4': 493.88, 'C5': 523.25, 'D5': 587.33
    };
    // Wagner's Bridal Chorus theme
    this.melody = [
      { note: 'D4', dur: 1.5 }, { note: 'G4', dur: 1.5 }, { note: 'G4', dur: 0.5 }, { note: 'G4', dur: 2.0 },
      { note: 'D4', dur: 1.5 }, { note: 'A4', dur: 1.5 }, { note: 'F#4', dur: 0.5 }, { note: 'G4', dur: 2.0 },
      { note: 'D4', dur: 1.0 }, { note: 'G4', dur: 1.0 }, { note: 'B4', dur: 1.0 }, { note: 'G4', dur: 1.5 },
      { note: 'F#4', dur: 0.5 }, { note: 'E4', dur: 1.0 }, { note: 'A4', dur: 1.0 }, { note: 'D4', dur: 2.0 },
      
      { note: 'D4', dur: 1.5 }, { note: 'G4', dur: 1.5 }, { note: 'G4', dur: 0.5 }, { note: 'G4', dur: 2.0 },
      { note: 'D4', dur: 1.5 }, { note: 'A4', dur: 1.5 }, { note: 'F#4', dur: 0.5 }, { note: 'G4', dur: 2.0 },
      { note: 'D4', dur: 1.0 }, { note: 'G4', dur: 1.0 }, { note: 'B4', dur: 1.0 }, { note: 'G4', dur: 1.5 },
      { note: 'F#4', dur: 0.5 }, { note: 'A4', dur: 1.0 }, { note: 'F#4', dur: 1.0 }, { note: 'G4', dur: 2.0 }
    ];
    this.bass = [
      { note: 'G3', dur: 4.0 }, { note: 'G3', dur: 1.5 }, { note: 'D3', dur: 2.0 }, { note: 'G3', dur: 0.5 },
      { note: 'D3', dur: 4.0 }, { note: 'G3', dur: 4.0 },
      { note: 'G3', dur: 2.0 }, { note: 'B3', dur: 1.0 }, { note: 'G3', dur: 1.0 },
      { note: 'A3', dur: 2.0 }, { note: 'D3', dur: 2.0 },
      
      { note: 'G3', dur: 4.0 }, { note: 'G3', dur: 1.5 }, { note: 'D3', dur: 2.0 }, { note: 'G3', dur: 0.5 },
      { note: 'D3', dur: 4.0 }, { note: 'G3', dur: 4.0 },
      { note: 'G3', dur: 2.0 }, { note: 'B3', dur: 1.0 }, { note: 'G3', dur: 1.0 },
      { note: 'D3', dur: 2.0 }, { note: 'G3', dur: 2.0 }
    ];
  }

  playNote(freq, startTime, duration, vol = 0.25) {
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.value = freq;

    osc2.type = 'sine';
    osc2.frequency.value = freq * 2; 

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration - 0.02);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.dest);
    gain.connect(this.ctx.destination);

    osc1.start(startTime);
    osc1.stop(startTime + duration);
    
    osc2.start(startTime);
    osc2.stop(startTime + duration);
  }

  start(tempoBpm = 76) {
    const beatDuration = 60 / tempoBpm;
    let time = this.ctx.currentTime + 0.1;
    
    // Play melody
    let melTime = time;
    this.melody.forEach(item => {
      const freq = this.notes[item.note];
      const dur = item.dur * beatDuration;
      if (freq) {
        this.playNote(freq, melTime, dur * 0.9, 0.15);
      }
      melTime += dur;
    });

    // Play bass
    let bassTime = time;
    this.bass.forEach(item => {
      const freq = this.notes[item.note];
      const dur = item.dur * beatDuration;
      if (freq) {
        this.playNote(freq, bassTime, dur * 0.95, 0.2);
      }
      bassTime += dur;
    });
  }

  stop() {}
}

class WeddingMarchSynth {
  constructor(audioCtx, destination) {
    this.ctx = audioCtx;
    this.dest = destination;
    this.notes = {
      'C3': 130.81, 'E3': 164.81, 'F3': 174.61, 'G3': 196.00, 'A3': 220.00, 'B3': 246.94,
      'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23, 'G4': 392.00, 'A4': 440.00, 'B4': 493.88, 
      'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46, 'G5': 783.99
    };
    // Mendelssohn's Wedding March
    this.melody = [
      // Trumpet Fanfare
      { note: 'G4', dur: 0.25 }, { note: 'G4', dur: 0.25 }, { note: 'G4', dur: 0.25 },
      { note: 'C5', dur: 1.25 }, { note: 'C5', dur: 0.5 }, { note: 'C5', dur: 0.5 },
      { note: 'G4', dur: 0.25 }, { note: 'G4', dur: 0.25 }, { note: 'G4', dur: 0.25 },
      { note: 'D5', dur: 1.25 }, { note: 'B4', dur: 0.5 }, { note: 'G4', dur: 0.5 },
      
      { note: 'G4', dur: 0.25 }, { note: 'G4', dur: 0.25 }, { note: 'G4', dur: 0.25 },
      { note: 'E5', dur: 0.75 }, { note: 'D5', dur: 0.75 }, { note: 'C5', dur: 0.75 }, { note: 'B4', dur: 0.75 },
      { note: 'A4', dur: 0.75 }, { note: 'G4', dur: 0.75 }, { note: 'F5', dur: 0.75 }, { note: 'D5', dur: 0.75 },
      { note: 'C5', dur: 2.0 },
      
      // Repeat fanfare short
      { note: 'G4', dur: 0.25 }, { note: 'G4', dur: 0.25 }, { note: 'G4', dur: 0.25 },
      { note: 'C5', dur: 1.25 }, { note: 'C5', dur: 0.5 }, { note: 'C5', dur: 0.5 }
    ];
    this.bass = [
      { note: 'C4', dur: 1.0 }, { note: 'C4', dur: 1.0 }, { note: 'C4', dur: 1.0 },
      { note: 'G3', dur: 1.0 }, { note: 'G3', dur: 1.0 }, { note: 'G3', dur: 1.0 },
      { note: 'C4', dur: 1.0 }, { note: 'C4', dur: 1.0 }, { note: 'C4', dur: 1.0 },
      { note: 'G3', dur: 1.0 }, { note: 'G3', dur: 1.0 }, { note: 'G3', dur: 1.0 },
      
      { note: 'C4', dur: 1.0 }, { note: 'C4', dur: 1.0 }, { note: 'C4', dur: 1.0 },
      { note: 'F3', dur: 1.0 }, { note: 'G3', dur: 1.0 }, { note: 'C4', dur: 2.0 },
      { note: 'C4', dur: 1.0 }, { note: 'C4', dur: 1.0 }, { note: 'C4', dur: 1.0 }
    ];
  }

  playNote(freq, startTime, duration, vol = 0.25) {
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.value = freq;

    osc2.type = 'sine';
    osc2.frequency.value = freq * 2; 

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(vol, startTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration - 0.02);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.dest);
    gain.connect(this.ctx.destination);

    osc1.start(startTime);
    osc1.stop(startTime + duration);
    
    osc2.start(startTime);
    osc2.stop(startTime + duration);
  }

  start(tempoBpm = 86) {
    const beatDuration = 60 / tempoBpm;
    let time = this.ctx.currentTime + 0.1;
    
    // Play melody
    let melTime = time;
    this.melody.forEach(item => {
      const freq = this.notes[item.note];
      const dur = item.dur * beatDuration;
      if (freq) {
        this.playNote(freq, melTime, dur * 0.85, 0.15);
      }
      melTime += dur;
    });

    // Play bass
    let bassTime = time;
    this.bass.forEach(item => {
      const freq = this.notes[item.note];
      const dur = item.dur * beatDuration;
      if (freq) {
        this.playNote(freq, bassTime, dur * 0.9, 0.2);
      }
      bassTime += dur;
    });
  }

  stop() {}
}

// STEP 4: MP4 VIDEO EXPORT
async function handleVideoExport() {
  if (state.isRecording || state.processedImages.length === 0) return;

  state.isRecording = true;
  exportBtn.setAttribute('disabled', 'true');
  resetBtn.setAttribute('disabled', 'true');
  recordingStatus.classList.remove('hidden');

  const bgmTrackId = state.settings.bgmTrackId;
  const withAudio = bgmTrackId !== 'none';
  const speedMul = state.settings.fanSpeed || 1;
  const effectId = state.settings.presentationEffectId || "cube_focus";
  const durationSec =
    effectId === "cube_focus" && window.WeddingSimpleFan
      ? Math.max(
          8,
          Math.ceil(
            window.WeddingSimpleFan.getPresentationDurationMs(
              state.processedImages.length,
              speedMul
            ) / 1000
          )
        )
      : 15;
  
  let mediaRecorder;
  const recordedChunks = [];

  // Enable Export mode to configure 1024x1024 square layout & reset timeline
  if (cubePlayer) {
    cubePlayer.setExportMode(true);
  }

  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const canvasStream = cubePlayer ? cubePlayer.captureStream(30) : null;
  if (!canvasStream) {
    state.isRecording = false;
    exportBtn.removeAttribute('disabled');
    resetBtn.removeAttribute('disabled');
    recordingStatus.classList.add('hidden');
    return;
  }

  let finalStream = canvasStream;
  let audioContext, audioDestination, audioNode;

  if (withAudio) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioDestination = audioContext.createMediaStreamDestination();
      
      if (bgmTrackId === 'romantic_wedding') {
        audioNode = new CanonSynth(audioContext, audioDestination);
      } else if (bgmTrackId === 'bridal_chorus') {
        audioNode = new BridalChorusSynth(audioContext, audioDestination);
      } else if (bgmTrackId === 'wedding_march') {
        audioNode = new WeddingMarchSynth(audioContext, audioDestination);
      }
      
      if (audioNode) {
        audioNode.start();
      }
      
      const compositeStream = new MediaStream();
      canvasStream.getVideoTracks().forEach(track => compositeStream.addTrack(track));
      audioDestination.stream.getAudioTracks().forEach(track => compositeStream.addTrack(track));
      
      finalStream = compositeStream;
    } catch (audioError) {
      console.warn("Audio Synthesis failed, falling back to silent video.", audioError);
    }
  }

  let mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm';
  }

  try {
    mediaRecorder = new MediaRecorder(finalStream, {
      mimeType,
      videoBitsPerSecond: 8_000_000
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      if (audioNode) {
        try {
          audioNode.stop();
          audioContext.close();
        } catch (_) {}
      }

      const blob = new Blob(recordedChunks, { type: mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = (mimeType || '').includes('webm') ? 'marriage.webm' : 'marriage.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      state.isRecording = false;

      // Restore standard display configurations
      if (cubePlayer) {
        cubePlayer.setExportMode(false);
      }

      exportBtn.removeAttribute('disabled');
      resetBtn.removeAttribute('disabled');
      recordingStatus.classList.add('hidden');
      alert("marriage.mp4 홀로그램 비디오 다운로드가 완료되었습니다!");
    };

    setTimeout(async () => {
      if (audioContext) {
        try {
          await audioContext.resume();
        } catch (_) {}
      }
      
      state.recordingStartTime = performance.now();
      mediaRecorder.start(250);
      
      setTimeout(() => {
        try {
          mediaRecorder.requestData();
        } catch (_) {}
        mediaRecorder.stop();
      }, durationSec * 1000);
    }, 100);

  } catch (recError) {
    console.error(recError);
    alert(`동영상 내보내기 중 오류가 발생했습니다: ${recError.message}`);
    state.isRecording = false;
    if (cubePlayer) {
      cubePlayer.setExportMode(false);
    }
    exportBtn.removeAttribute('disabled');
    resetBtn.removeAttribute('disabled');
    recordingStatus.classList.add('hidden');
  }
}

/** Test/verify hook — settings + processed summary (no image payloads). */
if (typeof window !== 'undefined') {
  window.mboxInspectVoluMaxFaces = () => {
    if (cubePlayer) return cubePlayer.inspectVoluMaxFaces();
    return { depthOn: false, layerCount: 0, activeFaceIndex: 4, faces: [] };
  };

  window.mboxProbeVoluMaxParallax = () => {
    if (cubePlayer) return cubePlayer.probeVoluMaxParallax();
    return { depthOn: false, layerCount: 0, activeFaceIndex: 4, faces: [] };
  };

  window.mboxGetPresentationDebug = () => {
    if (cubePlayer) return cubePlayer.getPresentationDebug();
    return { settings: {}, processed: [] };
  };

  window.mboxDebugLayerSummary = () =>
    state.processedImages.map((img, i) => ({
      i,
      label: img.label,
      hasPreCrop: Boolean(img.preCropSourceUrl),
      plateSameAsFg: img.backgroundPlateUrl === img.subjectForegroundUrl,
      voluMaxForegroundKind: img.voluMaxForegroundKind,
      preprocessMode: img.preprocessMode,
      voluMaxPrepared: img.voluMaxPrepared,
      bgMime: img.backgroundPlateUrl?.startsWith('data:')
        ? img.backgroundPlateUrl.slice(5, img.backgroundPlateUrl.indexOf(';'))
        : null,
      fgMime: img.subjectForegroundUrl?.startsWith('data:')
        ? img.subjectForegroundUrl.slice(5, img.subjectForegroundUrl.indexOf(';'))
        : null,
      bgLen: img.backgroundPlateUrl?.length ?? 0,
      fgLen: img.subjectForegroundUrl?.length ?? 0,
      appDualLayer: imageHasVoluMaxLayers(img),
    }));

  window.mboxDebugRing = () => window.__mboxDebugRing ?? [];

  window.mboxExportDebug = () => {
    const payload = {
      layerSummary: window.mboxDebugLayerSummary?.() ?? [],
      faces: window.mboxInspectVoluMaxFaces?.() ?? null,
      ring: window.mboxDebugRing?.() ?? [],
      status: document.getElementById('volumax-status')?.textContent ?? '',
    };
    const text = JSON.stringify(payload, null, 2);
    try {
      localStorage.setItem('mboxDebugExport', text);
    } catch {
      /* ignore */
    }
    return payload;
  };
}
