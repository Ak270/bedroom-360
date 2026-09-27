import * as THREE from 'three';
import { FLOOR, PALETTE } from '../config/room.config';

/** Deterministic PRNG so procedural textures look the same on every load. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, color: boolean, anisotropy: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

export interface FloorTextures {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  /** Metres covered by one repeat of the texture. */
  span: number;
}

/**
 * Composes a 4 x 4 block of 0.8 m vitrified tiles from the marble photo:
 * each tile takes a different crop/rotation so the veins never line up,
 * tinted to the warm grey of REF-D, separated by 2 mm dark grout.
 */
export function makeFloorTextures(marblePhoto: HTMLImageElement, anisotropy: number): FloorTextures {
  const marble = tintByLuminance(marblePhoto, PALETTE.floorBase, FLOOR.veinContrast, 2048);
  const px = FLOOR.canvasPx;
  const n = FLOOR.tilesPerCanvas;
  const tilePx = px / n;
  const span = FLOOR.tile * n;
  const groutPx = Math.max(1.5, (FLOOR.grout / span) * px);
  const rand = rng(17);

  const [c, ctx] = canvas(px);
  const [rc, rctx] = canvas(px / 2);
  const [bc, bctx] = canvas(px / 2);
  rctx.fillStyle = '#fff';
  bctx.fillStyle = '#fff';
  bctx.fillRect(0, 0, bc.width, bc.height);

  const src = Math.min(marble.width, marble.height);
  const crop = src * 0.55;
  for (let ty = 0; ty < n; ty++) {
    for (let tx = 0; tx < n; tx++) {
      const sx = rand() * (src - crop);
      const sy = rand() * (src - crop);
      const rot = Math.floor(rand() * 4) * (Math.PI / 2);
      ctx.save();
      ctx.translate(tx * tilePx + tilePx / 2, ty * tilePx + tilePx / 2);
      ctx.rotate(rot);
      ctx.drawImage(marble, sx, sy, crop, crop, -tilePx / 2, -tilePx / 2, tilePx, tilePx);
      ctx.restore();
      // Per-tile shade + polish variation, like real vitrified batches.
      const shade = 0.97 + rand() * 0.06;
      ctx.fillStyle = `rgba(${shade > 1 ? 255 : 0},${shade > 1 ? 255 : 0},${shade > 1 ? 255 : 0},${Math.abs(1 - shade)})`;
      ctx.fillRect(tx * tilePx, ty * tilePx, tilePx, tilePx);
      const r = Math.round((0.12 + rand() * 0.07) * 255);
      rctx.fillStyle = `rgb(${r},${r},${r})`;
      rctx.fillRect((tx * tilePx) / 2, (ty * tilePx) / 2, tilePx / 2, tilePx / 2);
    }
  }
  // Grout: boundaries sit on the canvas edges too, so repeats stay seamless.
  const grout = (g: CanvasRenderingContext2D, scale: number, style: string) => {
    g.fillStyle = style;
    const w = (groutPx * scale) / 2;
    const size = px * scale;
    for (let i = 0; i <= n; i++) {
      const p = i * tilePx * scale;
      g.fillRect(p - w, 0, w * 2, size);
      g.fillRect(0, p - w, size, w * 2);
    }
  };
  grout(ctx, 1, PALETTE.grout);
  grout(rctx, 0.5, 'rgb(200,200,200)');
  grout(bctx, 0.5, '#000');

  return {
    map: toTexture(c, true, anisotropy),
    roughnessMap: toTexture(rc, false, anisotropy),
    bumpMap: toTexture(bc, false, anisotropy),
    span,
  };
}

/**
 * Re-colours a photo texture by its luminance so its mean lands exactly on
 * `hex` while keeping the grain/veins. `contrast` scales the deviation from
 * the mean (0 = flat colour, 1 = original contrast).
 */
export function tintByLuminance(img: CanvasImageSource & { width: number; height: number }, hex: string, contrast: number, size = 1024): HTMLCanvasElement {
  const [c, ctx] = canvas(size);
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size);
  const px = data.data;
  const n = px.length / 4;
  const lum = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const l = 0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2];
    lum[i] = l;
    sum += l;
  }
  const mean = sum / n || 1;
  // Canvas pixels are sRGB, so read the hex back in sRGB (THREE.Color stores linear).
  const col = new THREE.Color(hex).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  const r = col.r * 255, g = col.g * 255, b = col.b * 255;
  for (let i = 0; i < n; i++) {
    const k = 1 + (lum[i] / mean - 1) * contrast;
    px[i * 4] = r * k;
    px[i * 4 + 1] = g * k;
    px[i * 4 + 2] = b * k;
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

export function tintedTexture(img: CanvasImageSource & { width: number; height: number }, hex: string, contrast: number, anisotropy: number, size = 1024): THREE.CanvasTexture {
  return toTexture(tintByLuminance(img, hex, contrast, size), true, anisotropy);
}

/**
 * Alpha mask of foliage for the sun gobo: a few branches entering from the
 * top and one side, each carrying clusters of pointed leaves.
 */
export function makeLeafGobo(coverage: number): THREE.CanvasTexture {
  const size = 1024;
  const [c, ctx] = canvas(size);
  const rand = rng(91);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  const leaf = (x: number, y: number, len: number, ang: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * 0.5, -len * 0.28, len, 0);
    ctx.quadraticCurveTo(len * 0.5, len * 0.28, 0, 0);
    ctx.fill();
    ctx.restore();
  };
  const branches = 7;
  const leavesPerBranch = Math.round(90 * coverage);
  for (let b = 0; b < branches; b++) {
    // Branches start from the top edge or the north side and droop inwards.
    let x = b % 2 === 0 ? rand() * size : 0;
    let y = b % 2 === 0 ? 0 : rand() * size * 0.7;
    let ang = b % 2 === 0 ? Math.PI / 2 + (rand() - 0.5) * 0.9 : (rand() - 0.5) * 0.8;
    ctx.lineWidth = 6;
    for (let i = 0; i < leavesPerBranch; i++) {
      const step = 9 + rand() * 6;
      const nx = x + Math.cos(ang) * step;
      const ny = y + Math.sin(ang) * step;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(nx, ny);
      ctx.stroke();
      x = nx;
      y = ny;
      ang += (rand() - 0.5) * 0.35;
      ctx.lineWidth = Math.max(1.5, ctx.lineWidth * 0.985);
      const side = rand() < 0.5 ? -1 : 1;
      leaf(x, y, 34 + rand() * 30, ang + side * (0.6 + rand() * 0.7));
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}
