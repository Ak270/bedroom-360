import * as THREE from 'three';
import {
  ACCENT,
  BEAM,
  DOORS,
  DOOR_DETAIL,
  PILLAR,
  CORNER_PILLARS,
  DOOR_PILLAR,
  ROOM,
  SKIRTING,
  WALLS,
  WINDOW,
} from '../config/room.config';
import { boxBetween, faceWithHoles, metricPlane, type Rect } from '../geometry/metric';
import type { Materials } from '../materials/library';

const H = ROOM.ceilingH;
const T = ROOM.wallThickness;
const { halfW, halfD } = ROOM;

/** Opening rectangles in world terms (along-wall range + vertical range). */
export const OPENINGS = {
  bedroomDoor: span(DOORS.bedroom.centerX, DOORS.bedroom.width, 0, DOORS.bedroom.height),
  washroomDoor: span(DOORS.washroom.centerX, DOORS.washroom.width, 0, DOORS.washroom.height),
  window: span(WINDOW.centerZ, WINDOW.width, WINDOW.sill, WINDOW.sill + WINDOW.height),
};

function span(center: number, width: number, v0: number, v1: number): Rect {
  return { u0: center - width / 2, u1: center + width / 2, v0, v1 };
}

/** Orients a +Z-facing plane so it faces `normal` (axis-aligned normals only). */
function facePlane(mesh: THREE.Mesh, normal: THREE.Vector3): THREE.Mesh {
  if (Math.abs(normal.y) > 0.9) mesh.rotation.x = normal.y > 0 ? -Math.PI / 2 : Math.PI / 2;
  else mesh.rotation.y = Math.atan2(normal.x, normal.z);
  return mesh;
}

function receiver(mesh: THREE.Mesh): THREE.Mesh {
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

function caster(mesh: THREE.Mesh): THREE.Mesh {
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

export interface Shell {
  group: THREE.Group;
  /** Interior volume used by the camera clamp (M5). */
  interior: THREE.Box3;
}

export function buildShell(mats: Materials): Shell {
  const group = new THREE.Group();
  group.name = 'shell';

  // ------------------------------------------------ inward wall faces (dollhouse cutaway)
  // Each face is single-sided: seen from outside, the near walls vanish.
  const north = new THREE.Mesh(
    faceWithHoles(-halfW, halfW, 0, H, [OPENINGS.bedroomDoor, OPENINGS.washroomDoor]),
    mats.wall,
  );
  north.position.z = WALLS.north; // local u = world x
  const south = new THREE.Mesh(faceWithHoles(-halfW, halfW, 0, H, []), mats.wall);
  south.position.z = WALLS.south;
  south.rotation.y = Math.PI; // local u = -x
  const east = new THREE.Mesh(faceWithHoles(-halfD, halfD, 0, H, [OPENINGS.window]), mats.wall);
  east.position.x = WALLS.east;
  east.rotation.y = -Math.PI / 2; // local u = z
  const west = new THREE.Mesh(faceWithHoles(-halfD, halfD, 0, H, []), mats.wall);
  west.position.x = WALLS.west;
  west.rotation.y = Math.PI / 2; // local u = -z
  for (const m of [north, south, east, west]) group.add(receiver(m));

  // ------------------------------------------------ reveals (returns inside the openings)
  const reveal = (w: number, h: number, pos: THREE.Vector3, normal: THREE.Vector3, mat = mats.wall) => {
    const m = facePlane(new THREE.Mesh(metricPlane(w, h), mat), normal);
    m.position.copy(pos);
    group.add(receiver(m));
  };
  for (const o of [OPENINGS.bedroomDoor, OPENINGS.washroomDoor]) {
    const zc = WALLS.north - T / 2;
    const h = o.v1 - o.v0;
    reveal(T, h, new THREE.Vector3(o.u0, h / 2, zc), new THREE.Vector3(1, 0, 0));
    reveal(T, h, new THREE.Vector3(o.u1, h / 2, zc), new THREE.Vector3(-1, 0, 0));
    const head = facePlane(new THREE.Mesh(metricPlane(o.u1 - o.u0, T), mats.wall), new THREE.Vector3(0, -1, 0));
    head.position.set((o.u0 + o.u1) / 2, o.v1, zc);
    group.add(receiver(head));
  }
  {
    const o = OPENINGS.window;
    const xc = WALLS.east + T / 2;
    const h = o.v1 - o.v0;
    const w = o.u1 - o.u0;
    const yc = (o.v0 + o.v1) / 2;
    const side = (z: number, nz: number) => {
      const m = new THREE.Mesh(metricPlane(T, h), mats.wall);
      m.rotation.y = nz > 0 ? 0 : Math.PI;
      m.position.set(xc, yc, z);
      group.add(receiver(m));
    };
    side(o.u0, 1);
    side(o.u1, -1);
    const sill = new THREE.Mesh(metricPlane(T, w), mats.wall);
    sill.rotation.x = -Math.PI / 2;
    sill.position.set(xc, o.v0, WINDOW.centerZ);
    group.add(receiver(sill));
    const head = new THREE.Mesh(metricPlane(T, w), mats.wall);
    head.rotation.x = Math.PI / 2;
    head.position.set(xc, o.v1, WINDOW.centerZ);
    group.add(receiver(head));
  }

  // ------------------------------------------------ 0.23 m solids: shadow casters only
  // Invisible in the beauty pass; they give the sun real wall thickness and
  // real openings, so light only enters through the window.
  const proxies = new THREE.Group();
  proxies.name = 'shadowProxies';
  const P = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const m = boxBetween(mats.shadowProxy, x0, x1, y0, y1, z0, z1);
    m.castShadow = true;
    m.receiveShadow = false;
    proxies.add(m);
  };
  const xo = halfW + T;
  const zo = halfD + T;
  // south + west: solid
  P(-xo, xo, 0, H, WALLS.south, zo);
  P(-xo, WALLS.west, 0, H, -zo, zo);
  // north: piers between and around the doors, plus lintels
  {
    const b = OPENINGS.bedroomDoor;
    const w = OPENINGS.washroomDoor;
    P(-xo, b.u0, 0, H, -zo, WALLS.north);
    P(b.u1, w.u0, 0, H, -zo, WALLS.north);
    P(w.u1, xo, 0, H, -zo, WALLS.north);
    P(b.u0, b.u1, b.v1, H, -zo, WALLS.north);
    P(w.u0, w.u1, w.v1, H, -zo, WALLS.north);
  }
  // east: around the window
  {
    const o = OPENINGS.window;
    P(WALLS.east, xo, 0, H, -zo, o.u0);
    P(WALLS.east, xo, 0, H, o.u1, zo);
    P(WALLS.east, xo, 0, o.v0, o.u0, o.u1);
    P(WALLS.east, xo, o.v1, H, o.u0, o.u1);
  }
  // roof slab
  P(-xo, xo, H, H + ROOM.slabThickness, -zo, zo);
  group.add(proxies);

  // ------------------------------------------------ wall-top caps (dollhouse reads as a cut model)
  const cap = (x0: number, x1: number, z0: number, z1: number) => {
    const m = new THREE.Mesh(metricPlane(x1 - x0, z1 - z0), mats.wall);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, H + 0.001, (z0 + z1) / 2);
    m.receiveShadow = false;
    group.add(m);
  };
  cap(-xo, xo, -zo, WALLS.north);
  cap(-xo, xo, WALLS.south, zo);
  cap(-xo, WALLS.west, WALLS.north, WALLS.south);
  cap(WALLS.east, xo, WALLS.north, WALLS.south);

  // ------------------------------------------------ floor + ceiling
  const floor = new THREE.Mesh(metricPlane(ROOM.width, ROOM.depth), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.name = 'floor';
  group.add(receiver(floor));
  for (const o of [OPENINGS.bedroomDoor, OPENINGS.washroomDoor]) {
    const t = new THREE.Mesh(metricPlane(o.u1 - o.u0, T), mats.floor);
    t.rotation.x = -Math.PI / 2;
    t.position.set((o.u0 + o.u1) / 2, 0, WALLS.north - T / 2);
    group.add(receiver(t));
  }
  const ceiling = new THREE.Mesh(metricPlane(ROOM.width, ROOM.depth), mats.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  ceiling.name = 'ceiling';
  group.add(receiver(ceiling));

  // ------------------------------------------------ blue accent paint (south wall only, REF-D)
  const blueTop = H - ACCENT.topGap;
  const paintPanel = (x0: number, x1: number) => {
    const m = new THREE.Mesh(metricPlane(x1 - x0, blueTop), mats.accent);
    m.rotation.y = Math.PI;
    m.position.set((x0 + x1) / 2, blueTop / 2, WALLS.south - ACCENT.offset);
    group.add(receiver(m));
  };
  paintPanel(WALLS.west, PILLAR.x0); // wide main panel behind the bed
  paintPanel(PILLAR.x1, WALLS.east); // narrow left panel (study)

  // ------------------------------------------------ pillar + ceiling beam (REF-D)
  const pillar = boxBetween(mats.wall, PILLAR.x0, PILLAR.x1, 0, H, WALLS.south - PILLAR.projection, WALLS.south);
  pillar.name = 'pillar';
  group.add(caster(pillar));
  // Corner pillars and the pillar between the doors (CLIENT: 4" proud of the walls).
  for (const c of CORNER_PILLARS) {
    const p = boxBetween(mats.wall, c.x0, c.x1, 0, H, c.z0, c.z1);
    p.name = `pillar-${c.id}`;
    group.add(caster(p));
  }
  const dp = boxBetween(mats.wall, DOOR_PILLAR.x0 + DOOR_DETAIL.architraveWidth, DOOR_PILLAR.x1 - DOOR_DETAIL.architraveWidth, 0, H, WALLS.north, WALLS.north + DOOR_PILLAR.projection);
  dp.name = 'pillar-doors';
  group.add(caster(dp));
  const beam = boxBetween(mats.wall, BEAM.x0, BEAM.x1, H - BEAM.drop, H, WALLS.north, WALLS.south);
  beam.name = 'beam';
  group.add(caster(beam));

  // ------------------------------------------------ skirting
  group.add(buildSkirting(mats));

  // ------------------------------------------------ corridor behind the bedroom door
  group.add(buildHall(mats));

  const interior = new THREE.Box3(new THREE.Vector3(-halfW, 0, -halfD), new THREE.Vector3(halfW, H, halfD));
  return { group, interior };
}

/** Skirting profile: 12 mm thick, 100 mm tall, small top chamfer. */
function skirtingGeometry(length: number): THREE.ExtrudeGeometry {
  const s = new THREE.Shape();
  const t = SKIRTING.thickness;
  const h = SKIRTING.height;
  const b = SKIRTING.bevel;
  s.moveTo(0, 0);
  s.lineTo(t, 0);
  s.lineTo(t, h - b);
  s.lineTo(t - b * 0.6, h);
  s.lineTo(0, h);
  s.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false });
  // UVs in metres along the run.
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getZ(i), pos.getY(i) + pos.getX(i));
  g.computeVertexNormals();
  return g;
}

/**
 * One skirting run along a wall. `a`/`b` are (x,z) endpoints on the wall
 * face, `normal` points into the room.
 */
function skirtRun(mat: THREE.Material, a: [number, number], b: [number, number], normal: [number, number]): THREE.Mesh {
  const n = new THREE.Vector3(normal[0], 0, normal[1]);
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3().crossVectors(n, up); // extrusion axis
  const pa = new THREE.Vector3(a[0], 0, a[1]);
  const pb = new THREE.Vector3(b[0], 0, b[1]);
  const start = pa.dot(dir) < pb.dot(dir) ? pa : pb;
  const len = Math.abs(pb.clone().sub(pa).dot(dir));
  const m = new THREE.Mesh(skirtingGeometry(len), mat);
  m.matrixAutoUpdate = false;
  m.matrix.makeBasis(n, up, dir).setPosition(start);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function buildSkirting(mats: Materials): THREE.Group {
  const g = new THREE.Group();
  g.name = 'skirting';
  const m = mats.skirting;
  const { north, south, east, west } = WALLS;
  const bd = OPENINGS.bedroomDoor;
  const wd = OPENINGS.washroomDoor;
  const pz = south - PILLAR.projection;
  // north wall, broken at both doors
  g.add(skirtRun(m, [west, north], [bd.u0 - DOOR_DETAIL.architraveWidth, north], [0, 1]));
  g.add(skirtRun(m, [bd.u1 + DOOR_DETAIL.architraveWidth, north], [wd.u0 - DOOR_DETAIL.architraveWidth, north], [0, 1]));
  g.add(skirtRun(m, [wd.u1 + DOOR_DETAIL.architraveWidth, north], [east, north], [0, 1]));
  // south wall, around the pillar
  g.add(skirtRun(m, [west, south], [PILLAR.x0, south], [0, -1]));
  g.add(skirtRun(m, [PILLAR.x0, south], [PILLAR.x0, pz], [-1, 0]));
  g.add(skirtRun(m, [PILLAR.x0, pz], [PILLAR.x1, pz], [0, -1]));
  g.add(skirtRun(m, [PILLAR.x1, pz], [PILLAR.x1, south], [1, 0]));
  g.add(skirtRun(m, [PILLAR.x1, south], [east, south], [0, -1]));
  // east + west
  g.add(skirtRun(m, [east, north], [east, south], [-1, 0]));
  g.add(skirtRun(m, [west, north], [west, south], [1, 0]));
  return g;
}

/** A plain corridor volume so the open bedroom door does not reveal a void. */
function buildHall(mats: Materials): THREE.Group {
  const g = new THREE.Group();
  g.name = 'hall';
  const o = OPENINGS.bedroomDoor;
  const z1 = WALLS.north - T;
  const z0 = z1 - DOOR_DETAIL.hallDepth;
  const x0 = o.u0 - 1.2;
  const x1 = o.u1 + 0.3;
  const hallMat = mats.wall.clone();
  hallMat.side = THREE.BackSide;
  hallMat.color.multiplyScalar(0.85);
  const box = boxBetween(hallMat, x0, x1, 0, H, z0, z1);
  box.receiveShadow = true;
  g.add(box);
  const f = new THREE.Mesh(metricPlane(x1 - x0, z1 - z0), mats.floor);
  f.rotation.x = -Math.PI / 2;
  f.position.set((x0 + x1) / 2, 0.0005, (z0 + z1) / 2);
  f.receiveShadow = true;
  g.add(f);
  return g;
}
