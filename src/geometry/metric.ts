import * as THREE from 'three';

/**
 * Box whose UVs are in metres on every face, so tiled materials keep the
 * same texel density on a 4 cm architrave and a 2 m door leaf.
 */
export function metricBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z (4 vertices each).
  const faceSize: [number, number][] = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = faceSize[f];
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      uv.setXY(k, uv.getX(k) * su, uv.getY(k) * sv);
    }
  }
  uv.needsUpdate = true;
  return g;
}

export interface Rect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/**
 * Flat wall face in local XY (u along the wall, v up), normal +Z, with
 * rectangular holes. ShapeGeometry emits UVs equal to local XY = metres.
 */
export function faceWithHoles(u0: number, u1: number, v0: number, v1: number, holes: Rect[]): THREE.ShapeGeometry {
  const s = new THREE.Shape();
  s.moveTo(u0, v0);
  s.lineTo(u1, v0);
  s.lineTo(u1, v1);
  s.lineTo(u0, v1);
  s.lineTo(u0, v0);
  for (const h of holes) {
    const p = new THREE.Path();
    p.moveTo(h.u0, h.v0);
    p.lineTo(h.u0, h.v1);
    p.lineTo(h.u1, h.v1);
    p.lineTo(h.u1, h.v0);
    p.lineTo(h.u0, h.v0);
    s.holes.push(p);
  }
  return new THREE.ShapeGeometry(s);
}

/** Axis-aligned plane from two corners, facing `normal`; UVs in metres. */
export function metricPlane(w: number, h: number): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  uv.needsUpdate = true;
  return g;
}

/** Positions a mesh as an axis-aligned box spanning [x0,x1] x [y0,y1] x [z0,z1]. */
export function boxBetween(
  mat: THREE.Material,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
): THREE.Mesh {
  const m = new THREE.Mesh(metricBox(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return m;
}
