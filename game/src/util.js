// Vice Harbor v7 — small shared helpers. Written fresh in-session for gta6-01.
import * as THREE from 'three';
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;

export function angleLerp(a, b, t) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * t;
}

export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// Canvas texture with glowing text (neon signs, labels, awnings).
export function textTexture(lines, opts = {}) {
  const w = opts.w || 512;
  const h = opts.h || 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = opts.bg || '#0a0618';
  g.fillRect(0, 0, w, h);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const color = opts.color || '#ff2e88';
  const font = opts.font || 'bold 64px Arial, sans-serif';
  g.font = font;
  g.shadowColor = color;
  g.shadowBlur = opts.glow ?? 26;
  g.fillStyle = color;
  const n = lines.length;
  lines.forEach((line, i) => {
    g.fillText(line, w / 2, h * ((i + 0.5) / n));
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Window texture for a building: lit windows on a dark facade, tinted by district.
export function windowsTexture(base, lit, rng, floors = 8, cols = 5) {
  const w = 128;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const cw = w / cols;
  const ch = h / floors;
  for (let f = 0; f < floors; f++) {
    for (let col = 0; col < cols; col++) {
      const on = rng() < 0.55;
      g.fillStyle = on ? lit : '#101018';
      g.globalAlpha = on ? 0.75 + rng() * 0.25 : 1;
      g.fillRect(col * cw + cw * 0.22, f * ch + ch * 0.25, cw * 0.56, ch * 0.5);
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Asphalt with a dashed centre line, tiled along a road.
export function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#33333e';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#3d3d48';
  for (let i = 0; i < 200; i++) {
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  g.fillStyle = '#d8c25a';
  g.fillRect(62, 8, 4, 44);
  g.fillRect(62, 72, 4, 44);
  g.fillStyle = '#e8e8e8';
  g.fillRect(6, 0, 3, 128);
  g.fillRect(119, 0, 3, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
