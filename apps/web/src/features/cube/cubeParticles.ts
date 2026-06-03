import * as THREE from "three";

export type ParticleThemeId =
  | "gold_dust"
  | "white_petals"
  | "floating_hearts"
  | "confetti"
  | "none";

interface ParticleState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  phase: number;
  swaySpeed: number;
  swayWidth: number;
}

export interface CubeParticlesSystem {
  points: THREE.Points;
  update: (deltaMs: number) => void;
  dispose: () => void;
}

function createGoldDustTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255, 235, 170, 1.0)");
  grad.addColorStop(0.2, "rgba(255, 215, 0, 0.9)");
  grad.addColorStop(0.6, "rgba(230, 160, 10, 0.3)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createPetalTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 64, 64);

  const grad = ctx.createLinearGradient(16, 16, 48, 48);
  grad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
  grad.addColorStop(0.5, "rgba(255, 220, 232, 0.85)");
  grad.addColorStop(1, "rgba(255, 192, 203, 0.4)");
  ctx.fillStyle = grad;

  ctx.beginPath();
  ctx.moveTo(32, 8);
  ctx.quadraticCurveTo(56, 16, 48, 48);
  ctx.quadraticCurveTo(32, 56, 16, 48);
  ctx.quadraticCurveTo(8, 16, 32, 8);
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createHeartTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 64, 64);

  // Facet Vertices for Crystal/Polygonal Heart
  const p = {
    topCenter: { x: 32, y: 22 },
    topLeftLobe: { x: 18, y: 8 },
    topRightLobe: { x: 46, y: 8 },
    leftEdge: { x: 6, y: 24 },
    rightEdge: { x: 58, y: 24 },
    midCenter: { x: 32, y: 38 },
    bottomTip: { x: 32, y: 60 }
  };

  const drawFacet = (v1: {x:number,y:number}, v2: {x:number,y:number}, v3: {x:number,y:number}, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(v1.x, v1.y);
    ctx.lineTo(v2.x, v2.y);
    ctx.lineTo(v3.x, v3.y);
    ctx.closePath();
    ctx.fill();
  };

  // Facets with different gradients/colors to create 3D gemstone refraction look
  // Left top outer facet (Soft pastel pink highlight)
  drawFacet(p.topCenter, p.topLeftLobe, p.leftEdge, "rgba(255, 195, 215, 0.95)");
  // Right top outer facet (Light pink highlight)
  drawFacet(p.topCenter, p.topRightLobe, p.rightEdge, "rgba(255, 150, 185, 0.95)");
  // Center left facet (Medium magenta pink)
  drawFacet(p.topCenter, p.leftEdge, p.midCenter, "rgba(240, 95, 145, 0.95)");
  // Center right facet (Slightly darker pink-purple)
  drawFacet(p.topCenter, p.rightEdge, p.midCenter, "rgba(220, 70, 120, 0.95)");
  // Lower left facet (Vibrant rose red)
  drawFacet(p.leftEdge, p.bottomTip, p.midCenter, "rgba(255, 60, 115, 0.95)");
  // Lower right facet (Deep violet ruby)
  drawFacet(p.rightEdge, p.bottomTip, p.midCenter, "rgba(195, 48, 95, 0.95)");

  // White diamond shine wireframes for polygonal polygon feel
  ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
  ctx.lineWidth = 1.0;

  const drawLine = (v1: {x:number,y:number}, v2: {x:number,y:number}) => {
    ctx.beginPath();
    ctx.moveTo(v1.x, v1.y);
    ctx.lineTo(v2.x, v2.y);
    ctx.stroke();
  };

  drawLine(p.topCenter, p.topLeftLobe);
  drawLine(p.topCenter, p.topRightLobe);
  drawLine(p.topCenter, p.leftEdge);
  drawLine(p.topCenter, p.rightEdge);
  drawLine(p.topCenter, p.midCenter);
  drawLine(p.leftEdge, p.midCenter);
  drawLine(p.rightEdge, p.midCenter);
  drawLine(p.leftEdge, p.bottomTip);
  drawLine(p.rightEdge, p.bottomTip);
  drawLine(p.midCenter, p.bottomTip);
  drawLine(p.topLeftLobe, p.leftEdge);
  drawLine(p.topRightLobe, p.rightEdge);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createConfettiTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 32, 32);
  // Simple rounded rectangle with subtle highlight; per-particle color comes from vertex colors.
  ctx.fillStyle = "rgba(255,255,255,1)";
  ctx.beginPath();
  const r = 6;
  ctx.moveTo(r, 6);
  ctx.arcTo(26, 6, 26, 26, r);
  ctx.arcTo(26, 26, 6, 26, r);
  ctx.arcTo(6, 26, 6, 6, r);
  ctx.arcTo(6, 6, 26, 6, r);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 1;
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createCubeParticles(
  theme: ParticleThemeId,
  count: number = 80
): CubeParticlesSystem | null {
  if (theme === "none") {
    return null;
  }

  let texture: THREE.Texture;
  let defaultSize = 0.35;
  let baseColor = new THREE.Color(0xffffff);

  if (theme === "gold_dust") {
    texture = createGoldDustTexture();
    defaultSize = 0.28;
    baseColor = new THREE.Color(0xffd700);
  } else if (theme === "white_petals") {
    texture = createPetalTexture();
    defaultSize = 0.45;
    baseColor = new THREE.Color(0xfff0f5);
  } else if (theme === "floating_hearts") {
    texture = createHeartTexture();
    defaultSize = 0.5;
    baseColor = new THREE.Color(0xffb6c1);
  } else if (theme === "confetti") {
    texture = createConfettiTexture();
    defaultSize = 0.38;
  } else {
    return null;
  }

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);

  const particles: ParticleState[] = [];
  const confettiPalette =
    theme === "confetti"
      ? [
          new THREE.Color("#ff4d6d"),
          new THREE.Color("#ffb703"),
          new THREE.Color("#4cc9f0"),
          new THREE.Color("#7c3aed"),
          new THREE.Color("#34d399"),
          new THREE.Color("#f97316"),
        ]
      : null;

  const spawnParticle = (index: number, isInitial = false) => {
    // Spawning around the cube (CUBE_EDGE_LENGTH is approx 1.6, so spread in -3 to 3 box)
    const x = (Math.random() - 0.5) * 6;
    const y = isInitial
      ? (Math.random() - 0.5) * 6
      : theme === "white_petals"
        ? 3.5 // petals fall from top
        : theme === "floating_hearts"
          ? -3.5 // hearts float from bottom
          : (Math.random() - 0.5) * 6; // gold dust is random

    const z = (Math.random() - 0.5) * 6;

    const vx = (Math.random() - 0.5) * 0.4;
    const vy =
      theme === "white_petals"
        ? -0.5 - Math.random() * 0.4 // falling
        : theme === "floating_hearts"
          ? 0.5 + Math.random() * 0.4 // rising
          : theme === "confetti"
            ? -0.65 - Math.random() * 0.55 // confetti falls with some weight
          : (Math.random() - 0.5) * 0.3; // gold dust drifts slowly

    const vz = (Math.random() - 0.5) * 0.4;

    const maxLife = 3000 + Math.random() * 3000; // 3-6s
    const life = isInitial ? Math.random() * maxLife : 0;
    const size = defaultSize * (0.6 + Math.random() * 0.8);
    const phase = Math.random() * Math.PI * 2;
    const swaySpeed = 1.2 + Math.random() * 2.0;
    const swayWidth = 0.15 + Math.random() * 0.35;

    particles[index] = {
      x,
      y,
      z,
      vx,
      vy,
      vz,
      life,
      maxLife,
      size,
      phase,
      swaySpeed,
      swayWidth,
    };

    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;

    if (theme === "confetti" && confettiPalette) {
      const c = confettiPalette[index % confettiPalette.length];
      colors[index * 3] = c.r;
      colors[index * 3 + 1] = c.g;
      colors[index * 3 + 2] = c.b;
    }
  };

  // Initialize particles
  for (let i = 0; i < count; i += 1) {
    spawnParticle(i, true);
  }

  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: defaultSize,
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geometry, material);

  const update = (deltaMs: number) => {
    const deltaSec = deltaMs / 1000;
    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const colAttr = geometry.getAttribute("color") as THREE.BufferAttribute;

    for (let i = 0; i < count; i += 1) {
      const p = particles[i];
      p.life += deltaMs;

      if (p.life >= p.maxLife) {
        spawnParticle(i, false);
        continue;
      }

      // Physics update
      let currentX = p.x;
      let currentY = p.y;
      let currentZ = p.z;

      if (theme === "white_petals") {
        currentY += p.vy * deltaSec;
        // swaying side to side as they fall
        currentX = p.x + Math.sin(p.phase + (p.life / 1000) * p.swaySpeed) * p.swayWidth;
        currentZ = p.z + Math.cos(p.phase * 0.8 + (p.life / 1000) * p.swaySpeed) * p.swayWidth;
      } else if (theme === "floating_hearts") {
        currentY += p.vy * deltaSec;
        // floating upward with a sway
        currentX = p.x + Math.sin(p.phase + (p.life / 1000) * p.swaySpeed) * p.swayWidth;
        currentZ = p.z + Math.cos(p.phase * 0.5 + (p.life / 1000) * p.swaySpeed) * (p.swayWidth * 0.5);
      } else if (theme === "confetti") {
        // Confetti: fall with side drift + a bit of turbulent flutter.
        p.vx += (Math.random() - 0.5) * 0.25 * deltaSec;
        p.vz += (Math.random() - 0.5) * 0.25 * deltaSec;
        p.vy -= 0.35 * deltaSec; // gravity
        // mild drag
        p.vx *= 0.995;
        p.vy *= 0.998;
        p.vz *= 0.995;

        p.x += p.vx * deltaSec;
        p.y += p.vy * deltaSec;
        p.z += p.vz * deltaSec;
        currentX =
          p.x +
          Math.sin(p.phase + (p.life / 1000) * (p.swaySpeed * 2.1)) * (p.swayWidth * 0.6);
        currentY = p.y;
        currentZ =
          p.z +
          Math.cos(p.phase + (p.life / 1000) * (p.swaySpeed * 1.6)) * (p.swayWidth * 0.6);
      } else {
        // Gold dust drifts in all directions slowly
        p.x += p.vx * deltaSec;
        p.y += p.vy * deltaSec;
        p.z += p.vz * deltaSec;
        currentX = p.x;
        currentY = p.y;
        currentZ = p.z;
      }

      posAttr.setXYZ(i, currentX, currentY, currentZ);

      // Shimmer and fade in/out
      const lifeRatio = p.life / p.maxLife;
      let alpha = 1.0;
      if (lifeRatio < 0.15) {
        alpha = lifeRatio / 0.15; // Fade-in
      } else if (lifeRatio > 0.75) {
        alpha = 1.0 - (lifeRatio - 0.75) / 0.25; // Fade-out
      }

      // Shimmer/twinkle effect for gold dust
      if (theme === "gold_dust") {
        const shimmer = 0.6 + 0.4 * Math.sin(p.phase + (p.life / 1000) * 8.0);
        alpha *= shimmer;
      }

      // Apply additive color scaling (simulates opacity)
      if (theme === "confetti") {
        const r = colors[i * 3] ?? 1;
        const g = colors[i * 3 + 1] ?? 1;
        const b = colors[i * 3 + 2] ?? 1;
        colAttr.setXYZ(i, r * alpha, g * alpha, b * alpha);
      } else {
        colAttr.setXYZ(i, baseColor.r * alpha, baseColor.g * alpha, baseColor.b * alpha);
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  };

  const dispose = () => {
    geometry.dispose();
    material.dispose();
    texture.dispose();
  };

  return {
    points,
    update,
    dispose,
  };
}
