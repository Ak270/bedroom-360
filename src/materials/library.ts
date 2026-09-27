import * as THREE from 'three';
import { FLOOR, PALETTE } from '../config/room.config';
import { loadImage, loadTexture, withRepeat } from '../core/assets';
import { makeFloorTextures, tintedTexture } from './canvasTextures';
import { brushedNormal, orangePeelNormal } from './proceduralTextures';

/**
 * All geometry in this project carries UVs in metres (see geometry/metric.ts),
 * so a texture's repeat is simply 1 / (metres covered by one tile of the image).
 */
const PLASTER_SPAN = 1.6;
const WOOD_SPAN = 1.2;

export interface Materials {
  wall: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  floor: THREE.MeshPhysicalMaterial;
  skirting: THREE.MeshPhysicalMaterial;
  walnutH: THREE.MeshStandardMaterial;
  walnutV: THREE.MeshStandardMaterial;
  paintedWood: THREE.MeshStandardMaterial;
  brass: THREE.MeshStandardMaterial;
  blackMetal: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  plastic: THREE.MeshPhysicalMaterial;
  /** Invisible in the beauty pass but still rendered into shadow maps. */
  shadowProxy: THREE.MeshStandardMaterial;
}

export async function createMaterials(anisotropy: number): Promise<Materials> {
  const [marble, plaster, walnut, plasterNor, walnutNor, walnutRough, marbleNor] = await Promise.all([
    loadImage('tex/marble012_diff.jpg'),
    loadImage('tex/white_plaster_02_diff.jpg'),
    loadImage('tex/american_walnut_veneer_diff.jpg'),
    loadTexture('tex/white_plaster_02_nor.jpg', 'data'),
    loadTexture('tex/american_walnut_veneer_nor.jpg', 'data'),
    loadTexture('tex/american_walnut_veneer_rough.jpg', 'data'),
    loadTexture('tex/marble012_nor.jpg', 'data'),
  ]);

  // ---- paint: faint plaster variation + very subtle normal, matt (REF-D)
  const paintBase = tintedTexture(plaster, '#FFFFFF', 0.08, anisotropy);
  const plasterRepeat = 1 / PLASTER_SPAN;
  const paintMap = withRepeat(paintBase, plasterRepeat, plasterRepeat);
  const paintNor = withRepeat(plasterNor, plasterRepeat, plasterRepeat);
  const paint = (hex: string) =>
    new THREE.MeshStandardMaterial({
      color: hex,
      map: paintMap,
      normalMap: paintNor,
      normalScale: new THREE.Vector2(0.12, 0.12),
      roughness: 0.9,
      metalness: 0,
    });

  const wall = paint(PALETTE.cream);
  wall.shadowSide = THREE.DoubleSide;
  const accent = paint(PALETTE.petrolBlue);
  accent.roughness = 0.88;
  const ceiling = paint(PALETTE.ceiling);
  const paintedWood = paint(PALETTE.cream);
  paintedWood.roughness = 0.55;
  paintedWood.normalScale.set(0.04, 0.04);

  // ---- floor: composed vitrified tiles (REF-D)
  const ft = makeFloorTextures(marble, anisotropy);
  const fr = 1 / ft.span;
  for (const t of [ft.map, ft.roughnessMap, ft.bumpMap]) t.repeat.set(fr, fr);
  const floor = new THREE.MeshPhysicalMaterial({
    map: ft.map,
    roughnessMap: ft.roughnessMap,
    roughness: 1, // the map carries the ~0.15 polish
    bumpMap: ft.bumpMap,
    bumpScale: 0.6,
    clearcoat: FLOOR.clearcoat,
    clearcoatRoughness: FLOOR.clearcoatRoughness,
    metalness: 0,
  });

  // ---- skirting: darker marble, honed
  const skirtMap = tintedTexture(marble, PALETTE.skirting, 0.55, anisotropy, 512);
  skirtMap.repeat.set(1 / 0.6, 1 / 0.6);
  const skirting = new THREE.MeshPhysicalMaterial({
    map: skirtMap,
    normalMap: withRepeat(marbleNor, 1 / 0.6, 1 / 0.6),
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughness: 0.28,
    clearcoat: 0.3,
    clearcoatRoughness: 0.2,
  });

  // ---- walnut: veneer grain re-tinted to the REF-A walnut stain
  const walnutMap = tintedTexture(walnut, PALETTE.walnut, 1.6, anisotropy);
  const wr = 1 / WOOD_SPAN;
  const wood = (rotation: number) =>
    new THREE.MeshStandardMaterial({
      map: withRepeat(walnutMap, wr, wr, rotation),
      normalMap: withRepeat(walnutNor, wr, wr, rotation),
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughnessMap: withRepeat(walnutRough, wr, wr, rotation),
      roughness: 0.9, // map mean ~0.55 -> effective ~0.5
      metalness: 0,
    });
  const walnutH = wood(0);
  const walnutV = wood(Math.PI / 2);

  // Brushed brass: streaked normal + anisotropic highlight (stretched along the brushing).
  const brushed = brushedNormal();
  brushed.repeat.set(1 / 0.08, 1 / 0.08);
  const brass = new THREE.MeshPhysicalMaterial({
    color: PALETTE.brass,
    metalness: 1,
    roughness: 0.3,
    normalMap: brushed,
    normalScale: new THREE.Vector2(0.18, 0.18),
    anisotropy: 0.55,
  });
  // Powder-coated steel: satin with orange-peel texture.
  const peel = orangePeelNormal();
  peel.repeat.set(1 / 0.06, 1 / 0.06);
  const blackMetal = new THREE.MeshStandardMaterial({
    color: PALETTE.blackMetal,
    metalness: 0.35,
    roughness: 0.48,
    normalMap: peel,
    normalScale: new THREE.Vector2(0.25, 0.25),
  });

  const glass = new THREE.MeshPhysicalMaterial({
    color: PALETTE.glass,
    metalness: 0,
    roughness: 0.03,
    transparent: true,
    opacity: 0.06, // mostly specular: a higher opacity reads as a grey veil
    envMapIntensity: 1.6,
    specularIntensity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const plastic = new THREE.MeshPhysicalMaterial({
    color: '#F4F2EC',
    normalMap: peel,
    normalScale: new THREE.Vector2(0.08, 0.08),
    roughness: 0.35,
    clearcoat: 0.4,
    clearcoatRoughness: 0.3,
  });

  const shadowProxy = new THREE.MeshStandardMaterial({ colorWrite: false, depthWrite: false });

  return { wall, accent, ceiling, floor, skirting, walnutH, walnutV, paintedWood, brass, blackMetal, glass, plastic, shadowProxy };
}
