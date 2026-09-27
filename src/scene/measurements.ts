import * as THREE from 'three';
import {
  ART,
  BEAM,
  BED,
  BEDSIDE,
  CORNER_PILLARS,
  PALETTE,
  CURTAIN,
  DESK,
  DOORS,
  DOOR_PILLAR,
  DRESSER,
  FAN,
  LAMP,
  PILLAR,
  PLANTS,
  ROOM,
  RUG,
  SCONCE,
  WALLS,
  WARDROBE,
  WINDOW,
} from '../config/room.config';

/**
 * Everything that gets a measurement tag. Boxes and sizes are derived from
 * room.config.ts (never from meshes), so the tags always state the design
 * dimensions. `size` is shown as W x D x H; `round` swaps W x D for a diameter.
 */
export interface Measured {
  id: string;
  name: string;
  box: THREE.Box3;
  /** Where the tag is pinned (world). */
  anchor: THREE.Vector3;
  size?: { w: number; d?: number; h?: number; round?: boolean };
  note?: string;
  /** Whether this object's box hides tags behind it (false for flat/sparse items). */
  occludes?: boolean;
  /** Tighter box used for hiding other tags, when `box` is mostly air (e.g. bed below the headboard). */
  occluder?: THREE.Box3;
  /** Tag shows only while this returns true (e.g. wardrobe zones when a door is open). */
  visibleWhen?: () => boolean;
  /** Id of an occluder this tag sits inside (e.g. wardrobe zones inside the wardrobe box). */
  inside?: string;
  /** Finishes with market names available in Indore (MP) - see FINISHES. */
  colours?: Finish[];
}

/** A colour/finish with a name a local dealer can match (hex for the shade card). */
export interface Finish {
  hex: string;
  name: string;
}

/**
 * CLIENT: colour names that can be bought in Indore, MP. Brand shade names and
 * codes are the closest published matches (Asian Paints, Merino, Greenlam,
 * Kajaria); take the hex to the dealer's shade card to confirm before ordering.
 */
const F = {
  blue: { hex: PALETTE.petrolBlue, name: 'Asian Paints Blue Edition 9213 (closest to petrol blue; darker: Ink Blue 7246)' },
  ivory: { hex: PALETTE.cream, name: 'Asian Paints Ivory 0315 (walls, pillars)' },
  ceiling: { hex: PALETTE.ceiling, name: 'Asian Paints Ivory Coast (ceiling, a shade lighter)' },
  walnut: { hex: PALETTE.walnut, name: 'Merino 14538 American Vertical Walnut laminate' },
  oak: { hex: PALETTE.oak, name: 'Greenlam 31755 Ideal Oak laminate' },
  greige: { hex: PALETTE.wardrobe, name: 'Beige/greige suede solid laminate (Merino or Greenlam beige range)' },
  white: { hex: PALETTE.lacquer, name: 'Frosty white high-gloss laminate / acrylic' },
  brass: { hex: PALETTE.brass, name: 'Antique brass finish (Hettich / Ebco / Hafele fittings)' },
  black: { hex: PALETTE.blackMetal, name: 'Matte black powder-coat (handles, window frame)' },
  tile: { hex: PALETTE.floorBase, name: 'Kajaria Solitaire 800×800 super-glossy vitrified, grey marble' },
  headFab: { hex: PALETTE.greige, name: 'Greige linen upholstery fabric (D\'Decor / local furnishing)' },
  coverlet: { hex: PALETTE.coverlet, name: 'Cream quilted cotton bedcover' },
  dustyBlue: { hex: PALETTE.dustyBlue, name: 'Dusty-blue throw & cushions' },
  sand: { hex: PALETTE.sand, name: 'Sand/beige linen curtain (D\'Decor style)' },
  sheer: { hex: '#FBF8F2', name: 'White sheer voile' },
  boucle: { hex: '#D8CBB4', name: 'Beige bouclé fabric' },
  rug: { hex: '#E9DFCB', name: 'Cream rug with blue geometric border' },
  meshBlack: { hex: '#1B1C1E', name: 'Black mesh (ergonomic chair)' },
} satisfies Record<string, Finish>;

/** Which finishes each tagged object uses. */
const COLOURS: Record<string, Finish[]> = {
  bed: [F.walnut, F.headFab, F.coverlet, F.dustyBlue],
  art: [F.walnut, F.brass],
  rug: [F.rug, F.dustyBlue],
  desk: [F.oak, F.walnut],
  shelves: [F.walnut],
  chair: [F.meshBlack],
  wardrobe: [F.greige, F.oak, F.black],
  mirror: [F.walnut],
  dresser: [F.white, F.walnut],
  pouf: [F.boucle],
  fan: [F.walnut, F.brass],
  curtains: [F.sand, F.sheer],
  window: [F.black],
  'door-bedroom': [F.walnut, F.brass],
  'door-washroom': [F.walnut, F.brass],
  pillar: [F.ivory],
  'pillar-ne': [F.ivory],
  'pillar-se': [F.ivory],
  'pillar-doors': [F.ivory],
  'bedside-0': [F.walnut, F.brass],
  'bedside-1': [F.walnut, F.brass],
  'accent-wall': [F.blue],
  walls: [F.ivory, F.ceiling],
  floor: [F.tile],
};

const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) =>
  new THREE.Box3(new THREE.Vector3(Math.min(x0, x1), y0, Math.min(z0, z1)), new THREE.Vector3(Math.max(x0, x1), y1, Math.max(z0, z1)));
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildMeasurements(): Measured[] {
  const cx = BED.centerX;
  const hbFront = WALLS.south - BED.headboard.depth;
  const bedZ0 = hbFront - BED.base.l;
  const out: Measured[] = [
    {
      id: 'bed',
      name: 'King bed',
      box: box(cx - BED.base.w / 2, cx + BED.base.w / 2, 0, BED.headboard.top, bedZ0, WALLS.south),
      occluder: box(cx - BED.base.w / 2, cx + BED.base.w / 2, 0, BED.base.h + BED.mattress.h, bedZ0, hbFront),
      anchor: v(cx, BED.base.h + BED.mattress.h + 0.12, bedZ0 + 0.35),
      size: { w: BED.base.w, d: BED.base.l + BED.headboard.depth, h: BED.headboard.top },
      note: `mattress ${m(BED.mattress.w)} × ${m(BED.mattress.l)}`,
    },
    {
      id: 'art',
      occludes: false,
      name: 'Wall art ×3',
      box: box(ART.centerX - 1.5 * ART.w - ART.gap, ART.centerX + 1.5 * ART.w + ART.gap, ART.bottom, SCONCE.y + 0.08, WALLS.south - 0.1, WALLS.south),
      anchor: v(ART.centerX, ART.bottom + ART.h + 0.1, WALLS.south - 0.05),
      size: { w: ART.w, h: ART.h },
      note: `each · gap ${m(ART.gap)} · sconce at ${m(SCONCE.y)}`,
    },
    {
      id: 'rug',
      occludes: false,
      name: 'Rug',
      box: box(RUG.cx - RUG.w / 2, RUG.cx + RUG.w / 2, 0, RUG.t, RUG.cz - RUG.d / 2, RUG.cz + RUG.d / 2),
      anchor: v(RUG.cx + RUG.w / 2 - 0.25, 0.03, RUG.cz - RUG.d / 2 + 0.15),
      size: { w: RUG.w, d: RUG.d },
    },
    {
      id: 'desk',
      name: 'L-desk',
      box: box(DESK.legA.x0, DESK.legA.x1, 0, DESK.top, DESK.legB.z0, DESK.legA.z1),
      anchor: v(DESK.legA.x0 + 0.3, DESK.top + 0.05, DESK.legA.z0 + 0.1),
      size: { w: DESK.legA.x1 - DESK.legA.x0, d: DESK.legA.z1 - DESK.legB.z0, h: DESK.top },
      note: `return ${m(DESK.legB.x1 - DESK.legB.x0)} deep`,
    },
    {
      id: 'shelves',
      occludes: false,
      name: 'Floating shelves ×2',
      box: box(DESK.shelves.x - DESK.shelves.w / 2, DESK.shelves.x + DESK.shelves.w / 2, DESK.shelves.ys[0] - 0.02, DESK.shelves.ys[1] + 0.25, WALLS.south - DESK.shelves.d, WALLS.south),
      anchor: v(DESK.shelves.x, DESK.shelves.ys[1] + 0.3, WALLS.south - 0.12),
      size: { w: DESK.shelves.w, d: DESK.shelves.d },
      note: `at ${m(DESK.shelves.ys[0])} / ${m(DESK.shelves.ys[1])}`,
    },
    {
      id: 'chair',
      occludes: false,
      name: 'Desk chair',
      box: box(DESK.chair.x - 0.31, DESK.chair.x + 0.31, 0, 1.28, DESK.chair.z - 0.31, DESK.chair.z + 0.31),
      anchor: v(DESK.chair.x, 1.36, DESK.chair.z),
      size: { w: 0.62, d: 0.62, h: 1.28 },
      note: 'approx.',
    },
    {
      id: 'wardrobe',
      name: 'Wardrobe + loft',
      box: box(WALLS.west, WARDROBE.faceX, 0, WARDROBE.height, WARDROBE.z0, WARDROBE.z1),
      anchor: v(WARDROBE.faceX, WARDROBE.loftSplit + 0.12, (WARDROBE.z0 + WARDROBE.z1) / 2),
      size: { w: WARDROBE.z1 - WARDROBE.z0, d: WARDROBE.depth, h: WARDROBE.height },
      note: `${ftIn(WARDROBE.depth)} deep · ${WARDROBE.doors} doors × ${ftIn(WARDROBE.doorW)} · open door clears bed by ${Math.round(WARDROBE.swingClearance * 100)} cm · loft at ${m(WARDROBE.loftSplit)}`,
    },
    {
      id: 'mirror',
      occludes: false,
      name: 'Oval mirror',
      box: box(WARDROBE.faceX, WARDROBE.faceX + 0.04, DRESSER.mirror.y - DRESSER.mirror.h / 2, DRESSER.mirror.y + DRESSER.mirror.h / 2, DRESSER.mirror.z - DRESSER.mirror.w / 2, DRESSER.mirror.z + DRESSER.mirror.w / 2),
      anchor: v(WARDROBE.faceX + 0.03, DRESSER.mirror.y + DRESSER.mirror.h / 2 + 0.1, DRESSER.mirror.z),
      size: { w: DRESSER.mirror.w, h: DRESSER.mirror.h },
    },
    {
      id: 'dresser',
      name: 'Floating dresser',
      box: box(DRESSER.top.x0, DRESSER.top.x1, DRESSER.top.y - 0.24, DRESSER.top.y, DRESSER.top.zc - DRESSER.top.len / 2, DRESSER.top.zc + DRESSER.top.len / 2),
      anchor: v(DRESSER.top.x1, DRESSER.top.y + 0.02, DRESSER.top.zc + 0.33),
      size: { w: DRESSER.top.len, d: DRESSER.top.x1 - DRESSER.top.x0 },
      note: `top at ${m(DRESSER.top.y)}`,
    },
    {
      id: 'pouf',
      name: 'Pouf',
      box: box(DRESSER.pouf.x - DRESSER.pouf.r, DRESSER.pouf.x + DRESSER.pouf.r, 0, DRESSER.pouf.h, DRESSER.pouf.z - DRESSER.pouf.r, DRESSER.pouf.z + DRESSER.pouf.r),
      anchor: v(DRESSER.pouf.x, DRESSER.pouf.h + 0.06, DRESSER.pouf.z),
      size: { w: DRESSER.pouf.r * 2, h: DRESSER.pouf.h, round: true },
    },
    {
      id: 'fan',
      occludes: false,
      name: 'Ceiling fan',
      box: box(FAN.x - FAN.sweep / 2, FAN.x + FAN.sweep / 2, ROOM.ceilingH - FAN.downRod - 0.14, ROOM.ceilingH, FAN.z - FAN.sweep / 2, FAN.z + FAN.sweep / 2),
      anchor: v(FAN.x, ROOM.ceilingH - FAN.downRod - 0.18, FAN.z),
      size: { w: FAN.sweep, round: true },
      note: `down-rod ${m(FAN.downRod)}`,
    },
    {
      id: 'curtains',
      occludes: false,
      name: 'Curtain track',
      box: box(CURTAIN.trackX - 0.08, CURTAIN.trackX + 0.04, 0, CURTAIN.trackY, CURTAIN.z0, CURTAIN.z1),
      anchor: v(CURTAIN.trackX - 0.05, CURTAIN.trackY - 0.12, CURTAIN.heavy.z1),
      size: { w: CURTAIN.z1 - CURTAIN.z0 },
      note: `at ${m(CURTAIN.trackY)}`,
    },
    {
      id: 'window',
      occludes: false,
      name: 'Window',
      box: box(WALLS.east, WALLS.east + ROOM.wallThickness, WINDOW.sill, WINDOW.sill + WINDOW.height, WINDOW.centerZ - WINDOW.width / 2, WINDOW.centerZ + WINDOW.width / 2),
      anchor: v(WALLS.east - 0.02, WINDOW.sill + WINDOW.height + 0.12, WINDOW.centerZ),
      size: { w: WINDOW.width, h: WINDOW.height },
      note: `sill at ${m(WINDOW.sill)}`,
    },
    ...(['bedroom', 'washroom'] as const).map<Measured>((k) => ({
      id: `door-${k}`,
      occludes: false,
      name: k === 'bedroom' ? 'Bedroom door' : 'Washroom door',
      box: box(DOORS[k].centerX - DOORS[k].width / 2, DOORS[k].centerX + DOORS[k].width / 2, 0, DOORS[k].height, WALLS.north - ROOM.wallThickness, WALLS.north),
      anchor: v(DOORS[k].centerX, DOORS[k].height + 0.14, WALLS.north + 0.03),
      size: { w: DOORS[k].width, h: DOORS[k].height },
    })),
    {
      id: 'pillar',
      name: 'Pillar',
      box: box(PILLAR.x0, PILLAR.x1, 0, ROOM.ceilingH, WALLS.south - PILLAR.projection, WALLS.south),
      anchor: v((PILLAR.x0 + PILLAR.x1) / 2, 2.45, WALLS.south - PILLAR.projection),
      size: { w: PILLAR.x1 - PILLAR.x0, d: PILLAR.projection },
      note: '8" column, 4" in the wall',
    },
    // Corner pillars that stay visible (the two west ones sit inside the wardrobe and end module).
    ...CORNER_PILLARS.filter((c) => c.id === 'ne' || c.id === 'se').map<Measured>((c) => ({
      id: `pillar-${c.id}`,
      name: `Corner pillar ${c.id.toUpperCase()}`,
      box: box(c.x0, c.x1, 0, ROOM.ceilingH, c.z0, c.z1),
      anchor: v((c.x0 + c.x1) / 2, c.id === 'se' ? 2.3 : 2.45, (c.z0 + c.z1) / 2),
      size: { w: c.x1 - c.x0, d: c.z1 - c.z0 },
      note: '4" proud of both walls',
    })),
    {
      id: 'pillar-doors',
      name: 'Pillar between doors',
      box: box(DOOR_PILLAR.x0, DOOR_PILLAR.x1, 0, ROOM.ceilingH, WALLS.north, WALLS.north + DOOR_PILLAR.projection),
      anchor: v((DOOR_PILLAR.x0 + DOOR_PILLAR.x1) / 2, 2.55, WALLS.north + DOOR_PILLAR.projection),
      size: { w: DOOR_PILLAR.x1 - DOOR_PILLAR.x0, d: DOOR_PILLAR.projection },
      note: 'fills the gap between the doors',
    },
    {
      id: 'beam',
      occludes: false,
      name: 'Ceiling beam',
      box: box(BEAM.x0, BEAM.x1, ROOM.ceilingH - BEAM.drop, ROOM.ceilingH, WALLS.north, WALLS.south),
      anchor: v((BEAM.x0 + BEAM.x1) / 2, ROOM.ceilingH - BEAM.drop - 0.02, -0.6),
      size: { w: BEAM.x1 - BEAM.x0, h: BEAM.drop },
      note: `underside at ${m(ROOM.ceilingH - BEAM.drop)}`,
    },
    {
      id: 'palm',
      occludes: false,
      name: 'Areca palm',
      box: box(PLANTS.areca.x - 0.5, PLANTS.areca.x + 0.5, 0, PLANTS.areca.height, PLANTS.areca.z - 0.5, PLANTS.areca.z + 0.5),
      anchor: v(PLANTS.areca.x, PLANTS.areca.height + 0.05, PLANTS.areca.z),
      size: { w: PLANTS.areca.potR * 2, h: PLANTS.areca.height, round: true },
      note: 'pot Ø · overall height',
    },
  ];
  // Surfaces (colour tags): blue accent wall, walls + ceiling, floor tiles.
  out.push(
    {
      id: 'accent-wall',
      occludes: false,
      name: 'Blue accent wall',
      box: box(WALLS.west, PILLAR.x0, 0, ROOM.ceilingH - 0.25, WALLS.south - 0.02, WALLS.south),
      anchor: v(ART.centerX - 1.5 * ART.w - ART.gap - 0.2, ART.bottom + ART.h * 0.6, WALLS.south - 0.01), // beside the art
      note: 'matt emulsion · stops 25 cm below the ceiling',
    },
    {
      id: 'walls',
      occludes: false,
      name: 'Walls & ceiling',
      box: box(WALLS.west, WALLS.east, 0, ROOM.ceilingH, WALLS.north, WALLS.north + 0.02),
      anchor: v(WALLS.west + 1.4, 2.4, WALLS.north + 0.01),
      note: 'matt emulsion',
    },
    {
      id: 'floor',
      occludes: false,
      name: 'Floor tiles',
      box: box(WALLS.west, WALLS.east, 0, 0.01, WALLS.north, WALLS.south),
      anchor: v(0.45, 0.02, -1.1),
      size: { w: 0.8, d: 0.8 },
      note: 'each tile · 2 mm grout',
    },
  );
  BEDSIDE.centersX.forEach((x, i) => {
    out.push({
      id: `bedside-${i}`,
      name: i === 0 ? 'Bedside table (E)' : 'Bedside table (W)',
      box: box(x - BEDSIDE.w / 2, x + BEDSIDE.w / 2, 0, LAMP.top, WALLS.south - BEDSIDE.d, WALLS.south),
      anchor: v(x, BEDSIDE.h + 0.1, WALLS.south - BEDSIDE.d),
      size: { w: BEDSIDE.w, d: BEDSIDE.d, h: BEDSIDE.h },
      note: `lamp Ø${m(LAMP.shadeDia)}, top ${m(LAMP.top)}`,
    });
  });
  for (const it of out) it.colours = COLOURS[it.id];
  return out;
}

/** 1.92 -> "1.92 m" (metres, 2 dp). */
export function m(x: number): string {
  return `${x.toFixed(2)} m`;
}

/** Metres to feet-inches rounded to the nearest inch, e.g. 5.004 -> 16'5". */
export function ftIn(x: number): string {
  const totalIn = Math.round(x / 0.0254);
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn % 12;
  return ft > 0 ? `${ft}'${inch}"` : `${inch}"`;
}
