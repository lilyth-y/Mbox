import type { FanBladeFrameId } from "./fanBladeFrame.js";

function roseCluster(x: number, y: number, rot: number, scale = 1): string {
  return `
    <g transform="translate(${x} ${y}) rotate(${rot}) scale(${scale})" opacity="0.92">
      <circle cx="0" cy="0" r="2.8" fill="#f4a4b4" />
      <circle cx="-1.6" cy="-1.2" r="1.5" fill="#f9c5d1" />
      <circle cx="1.5" cy="-1.1" r="1.4" fill="#efb0bc" />
      <circle cx="0" cy="1.6" r="1.3" fill="#e89aab" />
      <circle cx="0" cy="0" r="0.7" fill="#fff5f0" opacity="0.85" />
    </g>`;
}

function leafSprig(x: number, y: number, rot: number, scale = 1): string {
  return `
    <g transform="translate(${x} ${y}) rotate(${rot}) scale(${scale})" opacity="0.88">
      <ellipse cx="-1.2" cy="0" rx="2.4" ry="1" fill="#7fa87a" transform="rotate(-28)" />
      <ellipse cx="1.3" cy="0.2" rx="2.2" ry="0.95" fill="#94b890" transform="rotate(24)" />
      <circle cx="0" cy="0" r="0.55" fill="#dfe8d8" />
    </g>`;
}

function pearlDot(x: number, y: number, r = 1.1): string {
  return `
    <g transform="translate(${x} ${y})">
      <circle r="${r}" fill="#f5f7fa" />
      <circle r="${r * 0.45}" cx="${-r * 0.25}" cy="${-r * 0.25}" fill="#ffffff" opacity="0.95" />
    </g>`;
}

function goldSparkle(x: number, y: number): string {
  return `
    <g transform="translate(${x} ${y})" opacity="0.75">
      <path d="M0 -1.4 L0.35 0 L0 1.4 L-0.35 0 Z" fill="#f0d4a4" />
      <path d="M-1.4 0 L0 0.35 L1.4 0 L0 -0.35 Z" fill="#e8c892" />
    </g>`;
}

function starDot(x: number, y: number, scale = 1): string {
  return `
    <g transform="translate(${x} ${y}) scale(${scale})" opacity="0.85">
      <path d="M0 -1.6 L0.45 -0.45 L1.6 0 L0.45 0.45 L0 1.6 L-0.45 0.45 L-1.6 0 L-0.45 -0.45 Z" fill="#f5e6b8" />
    </g>`;
}

const ORNAMENT_BY_FRAME: Record<FanBladeFrameId, string> = {
  rose_gold_ring: `
    ${roseCluster(50, 6, 0, 1.15)}
    ${roseCluster(82, 18, 35, 0.95)}
    ${roseCluster(94, 50, 90, 1.05)}
    ${roseCluster(82, 82, 145, 0.95)}
    ${roseCluster(50, 94, 180, 1.1)}
    ${roseCluster(18, 82, -145, 0.95)}
    ${roseCluster(6, 50, -90, 1.05)}
    ${roseCluster(18, 18, -35, 0.95)}
    ${goldSparkle(50, 14)} ${goldSparkle(86, 50)} ${goldSparkle(50, 86)} ${goldSparkle(14, 50)}
    <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(223,179,134,0.22)" stroke-width="0.6" stroke-dasharray="2 3" />
  `,
  pearl_ring: `
    ${pearlDot(50, 7, 1.35)} ${pearlDot(73, 13, 1.05)} ${pearlDot(87, 27, 1.2)} ${pearlDot(93, 50, 1.35)}
    ${pearlDot(87, 73, 1.2)} ${pearlDot(73, 87, 1.05)} ${pearlDot(50, 93, 1.35)} ${pearlDot(27, 87, 1.05)}
    ${pearlDot(13, 73, 1.2)} ${pearlDot(7, 50, 1.35)} ${pearlDot(13, 27, 1.2)} ${pearlDot(27, 13, 1.05)}
    ${goldSparkle(50, 18)} ${goldSparkle(82, 50)} ${goldSparkle(50, 82)} ${goldSparkle(18, 50)}
  `,
  classic_black_ring: `
    <path d="M50 8 Q54 12 50 16 Q46 12 50 8" fill="#d4af5f" opacity="0.9" />
    <path d="M84 16 Q88 20 84 24 Q80 20 84 16" fill="#d4af5f" opacity="0.85" transform="rotate(45 84 20)" />
    <path d="M92 50 Q96 54 92 58 Q88 54 92 50" fill="#d4af5f" opacity="0.9" />
    <path d="M84 84 Q88 88 84 92 Q80 88 84 84" fill="#d4af5f" opacity="0.85" transform="rotate(45 84 88)" />
    <path d="M50 92 Q54 96 50 100 Q46 96 50 92" fill="#d4af5f" opacity="0.9" />
    <path d="M16 84 Q20 88 16 92 Q12 88 16 84" fill="#d4af5f" opacity="0.85" transform="rotate(45 16 88)" />
    <path d="M8 50 Q12 54 8 58 Q4 54 8 50" fill="#d4af5f" opacity="0.9" />
    <path d="M16 16 Q20 20 16 24 Q12 20 16 16" fill="#d4af5f" opacity="0.85" transform="rotate(45 16 20)" />
    ${goldSparkle(50, 12)} ${goldSparkle(88, 50)} ${goldSparkle(50, 88)} ${goldSparkle(12, 50)}
    <circle cx="50" cy="50" r="45.5" fill="none" stroke="rgba(212,175,95,0.35)" stroke-width="0.5" />
  `,
  sage_garden_ring: `
    ${leafSprig(50, 7, 0, 1.2)} ${leafSprig(78, 16, 40, 1)} ${roseCluster(92, 34, 70, 0.75)}
    ${leafSprig(94, 50, 90, 1.05)} ${roseCluster(92, 66, 110, 0.75)} ${leafSprig(78, 84, 140, 1)}
    ${leafSprig(50, 93, 180, 1.2)} ${leafSprig(22, 84, -140, 1)} ${roseCluster(8, 66, -110, 0.75)}
    ${leafSprig(6, 50, -90, 1.05)} ${roseCluster(8, 34, -70, 0.75)} ${leafSprig(22, 16, -40, 1)}
    <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(127,168,122,0.28)" stroke-width="0.55" stroke-dasharray="1.5 2.5" />
  `,
  royal_navy_ring: `
    ${starDot(50, 8, 1.1)} ${starDot(76, 16, 0.85)} ${starDot(90, 34, 0.95)} ${starDot(92, 50, 1.1)}
    ${starDot(90, 66, 0.95)} ${starDot(76, 84, 0.85)} ${starDot(50, 92, 1.1)} ${starDot(24, 84, 0.85)}
    ${starDot(10, 66, 0.95)} ${starDot(8, 50, 1.1)} ${starDot(10, 34, 0.95)} ${starDot(24, 16, 0.85)}
    <path d="M50 12 L52 16 L50 20 L48 16 Z" fill="#f5e6b8" opacity="0.75" />
    <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(212,175,95,0.25)" stroke-width="0.55" />
  `,
};

export function getFanBladeOrnamentMarkup(frameId: FanBladeFrameId): string {
  return ORNAMENT_BY_FRAME[frameId] ?? ORNAMENT_BY_FRAME.rose_gold_ring;
}

export function renderFanBladeOrnamentSvg(frameId: FanBladeFrameId): string {
  return `<svg class="fan-blade-ornaments" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${getFanBladeOrnamentMarkup(frameId)}</svg>`;
}
