import * as THREE from 'three';
import { ACCENT, DESK, ROOM, WALLS } from '../../config/room.config';
import { boxBetween, metricBox } from '../../geometry/metric';
import { planarUV, softBox } from '../../geometry/soft';
import { ledStrip, mesh, shadows, type InteriorLights, type Mats, type Piece } from './common';
import { bookStack } from './bedside';
import { smallPlant, trailingPothos } from './plants';

/** Upright books on a shelf: varied heights, one leaning. */
function bookRow(m: Mats, count: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  let x = 0;
  for (let i = 0; i < count; i++) {
    const h = 0.18 + ((seed + i * 5) % 6) * 0.012;
    const t = 0.022 + ((seed + i * 3) % 4) * 0.006;
    const d = 0.15 + ((seed + i) % 3) * 0.012;
    const geo = new THREE.BoxGeometry(t, h, d);
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const slot = (seed + i * 5) % 8;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (slot + uv.getX(k)) / 8);
    const b = mesh(geo, m.f.books);
    const leanLast = i === count - 1;
    b.rotation.z = leanLast ? -0.25 : 0;
    b.position.set(x + t / 2 + (leanLast ? 0.03 : 0), h / 2 - (leanLast ? 0.01 : 0), 0);
    g.add(b);
    x += t + 0.001;
  }
  return shadows(g);
}

/** Black mesh ergonomic chair with headrest; built facing -Z, back at +Z. */
function chair(m: Mats): THREE.Group {
  const { f } = m;
  const g = new THREE.Group();
  // 5-star nylon base with casters
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = new THREE.Group();
    const bar = mesh(metricBox(0.04, 0.03, 0.3), f.nylon);
    bar.position.set(0, 0.075, 0.16);
    bar.rotation.x = -0.1;
    const caster = mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.022, 16), f.nylon);
    caster.rotation.z = Math.PI / 2;
    caster.position.set(0, 0.026, 0.3);
    const fork = mesh(metricBox(0.03, 0.03, 0.03), f.nylon);
    fork.position.set(0, 0.05, 0.3);
    arm.add(bar, caster, fork);
    arm.rotation.y = a;
    g.add(arm);
  }
  const hub = mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 20), f.nylon);
  hub.position.y = 0.09;
  const gas = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.3, 20), f.chrome);
  gas.position.y = 0.26;
  const mech = mesh(metricBox(0.2, 0.05, 0.22), f.nylon);
  mech.position.y = 0.42;
  g.add(hub, gas, mech);
  // Seat: padded shell
  const seat = mesh(planarUV(softBox(0.5, 0.07, 0.48, 0.03, 0.01, 81), 'xz'), f.nylon);
  seat.position.set(0, 0.48, 0);
  g.add(seat);
  // Backrest: tubular frame + hex mesh, reclined ~10 deg
  const back = new THREE.Group();
  const bw = 0.46, bh = 0.55;
  const outline = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(-bw / 2, 0, 0),
      new THREE.Vector3(-bw / 2 - 0.01, bh * 0.5, 0.02),
      new THREE.Vector3(-bw / 2 + 0.03, bh, 0),
      new THREE.Vector3(0, bh + 0.02, 0.01),
      new THREE.Vector3(bw / 2 - 0.03, bh, 0),
      new THREE.Vector3(bw / 2 + 0.01, bh * 0.5, 0.02),
      new THREE.Vector3(bw / 2, 0, 0),
      new THREE.Vector3(0, -0.02, 0.02),
    ],
    true,
  );
  back.add(mesh(new THREE.TubeGeometry(outline, 80, 0.013, 8, true), f.nylon));
  const meshGeo = new THREE.PlaneGeometry(bw, bh, 8, 8);
  const pos = meshGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    pos.setZ(i, 0.04 * (1 - Math.pow((2 * x) / bw, 2))); // lumbar curve
  }
  meshGeo.computeVertexNormals();
  planarUV(meshGeo, 'xy');
  const net = mesh(meshGeo, f.chairMesh);
  net.position.y = bh / 2;
  back.add(net);
  // Headrest
  const hr = mesh(planarUV(softBox(0.28, 0.12, 0.05, 0.02, 0.006, 82), 'xy'), f.nylon);
  hr.position.set(0, bh + 0.14, 0.03);
  const hrPost = mesh(metricBox(0.03, 0.12, 0.02), f.nylon);
  hrPost.position.set(0, bh + 0.06, 0.03);
  back.add(hr, hrPost);
  back.position.set(0, 0.56, 0.24);
  back.rotation.x = 0.17;
  const spine = mesh(metricBox(0.05, 0.2, 0.03), f.nylon);
  spine.position.set(0, 0.5, 0.25);
  spine.rotation.x = -0.4;
  g.add(back, spine);
  // Armrests
  for (const s of [-1, 1]) {
    const post = mesh(metricBox(0.025, 0.2, 0.04), f.nylon);
    post.position.set(s * 0.27, 0.58, 0.04);
    const pad = mesh(planarUV(softBox(0.07, 0.03, 0.24, 0.012, 0.003, 83), 'xz'), f.nylon);
    pad.position.set(s * 0.27, 0.69, 0.02);
    g.add(post, pad);
  }
  return shadows(g);
}

function laptop(m: Mats): THREE.Group {
  const { f } = m;
  const g = new THREE.Group();
  const w = 0.32, d = 0.22;
  const baseM = mesh(metricBox(w, 0.012, d), f.aluminium);
  baseM.position.y = 0.006;
  const keys = mesh(metricBox(w * 0.85, 0.001, d * 0.45), f.nylon);
  keys.position.set(0, 0.0125, 0.02);
  g.add(baseM, keys);
  const lid = new THREE.Group();
  const shell = mesh(metricBox(w, 0.006, d), f.aluminium);
  shell.position.z = -d / 2;
  const scr = mesh(new THREE.PlaneGeometry(w * 0.92, d * 0.88), f.screen, false, false);
  // Inner face of the closed lid looks down (-Y); opening turns it to the user.
  scr.rotation.x = Math.PI / 2;
  scr.position.set(0, -0.0032, -d / 2);
  lid.add(shell, scr);
  lid.position.set(0, 0.012, d / 2);
  lid.rotation.x = Math.PI / 2 + 0.26; // open ~105 deg
  g.add(lid);
  return shadows(g);
}

export function buildStudy(m: Mats, lights: InteriorLights): Piece {
  const { base, f } = m;
  const g = new THREE.Group();
  g.name = 'study';
  const A = DESK.legA, B = DESK.legB;
  const top = DESK.top;

  // ---- L-shaped oak top (one extrusion so the grain runs continuously)
  const s = new THREE.Shape();
  // Notched around the 4" corner pillar in the SE corner.
  const cp = ROOM.pillarProud;
  s.moveTo(A.x0, A.z0);
  s.lineTo(B.x0, A.z0);
  s.lineTo(B.x0, B.z0);
  s.lineTo(B.x1, B.z0);
  s.lineTo(B.x1, A.z1 - cp);
  s.lineTo(A.x1 - cp, A.z1 - cp);
  s.lineTo(A.x1 - cp, A.z1);
  s.lineTo(A.x0, A.z1);
  s.closePath();
  const topGeo = new THREE.ExtrudeGeometry(s, { depth: DESK.thickness, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 });
  topGeo.rotateX(Math.PI / 2); // shape y -> world z, extrusion -> -y
  topGeo.translate(0, top, 0);
  g.add(mesh(topGeo, f.oak));

  // ---- walnut 3-drawer pedestal under leg B, drawers facing the chair (-X)
  const P = DESK.pedestal;
  const px0 = B.x0 + 0.02, px1 = B.x1 - 0.01;
  const ptop = top - DESK.thickness - 0.004;
  g.add(boxBetween(base.walnutH, px0 + 0.018, px1, 0.02, ptop, P.z0, P.z1));
  const dh = (ptop - 0.02 - 0.003 * (P.drawers + 1)) / P.drawers;
  for (let i = 0; i < P.drawers; i++) {
    const y0 = 0.02 + 0.003 + i * (dh + 0.003);
    g.add(boxBetween(base.walnutH, px0, px0 + 0.018, y0, y0 + dh, P.z0 + 0.003, P.z1 - 0.003));
    const pull = mesh(metricBox(0.014, 0.01, 0.08), base.brass);
    pull.position.set(px0 - 0.007, y0 + dh - 0.04, (P.z0 + P.z1) / 2);
    g.add(pull);
  }
  // ---- slim walnut end panel supporting leg A beside the pillar
  g.add(boxBetween(base.walnutV, A.x0 + 0.005, A.x0 + 0.025, 0, top - DESK.thickness, A.z0 + 0.02, A.z1 - 0.005));

  // ---- floating shelves on the narrow blue panel, with warm LED strips
  const S = DESK.shelves;
  const wall = WALLS.south - ACCENT.offset;
  S.ys.forEach((y, i) => {
    g.add(boxBetween(base.walnutH, S.x - S.w / 2, S.x + S.w / 2, y - S.t / 2, y + S.t / 2, wall - S.d, wall));
    g.add(ledStrip(lights, S.w - 0.06, 3.5, '#FFB870', new THREE.Vector3(S.x, y - S.t / 2 - 0.003, wall - S.d + 0.03), false));
    const row = bookRow(m, i === 0 ? 7 : 5, 3 + i * 4);
    row.position.set(S.x - S.w / 2 + 0.04, y + S.t / 2, wall - S.d / 2);
    g.add(row);
  });
  const pothos = trailingPothos(m, 91, 0.55);
  pothos.position.set(S.x + 0.28, S.ys[1] + S.t / 2, wall - S.d / 2 + 0.02);
  g.add(pothos);
  const stack = bookStack(m, 2, 11);
  stack.position.set(S.x + 0.3, S.ys[0] + S.t / 2, wall - S.d / 2);
  g.add(stack);

  // ---- desk top items
  const lap = laptop(m);
  // Items placed relative to the desk corner (east wall / south wall).
  const lapX = ROOM.halfW - 0.52, lapZ = ROOM.halfD - 0.36;
  lap.position.set(lapX, top, lapZ);
  // Local -Z (user side) points at the chair: (-sin, -cos) = normalize(chair - laptop).
  lap.rotation.y = Math.atan2(lapX - DESK.chair.x, lapZ - DESK.chair.z);
  g.add(lap);
  const plant = smallPlant(m, 95, 0.055, 0.09, 0.13, 12);
  plant.position.set(ROOM.halfW - cp - 0.12, top, ROOM.halfD - cp - 0.1);
  g.add(plant);
  const mug = mesh(new THREE.CylinderGeometry(0.04, 0.036, 0.09, 32, 1, true), f.ceramic);
  mug.position.set(ROOM.halfW - 0.3, top + 0.045, ROOM.halfD - 0.72);
  g.add(mug);

  // ---- chair, facing the SE corner
  const c = chair(m);
  c.position.set(DESK.chair.x, 0, DESK.chair.z);
  c.rotation.y = -Math.PI * 0.75; // local -Z -> (+X, +Z)
  g.add(c);

  shadows(g);
  return { group: g };
}
