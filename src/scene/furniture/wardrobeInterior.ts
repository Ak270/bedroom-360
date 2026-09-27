import * as THREE from 'three';
import { metricBox } from '../../geometry/metric';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { WALLS, WARDROBE } from '../../config/room.config';
import { rng } from '../../materials/canvasTextures';
import type { Mats } from './common';

/**
 * Indian carpenter-style his/hers wardrobe (client reference photos): hanging
 * above, a waist-height band of key-lock drawers, deep shelves below, a narrow
 * shelf column, and hidden lockers:
 *  - Hers (south pair): saree shelf column + hanging; 2 key drawers, the
 *    jewellery drawer with a false bottom; deep saree/folded shelves below.
 *  - His (middle pair): shirt hanging; 2 key drawers; jeans/tees shelves;
 *    push-to-open drawer disguised as the plinth (hidden locker).
 *  - Shared (single door): full-height adjustable shelves; steel safe behind
 *    a sliding false back panel at the bottom.
 *  - Loft: suitcases, blanket bags, storage boxes.
 * Built into one merged mesh per material (static, drawn only while a door is open).
 */
export interface InteriorZone {
  name: string;
  detail: string;
  anchor: THREE.Vector3;
}

/** A sliding internal drawer (built at its closed position; slides along +X). */
export interface InteriorDrawer {
  group: THREE.Group;
  open: number;
  travel: number;
  name: string;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();

class Merger {
  private readonly parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  add(mat: THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number, rotY = 0, rotZ = 0): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    _q.setFromEuler(new THREE.Euler(0, rotY, rotZ));
    _m.compose(_p.set(x, y, z), _q, _s);
    g.applyMatrix4(_m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const list = this.parts.get(mat) ?? [];
    list.push(g);
    this.parts.set(mat, list);
  }
  box(mat: THREE.Material, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): void {
    this.add(mat, metricBox(x1 - x0, y1 - y0, z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  }
  build(): THREE.Group {
    const g = new THREE.Group();
    for (const [mat, list] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false), mat);
      mesh.castShadow = false; // interior is only seen with doors open; skip shadow cost
      mesh.receiveShadow = true;
      g.add(mesh);
    }
    return g;
  }
}

/** Garment silhouette on a hanger (shirt / kurta / long dress), extruded thin. */
function garmentGeometry(width: number, length: number, kind: 'shirt' | 'kurta' | 'long'): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const sh = width / 2;
  const neck = 0.05;
  const hem = kind === 'shirt' ? sh * 0.92 : kind === 'kurta' ? sh * 1.05 : sh * 1.25;
  s.moveTo(-neck, 0);
  s.quadraticCurveTo(0, -0.035, neck, 0);
  s.lineTo(sh, -0.05);
  s.lineTo(sh + 0.02, -0.22); // sleeve edge
  s.lineTo(sh * 0.9, -0.24);
  s.lineTo(hem, -length);
  s.lineTo(-hem, -length);
  s.lineTo(-sh * 0.9, -0.24);
  s.lineTo(-sh - 0.02, -0.22);
  s.lineTo(-sh, -0.05);
  s.closePath();
  // Cloth on a hanger is ~4-5 cm thick seen edge-on (sleeves + body folds).
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.009, bevelSize: 0.008, bevelSegments: 2 });
  g.translate(0, 0, -0.015);
  // Metric UVs so the cloth texture keeps its scale.
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) * 2, pos.getY(i) * 2);
  return g;
}

/** Wire hanger: hook + shoulder bar. */
function hangerGeometry(width: number): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector3(-width / 2, -0.04, 0),
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(width / 2, -0.04, 0),
  ];
  const bar = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.003, 5);
  const hook = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(0.025, 0.045, 0)), 8, 0.0025, 5);
  return mergeGeometries([bar.toNonIndexed(), hook.toNonIndexed()], false);
}

export function buildWardrobeInterior(m: Mats, bays: [number, number][]): { group: THREE.Group; zones: InteriorZone[]; drawers: InteriorDrawer[] } {
  const { base, f } = m;
  const W = WARDROBE;
  const back = WALLS.west + W.carcass;
  const front = W.faceX - W.doorT - 0.01;
  const cx = (back + front) / 2;
  const depth = front - back;
  const t = W.carcass;
  const M = new Merger();
  const rand = rng(401);
  const inner = f.oak; // light oak laminate throughout (client photo 1)
  const zones: InteriorZone[] = [];

  const shelf = (y: number, za: number, zb: number, d = depth) => M.box(inner, back, back + d, y, y + t, za, zb);
  const railAlongZ = (y: number, za: number, zb: number) => {
    const g = new THREE.CylinderGeometry(0.012, 0.012, zb - za - 0.004, 12);
    g.rotateX(Math.PI / 2);
    M.add(f.chrome, g, cx, y, (za + zb) / 2);
  };
  const hangers = new Map<string, THREE.BufferGeometry>();
  const hangGarments = (railY: number, za: number, zb: number, drop: number, kinds: ('shirt' | 'kurta' | 'long')[], colors: string[], spacing: number) => {
    const n = Math.floor((zb - za - 0.06) / spacing);
    for (let i = 0; i < n; i++) {
      const z = za + 0.04 + i * spacing + (rand() - 0.5) * 0.01;
      const kind = kinds[i % kinds.length];
      const len = drop * (kind === 'shirt' ? 0.78 : kind === 'kurta' ? 0.72 : 0.9) * (0.92 + rand() * 0.08);
      const key = `${kind}-${len.toFixed(2)}`;
      const geo = hangers.get(key) ?? garmentGeometry(depth * 0.78, len, kind);
      hangers.set(key, geo);
      // Garments hang across the depth (width along X), faces towards +/-Z.
      M.add(f.cloth(colors[i % colors.length]), geo, cx, railY - 0.045, z, (rand() - 0.5) * 0.12);
      M.add(base.brass, hangerGeometry(depth * 0.74), cx, railY - 0.01, z);
    }
  };
  const folded = (x0: number, y: number, z0: number, w: number, d: number, count: number, colors: string[], trim?: THREE.Material) => {
    let yy = y + t;
    for (let i = 0; i < count; i++) {
      const h = 0.028 + rand() * 0.018;
      const geo = new RoundedBoxGeometry(d, h, w, 2, 0.008);
      M.add(f.cloth(colors[i % colors.length]), geo, x0 + d / 2 + (rand() - 0.5) * 0.01, yy + h / 2, z0 + w / 2 + (rand() - 0.5) * 0.01);
      // Zari border line along the front edge (sarees).
      if (trim) M.box(trim, x0 + d - 0.001, x0 + d + 0.002, yy + h * 0.35, yy + h * 0.65, z0 + 0.01, z0 + w - 0.01);
      yy += h;
    }
  };
  const drawers: InteriorDrawer[] = [];
  const drawerRoot = new THREE.Group();
  drawerRoot.name = 'wardrobeDrawers';
  /** Contents callback gets the drawer's own merger and its inner box (x0..x1, floor y, za..zb). */
  type Fill = (D: Merger, x0: number, x1: number, floorY: number, za: number, zb: number) => void;
  /** Key-lock drawer: front, box (floor, sides, back), knob + lock, contents; slides out on +X. */
  const drawer = (name: string, y0: number, y1: number, za: number, zb: number, fill?: Fill, travel = 0.36) => {
    const D = new Merger();
    const bx0 = back + 0.03;
    const bx1 = front - 0.018;
    const bz0 = za + 0.012, bz1 = zb - 0.012;
    const floorY = y0 + 0.012;
    const top = y1 - 0.025;
    D.box(inner, front - 0.018, front, y0 + 0.003, y1 - 0.003, za + 0.004, zb - 0.004); // front
    D.box(inner, bx0, bx1, y0 + 0.006, floorY, bz0, bz1); // floor
    D.box(inner, bx0, bx1, y0 + 0.006, top, bz0, bz0 + 0.012); // sides
    D.box(inner, bx0, bx1, y0 + 0.006, top, bz1 - 0.012, bz1);
    D.box(inner, bx0, bx0 + 0.012, y0 + 0.006, top, bz0, bz1); // back
    D.add(base.brass, new THREE.SphereGeometry(0.009, 12, 8), front + 0.006, (y0 + y1) / 2 + 0.03, (za + zb) / 2);
    const lock = new THREE.CylinderGeometry(0.011, 0.011, 0.006, 16);
    lock.rotateZ(Math.PI / 2);
    D.add(base.brass, lock, front + 0.003, (y0 + y1) / 2 - 0.02, (za + zb) / 2);
    fill?.(D, bx0 + 0.012, bx1, floorY, bz0 + 0.012, bz1 - 0.012);
    const group = D.build();
    group.name = `drawer:${name}`;
    const d: InteriorDrawer = { group, open: 0, travel, name };
    group.traverse((o) => (o.userData.wardrobeDrawer = d));
    drawerRoot.add(group);
    drawers.push(d);
    return d;
  };

  // ---- drawer contents
  const torus = (r: number, tube: number) => new THREE.TorusGeometry(r, tube, 8, 28).rotateX(Math.PI / 2);
  /**
   * Jewellery drawer with a FALSE BOTTOM: the velvet tray sits 5 cm up on a
   * lift-out ledge; the front strip is shown with the tray edge cut away so the
   * hidden cavity underneath (coins, sealed envelope) is visible when pulled out.
   */
  const jewellery: Fill = (D, x0, x1, y, za, zb) => {
    const cavity = 0.13; // visible front strip of the hidden cavity
    const trayX1 = x1 - cavity;
    const ty = y + 0.05;
    D.box(f.velvet, x0, trayX1, ty, ty + 0.008, za, zb); // raised velvet tray (the false bottom)
    for (let k = 1; k < 3; k++) {
      const z = za + ((zb - za) * k) / 3;
      D.box(inner, x0 + 0.05, trayX1, ty + 0.008, ty + 0.035, z - 0.003, z + 0.003);
    }
    D.box(inner, trayX1, trayX1 + 0.008, y, ty + 0.035, za, zb); // tray edge standing over the cavity
    const cz = (zb - za) / 3;
    for (let i = 0; i < 3; i++) D.add(f.zari, torus(0.032, 0.004), trayX1 - 0.07 - i * 0.012, ty + 0.014 + i * 0.008, za + cz / 2); // bangles
    for (let i = 0; i < 4; i++) D.add(f.zari, torus(0.009, 0.0025), trayX1 - 0.05 - (i % 2) * 0.05, ty + 0.012, za + cz + 0.03 + Math.floor(i / 2) * 0.05); // rings
    D.add(f.zari, torus(0.055, 0.003).scale(1, 1, 0.75), trayX1 - 0.09, ty + 0.012, za + cz * 2.5); // necklace
    // Hidden cavity (below the tray level): sealed envelope and gold coins.
    D.box(f.paper, trayX1 + 0.015, x1 - 0.01, y, y + 0.006, za + 0.02, (za + zb) / 2 + 0.03);
    for (let i = 0; i < 4; i++) D.add(f.zari, new THREE.CylinderGeometry(0.014, 0.014, 0.004, 20), trayX1 + 0.06, y + 0.004 + i * 0.004, zb - 0.05);
  };
  const accessories: Fill = (D, x0, x1, y, za, zb) => {
    D.box(f.velvet, x0 + 0.02, x0 + 0.2, y, y + 0.06, za + 0.02, za + 0.14); // bangle box
    D.box(f.cloth('#B45A7A'), x0 + 0.24, x1 - 0.03, y, y + 0.03, za + 0.02, (za + zb) / 2 - 0.01); // folded dupatta
    D.box(f.cloth('#D9A441'), x0 + 0.24, x1 - 0.03, y + 0.03, y + 0.055, za + 0.02, (za + zb) / 2 - 0.01);
    D.box(f.cloth('#E9D8C4'), x0 + 0.05, x1 - 0.05, y, y + 0.04, (za + zb) / 2 + 0.01, zb - 0.02); // scarves
  };
  const watches: Fill = (D, x0, x1, y, za, zb) => {
    D.box(f.velvet, x0 + 0.2, x1 - 0.03, y, y + 0.05, za + 0.02, za + 0.2); // watch box
    for (let i = 0; i < 3; i++) {
      const z = za + 0.05 + i * 0.05;
      D.add(f.chrome, new THREE.CylinderGeometry(0.02, 0.02, 0.012, 20), x0 + 0.34, y + 0.058, z);
      D.box(base.blackMetal, x0 + 0.25, x0 + 0.43, y + 0.05, y + 0.054, z - 0.009, z + 0.009);
    }
    D.box(f.cloth('#6E4B3A'), x0 + 0.04, x0 + 0.15, y, y + 0.02, za + 0.03, za + 0.12); // wallet
    D.add(f.cloth('#3B2A20'), torus(0.04, 0.012), x0 + 0.1, y + 0.012, zb - 0.07); // rolled belt
    D.add(f.cloth('#1E1E1E'), torus(0.04, 0.012), x0 + 0.22, y + 0.012, zb - 0.07);
  };
  const documents: Fill = (D, x0, x1, y, za, zb) => {
    D.box(f.paper, x0 + 0.02, x1 - 0.06, y, y + 0.05, za + 0.02, za + 0.24); // document folder stack
    D.box(f.cloth('#1F3A68'), x0 + 0.3, x0 + 0.42, y, y + 0.012, zb - 0.14, zb - 0.05); // passport
    D.box(f.cloth('#8C1D2B'), x0 + 0.3, x0 + 0.42, y + 0.012, y + 0.024, zb - 0.14, zb - 0.05);
    D.add(f.chrome, torus(0.015, 0.002), x0 + 0.1, y + 0.004, zb - 0.08); // key ring
  };
  const cashBox: Fill = (D, x0, x1, y, za) => {
    D.box(f.safeSteel, x1 - 0.3, x1 - 0.05, y, y + 0.06, za + 0.09, za + 0.39);
    D.box(f.chrome, x1 - 0.052, x1 - 0.046, y + 0.02, y + 0.04, za + 0.2, za + 0.28);
    void x0;
  };
  const ledBar = (za: number, zb: number) => M.box(f.interiorLed, front - 0.05, front - 0.04, W.loftSplit - t - 0.012, W.loftSplit - t - 0.004, za + 0.02, zb - 0.02);

  const [her, his, shared] = bays;
  const bottom = W.plinth + t;
  const band = W.drawerBand;
  const railY = W.loftSplit - t - 0.2; // rail under a top shelf, as in the photos
  const topShelf = railY + 0.03;
  const lowShelf = (bottom + band.y0) / 2; // splits the space under the drawers in two
  const steel = f.safeSteel;

  /** The drawer band: fixed shelves above/below and two key-lock drawers side by side. */
  const drawerBand = (za: number, zb: number, who: string, fillA: Fill, fillB: Fill) => {
    shelf(band.y0 - t, za, zb);
    shelf(band.y1, za, zb);
    const zm = (za + zb) / 2;
    drawer(`${who} left`, band.y0, band.y1, za, zm, fillA);
    drawer(`${who} right`, band.y0, band.y1, zm, zb, fillB);
  };

  // ------------------------------------------------ HERS (south pair)
  if (her) {
    const [za, zb] = her;
    const colW = 0.28; // narrow saree column beside the hanging (4-door photo)
    const colZ = za + colW;
    drawerBand(za, zb, 'Hers', jewellery, accessories);
    // Above the band: saree column | hanging.
    M.box(inner, back, front, band.y1 + t, topShelf, colZ - t / 2, colZ + t / 2);
    shelf(topShelf, za, zb);
    const sareeColors = ['#9B1B30', '#E0A526', '#1F6F6B', '#6B2D5C', '#C9572B', '#274C77', '#B8860B', '#8B3A62'];
    for (const y of [band.y1 + t, band.y1 + 0.33, band.y1 + 0.66]) {
      if (y > band.y1 + t) shelf(y, za, colZ - t / 2);
      folded(back + 0.02, y, za + 0.02, colW - 0.05, depth - 0.1, 7, sareeColors.slice(Math.floor(rand() * 3)), f.zari);
    }
    railAlongZ(railY, colZ + t / 2, zb);
    hangGarments(railY, colZ + t / 2, zb, railY - band.y1 - 0.08, ['kurta', 'long', 'kurta'], ['#8E2C3A', '#D9A441', '#2F6F73', '#E9D8C4', '#B45A7A', '#3B4F7A'], 0.06);
    const zm = (za + zb) / 2;
    // Below the band: deep shelves for folded sarees / dupattas.
    shelf(lowShelf, za, zb);
    folded(back + 0.03, lowShelf, za + 0.03, (zb - za) / 2 - 0.05, depth - 0.1, 5, sareeColors, f.zari);
    folded(back + 0.03, lowShelf, (za + zb) / 2 + 0.02, (zb - za) / 2 - 0.05, depth - 0.1, 4, ['#E9D8C4', '#F4E6CE', '#C9B79C']);
    folded(back + 0.03, bottom - t, za + 0.03, (zb - za) / 2 - 0.05, depth - 0.1, 4, ['#D8C3A5', '#B45A7A', '#E9D8C4']);
    // Handbags on the top shelf.
    for (let i = 0; i < 3; i++) {
      const bag = new RoundedBoxGeometry(0.2, 0.15, 0.24, 3, 0.03);
      M.add(f.cloth(['#6E4B3A', '#C9A27E', '#1E1E1E'][i]), bag, cx, topShelf + t + 0.075, za + 0.16 + i * 0.26);
    }
    ledBar(za, zb);
    zones.push({ name: 'Hers', detail: 'saree column + hanging · 2 key drawers (jewellery drawer has a false bottom) · deep shelves', anchor: new THREE.Vector3(front, topShelf + 0.14, zm) });
  }

  // ------------------------------------------------ HIS (middle pair)
  if (his) {
    const [za, zb] = his;
    drawerBand(za, zb, 'His', watches, documents);
    shelf(topShelf, za, zb);
    railAlongZ(railY, za, zb);
    hangGarments(railY, za, zb, railY - band.y1 - 0.06, ['shirt'], ['#F4F4F2', '#A9C4DE', '#2E3A4F', '#D8D2C4', '#7C8B6F', '#FFFFFF', '#6E8DAE'], 0.058);
    shelf(lowShelf, za, zb);
    const denim = ['#2E4A6B', '#3B5877', '#23364F', '#4A6A8C'];
    folded(back + 0.03, lowShelf, za + 0.03, (zb - za) / 2 - 0.05, depth - 0.1, 5, denim);
    folded(back + 0.03, lowShelf, (za + zb) / 2 + 0.02, (zb - za) / 2 - 0.05, depth - 0.1, 5, ['#E9E6DF', '#3A3F47', '#8C7B64', '#FFFFFF']);
    folded(back + 0.03, bottom - t, za + 0.03, (zb - za) / 2 - 0.05, depth - 0.1, 4, ['#5B5E4E', '#9E9A91', '#1F2A3A']);
    folded(back + 0.05, topShelf, za + 0.06, 0.3, 0.3, 3, ['#4A5A6A', '#D7D2C8', '#7A6A55']);
    // Hidden plinth locker: a push-to-open drawer whose front *is* the dark
    // plinth board (no knob, no lock); slides out 28 cm.
    const f0 = W.faceX - W.doorT;
    {
      const D = new Merger();
      D.box(base.blackMetal, f0 - 0.02, f0, 0.012, W.plinth - 0.004, za + 0.01, zb - 0.01); // disguised front
      D.box(inner, back + 0.06, f0 - 0.02, 0.012, 0.024, za + 0.03, zb - 0.03); // tray floor
      D.box(inner, back + 0.06, f0 - 0.02, 0.012, W.plinth - 0.01, za + 0.03, za + 0.042); // tray sides
      D.box(inner, back + 0.06, f0 - 0.02, 0.012, W.plinth - 0.01, zb - 0.042, zb - 0.03);
      cashBox(D, back + 0.06, f0 - 0.02, 0.024, za, zb);
      const group = D.build();
      group.name = 'drawer:plinth locker';
      const d: InteriorDrawer = { group, open: 0, travel: 0.28, name: 'Plinth locker' };
      group.traverse((o) => (o.userData.wardrobeDrawer = d));
      drawerRoot.add(group);
      drawers.push(d);
    }
    ledBar(za, zb);
    zones.push({ name: 'Hidden plinth locker', detail: 'push-to-open drawer disguised as the kickboard · cash box', anchor: new THREE.Vector3(f0, W.plinth + 0.02, za + 0.27) });
    zones.push({ name: 'His', detail: 'shirt hanging · 2 key drawers · jeans/tees shelves · hidden plinth locker (push to open)', anchor: new THREE.Vector3(front, topShelf + 0.14, (za + zb) / 2) });
  }

  // ------------------------------------------------ SHARED (single door)
  if (shared) {
    const [za, zb] = shared;
    const linen = ['#F2EEE6', '#C9D6E3', '#E7D8C0', '#9DB0A3', '#FFFFFF'];
    // Full-height adjustable shelves (first photo, right column).
    const safeTop = bottom + 0.3;
    for (let y = safeTop; y < W.loftSplit - 0.2; y += 0.3) {
      shelf(y, za, zb);
      folded(back + 0.04, y, za + 0.03, zb - za - 0.06, depth - 0.12, 4, linen);
    }
    // Hidden safe: behind a false back panel at the bottom; panel slid aside.
    const safeDepth = 0.22;
    M.box(steel, back, back + safeDepth, bottom, safeTop - 0.02, za + 0.04, zb - 0.04); // safe body
    M.box(f.chrome, back + safeDepth, back + safeDepth + 0.006, bottom + 0.1, bottom + 0.2, za + 0.08, za + 0.12); // keypad
    M.add(base.brass, new THREE.CylinderGeometry(0.018, 0.018, 0.01, 20).rotateZ(Math.PI / 2), back + safeDepth + 0.005, bottom + 0.14, zb - 0.1);
    M.box(inner, back + safeDepth + 0.012, back + safeDepth + 0.03, bottom, safeTop - 0.02, zb - 0.1, zb - 0.02); // false panel, slid to one side
    ledBar(za, zb);
    zones.push({ name: 'Hidden safe', detail: 'steel safe behind a sliding false back panel', anchor: new THREE.Vector3(back + safeDepth, safeTop - 0.02, (za + zb) / 2) });
    zones.push({ name: 'Shared', detail: 'full-height shelves · hidden steel safe behind a sliding false back panel', anchor: new THREE.Vector3(front, W.loftSplit - 0.25, (za + zb) / 2) });
  }

  // ------------------------------------------------ LOFT (full length)
  const ly = W.loftSplit;
  const loftItems: [number, number, number, string][] = [
    [0.55, 0.36, 0.22, '#2F3B48'], // large suitcase
    [0.45, 0.3, 0.2, '#7A2E2E'], // cabin suitcase
    [0.5, 0.3, 0.4, '#D9CDB8'], // blanket bag
    [0.4, 0.25, 0.35, '#B9A68A'], // storage box
    [0.45, 0.3, 0.35, '#D9CDB8'],
  ];
  let z = W.z0 + 0.05;
  for (const [len, h, w, col] of loftItems) {
    if (z + w > W.z1 - 0.05) break;
    const geo = new RoundedBoxGeometry(Math.min(len, depth - 0.05), h, w, 3, 0.03);
    M.add(f.cloth(col), geo, back + Math.min(len, depth - 0.05) / 2 + 0.02, ly + h / 2 + 0.002, z + w / 2);
    z += w + 0.06;
  }
  zones.push({ name: 'Loft', detail: 'suitcases · blanket bags · storage boxes', anchor: new THREE.Vector3(front, W.height - 0.08, (W.z0 + W.z1) / 2) });

  const group = M.build();
  group.name = 'wardrobeInterior';
  group.add(drawerRoot);
  return { group, zones, drawers };
}
