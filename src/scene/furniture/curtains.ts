import * as THREE from 'three';
import { CURTAIN, ROOM } from '../../config/room.config';
import { curtainGeometry } from '../../geometry/soft';
import { mesh, type Mats, type Piece } from './common';

/** Ceiling track, heavy sand linen stacked north, white voile across the window. */
export function buildCurtains({ base, f }: Mats): Piece {
  const g = new THREE.Group();
  g.name = 'curtains';
  const C = CURTAIN;
  const len = C.z1 - C.z0 + 0.1;
  const track = mesh(new THREE.BoxGeometry(0.03, 0.02, len), base.blackMetal);
  track.position.set(C.trackX, C.trackY + 0.02, (C.z0 + C.z1) / 2);
  g.add(track);
  for (const z of [C.z0 + 0.1, (C.z0 + C.z1) / 2, C.z1 - 0.1]) {
    const bracket = mesh(new THREE.CylinderGeometry(0.008, 0.008, ROOM.ceilingH - C.trackY - 0.02, 8), base.blackMetal);
    bracket.position.set(C.trackX, (ROOM.ceilingH + C.trackY + 0.02) / 2, z);
    g.add(bracket);
  }

  const bottom = C.floorGap;
  const hv = C.heavy;
  const heavy = mesh(curtainGeometry(C.trackX, hv.z0, hv.z1, C.trackY, bottom, hv.wavelength, hv.amplitude, 5), f.heavyCurtain);
  heavy.name = 'heavyCurtain';
  g.add(heavy);

  // Voile sits just in front of the heavy curtain's track line.
  const sh = C.sheer;
  const sheer = mesh(curtainGeometry(C.trackX + sh.offsetX, sh.z0, sh.z1, C.trackY, bottom + 0.01, sh.wavelength, sh.amplitude, 8), f.sheer, false, true);
  sheer.name = 'sheer';
  sheer.renderOrder = 3;
  g.add(sheer);
  return { group: g };
}
