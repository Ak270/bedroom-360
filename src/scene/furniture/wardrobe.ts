import * as THREE from 'three';
import { DRESSER, ROOM, WALLS, WARDROBE } from '../../config/room.config';
import { boxBetween, metricBox } from '../../geometry/metric';
import { ledStrip, lathe, mesh, shadows, type InteriorLights, type Mats, type Piece } from './common';
import { vaseWithGreenery } from './plants';
import { buildWardrobeInterior, type InteriorDrawer, type InteriorZone } from './wardrobeInterior';

/** Pill / stadium outline (w across Z, h up Y) centred on the origin. */
function pill(w: number, h: number): THREE.Shape {
  const r = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-r, -(h / 2 - r));
  s.lineTo(-r, h / 2 - r);
  s.absarc(0, h / 2 - r, r, Math.PI, 0, true);
  s.lineTo(r, -(h / 2 - r));
  s.absarc(0, -(h / 2 - r), r, 0, Math.PI, true);
  return s;
}

export interface WardrobeDoor {
  pivot: THREE.Object3D;
  leaf: THREE.Mesh;
  /** +1 / -1: rotation sign that swings the free edge into the room. */
  sign: number;
  open: number;
}

export interface Wardrobe {
  group: THREE.Group;
  doors: WardrobeDoor[];
  /** Meshes that open their door when clicked. */
  hitTargets: THREE.Mesh[];
  /** Labelled storage zones (His / Hers / Shared / Loft), shown when open. */
  zones: InteriorZone[];
  /** Internal key-lock drawers + the plinth locker (slide out on +X). */
  drawers: InteriorDrawer[];
  readonly isOpen: boolean;
  setOpen(door: WardrobeDoor, amount: number): void;
  setDrawer(drawer: InteriorDrawer, amount: number): void;
}

/**
 * 22" wardrobe (CLIENT): hollow carcass with hanging rail + shelves, lower
 * doors sized so each opens a full 90 deg clear of the bed and bedside table,
 * and a full-length loft above 2.20 m (see WARDROBE in room.config.ts).
 */
function buildWardrobe(m: Mats): Wardrobe {
  const { base, f } = m;
  const W = WARDROBE;
  const g = new THREE.Group();
  g.name = 'wardrobe';
  const face = W.faceX;
  const back = WALLS.west;
  const doorBack = face - W.doorT;
  const t = W.carcass;
  const inner = f.oak; // light oak laminate interior (client photo)

  // ---- lower cabinet: sides, back, bottom, top (shared with the loft floor)
  const lz0 = W.z0, lz1 = W.lowerZ1;
  g.add(boxBetween(f.wardrobe, back, doorBack, 0, W.loftSplit, lz0, lz0 + t)); // north side
  g.add(boxBetween(f.wardrobe, back, doorBack, 0, W.loftSplit, lz1 - t, lz1)); // south side (seen beside the bedside table)
  g.add(boxBetween(inner, back, back + t, 0, W.loftSplit, lz0, lz1)); // back panel
  g.add(boxBetween(inner, back, doorBack, W.plinth, W.plinth + t, lz0, lz1)); // bottom
  g.add(boxBetween(base.blackMetal, back + 0.03, doorBack - 0.02, 0, W.plinth, lz0, lz1)); // recessed plinth (hides the plinth locker)

  // Bays: pairs of doors share a bay; the odd door gets its own.
  const edges: number[] = [];
  for (let i = 0; i <= W.doors; i++) edges.push(lz1 - i * W.doorW);
  const bays: [number, number][] = [];
  for (let i = 0; i < W.doors; i += 2) bays.push([edges[Math.min(i + 2, W.doors)], edges[i]]);
  bays.forEach(([, zb], k) => {
    if (k > 0) g.add(boxBetween(inner, back + t, doorBack, W.plinth + t, W.loftSplit, zb - t / 2, zb + t / 2)); // divider
  });
  // His/hers/shared fittings (merged; drawn only while a door is open).
  const interior = buildWardrobeInterior(m, bays);
  interior.group.visible = false;
  g.add(interior.group);

  // ---- loft: full length (lower cabinet + over the bedside table), floor at loftSplit
  g.add(boxBetween(f.wardrobe, back, doorBack, W.loftSplit - t, W.loftSplit, W.z0, W.z1)); // loft floor
  g.add(boxBetween(f.wardrobe, back, doorBack, W.height, ROOM.ceilingH, W.z0, W.z1)); // top + filler zone
  g.add(boxBetween(f.wardrobe, doorBack, face, W.height, ROOM.ceilingH, W.z0, W.z1)); // filler, flush with doors
  g.add(boxBetween(inner, back, back + t, W.loftSplit, W.height, W.z0, W.z1));
  g.add(boxBetween(f.wardrobe, back, doorBack, W.loftSplit, W.height, W.z1 - t, W.z1)); // south loft side

  // ---- doors on hinges
  const doors: WardrobeDoor[] = [];
  const hitTargets: THREE.Mesh[] = [];
  const gap = W.gap;
  const addDoor = (za: number, zb: number, y0: number, y1: number, hingeAtHighZ: boolean, pullAt: 'low' | 'high' | null) => {
    const hingeZ = hingeAtHighZ ? zb : za;
    const pivot = new THREE.Group();
    pivot.position.set(face, 0, hingeZ);
    const w = zb - za;
    const leaf = mesh(new THREE.BoxGeometry(W.doorT, y1 - y0, w), f.wardrobe);
    // Leaf extends from the hinge towards the free edge, behind the face plane.
    const dir = hingeAtHighZ ? -1 : 1;
    leaf.position.set(-W.doorT / 2, (y0 + y1) / 2, (dir * w) / 2);
    pivot.add(leaf);
    if (pullAt) {
      const P = W.pull;
      const pz = dir * (w - 0.035);
      const pull = mesh(metricBox(P.depth, P.len, P.w), base.blackMetal);
      pull.position.set(P.depth / 2 + 0.006, P.y0 + P.len / 2, pz);
      pivot.add(pull);
      for (const dy of [0.05, P.len - 0.05]) {
        const post = mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.012, 8), base.blackMetal);
        post.rotation.z = Math.PI / 2;
        post.position.set(0.006, P.y0 + dy, pz);
        pivot.add(post);
      }
    }
    g.add(pivot);
    // Rotation about Y by s*90 deg takes the leaf direction (0,0,dir) to (+1,0,0): s = dir.
    const door: WardrobeDoor = { pivot, leaf, sign: dir, open: 0 };
    leaf.userData.wardrobeDoor = door;
    doors.push(door);
    hitTargets.push(leaf);
  };
  for (let i = 0; i < W.doors; i++) {
    const za = edges[i + 1] + gap / 2;
    const zb = edges[i] - gap / 2;
    // Pairs meet in the middle (pulls there, hinges outside); a leftover single door hinges north.
    const paired = i + 1 < W.doors || i % 2 === 1;
    const first = i % 2 === 0;
    const hingeHigh = paired ? first : false;
    addDoor(za, zb, W.plinth + 0.002, W.loftSplit - gap / 2, hingeHigh, hingeHigh ? 'low' : 'high');
    addDoor(za, zb, W.loftSplit + gap / 2, W.height - gap / 2, hingeHigh, null);
  }
  // Loft door over the bedside table (push-latch, no pull).
  addDoor(lz1 + gap / 2, W.z1 - gap / 2, W.loftSplit + gap / 2, W.height - gap / 2, true, null);

  shadows(g);
  const maxAngle = THREE.MathUtils.degToRad(W.openDeg);
  return {
    group: g,
    doors,
    hitTargets,
    zones: interior.zones,
    drawers: interior.drawers,
    get isOpen() {
      return interior.group.visible;
    },
    setOpen(door, amount) {
      door.open = THREE.MathUtils.clamp(amount, 0, 1);
      door.pivot.rotation.y = door.sign * maxAngle * door.open;
      interior.group.visible = doors.some((d) => d.open > 0.001);
    },
    setDrawer(drawer, amount) {
      drawer.open = THREE.MathUtils.clamp(amount, 0, 1);
      drawer.group.position.x = drawer.travel * drawer.open;
    },
  };
}

/**
 * West wall (REF-B): 22" wardrobe with loft, then a walnut-clad end module
 * with an LED-haloed oval mirror, floating dresser and pouf.
 */
export function buildWestWall(m: Mats, lights: InteriorLights): Piece & { wardrobe: Wardrobe } {
  const { base, f } = m;
  const g = new THREE.Group();
  g.name = 'westWall';
  const W = WARDROBE;
  const face = W.faceX; // door front plane (22" deep)
  const back = WALLS.west;

  const wardrobe = buildWardrobe(m);
  g.add(wardrobe.group);

  // ---- walnut-clad end module (full height)
  const D = DRESSER;
  g.add(boxBetween(base.walnutV, back, face, 0, ROOM.ceilingH, D.module.z0, D.module.z1));

  // ---- oval mirror, walnut ring frame, warm LED halo behind
  const mr = D.mirror;
  const ringShape = pill(mr.w + 2 * mr.frame, mr.h + 2 * mr.frame);
  ringShape.holes.push(pill(mr.w, mr.h) as unknown as THREE.Path);
  const ring = mesh(new THREE.ExtrudeGeometry(ringShape, { depth: 0.025, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 48 }), base.walnutH);
  ring.rotation.y = Math.PI / 2; // shape XY -> ZY, extrusion along +X
  ring.position.set(face + 0.015, mr.y, mr.z);
  g.add(ring);
  const glassGeo = new THREE.ShapeGeometry(pill(mr.w, mr.h), 48);
  // UVs 0..1 over the pill, u reversed so a still "photo" reads mirror-correct.
  const guv = glassGeo.getAttribute('uv') as THREE.BufferAttribute;
  const gpos = glassGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < guv.count; i++) guv.setXY(i, 0.5 - gpos.getX(i) / mr.w, gpos.getY(i) / mr.h + 0.5);
  const glass = mesh(glassGeo, f.mirror, false, false);
  glass.name = 'mirrorGlass';
  glass.rotation.y = Math.PI / 2;
  glass.position.set(face + 0.03, mr.y, mr.z);
  g.add(glass);
  const halo = mesh(new THREE.PlaneGeometry(mr.w + 0.42, mr.h + 0.42), f.ledGlow, false, false);
  halo.rotation.y = Math.PI / 2;
  halo.position.set(face + 0.003, mr.y, mr.z);
  halo.renderOrder = 1;
  g.add(halo);
  lights.emissive.push({ material: f.ledGlow, on: 1 });
  const haloLight = new THREE.RectAreaLight('#FFB870', 1.6, mr.w + 0.1, mr.h + 0.1);
  haloLight.position.set(face + 0.04, mr.y, mr.z);
  haloLight.rotation.y = -Math.PI / 2; // emit towards +X (into the room)
  g.add(haloLight);
  lights.leds.push(haloLight);

  // ---- floating white dresser top, 2-drawer unit below, LED under the top
  const T = D.top;
  const z0 = T.zc - T.len / 2, z1 = T.zc + T.len / 2;
  g.add(boxBetween(f.lacquer, T.x0, T.x1, T.y - T.t, T.y, z0, z1));
  const uy1 = T.y - T.t - 0.002;
  const uy0 = uy1 - D.drawers.h;
  const ux1 = T.x1 - 0.04;
  g.add(boxBetween(f.lacquer, T.x0, ux1 - 0.018, uy0, uy1, z0 + 0.05, z1 - 0.05));
  const dz = (z1 - z0 - 0.1 - 0.003) / D.drawers.count;
  for (let i = 0; i < D.drawers.count; i++) {
    const za = z0 + 0.05 + i * (dz + 0.003);
    g.add(boxBetween(f.lacquer, ux1 - 0.018, ux1, uy0 + 0.003, uy1 - 0.003, za, za + dz));
    const knob = mesh(new THREE.SphereGeometry(0.009, 16, 12), base.brass);
    knob.position.set(ux1 + 0.008, (uy0 + uy1) / 2, za + dz / 2);
    g.add(knob);
  }
  g.add(ledStrip(lights, T.len - 0.08, 2.4, '#FFB870', new THREE.Vector3(T.x1 - 0.03, T.y - T.t - 0.004, T.zc), true));

  // ---- brass tray + vase with greenery on the dresser
  const tray = mesh(lathe([[0, 0], [0.12, 0], [0.125, 0.012], [0.118, 0.012], [0.113, 0.004], [0, 0.004]], 48), base.brass);
  tray.position.set(T.x0 + 0.2, T.y, T.zc + 0.22);
  g.add(tray);
  const vase = vaseWithGreenery(m, 77);
  vase.position.set(T.x0 + 0.18, T.y + 0.004, T.zc + 0.2);
  g.add(vase);

  // ---- round boucle pouf
  const pf = D.pouf;
  const r = pf.r, h = pf.h;
  const pouf = mesh(
    lathe([[0, 0], [r - 0.03, 0], [r - 0.005, 0.02], [r, 0.06], [r + 0.004, h * 0.5], [r, h - 0.05], [r - 0.02, h - 0.012], [r - 0.06, h], [0, h + 0.004]], 64),
    f.boucle,
  );
  pouf.position.set(pf.x, 0, pf.z);
  g.add(pouf);

  shadows(g);
  halo.castShadow = false;
  glass.castShadow = false;
  return { group: g, wardrobe };
}
