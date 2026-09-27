/**
 * Single source of truth for every dimension, colour and light value.
 * Units: metres. Y up, +X = East, +Z = South, origin = floor centre.
 *
 * Source tags:
 *   REF-C  2D plan (drawn rotated 180deg: left = East, top = South)
 *   REF-D  photo of the real empty room (ground truth for architecture)
 *   REF-B  west-wall render      REF-A  final design sheet
 *   ASSUMPTION  not measurable from the references; confirm on site
 *   AGREED      conflict fix agreed with the client before M1
 *   SKETCH      client's hand-measured plan (IMG_5675, after M4)
 *   CLIENT      explicit client instruction
 */

/** Inches to metres (the client measures in feet-inches). */
export const IN = 0.0254;

// ---------------------------------------------------------------- room shell
/**
 * CLIENT: every pillar is an 8" column, 4" buried in the wall and 4" standing
 * proud into the room. The client measures *between pillar faces*:
 *   width 16'5" (SKETCH 3'10" + 1'0" + 11'7"), depth 11'3" (CLIENT).
 * Wall-to-wall therefore adds 4" at each end: 17'1" x 11'11".
 */
const PILLAR_PROUD = 4 * IN; // 0.102
const CLEAR_W = (46 + 12 + 139) * IN; // 16'5" between corner-pillar faces
const CLEAR_D = (11 * 12 + 3) * IN; // 11'3" between corner-pillar faces
const WIDTH = CLEAR_W + 2 * PILLAR_PROUD; // 17'1" (5.207 m) wall to wall
const DEPTH = CLEAR_D + 2 * PILLAR_PROUD; // 11'11" (3.632 m) wall to wall

export const ROOM = {
  width: WIDTH,
  depth: DEPTH,
  halfW: WIDTH / 2, // 2.604
  halfD: DEPTH / 2, // 1.816
  /** Pillar projection into the room (CLIENT 4"). */
  pillarProud: PILLAR_PROUD,
  clearWidth: CLEAR_W,
  clearDepth: CLEAR_D,
  ceilingH: 3.0, // ASSUMPTION
  wallThickness: 0.23, // ASSUMPTION (standard 9" brick)
  slabThickness: 0.15, // ASSUMPTION, only used by shadow proxies
} as const;

export const WALLS = {
  north: -ROOM.halfD, // both doors (REF-C)
  south: ROOM.halfD, // blue bed wall (REF-D)
  east: ROOM.halfW, // window (REF-C)
  west: -ROOM.halfW, // wardrobe (REF-B)
} as const;

export const SKIRTING = {
  height: 0.1, // REF-D
  thickness: 0.012, // REF-D
  bevel: 0.006, // small top chamfer
} as const;

/** Blue accent paint on the south wall only (REF-D). */
export const ACCENT = {
  topGap: 0.25, // REF-D: cream band between blue and ceiling
  offset: 0.0015, // paint film offset from the wall face (z-fight guard)
} as const;

/**
 * Pillar splitting the blue wall. SKETCH: 3'10" from the east corner pillar,
 * then 11'7" to the west corner pillar; 16'5" - 3'10" - 11'7" = 1'0" wide.
 */
export const PILLAR = {
  x0: ROOM.halfW - PILLAR_PROUD - (46 + 12) * IN, // 11'7" to the west corner pillar
  x1: ROOM.halfW - PILLAR_PROUD - 46 * IN, // 3'10" to the east corner pillar
  projection: PILLAR_PROUD, // CLIENT 4" (was 0.12 REF-D estimate)
} as const;

/** Corner pillars (CLIENT): 4" x 4" visible in each corner. */
export const CORNER_PILLARS = (['ne', 'se', 'sw', 'nw'] as const).map((c) => {
  const e = c.includes('e');
  const s = c.includes('s');
  return {
    id: c,
    x0: e ? ROOM.halfW - PILLAR_PROUD : -ROOM.halfW,
    x1: e ? ROOM.halfW : -ROOM.halfW + PILLAR_PROUD,
    z0: s ? ROOM.halfD - PILLAR_PROUD : -ROOM.halfD,
    z1: s ? ROOM.halfD : -ROOM.halfD + PILLAR_PROUD,
  };
});

/** Ceiling beam continuing from the pillar along Z (REF-D). */
export const BEAM = {
  x0: PILLAR.x0,
  x1: PILLAR.x1,
  drop: 0.3, // REF-D, underside Y = 2.70
} as const;

// ---------------------------------------------------------------- openings
export interface DoorSpec {
  centerX: number;
  width: number;
  height: number;
  /** "in" swings into the bedroom, "out" into the adjoining space. */
  swing: 'in' | 'out';
  /** Jamb that carries the hinges. */
  hinge: 'east' | 'west';
  openAngleDeg: number;
}

export const DOORS: Record<'washroom' | 'bedroom', DoorSpec> = {
  // REF-C, measured from the East wall (offsets kept when the room grew)
  washroom: { centerX: ROOM.halfW - 0.735, width: 0.76, height: 2.1, swing: 'out', hinge: 'east', openAngleDeg: 0 },
  // REF-C / REF-D (open leaf on the left of the photo = east jamb)
  bedroom: { centerX: ROOM.halfW - 1.708, width: 0.9, height: 2.1, swing: 'in', hinge: 'east', openAngleDeg: 90 },
};

/**
 * Pillar between the two doors (SKETCH). CLIENT says 8" columns, but REF-C
 * leaves only 0.143 m between the doors and the doors must not move, so the
 * visible pillar fills that gap and stands 4" proud.
 */
export const DOOR_PILLAR = {
  x0: DOORS.bedroom.centerX + DOORS.bedroom.width / 2,
  x1: DOORS.washroom.centerX - DOORS.washroom.width / 2,
  projection: PILLAR_PROUD,
} as const;

export const DOOR_DETAIL = {
  leafThickness: 0.035, // ASSUMPTION flush door
  frame: 0.025, // jamb lining inside the reveal
  gap: 0.003, // leaf-to-frame clearance
  architraveWidth: 0.04, // REF-A 40 mm
  architraveDepth: 0.015,
  handleHeight: 1.0, // REF-A
  hallDepth: 2.4, // corridor volume seen through the open bedroom door, ASSUMPTION
} as const;

/** SKETCH: window starts 3'7" from the south corner pillar and is 4'0" long; 3'8" remain to the north pillar. */
const WINDOW_SOUTH_EDGE = ROOM.halfD - PILLAR_PROUD - 43 * IN; // z 0.622
const WINDOW_WIDTH = 48 * IN; // 1.219

export const WINDOW = {
  centerZ: WINDOW_SOUTH_EDGE - WINDOW_WIDTH / 2, // z 0.013
  width: WINDOW_WIDTH, // SKETCH 4'0" (was 1.20 ASSUMPTION)
  height: 1.2, // ASSUMPTION
  sill: 0.9, // ASSUMPTION
  frame: 0.04, // REF-A 40 mm black powder coat
  frameDepth: 0.06,
  frameInset: 0.13, // frame position measured from the inner wall face
  grilleBars: 5, // REF-D
  grilleDia: 0.014,
  grilleInset: 0.04, // bars sit just inside the inner face
} as const;

// ---------------------------------------------------------------- small fixtures
export const FIXTURES = {
  plate: { w: 0.086, h: 0.086, d: 0.008 },
  switchEast: { y: 1.2, z: ROOM.halfD - 0.89, modules: 2 }, // REF-D
  bedsideSocketY: 0.72, // above each bedside table
  deskSocket: { x: (PILLAR.x1 + ROOM.halfW - PILLAR_PROUD) / 2, y: 1.05, sockets: 3 }, // above the desk, centred on the narrow panel
} as const;

// ---------------------------------------------------------------- furniture (M2)
const WARDROBE_DEPTH = 24 * IN; // CLIENT: 2'0" (was 22", before that 0.55 ASSUMPTION)
const WARDROBE_FACE = -ROOM.halfW + WARDROBE_DEPTH;
/** Spec: bed centred in the gap between the wardrobe front and the pillar (-0.457). */
const BED_CX = (WARDROBE_FACE + PILLAR.x0) / 2;
const HEADBOARD_W = 1.95;
const BEDSIDE_W = 0.4;
const BEDSIDE_OFFSET = HEADBOARD_W / 2 + 0.02 + BEDSIDE_W / 2; // tables 2 cm clear of the headboard

export const BED = {
  centerX: BED_CX,
  // AGREED depth 0.10; bottom sits behind the mattress
  headboard: { width: HEADBOARD_W, top: 1.15, bottom: 0.3, depth: 0.1, channels: 9, groove: 0.006, frame: 0.03, puff: 0.018 },
  // AGREED: mattress starts at the headboard face (0.10 off the south wall)
  mattress: { w: 1.83, l: 2.03, h: 0.25, z0: ROOM.halfD - 0.1 - 2.03, z1: ROOM.halfD - 0.1 },
  // 1.92 x 2.10 x 0.32 walnut hydraulic-storage platform; "recess" = toe-kick setback
  base: { w: 1.92, l: 2.1, h: 0.32, recess: 0.03, kick: 0.05 },
  // edge radius is derived from the base overhang (see bed.ts)
  coverlet: { drop: 0.3, foldWave: 0.3, foldAmp: 0.005, lift: 0.012 },
  throw: { width: 0.55, overhang: 0.35, centerFromFoot: 0.45, thickness: 0.012 }, // lower third
  pillows: {
    sleeping: { w: 0.75, d: 0.5, h: 0.12 },
    euro: { w: 0.6, d: 0.42, h: 0.11 },
    lumbar: { w: 0.45, d: 0.3, h: 0.09 },
  },
} as const;

export const BEDSIDE = {
  w: BEDSIDE_W,
  d: 0.4,
  h: 0.5,
  legH: 0.08,
  // Follow the bed (AGREED 0.72 / -1.67 before the SKETCH update); [0] = east table
  centersX: [BED_CX + BEDSIDE_OFFSET, BED_CX - BEDSIDE_OFFSET],
  centerZ: ROOM.halfD - 0.005 - 0.2,
} as const;

export const LAMP = {
  baseH: 0.3,
  baseR: 0.085,
  shadeDia: 0.24,
  shadeH: 0.19,
  top: 1.2, // REF-A
  light: { color: '#FFC98A', intensity: 2.2, distance: 3.5, decay: 2 },
  shadeGlow: '#FFA24C',
  wallGlow: '#C9772E', // additive halo on the wall behind each lamp
  wallGlowSize: 0.95,
} as const;

export const ART = {
  w: 0.42,
  h: 0.56,
  gap: 0.08,
  frame: 0.02,
  mat: 0.04,
  depth: 0.03,
  bottom: 1.35,
  centerX: BED_CX,
} as const;

export const SCONCE = {
  y: 2.15, // existing wall point in REF-D
  light: { color: '#FFB46B', intensity: 6, angle: 0.5, penumbra: 0.8, distance: 4, decay: 2 }, // 3000K
} as const;

export const RUG = { w: 2.6, d: 2.1, cx: BED_CX, cz: 0.5, t: 0.012, border: 0.12 } as const; // AGREED 2.60 x 2.10 @ z 0.50

const WINDOW_NORTH_EDGE = WINDOW_SOUTH_EDGE - WINDOW_WIDTH;
const HEAVY_Z1 = WINDOW_NORTH_EDGE - 0.03; // heavy curtain stacks clear of the glass

export const CURTAIN = {
  trackX: ROOM.halfW - 0.1,
  trackY: 2.9,
  z0: HEAVY_Z1 - 0.6,
  z1: WINDOW_SOUTH_EDGE + 0.01, // just past the window (SKETCH); AGREED rule: clear of desk leg B
  floorGap: 0.02,
  heavy: { z0: HEAVY_Z1 - 0.6, z1: HEAVY_Z1, wavelength: 0.09, amplitude: 0.035 },
  sheer: { z0: HEAVY_Z1 - 0.05, z1: WINDOW_SOUTH_EDGE + 0.01, wavelength: 0.13, amplitude: 0.018, offsetX: -0.05 },
} as const;

export const DESK = {
  top: 0.75,
  thickness: 0.018,
  // L-desk in the SE corner; its top is notched around the 4" corner pillar (study.ts).
  legA: { x0: PILLAR.x1, x1: ROOM.halfW, z0: ROOM.halfD - 0.55, z1: ROOM.halfD }, // runs from the pillar face
  legB: { x0: ROOM.halfW - 0.55, x1: ROOM.halfW, z0: WINDOW_SOUTH_EDGE + 0.05, z1: ROOM.halfD - 0.55 }, // starts past the curtain
  pedestal: { z0: WINDOW_SOUTH_EDGE + 0.07, z1: ROOM.halfD - 0.59, drawers: 3 },
  shelves: { w: 0.9, d: 0.22, t: 0.035, x: (PILLAR.x1 + ROOM.halfW - PILLAR_PROUD) / 2, ys: [1.45, 1.8] },
  chair: { x: ROOM.halfW - 0.9, z: ROOM.halfD - 0.99 }, // faces the SE corner
} as const;

/**
 * Wardrobe on the west wall, 2'0" deep (CLIENT). Its hinged doors must open a
 * full 90 deg without touching the bed or the west bedside table (CLIENT), so:
 *  - the lower cabinet stops 2 cm north of the bedside table;
 *  - door width is capped by the free floor between the wardrobe front and the
 *    bed's hanging throw, with MIN_SWING_CLEARANCE to spare;
 *  - the loft (above 2.20 m, clear of everything) still runs the full length.
 */
const MIN_SWING_CLEARANCE = 0.03;
/** Outermost point of the bedding on the wardrobe side (mirrors bed.ts: base overhang + throw offset + fold/flare). */
const BED_WEST_OUTER = BED_CX - 1.83 / 2 - ((1.92 - 1.83) / 2 + 0.005) - 0.02 - 0.023;
const PULL_PROJECTION = 0.025 + 0.006; // pull depth + stand-off: faces the table when the south door is open
// 2 cm clear of the bedside table (its pulls and anything on it) *after* the open door's pull.
const BEDSIDE_PULL = 0.014; // brass drawer pulls stand proud of the bedside table front
const WARDROBE_LOWER_Z1 = ROOM.halfD - 0.005 - 0.4 - BEDSIDE_PULL - 0.02 - PULL_PROJECTION;
const WARDROBE_Z0 = -0.7;
const MAX_DOOR = BED_WEST_OUTER - WARDROBE_FACE - MIN_SWING_CLEARANCE;
const LOWER_DOORS = Math.ceil((WARDROBE_LOWER_Z1 - WARDROBE_Z0) / MAX_DOOR);
const DOOR_W = (WARDROBE_LOWER_Z1 - WARDROBE_Z0) / LOWER_DOORS;

export const WARDROBE = {
  depth: WARDROBE_DEPTH,
  faceX: WARDROBE_FACE,
  z0: WARDROBE_Z0,
  z1: ROOM.halfD, // loft runs the full length
  lowerZ1: WARDROBE_LOWER_Z1, // lower cabinet stops before the bedside table
  doors: LOWER_DOORS, // 5
  doorW: DOOR_W, // 0.422
  /** Free floor left between an open door's edge and the bedding (>= MIN_SWING_CLEARANCE). */
  swingClearance: BED_WEST_OUTER - WARDROBE_FACE - DOOR_W,
  height: 2.85,
  loftSplit: 2.2,
  gap: 0.003,
  doorT: 0.018,
  openDeg: 90,
  pull: { w: 0.012, len: 0.6, y0: 0.9, depth: 0.025 },
  carcass: 0.018,
  plinth: 4 * IN, // dark recessed plinth (client photos); hides a push-to-open locker drawer
  drawerBand: { y0: 0.88, y1: 1.06 }, // waist-height key-lock drawers (client photos)
} as const;

const MODULE_ZC = (-ROOM.halfD + PILLAR_PROUD + WARDROBE_Z0) / 2; // centre of the clear wall between NW pillar and wardrobe

export const DRESSER = {
  module: { z0: -ROOM.halfD, z1: WARDROBE_Z0 }, // walnut-clad end module (wraps the NW pillar)
  mirror: { w: 0.5, h: 1.25, z: MODULE_ZC, y: 1.55, frame: 0.025 },
  top: { x0: WARDROBE_FACE, x1: WARDROBE_FACE + 0.42, zc: MODULE_ZC, len: 0.95, t: 0.03, y: 0.76 },
  drawers: { h: 0.2, count: 2 },
  pouf: { x: WARDROBE_FACE + 0.6, z: MODULE_ZC, r: 0.2, h: 0.42 },
} as const;

export const FAN = { x: BED_CX, z: 0, downRod: 0.2, sweep: 1.2, rpm: 60, blades: 3 } as const;

export const PLANTS = {
  areca: { x: ROOM.halfW - 0.45, z: HEAVY_Z1 - 0.32, fronds: 14, potR: 0.17, potH: 0.34, height: 1.55 },
} as const;

// ---------------------------------------------------------------- materials
export const PALETTE = {
  walnut: '#5B3A24',
  petrolBlue: '#24506B',
  cream: '#F1E7CB',
  ceiling: '#F7F2E6',
  greige: '#CDBBA0',
  dustyBlue: '#4F6F8E',
  sand: '#B8A17E',
  brass: '#B08D57',
  blackMetal: '#16181A',
  ceramic: '#EDE3CF',
  floorBase: '#B9B5AE',
  floorVein: '#6F6B66',
  grout: '#4A4642',
  skirting: '#8C8782',
  glass: '#F4F8F6',
  wardrobe: '#C9BFB0',
  oak: '#D9B98B',
  coverlet: '#EFE6D2',
  lacquer: '#F3F0EA',
} as const;

export const FLOOR = {
  tile: 0.8, // REF-D
  grout: 0.002, // REF-D 2 mm
  roughness: 0.15,
  clearcoat: 0.6,
  clearcoatRoughness: 0.08,
  tilesPerCanvas: 4,
  canvasPx: 2048,
  veinContrast: 0.75,
  /** Blurred planar reflection (quality tier: off on mobile). */
  reflection: { scale: 0.5, strength: 0.45, blurLod: 1.5, envMapIntensity: 0.3 },
} as const;

// ---------------------------------------------------------------- lighting
export const SUN = {
  color: '#FFD9A0',
  intensity: 8.5,
  azimuthDeg: 90, // due East (0 = North, clockwise)
  elevationDeg: 22,
  shadowMapSize: 4096,
  shadowRadius: 4,
  shadowBias: -0.0004,
  shadowNormalBias: 0.02,
  distance: 9,
} as const;

export const SKY_FILL = { color: '#E4E9EE', intensity: 10 } as const;

export const ENVIRONMENT = {
  hdri: 'hdri/sunset_forest_1k.hdr', // Poly Haven, CC0
  intensity: 0.35,
  /** Which HDRI feature is rolled to face the window (east). */
  align: 'sun' as 'sun' | 'foliage',
  windowAzimuthDeg: 90, // the window is on the east wall (REF-C)
  blurInterior: 0.07, // spec ~0.5 turns a 1K HDRI to mush; 0.12 reads as depth of field
  blurDollhouse: 0.7, // outside orbit: HDRI becomes a soft studio backdrop
  backgroundIntensity: 2.6, // outdoors reads over-exposed vs the room, as in REF-D
  /** Interior light probe: captures the lit room as the IBL for interior surfaces. */
  // intensity > 1 stands in for the multi-bounce GI a single capture misses.
  probe: { enabled: true, y: 1.35, size: 256, bounces: 2, intensity: 1.5 },
} as const;

export const GOBO = {
  distance: 2.2, // from the window centre, towards the sun
  size: 2.8,
  coverage: 0.55,
  wobbleDeg: 1.2,
  wobbleHz: 0.18,
} as const;

export const RENDER = {
  exposure: 0.92, // spec ~0.85; re-balance once the M2 lamps are in
  maxDpr: 2,
} as const;

/**
 * CLIENT (laptop heat, after M4): costly live effects switched off.
 *  - fanSpins: fan shown switched off (blades still).
 *  - sunlight: no low sun through the window, so no window/grille/leaf shadows
 *    and no shadow maps at all (the window's soft sky fill stays).
 *  - floorReflection: no per-frame mirrored render of the room for the floor.
 *  - mirror 'photo': the oval mirror shows one still image of the room, taken
 *    once at load, instead of a live reflection.
 */
export const FEATURES = {
  fanSpins: false,
  sunlight: false,
  floorReflection: false,
  mirror: 'photo' as 'photo' | 'reflective',
} as const;

/** Power saving (CLIENT: laptop heating). */
export const POWER = {
  maxFps: 60, // cap even on 120 Hz screens
  idleAfter: 2.5, // s without input or motion -> idle frame rate
  idleFps: 15, // fan keeps turning, GPU mostly rests
  sleepAfter: 15, // s -> stop drawing entirely until the next input
} as const;

/** Post-processing (spec 7). */
export const POSTFX = {
  toneMapping: 'aces' as 'aces' | 'agx',
  ao: { radius: 0.5, distanceFalloff: 1.0, intensity: 2.0, halfRes: true },
  aoQuality: { high: 'Medium', medium: 'Performance' } as const, // low / mobile: AO off
  bloom: { threshold: 0.9, intensity: 0.35, smoothing: 0.2, radius: 0.7 },
  vignette: { darkness: 0.2, offset: 0.35 },
  grain: 0.02,
} as const;

/** Adaptive quality (spec 7). Resolution drops first, then feature tiers. */
export const QUALITY = {
  maxDpr: 1.5, // CLIENT (laptop heat): 2x retina quadruples pixel work for little visible gain
  startDpr: 1.25, // starts here, then adapts (never below 1x until the low tier)
  mobileStartDpr: 1,
  warmupSeconds: 2.5,
  minDpr: 0.6,
  lowFps: 48,
  highFps: 58,
  leafWobble: true,
} as const;

// ---------------------------------------------------------------- camera behaviour
export const CAMERA = {
  // spec 8 asks 0.25 m, but spec shots S2 (z -1.70) and S3 (z -1.65) sit 0.14-0.19 m
  // from the north wall; 0.12 keeps every spec shot exactly where it was defined.
  interiorPadding: 0.12,
  eyeMin: 0.8, // spec 8: eye height 0.8..2.2
  eyeMax: 2.2,
  smoothTime: 0.25,
  dollySpeed: 0.55, // gentler wheel steps so objects stay framed
  focusMargin: 1.25, // double-click framing slack
  // Interior: drag looks around in place (pivot 5 cm ahead, grab-the-world
  // direction); after focusing something within orbitMaxDistance, drag orbits it.
  interior: { minDistance: 0.05, maxDistance: 3.5, minPolarDeg: 20, maxPolarDeg: 160, lookSpeed: -0.35, orbitSpeed: 0.45 },
  dollhouse: { minDistance: 6.5, maxDistance: 16, minPolarDeg: 10, maxPolarDeg: 80, lookSpeed: 0.8, orbitSpeed: 0.8 },
  lookPivot: 0.05,
  swipePan: 0.004, // metres per wheel-delta pixel of a sideways trackpad swipe
  keyStep: 0.18, // metres per arrow/WASD press or move-pad tick
  orbitMaxDistance: 2.2,
  /** Eye keeps this far from furniture volumes (bed, tables, wardrobe, desk, pillar...). */
  furnitureMargin: 0.25,
} as const;

// ---------------------------------------------------------------- camera shots
export interface Shot {
  id: string;
  label: string;
  pos: [number, number, number];
  target: [number, number, number];
  fov: number;
  doorOpen?: boolean;
}

export const SHOTS: Shot[] = [
  { id: 'S0', label: 'Dollhouse', pos: [6.5, 7.0, -7.5], target: [0, 0.9, 0], fov: 35 },
  { id: 'S1', label: 'Doorway', pos: [1.0, 1.55, -1.55], target: [-0.5, 1.2, 1.8], fov: 65, doorOpen: true },
  { id: 'S2', label: 'Front view', pos: [0.6, 1.45, -1.7], target: [-0.475, 1.15, 1.84], fov: 50 },
  { id: 'S3', label: 'From door', pos: [1.4, 1.5, -1.65], target: [-1.0, 1.0, 1.0], fov: 55 },
  // Moved from (2.2, 1.45, -1.2): that sat inside the areca palm (AGREED M2)
  { id: 'S4', label: 'Window side', pos: [2.15, 1.45, -0.35], target: [-0.5, 0.9, 1.0], fov: 55 },
  { id: 'S5', label: 'Wardrobe side', pos: [0.3, 1.5, 1.55], target: [-0.9, 1.25, -1.8], fov: 55 },
  { id: 'S6', label: 'Study', pos: [0.8, 1.35, -0.6], target: [2.1, 0.95, 1.4], fov: 45 },
  { id: 'S7', label: 'Dresser', pos: [-0.6, 1.4, -0.4], target: [-2.2, 1.3, -1.4], fov: 50 },
  { id: 'S8', label: 'Art detail', pos: [-0.475, 1.3, 0.2], target: [-0.475, 1.5, 1.84], fov: 35 },
];
