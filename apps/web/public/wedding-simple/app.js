// API BASE CONFIG (Dynamically resolve cloud/deployment host origin if not file:// or localhost)
const CLOUD_RUN_API_URL = 'https://mbox-api-118689443638.asia-northeast3.run.app';
const CLOUD_API_KEY = 'mbox-prod-j5WzZTkM3KLekOEkox7rmKamTqUf9gky';
let API_BASE_URL = 'http://localhost:8787';
let API_KEY_HEADER = '';
const isLocalIP = /^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(window.location.hostname);
if (window.location.protocol !== 'file:') {
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    API_BASE_URL = 'http://localhost:8787';
  } else if (isLocalIP) {
    // 로컬 와이파이(LAN)를 통해 모바일이나 다른 기기로 접속 시, 동일한 호스트의 API 포트(8787)로 매핑합니다.
    API_BASE_URL = `http://${window.location.hostname}:8787`;
  } else {
    // 프로덕션(GCS, CDN 등) — Cloud Run URL 고정
    API_BASE_URL = CLOUD_RUN_API_URL;
    API_KEY_HEADER = CLOUD_API_KEY;
  }
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

// STATE MANAGEMENT
let state = {
  step: 1, // 1: upload, 2: processing, 3: preview & export
  sourceImages: [], // base64 strings
  processedImages: [], // Array of { id, url, backgroundPlateUrl, center, focus, etc. }
  settings: {
    presentationEffectId: 'cube_focus',
    framePresetId: 'rose_gold',
    customFrameColor: '',
    backgroundTheme: 'original',
    particleTheme: 'floating_hearts',
    bgmTrackId: 'romantic_wedding',
    hologramMode: true,
    cubeRotationMode: 'auto',
    fanSpeed: 1
  },
  isRecording: false,
  nextImageIndex: 6,
  recordingStartTime: 0
};

// PRESET STYLES
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

function getPresentationFaceIndex(step) {
  if (window.WeddingSimpleFan) {
    return window.WeddingSimpleFan.getPresentationFace(step);
  }
  const order = [4, 0, 1, 2, 3, 5];
  return order[step % order.length];
}

function applyPhotoToCubeFace(textureStep) {
  const image = state.processedImages[textureStep];
  if (!image || !cubeFaces.length) return;
  const faceIdx = getPresentationFaceIndex(textureStep);
  const face = cubeFaces.find((f) => f.faceIndex === faceIdx);
  if (!face?.innerMesh) return;
  const loader = new THREE.TextureLoader();
  const tex = loader.load(image.faceCompositeUrl || image.url);
  if (face.innerMesh.material.map) face.innerMesh.material.map.dispose();
  face.innerMesh.material.map = tex;
  face.innerMesh.material.needsUpdate = true;
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

// Blurred fill plate for dual-layer cube parallax with theme synthesis
async function createBackgroundPlate(url, size = 1024, blurPx = 32) {
  const img = await loadImage(url);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');

  const theme = state.settings.backgroundTheme || 'original_blurred';

  const scale = Math.max(size / img.width, size / img.height);
  const drawWidth = img.width * scale;
  const drawHeight = img.height * scale;
  const offsetX = (size - drawWidth) / 2;
  const offsetY = (size - drawHeight) / 2;

  if (theme === 'original') {
    context.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    return canvas.toDataURL('image/jpeg', 0.92);
  }

  // 1. Draw blurred source image base
  context.filter = `blur(${blurPx}px) saturate(1.1) brightness(1.0)`;
  context.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
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

async function regenerateBackgroundPlates() {
  const total = state.sourceImages.length;
  for (let i = 0; i < total; i++) {
    const originalBase64 = state.sourceImages[i];
    const entry = state.processedImages[i];
    if (!entry) continue;
    const newBgPlate = await createBackgroundPlate(originalBase64);
    entry.backgroundPlateUrl = newBgPlate;
    entry.faceCompositeUrl = entry.url;
  }

  const textureLoader = new THREE.TextureLoader();
  plateTextures = state.processedImages.map((img) => textureLoader.load(img.backgroundPlateUrl));

  cubeFaces.forEach((face) => {
    const idx = face.faceIndex % state.processedImages.length;
    const imgData = state.processedImages[idx];
    if (!imgData) return;
    const photoTex = textureLoader.load(imgData.faceCompositeUrl || imgData.url);
    if (face.innerMesh?.material.map) face.innerMesh.material.map.dispose();
    face.innerMesh.material.map = photoTex;
    face.innerMesh.material.needsUpdate = true;
  });
  console.log("[Theme] Background plates regenerated; cube faces keep original photo.");
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

      // 2. Crop & plates (background kept — no matting)
      processingStatus.textContent = `[${imageNumber}/${totalImages}] 연출용 크롭 및 텍스처 준비 중...`;
      const finalPhoto = await cropImage(base64Src, metadata.center, metadata.focus);
      const backgroundPlate = await createBackgroundPlate(base64Src);

      state.processedImages.push({
        id: Date.now() + i,
        url: finalPhoto,
        faceCompositeUrl: finalPhoto,
        backgroundPlateUrl: backgroundPlate,
        preprocessMode: 'original',
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
let scene, camera, renderer, cubeGroup, specularLight = null;
let particleSystem = null;
let textures = [];
let plateTextures = [];
let cubeFaces = [];
let animationFrameId = null;
let fanRuntime = null;

function applyFanFrame(elapsedMs) {
  const rt = fanRuntime;
  const Fan = window.WeddingSimpleFan;
  if (!rt || !Fan || !cubeGroup || rt.effect !== "cube_focus") {
    return false;
  }
  const resolved = Fan.resolvePresentationTimeline(
    elapsedMs,
    rt.segmentMs,
    rt.loopBridgeMs
  );
  if (resolved.kind === "loop_bridge") {
    const bridge = Fan.sampleLoopBridge(
      resolved.bridgeElapsed,
      rt.loopBridgeMs,
      resolved.lastStep
    );
    cubeGroup.rotation.set(bridge.rotation.x, bridge.rotation.y, bridge.rotation.z);
    cubeGroup.scale.setScalar(bridge.presentationScale);
    const texStep =
      rt.loopBridgeMs > 0 && resolved.bridgeElapsed >= rt.loopBridgeMs * 0.82
        ? 0
        : resolved.lastStep;
    if (texStep !== rt.appliedTextureStep) {
      applyPhotoToCubeFace(texStep);
      rt.appliedTextureStep = texStep;
    }
    return true;
  }
  const { step, stepElapsed } = resolved;
  const face = getPresentationFaceIndex(step);
  const fanPhase = Fan.resolveFanPhase(step, stepElapsed, rt.speedMul);
  const texStep = fanPhase.phase === "approach" && step > 0 ? step - 1 : step;
  if (texStep !== rt.appliedTextureStep) {
    applyPhotoToCubeFace(texStep);
    rt.appliedTextureStep = texStep;
  }
  const motion = Fan.sampleFanCubeMotion(
    step,
    stepElapsed,
    face,
    rt.presentationCount,
    rt.motionSeed,
    state.settings.cubeRotationMode || "auto",
    rt.speedMul
  );
  cubeGroup.rotation.set(motion.rotation.x, motion.rotation.y, motion.rotation.z);
  cubeGroup.scale.setScalar(motion.presentationScale);
  return true;
}

function initStep3() {
  state.step = 3;
  step2View.classList.add('hidden');
  step3View.classList.remove('hidden');

  dot2.className = 'step-dot completed';
  dot2.innerHTML = '✓';
  label2.className = 'text-xs font-bold text-white/50';
  dot3.className = 'step-dot active';
  label3.className = 'text-xs font-bold text-gold';

  // Ensure the container has been laid out before reading clientWidth/Height.
  requestAnimationFrame(() => setupThreeScene());
}

function setupThreeScene() {
  canvasContainer.innerHTML = '';
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  if (renderer) renderer.dispose();

  const width = Math.max(1, canvasContainer.clientWidth || 0);
  const height = Math.max(1, canvasContainer.clientHeight || 0);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000); // Pitch black for fan hologram transparency

  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  camera.position.set(0, 0, 7.0);

  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  canvasContainer.appendChild(renderer.domElement);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.95);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
  dirLight.position.set(4, 7, 5);
  scene.add(dirLight);

  // Orbiting specular PointLight to highlight metal corners/specular peaks
  specularLight = new THREE.PointLight(0xfff5e6, 2.5, 12);
  specularLight.position.set(0, 3, 4);
  scene.add(specularLight);

  // Load Textures
  const textureLoader = new THREE.TextureLoader();
  textures = state.processedImages.map((img) =>
    textureLoader.load(img.faceCompositeUrl || img.url)
  );
  plateTextures = state.processedImages.map((img) =>
    textureLoader.load(img.backgroundPlateUrl)
  );

  const effect = state.settings.presentationEffectId || 'cube_focus';
  const getInitialFaceCount = () => {
    if (effect === 'cube_focus') return 6;
    if (effect === 'book_spread') return 2;
    if (effect === 'turntable') return 4;
    if (effect === 'orbit_gallery') return 5;
    if (effect === 'album_flip') return 2;
    return 6;
  };
  state.nextImageIndex = getInitialFaceCount();

  buildHologramCube();
  buildParticles();

  const Fan = window.WeddingSimpleFan;
  const presentationCount = state.processedImages.length;
  const speedMul = state.settings.fanSpeed || 1;
  const motionSeed = createMotionSeedFromImages(state.processedImages);
  const segmentMs = Fan
    ? state.processedImages.map((_, step) => Fan.getFanStepSegmentMs(step, speedMul))
    : [];
  const loopBridgeMs =
    Fan && presentationCount >= 2
      ? Fan.FAN_LOOP_BRIDGE_MS / Math.max(0.35, Math.min(2.5, speedMul))
      : 0;
  const presentationDurationMs = Fan
    ? Fan.getPresentationDurationMs(presentationCount, speedMul)
    : 15000;
  fanRuntime = {
    effect,
    segmentMs,
    loopBridgeMs,
    presentationDurationMs,
    presentationCount,
    motionSeed,
    speedMul,
    timelineStart: performance.now(),
    appliedTextureStep: -1,
  };

  // Animation Loop
  let lastTime = performance.now();
  
  // Interactive drag controls
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let targetRotation = { x: 0, y: 0.38 };
  
  const domEl = renderer.domElement;
  domEl.addEventListener('mousedown', (e) => {
    isDragging = true;
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  domEl.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const deltaMove = {
      x: e.clientX - previousMousePosition.x,
      y: e.clientY - previousMousePosition.y
    };
    
    targetRotation.y += deltaMove.x * 0.007;
    targetRotation.x += deltaMove.y * 0.007;
    
    // Clamp vertical rotation
    targetRotation.x = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, targetRotation.x));
    previousMousePosition = { x: e.clientX, y: e.clientY };
  });

  // Touch support for mobile
  domEl.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      isDragging = true;
      previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  });

  window.addEventListener('touchend', () => {
    isDragging = false;
  });

  domEl.addEventListener('touchmove', (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    const deltaMove = {
      x: e.touches[0].clientX - previousMousePosition.x,
      y: e.touches[0].clientY - previousMousePosition.y
    };
    
    targetRotation.y += deltaMove.x * 0.007;
    targetRotation.x += deltaMove.y * 0.007;
    targetRotation.x = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, targetRotation.x));
    previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  });

  const animate = (now) => {
    const deltaMs = now - lastTime;
    lastTime = now;

    if (state.isRecording) {
      const elapsedMs = now - state.recordingStartTime;
      const elapsed = elapsedMs / 1000;
      if (cubeGroup && effect === "cube_focus" && applyFanFrame(elapsedMs)) {
        // fan timeline drives recording
      } else if (cubeGroup) {
        const durationSec = 15;
        if (effect === 'album_flip') {
          let y = 0;
          if (elapsed < 1.5) {
            const t = elapsed / 1.5;
            y = (3 * t * t - 2 * t * t * t) * Math.PI;
          } else if (elapsed < 5.0) {
            y = Math.PI;
          } else if (elapsed < 6.5) {
            const t = (elapsed - 5.0) / 1.5;
            y = Math.PI + (3 * t * t - 2 * t * t * t) * Math.PI;
          } else if (elapsed < 10.0) {
            y = Math.PI * 2;
          } else if (elapsed < 11.5) {
            const t = (elapsed - 10.0) / 1.5;
            y = Math.PI * 2 + (3 * t * t - 2 * t * t * t) * Math.PI;
          } else {
            y = Math.PI * 3;
          }
          cubeGroup.rotation.y = y;
          cubeGroup.rotation.x = Math.sin(elapsed * 0.4) * 0.05;
        } else {
          cubeGroup.rotation.y = (elapsed / durationSec) * Math.PI * 2;
          if (effect === 'turntable') {
            cubeGroup.rotation.x = -0.12 + Math.sin(elapsed * 0.4) * 0.05;
          } else if (effect === 'orbit_gallery') {
            cubeGroup.rotation.x = 0.14 + Math.sin(elapsed * 0.4) * 0.05;
          } else {
            cubeGroup.rotation.x = Math.sin(elapsed * 0.4) * 0.12;
          }
        }
      }
    } else {
      if (!isDragging) {
        if (effect === "cube_focus") {
          const elapsedMs =
            (now - fanRuntime.timelineStart) % fanRuntime.presentationDurationMs;
          applyFanFrame(elapsedMs);
        } else if (effect === 'album_flip') {
          const elapsed = ((now % 15000) / 1000);
          let y = 0;
          if (elapsed < 1.5) {
            const t = elapsed / 1.5;
            y = (3 * t * t - 2 * t * t * t) * Math.PI;
          } else if (elapsed < 5.0) {
            y = Math.PI;
          } else if (elapsed < 6.5) {
            const t = (elapsed - 5.0) / 1.5;
            y = Math.PI + (3 * t * t - 2 * t * t * t) * Math.PI;
          } else if (elapsed < 10.0) {
            y = Math.PI * 2;
          } else if (elapsed < 11.5) {
            const t = (elapsed - 10.0) / 1.5;
            y = Math.PI * 2 + (3 * t * t - 2 * t * t * t) * Math.PI;
          } else {
            y = Math.PI * 3;
          }
          targetRotation.y = y;
          targetRotation.x = Math.sin(now * 0.0008) * 0.05;
        } else if (effect !== "cube_focus") {
          targetRotation.y += 0.006;
          if (effect === 'turntable') {
            targetRotation.x = -0.12 + Math.sin(now * 0.0008) * 0.05;
          } else if (effect === 'orbit_gallery') {
            targetRotation.x = 0.14 + Math.sin(now * 0.0008) * 0.05;
          } else {
            targetRotation.x = Math.sin(now * 0.0008) * 0.12;
          }
        }
      }
      if (cubeGroup && effect !== "cube_focus") {
        if (effect === 'album_flip') {
          cubeGroup.rotation.y = targetRotation.y;
          cubeGroup.rotation.x = targetRotation.x;
        } else {
          cubeGroup.rotation.y += (targetRotation.y - cubeGroup.rotation.y) * 0.08;
          cubeGroup.rotation.x += (targetRotation.x - cubeGroup.rotation.x) * 0.08;
        }
      } else if (cubeGroup && effect === "cube_focus" && isDragging) {
        cubeGroup.rotation.y += (targetRotation.y - cubeGroup.rotation.y) * 0.12;
        cubeGroup.rotation.x += (targetRotation.x - cubeGroup.rotation.x) * 0.12;
      }
    }

    if (cubeGroup && effect !== "cube_focus") {
      // Parallax effect on inner face planes based on rotation
      cubeFaces.forEach((face) => {
        if (face.innerMesh && face.bgMesh) {
          const angle = cubeGroup.rotation.y + face.offsetAngle;
          
          // Front subject layer offsets in reverse rotation direction for floating feel
          face.innerMesh.position.x = Math.sin(angle) * 0.14;
          
          // Background plate shifts in normal direction slightly to amplify depth distance
          face.bgMesh.position.x = -Math.sin(angle) * 0.08;

          // Vertical parallax based on pitch (X rotation)
          const pitch = cubeGroup.rotation.x;
          face.innerMesh.position.y = Math.sin(pitch) * 0.14;
          face.bgMesh.position.y = -Math.sin(pitch) * 0.08;
        }
      });
    }

    // Texture Carousel (Dynamic Swapping in camera blind spot / transition)
    const totalImages = state.processedImages.length;
    if (cubeGroup) {
      if (effect === 'cube_focus' || effect === 'turntable') {
        if (totalImages > 4) {
          const sideFaces = [
            { idx: 0, offset: 0 },
            { idx: 1, offset: Math.PI / 2 },
            { idx: 2, offset: Math.PI },
            { idx: 3, offset: -Math.PI / 2 }
          ];

          sideFaces.forEach((face) => {
            const faceObj = cubeFaces[face.idx];
            if (faceObj) {
              const angle = cubeGroup.rotation.y + face.offset;
              const cosAngle = Math.cos(angle);

              if (cosAngle < -0.96) {
                if (faceObj.canSwap) {
                  const nextIdx = state.nextImageIndex;
                  const imgData = state.processedImages[nextIdx];
                  if (imgData) {
                    const loader = new THREE.TextureLoader();
                    const innerTex = loader.load(imgData.url);
                    const bgTex = loader.load(imgData.backgroundPlateUrl);

                    if (faceObj.innerMesh.material.map) faceObj.innerMesh.material.map.dispose();
                    faceObj.innerMesh.material.map = innerTex;
                    faceObj.innerMesh.material.needsUpdate = true;

                    if (faceObj.bgMesh.material.map) faceObj.bgMesh.material.map.dispose();
                    faceObj.bgMesh.material.map = bgTex;
                    faceObj.bgMesh.material.needsUpdate = true;

                    console.log(`[Carousel] Swapped face index ${face.idx} to image index ${nextIdx}`);
                    state.nextImageIndex = (state.nextImageIndex + 1) % totalImages;
                    faceObj.canSwap = false;
                  }
                }
              } else if (cosAngle > 0.3) {
                faceObj.canSwap = true;
              }
            }
          });
        }
      } else if (effect === 'orbit_gallery') {
        if (totalImages > 5) {
          cubeFaces.forEach((faceObj) => {
            const angle = cubeGroup.rotation.y + faceObj.offsetAngle;
            const cosAngle = Math.cos(angle);

            if (cosAngle < -0.85) {
              if (faceObj.canSwap) {
                const nextIdx = state.nextImageIndex;
                const imgData = state.processedImages[nextIdx];
                if (imgData) {
                  const loader = new THREE.TextureLoader();
                  const innerTex = loader.load(imgData.url);
                  const bgTex = loader.load(imgData.backgroundPlateUrl);

                  if (faceObj.innerMesh.material.map) faceObj.innerMesh.material.map.dispose();
                  faceObj.innerMesh.material.map = innerTex;
                  faceObj.innerMesh.material.needsUpdate = true;

                  if (faceObj.bgMesh.material.map) faceObj.bgMesh.material.map.dispose();
                  faceObj.bgMesh.material.map = bgTex;
                  faceObj.bgMesh.material.needsUpdate = true;

                  console.log(`[Orbit Carousel] Swapped face index ${faceObj.faceIndex} to image index ${nextIdx}`);
                  state.nextImageIndex = (state.nextImageIndex + 1) % totalImages;
                  faceObj.canSwap = false;
                }
              }
            } else if (cosAngle > 0.3) {
              faceObj.canSwap = true;
            }
          });
        }
      } else if (effect === 'book_spread') {
        if (totalImages > 2) {
          const cosAngle = Math.cos(cubeGroup.rotation.y);
          if (cosAngle < -0.96) {
            let swappedAny = false;
            cubeFaces.forEach((faceObj, fIdx) => {
              if (faceObj.canSwap) {
                const nextIdx = (state.nextImageIndex + fIdx) % totalImages;
                const imgData = state.processedImages[nextIdx];
                if (imgData) {
                  const loader = new THREE.TextureLoader();
                  const innerTex = loader.load(imgData.url);
                  const bgTex = loader.load(imgData.backgroundPlateUrl);

                  if (faceObj.innerMesh.material.map) faceObj.innerMesh.material.map.dispose();
                  faceObj.innerMesh.material.map = innerTex;
                  faceObj.innerMesh.material.needsUpdate = true;

                  if (faceObj.bgMesh.material.map) faceObj.bgMesh.material.map.dispose();
                  faceObj.bgMesh.material.map = bgTex;
                  faceObj.bgMesh.material.needsUpdate = true;

                  console.log(`[Book Carousel] Swapped page ${fIdx} to image index ${nextIdx}`);
                  faceObj.canSwap = false;
                  swappedAny = true;
                }
              }
            });
            if (swappedAny) {
              state.nextImageIndex = (state.nextImageIndex + 2) % totalImages;
            }
          } else if (cosAngle > 0.3) {
            cubeFaces.forEach((faceObj) => {
              faceObj.canSwap = true;
            });
          }
        }
      } else if (effect === 'album_flip') {
        if (totalImages > 2) {
          const elapsed = state.isRecording ? ((now - state.recordingStartTime) / 1000) : ((now % 15000) / 1000);
          const swapPoints = [0.75, 5.75, 10.75];
          swapPoints.forEach((point, pIdx) => {
            const diff = elapsed - point;
            if (diff >= 0 && diff < 0.1) {
              const targetFaceIdx = (pIdx % 2 === 0) ? 0 : 1;
              const faceObj = cubeFaces[targetFaceIdx];
              if (faceObj && faceObj.canSwap) {
                const nextIdx = state.nextImageIndex;
                const imgData = state.processedImages[nextIdx];
                if (imgData) {
                  const loader = new THREE.TextureLoader();
                  const innerTex = loader.load(imgData.url);
                  const bgTex = loader.load(imgData.backgroundPlateUrl);

                  if (faceObj.innerMesh.material.map) faceObj.innerMesh.material.map.dispose();
                  faceObj.innerMesh.material.map = innerTex;
                  faceObj.innerMesh.material.needsUpdate = true;

                  if (faceObj.bgMesh.material.map) faceObj.bgMesh.material.map.dispose();
                  faceObj.bgMesh.material.map = bgTex;
                  faceObj.bgMesh.material.needsUpdate = true;

                  console.log(`[Album Flip] Swapped face index ${targetFaceIdx} to image index ${nextIdx}`);
                  state.nextImageIndex = (state.nextImageIndex + 1) % totalImages;
                  faceObj.canSwap = false;
                }
              }
            } else if (diff < 0 || diff > 1.0) {
              const targetFaceIdx = (pIdx % 2 === 0) ? 0 : 1;
              const faceObj = cubeFaces[targetFaceIdx];
              if (faceObj) faceObj.canSwap = true;
            }
          });
        }
      }
    }

    // Orbiting specular PointLight motion
    if (specularLight) {
      const time = now * 0.0012;
      specularLight.position.x = Math.cos(time) * 3.5;
      specularLight.position.z = Math.sin(time) * 3.5;
      specularLight.position.y = Math.sin(now * 0.0006) * 1.5 + 2.0;
    }

    // Update Particles
    updateParticles(deltaMs);

    renderer.render(scene, camera);
    animationFrameId = requestAnimationFrame(animate);
  };

  animationFrameId = requestAnimationFrame(animate);

  // Resize handler
  window.addEventListener('resize', () => {
    if (!canvasContainer || !renderer) return;
    const w = canvasContainer.clientWidth;
    const h = canvasContainer.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });
}

function createFaceGroup(imageIdx, preset) {
  const totalSides = state.processedImages.length;
  const idx = imageIdx % totalSides;
  const faceGroup = new THREE.Group();

  // 1. Inner Background Plate
  const bgTex = plateTextures[idx];
  const bgGeometry = new THREE.PlaneGeometry(2.35, 2.35);
  const bgMaterial = new THREE.MeshBasicMaterial({
    map: bgTex,
    side: THREE.DoubleSide,
    color: 0x222222
  });
  const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
  const imgMeta = state.processedImages[idx];
  if (imgMeta?.preprocessMode !== 'background_removed') {
    bgMesh.visible = false;
  }
  faceGroup.add(bgMesh);

  // 2. Inner border frame ring
  const borderGeom = new THREE.RingGeometry(1.05, 1.15, 64);
  const borderMat = new THREE.MeshStandardMaterial({
    color: preset.innerColor,
    metalness: preset.metalness,
    roughness: preset.roughness,
    side: THREE.DoubleSide
  });
  const borderMesh = new THREE.Mesh(borderGeom, borderMat);
  borderMesh.position.z = 0.01;
  faceGroup.add(borderMesh);

  // 2b. White border outline ring (하얀 띠)
  const outlineGeom = new THREE.RingGeometry(1.14, 1.16, 64);
  const outlineMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide
  });
  const outlineMesh = new THREE.Mesh(outlineGeom, outlineMat);
  outlineMesh.position.z = 0.012;
  faceGroup.add(outlineMesh);

  const photoTex = textures[idx];
  const innerGeometry = new THREE.PlaneGeometry(2.35, 2.35);
  const innerMaterial = new THREE.MeshBasicMaterial({
    map: photoTex,
    transparent: false,
    side: THREE.DoubleSide,
  });
  const innerMesh = new THREE.Mesh(innerGeometry, innerMaterial);
  innerMesh.position.z = 0.08;
  faceGroup.add(innerMesh);

  // 4. Back board plate (elegant metal frame backing)
  const plateGeom = new THREE.PlaneGeometry(2.4, 2.4);
  const plateMat = new THREE.MeshStandardMaterial({
    color: preset.outerColor,
    metalness: preset.metalness * 0.9,
    roughness: preset.roughness * 1.5,
    side: THREE.BackSide
  });
  const backPlateMesh = new THREE.Mesh(plateGeom, plateMat);
  backPlateMesh.position.z = -0.01;
  faceGroup.add(backPlateMesh);

  return { faceGroup, innerMesh, bgMesh };
}

function buildHologramCube() {
  if (cubeGroup) scene.remove(cubeGroup);
  cubeGroup = new THREE.Group();

  const basePreset = FRAME_PRESETS[state.settings.framePresetId];
  const customColor = state.settings.customFrameColor;
  const preset = {
    ...basePreset,
    outerColor: customColor ? parseInt(customColor.replace('#', '0x')) : basePreset.outerColor,
    innerColor: customColor ? parseInt(customColor.replace('#', '0x')) : basePreset.innerColor
  };
  const totalSides = state.processedImages.length;
  const effect = state.settings.presentationEffectId || 'cube_focus';
  
  cubeFaces = [];

  if (effect === 'cube_focus') {
    // Outer Premium Metallic Rounded Box Frame
    const frameGeometry = new THREE.RoundedBoxGeometry(2.6, 2.6, 2.6, 6, 0.08);
    const frameMaterial = new THREE.MeshStandardMaterial({
      color: preset.outerColor,
      metalness: preset.metalness,
      roughness: preset.roughness,
      side: THREE.DoubleSide
    });
    const outerFrameMesh = new THREE.Mesh(frameGeometry, frameMaterial);
    cubeGroup.add(outerFrameMesh);

    const faceDirections = [
      { pos: [0, 0, 1.28], rot: [0, 0, 0], angle: 0 }, // Front
      { pos: [1.28, 0, 0], rot: [0, Math.PI / 2, 0], angle: Math.PI / 2 }, // Right
      { pos: [0, 0, -1.28], rot: [0, Math.PI, 0], angle: Math.PI }, // Back
      { pos: [-1.28, 0, 0], rot: [0, -Math.PI / 2, 0], angle: -Math.PI / 2 }, // Left
      { pos: [0, 1.28, 0], rot: [-Math.PI / 2, 0, 0], angle: 0 }, // Top
      { pos: [0, -1.28, 0], rot: [Math.PI / 2, 0, 0], angle: 0 }  // Bottom
    ];

    for (let idx = 0; idx < 6; idx++) {
      const dir = faceDirections[idx];
      const { faceGroup, innerMesh, bgMesh } = createFaceGroup(idx, preset);
      faceGroup.position.set(...dir.pos);
      faceGroup.rotation.set(...dir.rot);
      cubeGroup.add(faceGroup);

      cubeFaces.push({
        group: faceGroup,
        innerMesh: innerMesh,
        bgMesh: bgMesh,
        offsetAngle: dir.angle,
        canSwap: true,
        faceIndex: idx
      });
    }
  } else if (effect === 'book_spread') {
    // Spine
    const spineGeometry = new THREE.BoxGeometry(0.12, 2.5, 0.18);
    const spineMaterial = new THREE.MeshStandardMaterial({
      color: preset.outerColor,
      metalness: preset.metalness,
      roughness: preset.roughness * 1.5
    });
    const spine = new THREE.Mesh(spineGeometry, spineMaterial);
    spine.position.set(0, 0, -0.02);
    cubeGroup.add(spine);

    // Book Back Cover
    const backGeometry = new THREE.BoxGeometry(2.6, 2.5, 0.05);
    const backMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e1215, // elegant dark leather cover color
      roughness: 0.8
    });
    const backMesh = new THREE.Mesh(backGeometry, backMaterial);
    backMesh.position.set(0, 0, -0.06);
    cubeGroup.add(backMesh);

    // Left Page (N)
    const leftPage = createFaceGroup(0, preset);
    leftPage.faceGroup.position.set(-1.25, 0, 0.04);
    leftPage.faceGroup.rotation.y = 0.18;
    cubeGroup.add(leftPage.faceGroup);
    cubeFaces.push({
      group: leftPage.faceGroup,
      innerMesh: leftPage.innerMesh,
      bgMesh: leftPage.bgMesh,
      offsetAngle: 0,
      canSwap: true,
      faceIndex: 0
    });

    // Right Page (N+1)
    const rightPage = createFaceGroup(1, preset);
    rightPage.faceGroup.position.set(1.25, 0, 0.04);
    rightPage.faceGroup.rotation.y = -0.18;
    cubeGroup.add(rightPage.faceGroup);
    cubeFaces.push({
      group: rightPage.faceGroup,
      innerMesh: rightPage.innerMesh,
      bgMesh: rightPage.bgMesh,
      offsetAngle: 0,
      canSwap: true,
      faceIndex: 1
    });

  } else if (effect === 'turntable') {
    // Metallic Turntable Base Cylinder
    const baseGeometry = new THREE.CylinderGeometry(1.55, 1.7, 0.12, 48);
    const baseMaterial = new THREE.MeshStandardMaterial({
      color: preset.outerColor,
      metalness: preset.metalness,
      roughness: preset.roughness
    });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = -1.35;
    cubeGroup.add(base);

    // 4 pages standing in a circle
    const faceDirections = [
      { pos: [0, 0.05, 1.1], rot: [0, 0, 0], angle: 0 }, // Front
      { pos: [1.1, 0.05, 0], rot: [0, Math.PI / 2, 0], angle: Math.PI / 2 }, // Right
      { pos: [0, 0.05, -1.1], rot: [0, Math.PI, 0], angle: Math.PI }, // Back
      { pos: [-1.1, 0.05, 0], rot: [0, -Math.PI / 2, 0], angle: -Math.PI / 2 } // Left
    ];

    for (let idx = 0; idx < 4; idx++) {
      const dir = faceDirections[idx];
      const { faceGroup, innerMesh, bgMesh } = createFaceGroup(idx, preset);
      faceGroup.position.set(...dir.pos);
      faceGroup.rotation.set(...dir.rot);
      cubeGroup.add(faceGroup);

      cubeFaces.push({
        group: faceGroup,
        innerMesh: innerMesh,
        bgMesh: bgMesh,
        offsetAngle: dir.angle,
        canSwap: true,
        faceIndex: idx
      });
    }

  } else if (effect === 'orbit_gallery') {
    // 5 pages arranged in a circle of radius 1.3
    for (let idx = 0; idx < 5; idx++) {
      const angle = (idx * Math.PI * 2) / 5;
      const x = Math.sin(angle) * 1.3;
      const z = Math.cos(angle) * 1.3;

      const { faceGroup, innerMesh, bgMesh } = createFaceGroup(idx, preset);
      faceGroup.position.set(x, 0, z);
      faceGroup.rotation.y = angle;
      cubeGroup.add(faceGroup);

      cubeFaces.push({
        group: faceGroup,
        innerMesh: innerMesh,
        bgMesh: bgMesh,
        offsetAngle: angle,
        canSwap: true,
        faceIndex: idx
      });
    }

  } else if (effect === 'album_flip') {
    // Outer border board
    const boardGeom = new THREE.RoundedBoxGeometry(2.45, 2.45, 0.1, 6, 0.04);
    const boardMat = new THREE.MeshStandardMaterial({
      color: preset.outerColor,
      metalness: preset.metalness,
      roughness: preset.roughness,
      side: THREE.DoubleSide
    });
    const boardMesh = new THREE.Mesh(boardGeom, boardMat);
    cubeGroup.add(boardMesh);

    // Front page (idx 0)
    const frontPage = createFaceGroup(0, preset);
    frontPage.faceGroup.position.set(0, 0, 0.052);
    cubeGroup.add(frontPage.faceGroup);
    cubeFaces.push({
      group: frontPage.faceGroup,
      innerMesh: frontPage.innerMesh,
      bgMesh: frontPage.bgMesh,
      offsetAngle: 0,
      canSwap: true,
      faceIndex: 0
    });

    // Back page (idx 1) - rotated PI to face back
    const backPage = createFaceGroup(1, preset);
    backPage.faceGroup.position.set(0, 0, -0.052);
    backPage.faceGroup.rotation.y = Math.PI;
    cubeGroup.add(backPage.faceGroup);
    cubeFaces.push({
      group: backPage.faceGroup,
      innerMesh: backPage.innerMesh,
      bgMesh: backPage.bgMesh,
      offsetAngle: Math.PI,
      canSwap: true,
      faceIndex: 1
    });
  }

  scene.add(cubeGroup);
}

// PARTICLE SYSTEMS (Crystalline Hearts, Gold Dust, Sakura, Confetti)
function buildParticles() {
  if (particleSystem) scene.remove(particleSystem);
  
  const theme = state.settings.particleTheme;
  if (theme === 'none') return;

  const count = theme === 'floating_hearts' ? 60 : theme === 'confetti' ? 120 : 150;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const velocities = [];
  const customData = []; 
  const palette = [
    new THREE.Color('#ff4d6d'),
    new THREE.Color('#ffb703'),
    new THREE.Color('#4cc9f0'),
    new THREE.Color('#7c3aed'),
    new THREE.Color('#34d399'),
    new THREE.Color('#f97316'),
  ];

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.0 + Math.random() * 2.2;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 6; // Y
    positions[i * 3 + 2] = Math.sin(angle) * radius;

    if (theme === 'floating_hearts') {
      velocities.push(new THREE.Vector3(0, 0.35 + Math.random() * 0.45, 0));
    } else if (theme === 'confetti') {
      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 0.25,
          -(0.6 + Math.random() * 0.6),
          (Math.random() - 0.5) * 0.25
        )
      );
      const c = palette[i % palette.length];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    } else {
      velocities.push(new THREE.Vector3(0, -(0.45 + Math.random() * 0.55), 0));
    }

    customData.push({
      phase: Math.random() * Math.PI * 2,
      swaySpeed: 0.8 + Math.random() * 1.5,
      size: theme === 'floating_hearts'
        ? 24 + Math.random() * 24
        : theme === 'confetti'
          ? 10 + Math.random() * 16
          : 8 + Math.random() * 12
    });
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (theme === 'confetti') {
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  const texture = createParticleTexture(theme);
  const material = new THREE.PointsMaterial({
    size: theme === 'floating_hearts' ? 0.4 : theme === 'confetti' ? 0.22 : 0.15,
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: theme === 'confetti'
  });

  particleSystem = new THREE.Points(geometry, material);
  particleSystem.userData = { velocities, customData, theme };
  scene.add(particleSystem);
}

function createParticleTexture(theme) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  if (theme === 'gold_dust') {
    // Golden glow circle
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255, 223, 134, 1.0)');
    grad.addColorStop(0.25, 'rgba(223, 179, 134, 0.8)');
    grad.addColorStop(0.55, 'rgba(223, 179, 134, 0.25)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();
  } else if (theme === 'white_petals') {
    // Cherry Blossom Petal
    ctx.translate(32, 32);
    ctx.rotate(Math.PI / 4);
    const grad = ctx.createLinearGradient(-15, -15, 15, 15);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, '#fbcfe8');
    grad.addColorStop(1, '#db2777');
    ctx.fillStyle = grad;
    
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.quadraticCurveTo(16, -16, 16, 0);
    ctx.quadraticCurveTo(16, 16, 0, 16);
    ctx.quadraticCurveTo(-16, 16, -16, 0);
    ctx.quadraticCurveTo(-16, -16, 0, -16);
    ctx.closePath();
    ctx.fill();
  } else if (theme === 'floating_hearts') {
    // Crystalline faceted heart structure
    ctx.translate(32, 32);
    
    const drawFacet = (p1, p2, p3, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.lineTo(p3[0], p3[1]);
      ctx.closePath();
      ctx.fill();
    };

    const topCenter = [0, -10];
    const leftPeak = [-18, -18];
    const rightPeak = [18, -18];
    const bottomTip = [0, 22];
    const centerNode = [0, -2];
    const midLeft = [-20, 0];
    const midRight = [20, 0];

    drawFacet(topCenter, leftPeak, centerNode, '#f472b6'); 
    drawFacet(topCenter, rightPeak, centerNode, '#f43f5e'); 
    drawFacet(leftPeak, midLeft, centerNode, '#db2777'); 
    drawFacet(rightPeak, midRight, centerNode, '#be185d'); 
    drawFacet(midLeft, bottomTip, centerNode, '#9d174d'); 
    drawFacet(midRight, bottomTip, centerNode, '#831843'); 

    // White shiny borders
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(topCenter[0], topCenter[1]);
    ctx.lineTo(leftPeak[0], leftPeak[1]);
    ctx.lineTo(midLeft[0], midLeft[1]);
    ctx.lineTo(bottomTip[0], bottomTip[1]);
    ctx.lineTo(midRight[0], midRight[1]);
    ctx.lineTo(rightPeak[0], rightPeak[1]);
    ctx.closePath();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerNode[0], centerNode[1]);
    ctx.lineTo(topCenter[0], topCenter[1]);
    ctx.moveTo(centerNode[0], centerNode[1]);
    ctx.lineTo(leftPeak[0], leftPeak[1]);
    ctx.moveTo(centerNode[0], centerNode[1]);
    ctx.lineTo(rightPeak[0], rightPeak[1]);
    ctx.moveTo(centerNode[0], centerNode[1]);
    ctx.lineTo(midLeft[0], midLeft[1]);
    ctx.moveTo(centerNode[0], centerNode[1]);
    ctx.lineTo(midRight[0], midRight[1]);
    ctx.moveTo(centerNode[0], centerNode[1]);
    ctx.lineTo(bottomTip[0], bottomTip[1]);
    ctx.stroke();
  } else if (theme === 'confetti') {
    // White rounded rectangle (color from vertex colors)
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    const x = 14, y = 16, w = 36, h = 32, r = 10;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function updateParticles(deltaMs) {
  if (!particleSystem) return;

  const geom = particleSystem.geometry;
  const positions = geom.attributes.position.array;
  const vels = particleSystem.userData.velocities;
  const customs = particleSystem.userData.customData;
  const theme = particleSystem.userData.theme;
  const count = customs.length;
  const deltaSec = deltaMs / 1000;

  for (let i = 0; i < count; i++) {
    positions[i * 3 + 1] += vels[i].y * deltaSec;
    customs[i].phase += customs[i].swaySpeed * deltaSec;
    positions[i * 3] += Math.sin(customs[i].phase) * 0.15 * deltaSec;
    if (theme === 'confetti') {
      // extra flutter
      positions[i * 3] += vels[i].x * deltaSec;
      positions[i * 3 + 2] += vels[i].z * deltaSec;
      vels[i].y -= 0.35 * deltaSec;
      vels[i].x *= 0.995;
      vels[i].y *= 0.998;
      vels[i].z *= 0.995;
    }

    if (theme === 'floating_hearts') {
      if (positions[i * 3 + 1] > 3.5) {
        positions[i * 3 + 1] = -3.5;
        positions[i * 3] = (Math.random() - 0.5) * 3.5;
      }
    } else {
      if (positions[i * 3 + 1] < -3.5) {
        positions[i * 3 + 1] = 3.5;
        positions[i * 3] = (Math.random() - 0.5) * 3.5;
      }
    }
  }

  geom.attributes.position.needsUpdate = true;
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
  const exportLayout = { width: renderer.domElement.width, height: renderer.domElement.height, aspect: camera.aspect };
  renderer.setPixelRatio(1);
  renderer.setSize(EXPORT_CANVAS_SIZE, EXPORT_CANVAS_SIZE, false);
  camera.aspect = 1;
  camera.updateProjectionMatrix();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const canvasStream = renderer.domElement.captureStream(30);
  let finalStream = canvasStream;
  let audioContext, audioSource, audioDestination, audioNode;

  if (withAudio) {
    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      audioDestination = audioContext.createMediaStreamDestination();
      
      // Initialize synthesized wedding BGM generator based on choice
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

  // Setup MediaRecorder
  // Prefer WebM for broad, reliable support (Playwright/headless often yields tiny/invalid MP4 blobs).
  let mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm';
  }

  try {
    mediaRecorder = new MediaRecorder(finalStream, {
      mimeType,
      videoBitsPerSecond: 8_000_000 // Higher bitrate to avoid tiny outputs
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
      renderer.setSize(exportLayout.width, exportLayout.height, false);
      camera.aspect = exportLayout.aspect;
      camera.updateProjectionMatrix();
      exportBtn.removeAttribute('disabled');
      resetBtn.removeAttribute('disabled');
      recordingStatus.classList.add('hidden');
      alert("marriage.mp4 홀로그램 비디오 다운로드가 완료되었습니다!");
    };

    if (fanRuntime) {
      fanRuntime.timelineStart = performance.now();
      fanRuntime.appliedTextureStep = -1;
    }
    cubeGroup.rotation.set(0, 0.38, 0);
    cubeGroup.scale.setScalar(0.58);
    const getInitialFaceCount = () => {
      const effect = state.settings.presentationEffectId || 'cube_focus';
      if (effect === 'cube_focus') return 6;
      if (effect === 'book_spread') return 2;
      if (effect === 'turntable') return 4;
      if (effect === 'orbit_gallery') return 5;
      if (effect === 'album_flip') return 2;
      return 6;
    };
    const initFaceCount = getInitialFaceCount();
    state.nextImageIndex = initFaceCount;

    // 녹화 시작 전 초기 이미지 상태로 모든 텍스처 환원
    const loader = new THREE.TextureLoader();
    cubeFaces.forEach((face) => {
      face.canSwap = true;
      if (face.faceIndex < initFaceCount && state.processedImages[face.faceIndex]) {
        const imgData = state.processedImages[face.faceIndex];
        const innerTex = loader.load(imgData.url);
        const bgTex = loader.load(imgData.backgroundPlateUrl);

        if (face.innerMesh.material.map) face.innerMesh.material.map.dispose();
        face.innerMesh.material.map = innerTex;
        face.innerMesh.material.needsUpdate = true;

        if (face.bgMesh.material.map) face.bgMesh.material.map.dispose();
        face.bgMesh.material.map = bgTex;
        face.bgMesh.material.needsUpdate = true;
      }
    });
    
    // 100ms 웜업 후 녹화 시작 (프레임 드랍 및 시작 끊김 현상 해결)
    setTimeout(async () => {
      if (audioContext) {
        try {
          await audioContext.resume();
        } catch (_) {}
      }
      
      state.recordingStartTime = performance.now();
      // Emit chunks periodically so the final blob isn't empty on some Chromium builds.
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
    renderer.setSize(exportLayout.width, exportLayout.height, false);
    camera.aspect = exportLayout.aspect;
    camera.updateProjectionMatrix();
    exportBtn.removeAttribute('disabled');
    resetBtn.removeAttribute('disabled');
    recordingStatus.classList.add('hidden');
  }
}
