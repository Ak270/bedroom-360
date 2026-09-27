import * as THREE from 'three';
import { DOORS, DOOR_DETAIL, ROOM, WALLS, WINDOW, type DoorSpec } from '../config/room.config';
import { boxBetween, metricBox, metricPlane } from '../geometry/metric';
import type { Materials } from '../materials/library';

const T = ROOM.wallThickness;

export interface Door {
  name: string;
  group: THREE.Group;
  /** Leaf pivot; rotation.y is driven by setOpen. */
  pivot: THREE.Object3D;
  /** Meshes that toggle the door when clicked. */
  hitTargets: THREE.Object3D[];
  /** 0 = closed, 1 = fully open (spec.openAngleDeg). */
  setOpen(amount: number): void;
  open: number;
}

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

/** Brushed-brass lever: rosette + neck + lever arm pointing towards the hinge side. */
function lever(mats: Materials, towardsHinge: number): THREE.Group {
  const g = new THREE.Group();
  const rosette = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.027, 0.008, 32), mats.brass);
  rosette.rotation.x = Math.PI / 2;
  rosette.position.z = 0.004;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.05, 20), mats.brass);
  neck.rotation.x = Math.PI / 2;
  neck.position.z = 0.03;
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.0085, 0.11, 6, 16), mats.brass);
  arm.rotation.z = Math.PI / 2;
  arm.position.set(towardsHinge * 0.06, 0, 0.055);
  g.add(rosette, neck, arm);
  return g;
}

function buildDoor(name: string, spec: DoorSpec, mats: Materials, leafMat: THREE.Material): Door {
  const D = DOOR_DETAIL;
  const group = new THREE.Group();
  group.name = `door:${name}`;
  const u0 = spec.centerX - spec.width / 2;
  const u1 = spec.centerX + spec.width / 2;
  const h = spec.height;
  const zIn = WALLS.north; // room-side wall face
  const zOut = WALLS.north - T;

  // Jamb lining inside the reveal (painted to match the architrave).
  group.add(boxBetween(mats.paintedWood, u0, u0 + D.frame, 0, h, zOut, zIn));
  group.add(boxBetween(mats.paintedWood, u1 - D.frame, u1, 0, h, zOut, zIn));
  group.add(boxBetween(mats.paintedWood, u0, u1, h - D.frame, h, zOut, zIn));

  // 40 mm architrave, room side (REF-A).
  const aw = D.architraveWidth;
  const ad = D.architraveDepth;
  group.add(boxBetween(mats.paintedWood, u0 - aw, u0, 0, h + aw, zIn, zIn + ad));
  group.add(boxBetween(mats.paintedWood, u1, u1 + aw, 0, h + aw, zIn, zIn + ad));
  group.add(boxBetween(mats.paintedWood, u0 - aw, u1 + aw, h, h + aw, zIn, zIn + ad));

  // Leaf on a pivot at the hinge jamb.
  const sign = spec.hinge === 'east' ? 1 : -1; // leaf extends towards -sign*x from the pivot
  const clear = spec.width - 2 * D.frame;
  const leafW = clear - 2 * D.gap;
  const leafH = h - D.frame - D.gap - 0.008;
  const lt = D.leafThickness;
  const inward = spec.swing === 'in';

  const pivot = new THREE.Group();
  pivot.position.set(sign > 0 ? u1 - D.frame : u0 + D.frame, 0, inward ? zIn - 0.004 : zOut + 0.004);
  const leaf = new THREE.Mesh(metricBox(leafW, leafH, lt), leafMat);
  leaf.position.set(-sign * (D.gap + leafW / 2), 0.008 + leafH / 2, inward ? -lt / 2 : lt / 2);
  leaf.name = `${name}-leaf`;
  pivot.add(leaf);

  // Levers on both faces, near the free edge.
  const hx = -sign * (D.gap + leafW - 0.065);
  const front = lever(mats, sign);
  front.position.set(hx, D.handleHeight, (inward ? 0 : lt));
  // Rotated half a turn, so its local x flips: pass -sign to keep pointing at the hinge.
  const back = lever(mats, -sign);
  back.rotation.y = Math.PI;
  back.position.set(hx, D.handleHeight, (inward ? -lt : 0));
  pivot.add(front, back);

  // Three butt hinges on the hinge edge.
  for (const y of [0.22, 1.05, leafH - 0.18]) {
    const k = new THREE.Mesh(metricBox(0.006, 0.1, lt * 0.8), mats.brass);
    k.position.set(-sign * 0.003, y, inward ? -lt / 2 : lt / 2);
    pivot.add(k);
  }
  group.add(pivot);
  shadowed(group);

  const maxAngle = THREE.MathUtils.degToRad(spec.openAngleDeg);
  const door: Door = {
    name,
    group,
    pivot,
    hitTargets: [leaf],
    open: 0,
    setOpen(amount: number) {
      door.open = THREE.MathUtils.clamp(amount, 0, 1);
      pivot.rotation.y = (inward ? sign : -sign) * maxAngle * door.open;
    },
  };
  return door;
}

export function buildDoors(mats: Materials): { group: THREE.Group; bedroom: Door; washroom: Door } {
  const group = new THREE.Group();
  group.name = 'doors';
  const bedroom = buildDoor('bedroom', DOORS.bedroom, mats, mats.walnutV);
  const washroom = buildDoor('washroom', DOORS.washroom, mats, mats.walnutV);
  group.add(bedroom.group, washroom.group);
  return { group, bedroom, washroom };
}

/** East window: black 40 mm frame, sliding sashes, glass, MS grille bars (REF-A, REF-D). */
export function buildWindow(mats: Materials): THREE.Group {
  const g = new THREE.Group();
  g.name = 'window';
  const W = WINDOW;
  const z0 = W.centerZ - W.width / 2;
  const z1 = W.centerZ + W.width / 2;
  const y0 = W.sill;
  const y1 = W.sill + W.height;
  const fx = WALLS.east + W.frameInset;
  const fd = W.frameDepth;
  const f = W.frame;
  const frameMat = mats.blackMetal;

  // Outer frame
  g.add(boxBetween(frameMat, fx - fd / 2, fx + fd / 2, y0, y0 + f, z0, z1));
  g.add(boxBetween(frameMat, fx - fd / 2, fx + fd / 2, y1 - f, y1, z0, z1));
  g.add(boxBetween(frameMat, fx - fd / 2, fx + fd / 2, y0, y1, z0, z0 + f));
  g.add(boxBetween(frameMat, fx - fd / 2, fx + fd / 2, y0, y1, z1 - f, z1));
  // Two sliding sashes, overlapping at the centre on staggered tracks.
  const sashW = (W.width - 2 * f) / 2 + f / 2;
  const sash = (za: number, zb: number, x: number) => {
    const s = 0.03;
    const d = fd * 0.4;
    g.add(boxBetween(frameMat, x - d / 2, x + d / 2, y0 + f, y0 + f + s, za, zb));
    g.add(boxBetween(frameMat, x - d / 2, x + d / 2, y1 - f - s, y1 - f, za, zb));
    g.add(boxBetween(frameMat, x - d / 2, x + d / 2, y0 + f, y1 - f, za, za + s));
    g.add(boxBetween(frameMat, x - d / 2, x + d / 2, y0 + f, y1 - f, zb - s, zb));
    const glass = new THREE.Mesh(metricPlane(zb - za - 2 * s, y1 - y0 - 2 * f - 2 * s), mats.glass);
    glass.rotation.y = -Math.PI / 2;
    glass.position.set(x, (y0 + y1) / 2, (za + zb) / 2);
    glass.castShadow = false;
    glass.receiveShadow = false;
    glass.renderOrder = 2;
    g.add(glass);
  };
  sash(z0 + f, z0 + f + sashW, fx - fd * 0.22);
  sash(z1 - f - sashW, z1 - f, fx + fd * 0.22);

  // MS grille: horizontal round bars just inside the room-side face (REF-D).
  const gx = WALLS.east + W.grilleInset;
  const barLen = W.width;
  for (let i = 1; i <= W.grilleBars; i++) {
    const y = y0 + (W.height * i) / (W.grilleBars + 1);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(W.grilleDia / 2, W.grilleDia / 2, barLen, 12), frameMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(gx, y, W.centerZ);
    g.add(bar);
  }
  // Flat vertical straps tying the bars together.
  for (const z of [z0 + W.width * 0.33, z0 + W.width * 0.67]) {
    g.add(boxBetween(frameMat, gx - 0.004, gx + 0.004, y0 + 0.02, y1 - 0.02, z - 0.012, z + 0.012));
  }
  shadowed(g);
  g.traverse((c) => {
    if ((c as THREE.Mesh).material === mats.glass) c.castShadow = false;
  });
  return g;
}

/** Plate with rocker switches / 3-pin sockets, 8 mm proud of the wall. */
export function buildFixtures(mats: Materials, specs: FixtureSpec[]): THREE.Group {
  const g = new THREE.Group();
  g.name = 'fixtures';
  const dark = new THREE.MeshStandardMaterial({ color: '#2A2826', roughness: 0.6 });
  for (const s of specs) {
    const plate = new THREE.Group();
    const w = 0.03 + 0.045 * s.modules;
    const body = new THREE.Mesh(metricBox(w, 0.086, 0.008), mats.plastic);
    body.position.z = 0.004;
    plate.add(body);
    for (let i = 0; i < s.modules; i++) {
      const x = -w / 2 + 0.015 + 0.0225 + i * 0.045;
      if (s.kind === 'switch') {
        const r = new THREE.Mesh(metricBox(0.03, 0.05, 0.006), mats.plastic);
        r.position.set(x, 0, 0.011);
        r.rotation.x = 0.06;
        plate.add(r);
      } else {
        for (const [px, py] of [[0, 0.012], [-0.009, -0.006], [0.009, -0.006]] as const) {
          const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.002, 10), dark);
          hole.rotation.x = Math.PI / 2;
          hole.position.set(x + px, py, 0.0085);
          plate.add(hole);
        }
      }
    }
    plate.position.copy(s.position);
    plate.rotation.y = Math.atan2(s.normal.x, s.normal.z);
    plate.traverse((c) => ((c as THREE.Mesh).receiveShadow = true));
    g.add(plate);
  }
  return g;
}

export interface FixtureSpec {
  kind: 'switch' | 'socket';
  modules: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
}

