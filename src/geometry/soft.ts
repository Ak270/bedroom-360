import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rng } from '../materials/canvasTextures';

/** Cheap smooth 3D value noise (deterministic) for fabric wobble. */
export function noise3(seed = 1): (x: number, y: number, z: number) => number {
  const r = rng(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h: number) => ((h & 1) === 0 ? 1 : -1) * (0.5 + ((h >> 1) & 7) / 14);
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y, z) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    const xf = x - Math.floor(x), yf = y - Math.floor(y), zf = z - Math.floor(z);
    const u = fade(xf), v = fade(yf), w = fade(zf);
    const h = (i: number, j: number, k: number) => grad(perm[perm[perm[X + i] + Y + j] + Z + k]);
    const l = THREE.MathUtils.lerp;
    return l(
      l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v),
      l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v),
      w,
    );
  };
}

/** Rewrites UVs as planar metres (x,z for up-facing, else x/z + y) so tiled fabric keeps scale. */
export function planarUV(g: THREE.BufferGeometry, axis: 'xz' | 'xy' | 'zy' = 'xz'): THREE.BufferGeometry {
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const [u, v] = axis === 'xz' ? [x + y * 0.5, z + y * 0.5] : axis === 'xy' ? [x + z * 0.5, y] : [z + x * 0.5, y];
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * Upholstered block: rounded box whose faces bulge outwards (max at the face
 * centre) with a little noise, so it reads as padded fabric, not a crate.
 */
export function softBox(w: number, h: number, d: number, radius: number, bulge: number, seed = 1, segments = 6): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(w, h, d, segments, Math.min(radius, Math.min(w, h, d) / 2 - 1e-4));
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const n = noise3(seed);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ux = (2 * v.x) / w, uy = (2 * v.y) / h, uz = (2 * v.z) / d;
    // Bulge each axis by how central the vertex is on the two other axes.
    const fx = (1 - uy * uy) * (1 - uz * uz);
    const fy = (1 - ux * ux) * (1 - uz * uz);
    const fz = (1 - ux * ux) * (1 - uy * uy);
    const k = 1 + n(v.x * 7, v.y * 7, v.z * 7) * 0.25;
    v.x += Math.sign(v.x) * bulge * fx * k;
    v.y += Math.sign(v.y) * bulge * fy * k;
    v.z += Math.sign(v.z) * bulge * fz * k;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Pillow lying in XZ (w along X, d along Z, thickness h along Y): puffy
 * centre, pinched seams, softened corners and a slight random slump.
 */
export function pillowGeometry(w: number, d: number, h: number, seed = 1): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, 48, 32);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const n = noise3(seed);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    // Superellipse in plan (square-ish with rounded corners).
    const ax = Math.sign(v.x) * Math.pow(Math.abs(v.x), 0.5);
    const az = Math.sign(v.z) * Math.pow(Math.abs(v.z), 0.5);
    const px = ax * (w / 2);
    const pz = az * (d / 2);
    // Thickness tapers to a seam at the rim; corners pinch further ("ears").
    const rim = Math.max(Math.abs(ax), Math.abs(az));
    const corner = Math.abs(ax) * Math.abs(az);
    const profile = Math.sqrt(Math.max(0, 1 - Math.pow(rim, 6))) * (1 - 0.35 * Math.pow(corner, 3));
    // Crumple: low-frequency slump plus a finer wrinkle, strongest mid-pillow.
    const crumple = n(px * 4, pz * 4, seed) * 0.012 + n(px * 14, pz * 14, seed + 1) * 0.003;
    const py = v.y * (h / 2) * Math.max(0.06, profile) + crumple * profile;
    pos.setXYZ(i, px, py, pz);
  }
  g.computeVertexNormals();
  return planarUV(g, 'xz');
}

export interface DrapeSpec {
  /** Top rectangle the fabric rests on (x0..x1, z0..z1 at y = top). */
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  top: number;
  /** Rounding radius where the fabric turns over the mattress edge. */
  radius: number;
  /** Hang lengths per side (0 = the fabric stops at that edge). */
  dropX: number;
  dropZ0: number;
  dropZ1: number;
  foldWave: number;
  foldAmp: number;
  seed?: number;
  segs?: number;
}

/**
 * Fabric draped over a rectangular top: flat (with puff) on top, rounds over
 * the edge, hangs straight down with soft vertical folds, flaring at the hem.
 */
export function drapeGeometry(s: DrapeSpec): THREE.BufferGeometry {
  const r = s.radius;
  const arc = (Math.PI / 2) * r;
  const ix0 = s.x0 + r, ix1 = s.x1 - r;
  const iz0 = s.z0 + (s.dropZ0 > 0 ? r : 0);
  const iz1 = s.z1 - (s.dropZ1 > 0 ? r : 0);
  const ex = s.dropX > 0 ? arc + s.dropX : r;
  const u0 = ix0 - ex, u1 = ix1 + ex;
  const v0 = iz0 - (s.dropZ0 > 0 ? arc + s.dropZ0 : 0);
  const v1 = iz1 + (s.dropZ1 > 0 ? arc + s.dropZ1 : 0);
  const segs = s.segs ?? 120;
  const g = new THREE.PlaneGeometry(u1 - u0, v1 - v0, segs, Math.round(segs * ((v1 - v0) / (u1 - u0)) * 1.2) || 1);
  g.rotateX(-Math.PI / 2); // lies in XZ, normal +Y
  g.translate((u0 + u1) / 2, 0, (v0 + v1) / 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const n = noise3(s.seed ?? 3);
  const maxDrop = Math.max(s.dropX, s.dropZ0, s.dropZ1, 1e-3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // Fabric length is preserved: UVs in metres along the cloth.
    uv.setXY(i, x, z);
    const cx = THREE.MathUtils.clamp(x, ix0, ix1);
    const cz = THREE.MathUtils.clamp(z, iz0, iz1);
    let dx = x - cx;
    let dz = z - cz;
    const e = Math.hypot(dx, dz);
    let px = x, py = s.top, pz = z;
    if (e < 1e-6) {
      // Top: gentle puff and wrinkles.
      py += n(x * 3, z * 3, 0.5) * 0.006 + 0.004;
    } else {
      dx /= e;
      dz /= e;
      const theta = Math.min(e / r, Math.PI / 2);
      // Corners would otherwise hang longer (dog-ears): cap at the side's drop.
      const limitX = Math.abs(dx) > 1e-3 ? s.dropX : 0;
      const limitZ = dz < -1e-3 ? s.dropZ0 : dz > 1e-3 ? s.dropZ1 : 0;
      const down = Math.min(Math.max(0, e - arc), Math.max(limitX, limitZ));
      px = cx + dx * r * Math.sin(theta);
      pz = cz + dz * r * Math.sin(theta);
      py = s.top - r * (1 - Math.cos(theta)) - down;
      if (down > 0) {
        const t = down / maxDrop;
        const along = Math.abs(dx) > Math.abs(dz) ? z : x;
        const fold = Math.sin((along / s.foldWave) * Math.PI * 2 + n(along * 2, 0, 1) * 2) * s.foldAmp * (0.3 + t);
        const flare = t * t * 0.012;
        px += dx * (fold + flare);
        pz += dz * (fold + flare);
        py += n(along * 6, down * 4, 2) * 0.002;
      }
    }
    pos.setXYZ(i, px, py, pz);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * Pleated curtain hanging from y = top to y = bottom at x = x, spanning z0..z1,
 * rippled in X with the given wavelength/amplitude (normal faces -X, into the room).
 */
export function curtainGeometry(
  x: number,
  z0: number,
  z1: number,
  top: number,
  bottom: number,
  wavelength: number,
  amplitude: number,
  seed = 5,
): THREE.BufferGeometry {
  const zs = Math.max(8, Math.round(((z1 - z0) / wavelength) * 10));
  const ys = 40;
  const g = new THREE.PlaneGeometry(z1 - z0, top - bottom, zs, ys);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const n = noise3(seed);
  for (let i = 0; i < pos.count; i++) {
    const lz = pos.getX(i) + (z0 + z1) / 2;
    const ly = pos.getY(i) + (top + bottom) / 2;
    const fromTop = top - ly;
    const phase = (lz / wavelength) * Math.PI * 2 + n(lz * 3, 0, 0) * 0.6;
    // Folds are tight at the heading and relax slightly towards the hem.
    const amp = amplitude * (1 + 0.25 * Math.min(1, fromTop / 1.5));
    const px = x + Math.sin(phase) * amp + n(lz * 2, ly * 1.5, 1) * 0.008;
    // Fabric width follows the ripples, so UV u runs along the cloth length.
    uv.setXY(i, (lz - z0) * 1.35, ly);
    pos.setXYZ(i, px, ly, lz);
  }
  // Local (x, y) -> world (z, y): basis Z x Y = -X, so the front already faces the room.
  g.computeVertexNormals();
  return g;
}
