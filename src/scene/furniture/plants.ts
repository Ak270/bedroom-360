import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PLANTS } from '../../config/room.config';
import { rng } from '../../materials/canvasTextures';
import { lathe, mesh, shadows, type Mats, type Piece } from './common';

/**
 * Single leaf blade along +Y (base at origin): lanceolate/heart outline,
 * folded at the midrib, bending backwards along its length.
 */
export function leafGeometry(length: number, width: number, bend: number, fold: number, shape: 'lance' | 'heart' = 'lance'): THREE.BufferGeometry {
  const us = 4;
  const vs = 10;
  const g = new THREE.PlaneGeometry(1, 1, us, vs);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i) * 2; // -1..1 across
    const t = pos.getY(i) + 0.5; // 0..1 along
    const profile = shape === 'heart' ? Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.7) * (1 - 0.3 * t) : Math.pow(Math.sin(Math.PI * t), 0.85);
    const x = u * (width / 2) * profile;
    const y = t * length;
    const z = -bend * t * t * length + fold * Math.abs(u) * (width / 2) * profile;
    pos.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Transform-and-collect helper so each plant becomes one or two draw calls. */
class Bundle {
  parts: THREE.BufferGeometry[] = [];
  add(geo: THREE.BufferGeometry, m: THREE.Matrix4) {
    const c = geo.clone();
    c.applyMatrix4(m);
    this.parts.push(c);
  }
  build(): THREE.BufferGeometry {
    return mergeGeometries(this.parts, false);
  }
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);

/** Small potted plant (bedside, desk, dresser): ceramic pot + rosette of leaves. */
export function smallPlant({ f }: Mats, seed: number, potR = 0.05, potH = 0.08, leafLen = 0.12, leaves = 11): THREE.Group {
  const g = new THREE.Group();
  const rand = rng(seed);
  const pot = mesh(lathe([[0, 0], [potR * 0.75, 0], [potR * 0.95, potH * 0.25], [potR, potH * 0.8], [potR * 0.97, potH], [potR * 0.88, potH], [potR * 0.88, potH * 0.92], [0, potH * 0.92]]), f.ceramic);
  g.add(pot);
  const soil = mesh(new THREE.CircleGeometry(potR * 0.87, 24), f.soil);
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = potH * 0.9;
  g.add(soil);
  const light = new Bundle();
  const dark = new Bundle();
  for (let i = 0; i < leaves; i++) {
    const L = leafLen * (0.7 + rand() * 0.5);
    const geo = leafGeometry(L, L * 0.42, 0.25 + rand() * 0.35, 0.25, 'lance');
    const yaw = (i / leaves) * Math.PI * 2 + rand() * 0.5;
    const tilt = 0.25 + rand() * 0.7;
    _e.set(tilt, yaw, 0, 'YXZ');
    _m.compose(new THREE.Vector3(0, potH * 0.9, 0), _q.setFromEuler(_e), _s);
    (i % 3 ? light : dark).add(geo, _m);
  }
  g.add(mesh(light.build(), f.leaf), mesh(dark.build(), f.leafDark));
  return shadows(g);
}

/** Vase with a few long-stemmed eucalyptus-like sprigs (dresser). */
export function vaseWithGreenery({ f }: Mats, seed: number): THREE.Group {
  const g = new THREE.Group();
  const rand = rng(seed);
  g.add(mesh(lathe([[0, 0], [0.045, 0], [0.06, 0.05], [0.055, 0.12], [0.025, 0.2], [0.022, 0.24], [0.028, 0.25], [0.02, 0.25], [0.018, 0.2], [0, 0.2]]), f.ceramic));
  const stems = new Bundle();
  const leaves = new Bundle();
  const leafGeo = leafGeometry(0.05, 0.035, 0.1, 0.1, 'heart');
  for (let s = 0; s < 6; s++) {
    const yaw = rand() * Math.PI * 2;
    const tilt = 0.15 + rand() * 0.45;
    const len = 0.28 + rand() * 0.18;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.sin(tilt), Math.cos(tilt), Math.cos(yaw) * Math.sin(tilt));
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(0, 0.2, 0),
      new THREE.Vector3(0, 0.2, 0).addScaledVector(dir, len * 0.6),
      new THREE.Vector3(0, 0.2, 0).addScaledVector(dir, len).add(new THREE.Vector3(dir.x * 0.1, -0.05, dir.z * 0.1)),
    );
    stems.add(new THREE.TubeGeometry(curve, 12, 0.0025, 5), _m.identity());
    for (let k = 2; k < 12; k++) {
      const t = k / 12;
      const p = curve.getPoint(t);
      for (const side of [-1, 1]) {
        _e.set(0.9 + rand() * 0.4, yaw + side * 1.3 + rand() * 0.3, 0, 'YXZ');
        _m.compose(p, _q.setFromEuler(_e), _s.setScalar(1 - t * 0.4));
        leaves.add(leafGeo, _m);
      }
    }
    _s.setScalar(1);
  }
  g.add(mesh(stems.build(), f.stem), mesh(leaves.build(), f.leaf));
  return shadows(g);
}

/** Pothos: small pot whose vines trail over the shelf edge. */
export function trailingPothos({ f }: Mats, seed: number, hang: number): THREE.Group {
  const g = new THREE.Group();
  const rand = rng(seed);
  g.add(mesh(lathe([[0, 0], [0.05, 0], [0.062, 0.1], [0.058, 0.11], [0, 0.11]]), f.ceramic));
  const stems = new Bundle();
  const light = new Bundle();
  const dark = new Bundle();
  const leafGeo = leafGeometry(0.07, 0.055, 0.15, 0.2, 'heart');
  // A tuft on top
  for (let i = 0; i < 9; i++) {
    _e.set(0.5 + rand() * 0.6, rand() * Math.PI * 2, 0, 'YXZ');
    _m.compose(new THREE.Vector3(0, 0.1, 0), _q.setFromEuler(_e), _s.setScalar(1.2));
    light.add(leafGeo, _m);
  }
  _s.setScalar(1);
  // Vines: out over the front edge (-Z locally), then down.
  for (let v = 0; v < 5; v++) {
    const x = (rand() - 0.5) * 0.3;
    const len = hang * (0.45 + rand() * 0.55);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.1, 0),
      new THREE.Vector3(x * 0.5, 0.12, -0.1),
      new THREE.Vector3(x, 0.02, -0.16 - rand() * 0.04),
      new THREE.Vector3(x * 1.2, -len * 0.5, -0.19),
      new THREE.Vector3(x * 1.3 + (rand() - 0.5) * 0.05, -len, -0.18),
    ]);
    stems.add(new THREE.TubeGeometry(curve, 30, 0.002, 4), _m.identity());
    const count = Math.round(len / 0.05) + 4;
    for (let k = 1; k < count; k++) {
      const p = curve.getPoint(k / count);
      _e.set(-1.2 + rand() * 0.6, Math.PI + (rand() - 0.5) * 1.8, (rand() - 0.5) * 0.8, 'YXZ');
      _m.compose(p, _q.setFromEuler(_e), _s.setScalar(0.7 + rand() * 0.5));
      (k % 3 ? light : dark).add(leafGeo, _m);
    }
    _s.setScalar(1);
  }
  g.add(mesh(stems.build(), f.stem), mesh(light.build(), f.leaf), mesh(dark.build(), f.leafDark));
  return shadows(g);
}

/** Areca palm in a woven cream pot (NE corner, REF-A). */
export function buildAreca({ f }: Mats): Piece {
  const a = PLANTS.areca;
  const g = new THREE.Group();
  g.name = 'areca';
  const rand = rng(61);
  g.add(mesh(lathe([[0, 0], [a.potR * 0.8, 0], [a.potR, a.potH * 0.15], [a.potR * 1.05, a.potH], [a.potR * 0.98, a.potH], [a.potR * 0.93, a.potH * 0.95], [0, a.potH * 0.95]], 40), f.ceramicWoven));
  const soil = mesh(new THREE.CircleGeometry(a.potR * 0.92, 32), f.soil);
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = a.potH * 0.93;
  g.add(soil);

  const stems = new Bundle();
  const light = new Bundle();
  const dark = new Bundle();
  const frondH = a.height - a.potH;
  const leaflet = leafGeometry(1, 1, 0.12, 0.35, 'lance'); // unit, scaled per leaflet
  for (let i = 0; i < a.fronds; i++) {
    const yaw = (i / a.fronds) * Math.PI * 2 + rand() * 0.4;
    const out = 0.25 + rand() * 0.45; // how far the frond arches out
    const h = frondH * (0.6 + rand() * 0.4);
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    const base = new THREE.Vector3(dx * 0.02, a.potH * 0.93, dz * 0.02);
    const curve = new THREE.QuadraticBezierCurve3(
      base,
      new THREE.Vector3(dx * out * 0.2, a.potH + h * 0.95, dz * out * 0.2),
      new THREE.Vector3(dx * out, a.potH + h * (0.55 + rand() * 0.2), dz * out),
    );
    stems.add(new THREE.TubeGeometry(curve, 16, 0.006, 5), _m.identity());
    // Leaflets from 35% of the stem outwards, both sides, drooping.
    const count = 22;
    for (let k = 0; k < count; k++) {
      const t = 0.35 + (k / count) * 0.63;
      const p = curve.getPoint(t);
      const tan = curve.getTangent(t);
      const len = 0.28 * Math.sin(Math.PI * (0.15 + t * 0.8)) + 0.06;
      for (const side of [-1, 1]) {
        // Leaflet points sideways from the rachis and droops.
        const sideDir = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(side);
        const dirv = sideDir.multiplyScalar(0.8).add(tan.clone().multiplyScalar(0.55)).add(new THREE.Vector3(0, -0.35 - rand() * 0.2, 0)).normalize();
        _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirv);
        _q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 0.6 - 0.3));
        _m.compose(p, _q, new THREE.Vector3(0.022, len, 0.022));
        (k + (side > 0 ? 1 : 0)) % 3 ? light.add(leaflet, _m) : dark.add(leaflet, _m);
      }
    }
  }
  g.add(mesh(stems.build(), f.stem), mesh(light.build(), f.leaf), mesh(dark.build(), f.leafDark));
  g.position.set(a.x, 0, a.z);
  shadows(g);
  return { group: g };
}
