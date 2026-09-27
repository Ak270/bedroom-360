import * as THREE from 'three';
import { LAMP, PALETTE } from '../config/room.config';
import { loadImage, loadTexture, withRepeat } from '../core/assets';
import { tintedTexture } from './canvasTextures';
import {
  artTexture,
  boucleNormal,
  bookSpineTexture,
  clockFaceTexture,
  glowTexture,
  hexMeshAlpha,
  knitNormal,
  leafTexture,
  laptopScreenTexture,
  quiltNormal,
  rugTextures,
  voileAlpha,
} from './proceduralTextures';

/** Furniture-level materials. Every surface is PBR and textured (no flat colours). */
export interface FurnitureMaterials {
  headboardFabric: THREE.MeshPhysicalMaterial;
  coverlet: THREE.MeshPhysicalMaterial;
  pillowCream: THREE.MeshPhysicalMaterial;
  pillowBlue: THREE.MeshPhysicalMaterial;
  lumbar: THREE.MeshPhysicalMaterial;
  throwBlue: THREE.MeshPhysicalMaterial;
  mattress: THREE.MeshPhysicalMaterial;
  rug: THREE.MeshPhysicalMaterial;
  oak: THREE.MeshStandardMaterial;
  wardrobe: THREE.MeshPhysicalMaterial;
  lacquer: THREE.MeshPhysicalMaterial;
  boucle: THREE.MeshPhysicalMaterial;
  ceramic: THREE.MeshPhysicalMaterial;
  ceramicWoven: THREE.MeshStandardMaterial;
  soil: THREE.MeshStandardMaterial;
  leaf: THREE.MeshPhysicalMaterial;
  leafDark: THREE.MeshPhysicalMaterial;
  stem: THREE.MeshStandardMaterial;
  shade: THREE.MeshPhysicalMaterial;
  heavyCurtain: THREE.MeshPhysicalMaterial;
  sheer: THREE.MeshPhysicalMaterial;
  mirror: THREE.MeshStandardMaterial;
  chairMesh: THREE.MeshStandardMaterial;
  nylon: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  aluminium: THREE.MeshStandardMaterial;
  screen: THREE.MeshStandardMaterial;
  books: THREE.MeshStandardMaterial;
  paper: THREE.MeshStandardMaterial;
  clockFace: THREE.MeshStandardMaterial;
  art: THREE.MeshStandardMaterial[];
  artMat: THREE.MeshStandardMaterial;
  ledGlow: THREE.MeshBasicMaterial;
  /** Cotton/linen cloth in any colour (cached): garments, folded stacks, bags. */
  cloth(hex: string): THREE.MeshStandardMaterial;
  velvet: THREE.MeshPhysicalMaterial;
  zari: THREE.MeshStandardMaterial;
  safeSteel: THREE.MeshStandardMaterial;
  interiorLed: THREE.MeshStandardMaterial;
  lampGlow: THREE.MeshBasicMaterial;
  glowTex: THREE.Texture;
}

const FABRIC_SPAN = 0.45; // metres per linen texture repeat

export async function createFurnitureMaterials(anisotropy: number): Promise<FurnitureMaterials> {
  const [linen, boucle, oak, linenNor, linenRough, boucleNor, oakNor, oakRough, weaveNor] = await Promise.all([
    loadImage('tex/rough_linen_diff.jpg'),
    loadImage('tex/wool_boucle_diff.jpg'),
    loadImage('tex/white_oak_veneer_diff.jpg'),
    loadTexture('tex/rough_linen_nor.jpg', 'data'),
    loadTexture('tex/rough_linen_rough.jpg', 'data'),
    loadTexture('tex/wool_boucle_nor.jpg', 'data'),
    loadTexture('tex/white_oak_veneer_nor.jpg', 'data'),
    loadTexture('tex/white_oak_veneer_rough.jpg', 'data'),
    loadTexture('tex/fabric_pattern_05_nor.jpg', 'data'),
  ]);
  const fr = 1 / FABRIC_SPAN;

  /** Woven fabric: linen grain re-tinted to `hex`, sheen for the soft rim. */
  const fabric = (hex: string, contrast: number, normal: THREE.Texture, normalScale: number, repeat = fr, sheen = 0.6) =>
    new THREE.MeshPhysicalMaterial({
      map: withRepeat(tintedTexture(linen, hex, contrast, anisotropy, 512), repeat, repeat),
      normalMap: withRepeat(normal, repeat, repeat),
      normalScale: new THREE.Vector2(normalScale, normalScale),
      roughnessMap: withRepeat(linenRough, repeat, repeat),
      roughness: 1,
      sheen,
      sheenRoughness: 0.75,
      sheenColor: new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.45),
      side: THREE.FrontSide,
    });

  const headboardFabric = fabric(PALETTE.greige, 0.35, linenNor, 0.6, 1 / 0.3);

  // Coverlet: cream linen + embossed diamond quilting.
  const quilt = quiltNormal();
  const coverlet = fabric(PALETTE.coverlet, 0.25, quilt, 0.45, 1 / 0.7);
  coverlet.side = THREE.DoubleSide;

  // Pillows: stronger weave relief and less sheen so they read as cotton, not satin balloons.
  const pillowCream = fabric('#EAE0CD', 0.25, linenNor, 0.85, 1 / 0.3, 0.3);
  const pillowBlue = fabric(PALETTE.dustyBlue, 0.4, linenNor, 0.9, 1 / 0.3, 0.35);
  // Lumbar: cream with a lattice weave.
  const lumbar = fabric('#E8DCC6', 0.3, weaveNor, 1.1, 1 / 0.12);
  const throwBlue = fabric(PALETTE.dustyBlue, 0.45, knitNormal(), 1.0, 1 / 0.09, 0.8);
  throwBlue.side = THREE.DoubleSide;
  const mattress = fabric('#F4F0E6', 0.15, quilt, 0.6, 1 / 0.35);

  const rugTex = rugTextures(anisotropy);
  const rug = new THREE.MeshPhysicalMaterial({
    map: rugTex.map,
    normalMap: rugTex.normalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.97,
    sheen: 0.5,
    sheenRoughness: 0.9,
    sheenColor: new THREE.Color('#fff4e0'),
  });

  const or = 1 / 1.0;
  const oakMat = new THREE.MeshStandardMaterial({
    map: withRepeat(tintedTexture(oak, PALETTE.oak, 1.1, anisotropy), or, or),
    normalMap: withRepeat(oakNor, or, or),
    normalScale: new THREE.Vector2(0.3, 0.3),
    roughnessMap: withRepeat(oakRough, or, or),
    roughness: 0.8,
  });

  // Flat-lacquered carcass panels: faint oak grain under paint (REF-B).
  const paintOver = (hex: string, rough: number) =>
    new THREE.MeshPhysicalMaterial({
      map: withRepeat(tintedTexture(oak, hex, 0.06, anisotropy, 512), 1 / 1.2, 1 / 1.2),
      normalMap: withRepeat(oakNor, 1 / 1.2, 1 / 1.2),
      normalScale: new THREE.Vector2(0.05, 0.05),
      roughness: rough,
      clearcoat: 0.15,
      clearcoatRoughness: 0.5,
    });
  const wardrobe = paintOver(PALETTE.wardrobe, 0.62);
  const lacquer = paintOver(PALETTE.lacquer, 0.35);

  const br = 1 / 0.25;
  const boucleMat = new THREE.MeshPhysicalMaterial({
    // The Poly Haven bouclé is a plaid weave; real bouclé is random loops, so the relief is procedural.
    map: withRepeat(tintedTexture(boucle, '#D8CBB4', 0.05, anisotropy, 512), br, br),
    normalMap: withRepeat(boucleNormal(), 1 / 0.06, 1 / 0.06),
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 1,
    sheen: 1,
    sheenRoughness: 0.6,
    sheenColor: new THREE.Color('#FFF6E6'),
  });

  const ceramic = new THREE.MeshPhysicalMaterial({
    color: PALETTE.ceramic,
    map: withRepeat(tintedTexture(boucle, '#FFFFFF', 0.04, anisotropy, 256), 2, 2),
    roughness: 0.3,
    clearcoat: 0.8,
    clearcoatRoughness: 0.15,
  });
  const ceramicWoven = new THREE.MeshStandardMaterial({
    map: withRepeat(tintedTexture(boucle, '#E6DAC3', 0.9, anisotropy, 512), 1 / 0.12, 1 / 0.12),
    normalMap: withRepeat(weaveNor, 1 / 0.08, 1 / 0.08),
    normalScale: new THREE.Vector2(1.5, 1.5),
    roughness: 0.85,
  });
  const soil = new THREE.MeshStandardMaterial({
    map: withRepeat(tintedTexture(boucle, '#3B2E24', 1.2, anisotropy, 256), 6, 6),
    normalMap: withRepeat(boucleNor, 6, 6),
    roughness: 1,
  });

  const leafMat = (hex: string) =>
    new THREE.MeshPhysicalMaterial({
      map: leafTexture(hex), // leaf UV: u across the blade, v base -> tip
      roughness: 0.5,
      sheen: 0.3,
      sheenColor: new THREE.Color('#d8f0c0'),
      side: THREE.DoubleSide,
      // Thin leaves: light passes through a little (cheap translucency).
      emissive: new THREE.Color(hex).multiplyScalar(0.04),
    });
  const leaf = leafMat('#4E7A3A');
  const leafDark = leafMat('#355E2C');
  const stem = new THREE.MeshStandardMaterial({ map: withRepeat(tintedTexture(linen, '#5C6B3A', 0.3, anisotropy, 128), 4, 4), roughness: 0.7 });

  // Lamp shade: cream fabric lit from inside (emissive carries the glow).
  // Slightly darker than paper-white so the warm transmitted glow reads as amber, not white.
  const shade = fabric('#E6D3B0', 0.25, linenNor, 0.4, 1 / 0.12, 0.3);
  shade.side = THREE.DoubleSide;
  shade.emissive = new THREE.Color(LAMP.shadeGlow);
  shade.emissiveIntensity = 1.25;

  const heavyCurtain = fabric(PALETTE.sand, 0.45, linenNor, 0.8, 1 / 0.35, 0.7);
  heavyCurtain.side = THREE.DoubleSide;

  const sheer = new THREE.MeshPhysicalMaterial({
    color: '#FBF8F2',
    alphaMap: withRepeat(voileAlpha(), 1 / 0.05, 1 / 0.05),
    transparent: true,
    opacity: 0.55,
    roughness: 0.9,
    sheen: 1,
    sheenColor: new THREE.Color('#ffffff'),
    side: THREE.DoubleSide,
    depthWrite: false,
    emissive: new THREE.Color('#FFE9C8'),
    emissiveIntensity: 0.12, // light glowing through the voile
  });

  const mirror = new THREE.MeshStandardMaterial({ color: '#E8ECEC', metalness: 1, roughness: 0.03, envMapIntensity: 1.2 });

  // Woven mesh back: opaque dark panel with the hex weave in colour + relief.
  // (Alpha-tested mesh shimmers without MSAA; blended mesh vanished against
  // bright backgrounds. At room distances real mesh reads near-solid.)
  const hex = hexMeshAlpha();
  hex.colorSpace = THREE.NoColorSpace;
  const chairMesh = new THREE.MeshStandardMaterial({
    color: '#1B1C1E',
    map: withRepeat(hex, 1 / 0.05, 1 / 0.05),
    normalMap: withRepeat(boucleNormal(), 1 / 0.05, 1 / 0.05),
    normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.7,
    side: THREE.DoubleSide,
  });
  const nylon = new THREE.MeshStandardMaterial({
    color: '#1D1E20',
    normalMap: withRepeat(boucleNor, 12, 12),
    normalScale: new THREE.Vector2(0.15, 0.15),
    roughness: 0.45,
    metalness: 0.1,
  });
  const chrome = new THREE.MeshStandardMaterial({ color: '#C9CCCF', metalness: 1, roughness: 0.18 });
  const aluminium = new THREE.MeshStandardMaterial({
    color: '#B8BBBE',
    metalness: 0.9,
    roughness: 0.38,
    normalMap: withRepeat(oakNor, 4, 4),
    normalScale: new THREE.Vector2(0.03, 0.03), // brushed
  });
  const screen = new THREE.MeshStandardMaterial({
    map: laptopScreenTexture(),
    emissiveMap: laptopScreenTexture(),
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.55,
    roughness: 0.12,
  });

  const books = new THREE.MeshStandardMaterial({
    map: bookSpineTexture(),
    normalMap: withRepeat(linenNor, 3, 3),
    normalScale: new THREE.Vector2(0.4, 0.4),
    roughness: 0.75,
  });
  const paper = new THREE.MeshStandardMaterial({
    map: withRepeat(tintedTexture(linen, '#F1EAD8', 0.1, anisotropy, 256), 8, 8),
    roughness: 0.9,
  });
  const clockFace = new THREE.MeshStandardMaterial({ map: clockFaceTexture(), roughness: 0.25 });

  const art = (['mountains', 'sun', 'leaf'] as const).map(
    (k) => new THREE.MeshStandardMaterial({ map: artTexture(k, anisotropy), roughness: 0.85 }),
  );
  const artMat = new THREE.MeshStandardMaterial({
    map: withRepeat(tintedTexture(linen, '#F3ECDD', 0.08, anisotropy, 256), 6, 6),
    roughness: 0.95,
  });

  const glowTex = glowTexture();
  // Additive halo cards for LEDs: not furniture, so an unlit material is right here.
  const ledGlow = new THREE.MeshBasicMaterial({
    color: '#FFB870',
    map: glowTex,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true,
  });

  // Warm light pooling on the wall around each lamp (REF-A): the blue paint
  // absorbs most of a warm point light, so the visible halo is a soft additive card.
  const lampGlow = new THREE.MeshBasicMaterial({
    color: LAMP.wallGlow,
    map: glowTex,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  // One neutral linen texture shared by every cloth colour (colour via material.color).
  const clothMap = withRepeat(tintedTexture(linen, '#FFFFFF', 0.3, anisotropy, 256), 1 / 0.2, 1 / 0.2);
  const clothNor = withRepeat(linenNor, 1 / 0.2, 1 / 0.2);
  const clothCache = new Map<string, THREE.MeshStandardMaterial>();
  const cloth = (hex: string) => {
    let c = clothCache.get(hex);
    if (!c) {
      c = new THREE.MeshStandardMaterial({ color: hex, map: clothMap, normalMap: clothNor, normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.9 });
      clothCache.set(hex, c);
    }
    return c;
  };
  const velvet = new THREE.MeshPhysicalMaterial({ color: '#5A1F2B', roughness: 1, sheen: 1, sheenRoughness: 0.4, sheenColor: new THREE.Color('#C98A96'), normalMap: clothNor });
  const zari = new THREE.MeshStandardMaterial({ color: '#C9A14A', metalness: 0.8, roughness: 0.35 });
  // Powder-coated steel for the safe / cash box.
  const safeSteel = new THREE.MeshStandardMaterial({ color: '#9AA0A6', metalness: 0.6, roughness: 0.38, normalMap: withRepeat(boucleNor, 8, 8), normalScale: new THREE.Vector2(0.05, 0.05) });
  // Wardrobe sensor-light strips: emissive only (no area light: keeps the GPU cool).
  const interiorLed = new THREE.MeshStandardMaterial({ color: '#2a2622', emissive: '#FFD9A8', emissiveIntensity: 2.5 });

  return {
    cloth,
    velvet,
    zari,
    safeSteel,
    interiorLed,
    lampGlow,
    headboardFabric,
    coverlet,
    pillowCream,
    pillowBlue,
    lumbar,
    throwBlue,
    mattress,
    rug,
    oak: oakMat,
    wardrobe,
    lacquer,
    boucle: boucleMat,
    ceramic,
    ceramicWoven,
    soil,
    leaf,
    leafDark,
    stem,
    shade,
    heavyCurtain,
    sheer,
    mirror,
    chairMesh,
    nylon,
    chrome,
    aluminium,
    screen,
    books,
    paper,
    clockFace,
    art,
    artMat,
    ledGlow,
    glowTex,
  };
}
