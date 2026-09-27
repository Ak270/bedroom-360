import * as THREE from 'three';
import { buildArt, buildRug } from './art';
import { buildBed } from './bed';
import { buildBedside } from './bedside';
import { newLights, type InteriorLights, type Mats, type Piece } from './common';
import { buildCurtains } from './curtains';
import { buildFan } from './fan';
import { buildAreca } from './plants';
import { buildStudy } from './study';
import { buildWestWall, type Wardrobe } from './wardrobe';

export interface Furniture {
  group: THREE.Group;
  lights: InteriorLights;
  wardrobe: Wardrobe;
  update(elapsed: number, dt: number): void;
}

/** M2: every furnishing, plus the lights they own (lamps, sconce, LEDs). */
export function buildFurniture(m: Mats): Furniture {
  const group = new THREE.Group();
  group.name = 'furniture';
  const lights = newLights();
  const west = buildWestWall(m, lights);
  const pieces: Piece[] = [
    buildRug(m),
    buildBed(m),
    buildBedside(m, lights),
    buildArt(m, lights),
    buildStudy(m, lights),
    west,
    buildFan(m),
    buildCurtains(m),
    buildAreca(m),
  ];
  for (const p of pieces) group.add(p.group);
  const updaters = pieces.filter((p) => p.update);
  return {
    group,
    lights,
    wardrobe: west.wardrobe,
    update(elapsed, dt) {
      for (const p of updaters) p.update!(elapsed, dt);
    },
  };
}
