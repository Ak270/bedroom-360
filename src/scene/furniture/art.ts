import * as THREE from 'three';
import { ACCENT, ART, RUG, SCONCE, WALLS } from '../../config/room.config';
import { boxBetween, metricPlane } from '../../geometry/metric';
import { lathe, mesh, shadows, type InteriorLights, type Mats, type Piece } from './common';

/** Three framed prints over the bed + brass sconce washing them (REF-A, REF-D wall point). */
export function buildArt(m: Mats, lights: InteriorLights): Piece {
  const { base, f } = m;
  const g = new THREE.Group();
  g.name = 'art';
  const wall = WALLS.south - ACCENT.offset;
  const zb = wall; // frame back
  const zf = wall - ART.depth; // frame front
  const y0 = ART.bottom;
  const y1 = y0 + ART.h;
  for (let i = 0; i < 3; i++) {
    // Viewed from the room (looking south) screen-left is +X: print 0 sits east.
    const cx = ART.centerX - (i - 1) * (ART.w + ART.gap);
    const x0 = cx - ART.w / 2, x1 = cx + ART.w / 2;
    const fw = ART.frame;
    g.add(boxBetween(base.walnutH, x0, x1, y1 - fw, y1, zf, zb));
    g.add(boxBetween(base.walnutH, x0, x1, y0, y0 + fw, zf, zb));
    g.add(boxBetween(base.walnutV, x0, x0 + fw, y0 + fw, y1 - fw, zf, zb));
    g.add(boxBetween(base.walnutV, x1 - fw, x1, y0 + fw, y1 - fw, zf, zb));
    // Cream mat, then the print set 2 mm behind the mat's window.
    const matW = ART.w - 2 * fw;
    const matH = ART.h - 2 * fw;
    const matShape = new THREE.Shape();
    matShape.moveTo(-matW / 2, -matH / 2);
    matShape.lineTo(matW / 2, -matH / 2);
    matShape.lineTo(matW / 2, matH / 2);
    matShape.lineTo(-matW / 2, matH / 2);
    const hole = new THREE.Path();
    const pw = matW - 2 * ART.mat, ph = matH - 2 * ART.mat;
    hole.moveTo(-pw / 2, -ph / 2);
    hole.lineTo(-pw / 2, ph / 2);
    hole.lineTo(pw / 2, ph / 2);
    hole.lineTo(pw / 2, -ph / 2);
    matShape.holes.push(hole);
    const matMesh = mesh(new THREE.ShapeGeometry(matShape), f.artMat);
    matMesh.rotation.y = Math.PI;
    matMesh.position.set(cx, (y0 + y1) / 2, zf + 0.008);
    const print = mesh(new THREE.PlaneGeometry(pw, ph), f.art[i]);
    print.rotation.y = Math.PI;
    print.position.set(cx, (y0 + y1) / 2, zf + 0.01);
    const backing = mesh(metricPlane(matW, matH), f.artMat);
    backing.rotation.y = Math.PI;
    backing.position.set(cx, (y0 + y1) / 2, zb - 0.001);
    g.add(matMesh, print, backing);
  }

  // Sconce on the existing wall point: backplate, arm, down-facing cup.
  const sx = ART.centerX;
  const sconce = new THREE.Group();
  const plate = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 32), base.brass);
  plate.rotation.x = Math.PI / 2;
  plate.position.z = -0.006;
  const arm = mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 12), base.brass);
  arm.rotation.x = Math.PI / 2;
  arm.position.z = -0.05;
  const cup = mesh(lathe([[0.012, 0.06], [0.035, 0.055], [0.05, 0.0], [0.047, 0.0], [0.032, 0.05], [0.01, 0.055]], 40), base.brass);
  cup.position.set(0, -0.045, -0.1);
  const glow = mesh(new THREE.CircleGeometry(0.044, 32), new THREE.MeshStandardMaterial({ color: '#fff2da', emissive: '#FFC27E', emissiveIntensity: 3 }), false, false);
  glow.rotation.x = Math.PI / 2;
  glow.position.set(0, -0.043, -0.1);
  sconce.add(plate, arm, cup, glow);
  sconce.position.set(sx, SCONCE.y, wall);
  g.add(sconce);
  const L = SCONCE.light;
  const spot = new THREE.SpotLight(L.color, L.intensity, L.distance, L.angle, L.penumbra, L.decay);
  spot.position.set(sx, SCONCE.y - 0.05, wall - 0.1);
  spot.target.position.set(sx, ART.bottom + ART.h * 0.4, wall);
  spot.castShadow = false;
  g.add(spot, spot.target);
  lights.sconce.push(spot);
  lights.emissive.push({ material: glow.material as THREE.MeshStandardMaterial, on: 3 });

  shadows(g, true, true);
  glow.castShadow = false;
  return { group: g };
}

/** 2.60 x 2.10 low-pile rug with geometric border (AGREED size). */
export function buildRug({ f }: Mats): Piece {
  const g = new THREE.Group();
  g.name = 'rug';
  const rug = mesh(new THREE.BoxGeometry(RUG.w, RUG.t, RUG.d), f.rug, false, true);
  rug.position.set(RUG.cx, RUG.t / 2, RUG.cz);
  g.add(rug);
  return { group: g };
}
