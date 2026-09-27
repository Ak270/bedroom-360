import * as THREE from 'three';
import { BED, WALLS } from '../../config/room.config';
import { boxBetween } from '../../geometry/metric';
import { drapeGeometry, pillowGeometry, planarUV, softBox } from '../../geometry/soft';
import { mesh, shadows, type Mats, type Piece } from './common';

/** King bed on the blue wall: platform, mattress, channel headboard, bedding (REF-A). */
export function buildBed({ base, f }: Mats): Piece {
  const g = new THREE.Group();
  g.name = 'bed';
  const cx = BED.centerX;
  const hb = BED.headboard;
  const mt = BED.mattress;
  const b = BED.base;
  const hbFront = WALLS.south - hb.depth; // 1.742, where the mattress stops

  // ---- hydraulic-storage platform (walnut) with a recessed toe-kick
  const bz1 = hbFront;
  const bz0 = bz1 - b.l;
  const bx0 = cx - b.w / 2;
  const bx1 = cx + b.w / 2;
  g.add(boxBetween(base.walnutH, bx0, bx1, b.kick, b.h, bz0, bz1));
  g.add(boxBetween(base.blackMetal, bx0 + b.recess, bx1 - b.recess, 0, b.kick, bz0 + b.recess, bz1 - b.recess));

  // ---- mattress (only its quilted band shows under the coverlet hem)
  const mat = mesh(planarUV(softBox(mt.w, mt.h, mt.l, 0.05, 0.008, 2), 'xy'), f.mattress);
  mat.position.set(cx, b.h + mt.h / 2, (mt.z0 + mt.z1) / 2);
  g.add(mat);
  const top = b.h + mt.h;

  // ---- headboard: walnut frame + 9 puffy vertical channels
  const hx0 = cx - hb.width / 2;
  const hx1 = cx + hb.width / 2;
  const back = WALLS.south;
  g.add(boxBetween(base.walnutH, hx0, hx1, hb.bottom, hb.top, back - 0.03, back)); // backboard
  g.add(boxBetween(base.walnutV, hx0, hx0 + hb.frame, hb.bottom, hb.top, hbFront, back));
  g.add(boxBetween(base.walnutV, hx1 - hb.frame, hx1, hb.bottom, hb.top, hbFront, back));
  g.add(boxBetween(base.walnutH, hx0, hx1, hb.top - hb.frame, hb.top, hbFront, back));
  const innerW = hb.width - 2 * hb.frame;
  const cw = (innerW - (hb.channels - 1) * hb.groove) / hb.channels;
  const ch = hb.top - hb.frame - hb.bottom - 0.004;
  const cd = hb.depth - 0.03 - 0.004;
  for (let i = 0; i < hb.channels; i++) {
    const geo = planarUV(softBox(cw, ch, cd, 0.022, hb.puff, 10 + i), 'xy');
    const c = mesh(geo, f.headboardFabric);
    c.position.set(hx0 + hb.frame + cw / 2 + i * (cw + hb.groove), hb.bottom + ch / 2, back - 0.03 - cd / 2);
    g.add(c);
  }

  // ---- coverlet: draped over mattress, hangs 0.30 at sides and foot
  const cv = BED.coverlet;
  const mx0 = cx - mt.w / 2;
  const mx1 = cx + mt.w / 2;
  // The platform is wider than the mattress, so hanging fabric must clear
  // its edge: the drape's vertical plane sits just outside the base.
  const clearBase = (b.w - mt.w) / 2 + 0.005;
  const cover = mesh(
    drapeGeometry({
      x0: mx0 - clearBase,
      x1: mx1 + clearBase,
      z0: mt.z0 - clearBase,
      z1: mt.z1 - 0.02,
      top: top + cv.lift,
      radius: clearBase,
      dropX: cv.drop,
      dropZ0: cv.drop,
      dropZ1: 0,
      foldWave: cv.foldWave,
      foldAmp: cv.foldAmp,
      seed: 3,
    }),
    f.coverlet,
  );
  cover.name = 'coverlet';
  g.add(cover);

  // ---- dusty-blue throw across the lower third
  const th = BED.throw;
  const tz = mt.z0 + th.centerFromFoot;
  const throwMesh = mesh(
    drapeGeometry({
      x0: mx0 - clearBase - 0.02,
      x1: mx1 + clearBase + 0.02,
      z0: tz - th.width / 2,
      z1: tz + th.width / 2,
      top: top + cv.lift + th.thickness,
      radius: clearBase + 0.02,
      dropX: th.overhang,
      dropZ0: 0,
      dropZ1: 0,
      foldWave: 0.26,
      foldAmp: 0.008,
      seed: 9,
      segs: 110,
    }),
    f.throwBlue,
  );
  throwMesh.name = 'throw';
  g.add(throwMesh);

  // ---- pillows, leaning back against the headboard
  const P = BED.pillows;
  const lean = (
    geo: THREE.BufferGeometry,
    m: THREE.Material,
    x: number,
    z: number,
    d: number,
    tiltDeg: number,
    yaw: number,
  ) => {
    const p = mesh(geo, m);
    const a = THREE.MathUtils.degToRad(tiltDeg);
    p.rotation.set(-a, yaw, 0, 'YXZ');
    p.position.set(x, top + cv.lift + (d / 2) * Math.sin(a) - 0.01, z);
    g.add(p);
  };
  const sp = P.sleeping;
  for (const [i, s] of [-1, 1].entries()) {
    lean(pillowGeometry(sp.w, sp.d, sp.h, 20 + i), f.pillowCream, cx + s * 0.4, hbFront - 0.17, sp.d, 70, s * -0.03);
  }
  const eu = P.euro;
  for (const [i, s] of [-1, 1].entries()) {
    lean(pillowGeometry(eu.w, eu.d, eu.h, 30 + i), f.pillowBlue, cx + s * 0.31, hbFront - 0.36, eu.d, 64, s * 0.05);
  }
  const lu = P.lumbar;
  lean(pillowGeometry(lu.w, lu.d, lu.h, 40), f.lumbar, cx, hbFront - 0.53, lu.d, 58, 0.02);

  shadows(g);
  return { group: g };
}
