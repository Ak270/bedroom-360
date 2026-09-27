import * as THREE from 'three';
import { PALETTE, RUG } from '../config/room.config';
import { rng } from './canvasTextures';

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

export function tex(c: HTMLCanvasElement, color: boolean, repeat = true, anisotropy = 8): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

/** Height field (0..1, row-major) to a tangent-space normal map canvas. */
export function heightToNormal(h: Float32Array, w: number, hgt: number, strength: number): HTMLCanvasElement {
  const [c, ctx] = canvas(w, hgt);
  const img = ctx.createImageData(w, hgt);
  const at = (x: number, y: number) => h[((y + hgt) % hgt) * w + ((x + w) % w)];
  for (let y = 0; y < hgt; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255; // OpenGL convention (+Y up)
      img.data[i + 2] = (1 / len) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Embossed diamond quilting (coverlet). One tile = 4 x 4 diamonds. */
export function quiltNormal(): THREE.CanvasTexture {
  const s = 512;
  const h = new Float32Array(s * s);
  const rand = rng(7);
  const n = 4;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = ((x + y) / s) * n;
      const v = ((x - y + s) / s) * n;
      const fu = u - Math.floor(u);
      const fv = v - Math.floor(v);
      // Puffy cells, sharp stitched valleys.
      const cell = Math.pow(Math.sin(Math.PI * fu) * Math.sin(Math.PI * fv), 0.45);
      h[y * s + x] = cell + (rand() - 0.5) * 0.04;
    }
  }
  return tex(heightToNormal(h, s, s, 3.5), false);
}

/** Bouclé: dense random loops (little domes) instead of a woven grid. */
export function boucleNormal(): THREE.CanvasTexture {
  const s = 256;
  const h = new Float32Array(s * s);
  const rand = rng(17);
  for (let k = 0; k < 1400; k++) {
    const cx = rand() * s, cy = rand() * s, r = 2.5 + rand() * 4;
    for (let y = Math.floor(-r); y <= r; y++)
      for (let x = Math.floor(-r); x <= r; x++) {
        const d = Math.hypot(x, y) / r;
        if (d > 1) continue;
        const i = ((Math.floor(cy + y) + s) % s) * s + ((Math.floor(cx + x) + s) % s);
        // Loop profile: a ring (yarn curl) rather than a solid dome.
        h[i] = Math.max(h[i], Math.sin(Math.PI * Math.min(1, d * 1.15)) * (0.6 + rand() * 0.4));
      }
  }
  return tex(heightToNormal(h, s, s, 2.2), false);
}

/** Fine knit/rib for the throw: horizontal ribs + fibre noise. */
export function knitNormal(): THREE.CanvasTexture {
  const s = 256;
  const h = new Float32Array(s * s);
  const rand = rng(11);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const rib = Math.abs(Math.sin((y / s) * Math.PI * 16));
      const stitch = Math.abs(Math.sin(((x + (Math.floor(y / 16) % 2) * 8) / s) * Math.PI * 32));
      h[y * s + x] = rib * 0.7 + stitch * 0.3 + (rand() - 0.5) * 0.15;
    }
  }
  return tex(heightToNormal(h, s, s, 2.5), false);
}

/** Rug: cream low-pile field with a blue/beige geometric border (REF-A). */
export function rugTextures(anisotropy: number): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const pxPerM = 700;
  const W = Math.round(RUG.w * pxPerM);
  const H = Math.round(RUG.d * pxPerM);
  const [c, ctx] = canvas(W, H);
  const rand = rng(23);
  ctx.fillStyle = '#E9DFCB';
  ctx.fillRect(0, 0, W, H);
  // Soft pile mottling.
  for (let i = 0; i < 9000; i++) {
    const x = rand() * W, y = rand() * H, r = 2 + rand() * 10;
    ctx.fillStyle = rand() < 0.5 ? 'rgba(255,250,240,0.10)' : 'rgba(170,150,120,0.08)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const b = RUG.border * pxPerM;
  const inset = 0.05 * pxPerM;
  // Border band: beige ground, blue diamond chain between two blue rules.
  ctx.fillStyle = '#D5C4A4';
  ctx.fillRect(inset, inset, W - 2 * inset, b);
  ctx.fillRect(inset, H - inset - b, W - 2 * inset, b);
  ctx.fillRect(inset, inset, b, H - 2 * inset);
  ctx.fillRect(W - inset - b, inset, b, H - 2 * inset);
  ctx.fillStyle = '#E9DFCB';
  ctx.fillRect(inset + b, inset + b, W - 2 * (inset + b), H - 2 * (inset + b));
  ctx.strokeStyle = PALETTE.dustyBlue;
  ctx.lineWidth = 6;
  for (const k of [0.08, 0.92]) {
    const o = inset + b * k;
    ctx.strokeRect(o, o, W - 2 * o, H - 2 * o);
  }
  const diamonds = (x0: number, y0: number, x1: number, y1: number) => {
    const horizontal = Math.abs(x1 - x0) > Math.abs(y1 - y0);
    const len = horizontal ? x1 - x0 : y1 - y0;
    const size = b * 0.34;
    const count = Math.floor(len / (size * 1.6));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const cx = horizontal ? x0 + len * t : x0;
      const cy = horizontal ? y0 : y0 + len * t;
      ctx.fillStyle = i % 2 ? PALETTE.dustyBlue : '#2F4D66';
      ctx.beginPath();
      ctx.moveTo(cx, cy - size);
      ctx.lineTo(cx + size, cy);
      ctx.lineTo(cx, cy + size);
      ctx.lineTo(cx - size, cy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#E9DFCB';
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  const m = inset + b / 2;
  diamonds(m + b, m, W - m - b, m);
  diamonds(m + b, H - m, W - m - b, H - m);
  diamonds(m, m + b, m, H - m - b);
  diamonds(W - m, m + b, W - m, H - m - b);
  // Fringe-free bound edge.
  ctx.strokeStyle = '#B9A785';
  ctx.lineWidth = inset * 0.5;
  ctx.strokeRect(inset * 0.25, inset * 0.25, W - inset * 0.5, H - inset * 0.5);

  // Pile normal: tileable fibre noise (repeat ~0.25 m).
  const s = 256;
  const h = new Float32Array(s * s);
  const r2 = rng(29);
  for (let i = 0; i < s * s; i++) h[i] = r2();
  for (let pass = 0; pass < 2; pass++) {
    const o = h.slice();
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        let sum = 0;
        for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) sum += o[((y + j + s) % s) * s + ((x + k + s) % s)];
        h[y * s + x] = sum / 9;
      }
  }
  const map = tex(c, true, false, anisotropy);
  const normalMap = tex(heightToNormal(h, s, s, 6), false);
  normalMap.repeat.set(RUG.w / 0.25, RUG.d / 0.25);
  return { map, normalMap };
}

/** Hex mesh alpha for the chair back (white = solid; the woven field is ~45% opaque). */
export function hexMeshAlpha(): THREE.CanvasTexture {
  const s = 256;
  const [c, ctx] = canvas(s);
  ctx.fillStyle = '#737373';
  ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 5;
  const r = 16;
  const w = Math.sqrt(3) * r;
  for (let row = -1; row < s / (1.5 * r) + 1; row++) {
    for (let col = -1; col < s / w + 1; col++) {
      const cx = col * w + (row % 2 ? w / 2 : 0);
      const cy = row * 1.5 * r;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
        if (k === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  return tex(c, false);
}

type ArtKind = 'mountains' | 'sun' | 'leaf';

/** Muted beige/blue prints painted on canvas (REF-A). */
export function artTexture(kind: ArtKind, anisotropy: number): THREE.CanvasTexture {
  const W = 480, H = 640;
  const [c, ctx] = canvas(W, H);
  const rand = rng(kind === 'mountains' ? 31 : kind === 'sun' ? 37 : 41);
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#EFE5D3');
  sky.addColorStop(1, '#E3D5BD');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);
  // Paper grain.
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = `rgba(120,100,70,${rand() * 0.05})`;
    ctx.fillRect(rand() * W, rand() * H, 1.5, 1.5);
  }
  const ridge = (base: number, amp: number, color: string, jag: number, seed: number) => {
    const r = rng(seed);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    let y = base;
    for (let x = 0; x <= W; x += W / jag) {
      y = base - amp * (0.5 + 0.5 * Math.sin(x * 0.012 + seed)) - r() * amp * 0.5;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  };
  if (kind === 'mountains') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (const [x, y, s] of [[120, 150, 1], [330, 110, 0.8], [260, 210, 0.6]] as const) {
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.ellipse(x + (k - 2) * 26 * s, y + Math.abs(k - 2) * 6, 36 * s, 18 * s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ridge(360, 110, '#A9B7C0', 9, 1);
    ridge(430, 90, '#7C93A4', 7, 2);
    ridge(500, 80, '#4F6F8E', 6, 3);
    ridge(575, 60, '#2E4C63', 8, 4);
  } else if (kind === 'sun') {
    ctx.fillStyle = '#D9894A';
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.36, 70, 0, Math.PI * 2);
    ctx.fill();
    ridge(430, 120, '#8FA3B3', 5, 5);
    ridge(500, 90, '#5C7A95', 6, 6);
    ridge(580, 70, '#2F4D66', 7, 7);
  } else {
    // Botanical: arching stem with alternate leaves.
    ctx.strokeStyle = '#6E5A44';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(W * 0.5, H * 0.92);
    ctx.quadraticCurveTo(W * 0.46, H * 0.5, W * 0.53, H * 0.12);
    ctx.stroke();
    for (let i = 0; i < 9; i++) {
      const t = 0.18 + i * 0.085;
      const y = H * (0.92 - t * 0.9);
      const x = W * (0.5 - 0.03 * Math.sin(t * 3));
      const side = i % 2 ? 1 : -1;
      const len = 120 * (1 - t * 0.55);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(side * (0.9 - t * 0.4) - Math.PI / 2 * 0);
      ctx.fillStyle = i % 3 === 0 ? '#5E4B38' : '#7A6450';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(side * len * 0.5, -len * 0.35, side * len, -len * 0.05);
      ctx.quadraticCurveTo(side * len * 0.5, len * 0.12, 0, 0);
      ctx.fill();
      ctx.restore();
    }
  }
  return tex(c, true, false, anisotropy);
}

/** Book spines: a few muted cloth colours with a title band. */
export function bookSpineTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 128);
  const cols = ['#6F5B45', '#9A8466', '#3E5A70', '#C7B89C', '#7C4B3A', '#50626B', '#A89A7E', '#2F3E4A'];
  cols.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(i * 64, 0, 64, 128);
    ctx.fillStyle = 'rgba(240,230,210,0.55)';
    ctx.fillRect(i * 64 + 10, 30, 44, 6);
    ctx.fillRect(i * 64 + 16, 90, 32, 3);
  });
  return tex(c, true, false);
}

export function clockFaceTexture(): THREE.CanvasTexture {
  const s = 256;
  const [c, ctx] = canvas(s);
  ctx.fillStyle = '#F4EEE2';
  ctx.fillRect(0, 0, s, s);
  ctx.translate(s / 2, s / 2);
  ctx.fillStyle = '#2B2621';
  for (let i = 0; i < 12; i++) {
    ctx.save();
    ctx.rotate((i / 12) * Math.PI * 2);
    ctx.fillRect(-3, -110, 6, i % 3 === 0 ? 24 : 12);
    ctx.restore();
  }
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#2B2621';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(-2.2) * 55, Math.sin(-2.2) * 55);
  ctx.stroke();
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(-0.4) * 85, Math.sin(-0.4) * 85);
  ctx.stroke();
  return tex(c, true, false);
}

export function laptopScreenTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 320);
  const g = ctx.createLinearGradient(0, 0, 512, 320);
  g.addColorStop(0, '#2C4A63');
  g.addColorStop(0.6, '#6E8FA8');
  g.addColorStop(1, '#E3C79B');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 320);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(0, 0, 512, 14);
  ctx.fillStyle = 'rgba(250,248,240,0.92)';
  ctx.fillRect(70, 60, 300, 200);
  ctx.fillStyle = 'rgba(60,70,80,0.5)';
  for (let i = 0; i < 9; i++) ctx.fillRect(90, 85 + i * 18, 150 + ((i * 53) % 110), 6);
  return tex(c, true, false);
}

/** Radial falloff used for LED halos and lamp glow cards. */
export function glowTexture(): THREE.CanvasTexture {
  const s = 256;
  const [c, ctx] = canvas(s);
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return tex(c, true, false);
}

/** Voile: faint woven noise alpha for the sheer. */
export function voileAlpha(): THREE.CanvasTexture {
  const s = 256;
  const [c, ctx] = canvas(s);
  const img = ctx.createImageData(s, s);
  const rand = rng(53);
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const weave = (x % 4 === 0 ? 0.12 : 0) + (y % 4 === 0 ? 0.12 : 0);
      const v = Math.min(1, 0.42 + weave + (rand() - 0.5) * 0.1);
      const i = (y * s + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255;
      img.data[i + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return tex(c, false);
}

/** Brushed metal: fine streaks along U (brass fittings, lamp bases). */
export function brushedNormal(): THREE.CanvasTexture {
  const s = 256;
  const h = new Float32Array(s * s);
  const rand = rng(61);
  const rows = new Float32Array(s);
  for (let y = 0; y < s; y++) rows[y] = rand();
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) h[y * s + x] = rows[y] * 0.8 + rows[(y + 1) % s] * 0.2 + (rand() - 0.5) * 0.05;
  return tex(heightToNormal(h, s, s, 1.2), false);
}

/** Powder coat / moulded plastic: soft orange-peel noise. */
export function orangePeelNormal(): THREE.CanvasTexture {
  const s = 256;
  const h = new Float32Array(s * s);
  const rand = rng(67);
  for (let i = 0; i < s * s; i++) h[i] = rand();
  for (let pass = 0; pass < 3; pass++) {
    const o = h.slice();
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        let sum = 0;
        for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) sum += o[((y + j + s) % s) * s + ((x + k + s) % s)];
        h[y * s + x] = sum / 9;
      }
  }
  return tex(heightToNormal(h, s, s, 5), false);
}

/**
 * Leaf blade colour map in leaf UV space (u across, v base->tip): darker
 * edges, lighter midrib and paired side veins, slight tip yellowing.
 */
export function leafTexture(hex: string): THREE.CanvasTexture {
  const w = 128, h = 256;
  const [c, ctx] = canvas(w, h);
  const base = new THREE.Color(hex).getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  const rgb = (k: number, warm = 0) =>
    `rgb(${Math.min(255, base.r * 255 * k + warm * 30)},${Math.min(255, base.g * 255 * k + warm * 12)},${Math.min(255, base.b * 255 * k)})`;
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, rgb(0.72));
  g.addColorStop(0.5, rgb(1.08));
  g.addColorStop(1, rgb(0.72));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const tip = ctx.createLinearGradient(0, 0, 0, h);
  tip.addColorStop(0, 'rgba(0,0,0,0)');
  tip.addColorStop(1, 'rgba(0,0,0,0)');
  tip.addColorStop(0.08, 'rgba(210,190,90,0.18)'); // canvas y=0 is the tip (v=1)
  ctx.fillStyle = tip;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = rgb(1.35, 0.3);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w / 2, h);
  ctx.lineTo(w / 2, 0);
  ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = rgb(1.18, 0.15);
  for (let i = 1; i < 12; i++) {
    const y = h - (i / 12) * h;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(w / 2, y);
      ctx.quadraticCurveTo(w / 2 + s * w * 0.25, y - 10, w / 2 + s * w * 0.48, y - 26);
      ctx.stroke();
    }
  }
  return tex(c, true, false);
}
