import * as THREE from 'three';
import spotsData from './spots.json';
import { BED, CORNER_PILLARS, DESK, DOORS, PILLAR, ROOM, WALLS, WARDROBE, WINDOW } from '../config/room.config';
import { buildMeasurements, ftIn, type Measured } from '../scene/measurements';

/**
 * Lightweight 360 tour (CLIENT: shareable on any phone / social media).
 * Pre-rendered equirectangular panoramas (scripts/capture360.mjs) on a
 * seamless shader sky-box; drag / tilt to look, floor arrows to move,
 * optional ⓘ markers with sizes and Indore-market colour names.
 */
interface Spot {
  id: string;
  name: string;
  pos: [number, number, number];
  heading: number;
  wardrobeOpen: boolean;
}

const spots = spotsData.spots as Spot[];
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const DEG = Math.PI / 180;

// ------------------------------------------------ renderer + panorama sky-box
const view = $('view');
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'low-power' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 10);

// Direction -> equirect lookup in the shader: no UV seam, no pole pinching.
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: { map: { value: null as THREE.Texture | null }, heading: { value: 0 } },
  vertexShader: /* glsl */ `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D map;
    uniform float heading;
    varying vec3 vDir;
    #define PI 3.141592653589793
    void main() {
      vec3 d = normalize(vDir);
      float lon = atan(d.x, -d.z);             // compass: 0 north (-Z), +90 east (+X)
      float lat = asin(clamp(d.y, -1.0, 1.0));
      float u = fract((lon - heading) / (2.0 * PI) + 0.5);
      float v = 0.5 + lat / PI;
      gl_FragColor = texture2D(map, vec2(u, v));
      #include <colorspace_fragment>
    }`,
});
scene.add(new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), skyMat));

const loader = new THREE.TextureLoader();
const cache = new Map<string, Promise<THREE.Texture>>();
function pano(id: string): Promise<THREE.Texture> {
  let p = cache.get(id);
  if (!p) {
    p = loader.loadAsync(`pano-${id}.jpg`).then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.generateMipmaps = false; // mip seams at the wrap column would show as a line
      t.minFilter = THREE.LinearFilter;
      t.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return t;
    });
    cache.set(id, p);
  }
  return p;
}

// ------------------------------------------------ look controls (compass yaw, pitch)
let yaw = 0;
let pitch = 0;
// Portrait phones get a wider vertical view so more of the room (and the walk arrows) is in frame.
let fov = innerHeight > innerWidth ? 95 : 75;
let dragging: { x: number; y: number; yaw: number; pitch: number } | null = null;
let gyro: { alpha0: number; yaw0: number } | null = null;
const pinch = new Map<number, { x: number; y: number }>();
let pinchStart = 0;
let fovStart = fov;

function applyCamera(): void {
  pitch = THREE.MathUtils.clamp(pitch, -85, 85);
  fov = THREE.MathUtils.clamp(fov, 35, 95);
  const cy = Math.cos(pitch * DEG);
  camera.lookAt(Math.sin(yaw * DEG) * cy, Math.sin(pitch * DEG), -Math.cos(yaw * DEG) * cy);
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  dirty = true;
}

view.addEventListener('pointerdown', (e) => {
  pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
  view.setPointerCapture(e.pointerId);
  if (pinch.size === 2) {
    const [a, b] = [...pinch.values()];
    pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
    fovStart = fov;
    dragging = null;
  } else dragging = { x: e.clientX, y: e.clientY, yaw, pitch };
  hideHint();
});
view.addEventListener('pointermove', (e) => {
  if (!pinch.has(e.pointerId)) return;
  pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch.size === 2) {
    const [a, b] = [...pinch.values()];
    fov = fovStart * (pinchStart / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)));
    applyCamera();
  } else if (dragging) {
    // Grab-the-world: 1 screen height of drag ~ one vertical field of view.
    const k = fov / view.clientHeight;
    yaw = dragging.yaw - (e.clientX - dragging.x) * k;
    pitch = dragging.pitch + (e.clientY - dragging.y) * k;
    applyCamera();
  }
});
const endPointer = (e: PointerEvent) => {
  pinch.delete(e.pointerId);
  if (pinch.size === 0) dragging = null;
};
view.addEventListener('pointerup', endPointer);
view.addEventListener('pointercancel', endPointer);
view.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    fov *= Math.exp(e.deltaY * 0.001);
    applyCamera();
  },
  { passive: false },
);

// Tilt-to-look (phones). iOS needs an explicit permission tap.
const btnGyro = $<HTMLButtonElement>('btn-gyro');
if ('DeviceOrientationEvent' in window && matchMedia('(pointer: coarse)').matches) btnGyro.hidden = false;
btnGyro.addEventListener('click', async () => {
  if (gyro) {
    gyro = null;
    btnGyro.setAttribute('aria-pressed', 'false');
    return;
  }
  const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
  if (DOE.requestPermission && (await DOE.requestPermission()) !== 'granted') return;
  gyro = { alpha0: NaN, yaw0: yaw };
  btnGyro.setAttribute('aria-pressed', 'true');
});
window.addEventListener('deviceorientation', (e) => {
  if (!gyro || e.alpha === null || e.beta === null) return;
  if (Number.isNaN(gyro.alpha0)) gyro.alpha0 = e.alpha;
  // Phone held upright: alpha turns around, beta tilts (90 = upright).
  yaw = gyro.yaw0 - (e.alpha - gyro.alpha0);
  pitch = (e.beta ?? 90) - 90;
  applyCamera();
});

// ------------------------------------------------ hotspots (walk arrows + ⓘ markers)
const items = buildMeasurements();
const occluders = items.filter((i) => i.occludes !== false).map((i) => ({ id: i.id, box: i.occluder ?? i.box }));
const ray = new THREE.Ray();
const hit = new THREE.Vector3();

function visibleFrom(from: THREE.Vector3, to: THREE.Vector3, ignore?: string): boolean {
  const dist = from.distanceTo(to);
  ray.set(from, to.clone().sub(from).normalize());
  for (const o of occluders) {
    if (o.id === ignore || o.box.containsPoint(from)) continue;
    if (ray.intersectBox(o.box, hit) && hit.distanceTo(from) < dist - 0.08) return false;
  }
  return true;
}

interface Hotspot {
  el: HTMLElement;
  dir: THREE.Vector3; // world direction from the spot
}
const layer = $('hotspots');
let hotspots: Hotspot[] = [];
let showInfo = false;
const card = $('card');

function buildHotspots(s: Spot): void {
  layer.replaceChildren();
  hotspots = [];
  const eye = new THREE.Vector3(...s.pos);
  // Walk arrows: every other spot in line of sight, drawn on the floor towards it.
  for (const o of spots) {
    if (o.id === s.id) continue;
    const target = new THREE.Vector3(o.pos[0], 1.0, o.pos[2]);
    if (!visibleFrom(new THREE.Vector3(eye.x, 1.0, eye.z), target)) continue;
    // Just below eye level towards the spot, so arrows sit in a level view.
    const aim = new THREE.Vector3(o.pos[0], eye.y - 0.55, o.pos[2]);
    const dir = aim.sub(eye).normalize();
    const el = document.createElement('button');
    el.className = 'hs-walk';
    el.type = 'button';
    el.innerHTML = `<span class="hs-arrow">➜</span><span class="hs-label">${o.name}</span>`;
    el.addEventListener('click', () => void go(o.id));
    layer.appendChild(el);
    hotspots.push({ el, dir });
  }
  // ⓘ markers for measured objects visible from here.
  for (const it of items) {
    if (!visibleFrom(eye, it.anchor, it.id) || eye.distanceTo(it.anchor) > 6) continue;
    const el = document.createElement('button');
    el.className = 'hs-info';
    el.type = 'button';
    el.textContent = 'i';
    el.title = it.name;
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openCard(it);
    });
    layer.appendChild(el);
    hotspots.push({ el, dir: it.anchor.clone().sub(eye).normalize() });
  }
  layer.classList.toggle('show-info', showInfo);
}

function openCard(it: Measured): void {
  const size = it.size
    ? (() => {
        const parts = (it.size.round ? [it.size.w, it.size.h] : [it.size.w, it.size.d, it.size.h]).filter((x): x is number => x !== undefined);
        const pre = it.size.round ? 'Ø' : '';
        return `<p class="c-ft">${pre}${parts.map(ftIn).join(' × ')}</p><p class="c-m">${pre}${parts.map((x) => x.toFixed(2)).join(' × ')} m</p>`;
      })()
    : '';
  const colours = (it.colours ?? []).map((c) => `<li><i style="background:${c.hex}"></i>${c.name}</li>`).join('');
  card.innerHTML =
    `<button type="button" class="c-close" aria-label="Close">×</button><h2>${it.name}</h2>${size}` +
    (it.note ? `<p class="c-note">${it.note}</p>` : '') +
    (colours ? `<ul class="c-colours">${colours}</ul>` : '');
  card.hidden = false;
  card.querySelector('.c-close')!.addEventListener('click', () => (card.hidden = true));
}

const proj = new THREE.Vector3();
function placeHotspots(): void {
  const w = view.clientWidth, h = view.clientHeight;
  // Anything whose label would slide under the bottom bar is hidden rather than half-covered.
  const barTop = (document.querySelector('.bar') as HTMLElement).getBoundingClientRect().top - 24;
  for (const hs of hotspots) {
    proj.copy(hs.dir).project(camera);
    const x = ((proj.x + 1) / 2) * w, y = ((1 - proj.y) / 2) * h;
    const inFront = proj.z < 1 && Math.abs(proj.x) < 0.96 && Math.abs(proj.y) < 0.92 && y < barTop;
    hs.el.style.display = inFront ? '' : 'none';
    if (inFront) hs.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  }
}

// ------------------------------------------------ floor-plan mini map
const map = document.getElementById('map') as unknown as SVGSVGElement;
// Drawn like the client's own plan (REF-C / sketch): blue wall (south) on top, window (east) on the left.
const MX = (x: number) => ((ROOM.halfW - x) / ROOM.width) * 100;
const MZ = (z: number) => ((ROOM.halfD - z) / ROOM.depth) * 70;
function rect(x0: number, x1: number, z0: number, z1: number, cls: string): string {
  const ax = MX(x0), bx = MX(x1), az = MZ(z0), bz = MZ(z1); // mapping is flipped: take min after mapping
  return `<rect class="${cls}" x="${Math.min(ax, bx)}" y="${Math.min(az, bz)}" width="${Math.abs(bx - ax)}" height="${Math.abs(bz - az)}"/>`;
}
function drawMap(active: Spot): void {
  const bedZ1 = WALLS.south;
  const bedZ0 = bedZ1 - BED.headboard.depth - BED.base.l;
  let svg = rect(WALLS.west, WALLS.east, WALLS.north, WALLS.south, 'm-room');
  svg += rect(WALLS.west + 0.02, PILLAR.x0, WALLS.south - 0.03, WALLS.south, 'm-accent');
  svg += rect(PILLAR.x1, WALLS.east - 0.02, WALLS.south - 0.03, WALLS.south, 'm-accent');
  svg += rect(PILLAR.x0, PILLAR.x1, WALLS.south - PILLAR.projection, WALLS.south, 'm-pillar');
  for (const c of CORNER_PILLARS) svg += rect(c.x0, c.x1, c.z0, c.z1, 'm-pillar');
  svg += rect(BED.centerX - BED.base.w / 2, BED.centerX + BED.base.w / 2, bedZ0, bedZ1, 'm-furn');
  svg += rect(WALLS.west, WARDROBE.faceX, WARDROBE.z0, WARDROBE.z1, 'm-furn');
  svg += rect(DESK.legA.x0, DESK.legA.x1, DESK.legA.z0, DESK.legA.z1, 'm-furn');
  svg += rect(DESK.legB.x0, DESK.legB.x1, DESK.legB.z0, DESK.legB.z1, 'm-furn');
  svg += rect(WALLS.east - 0.04, WALLS.east, WINDOW.centerZ - WINDOW.width / 2, WINDOW.centerZ + WINDOW.width / 2, 'm-window');
  for (const d of Object.values(DOORS)) svg += rect(d.centerX - d.width / 2, d.centerX + d.width / 2, WALLS.north, WALLS.north + 0.05, 'm-door');
  for (const s of spots) {
    const cx = MX(s.pos[0]), cz = MZ(s.pos[2]);
    if (s.id === active.id) {
      // View cone in the current yaw direction.
      const a0 = (yaw - fov / 2) * DEG, a1 = (yaw + fov / 2) * DEG, r = 16;
      // Plan is rotated 180 deg: world (sin, -cos) maps to screen (-sin, +cos).
      svg += `<path class="m-cone" d="M${cx},${cz} L${cx - Math.sin(a0) * r},${cz + Math.cos(a0) * r} A${r},${r} 0 0 1 ${cx - Math.sin(a1) * r},${cz + Math.cos(a1) * r} Z"/>`;
    }
    svg += `<circle class="m-spot${s.id === active.id ? ' on' : ''}" data-id="${s.id}" cx="${cx}" cy="${cz}" r="${s.id === active.id ? 3.2 : 2.4}"><title>${s.name}</title></circle>`;
  }
  map.innerHTML = svg;
}
map.addEventListener('click', (e) => {
  const id = (e.target as Element).getAttribute('data-id');
  if (id) void go(id);
});

// ------------------------------------------------ spot switching
let current: Spot = spots[0];
const fade = $('fade');
const chips = $('spots');
chips.innerHTML = spots.map((s) => `<button type="button" data-id="${s.id}">${s.name}</button>`).join('');
chips.addEventListener('click', (e) => {
  const id = (e.target as HTMLElement).dataset.id;
  if (id) void go(id);
});

async function go(id: string, first = false): Promise<void> {
  const s = spots.find((x) => x.id === id) ?? spots[0];
  const keepYaw = !first && current.id !== s.id;
  if (!first) fade.classList.add('on');
  const [tex] = await Promise.all([pano(s.id), first ? null : new Promise((r) => setTimeout(r, 220))]);
  // Walking to a spot: face the direction of travel; otherwise the spot's own view.
  if (keepYaw) {
    const dx = s.pos[0] - current.pos[0], dz = s.pos[2] - current.pos[2];
    yaw = Math.atan2(dx, -dz) / DEG;
  } else yaw = s.heading;
  pitch = -5;
  current = s;
  skyMat.uniforms.map.value = tex;
  skyMat.uniforms.heading.value = s.heading * DEG;
  $('spot-name').textContent = s.name;
  chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.id === s.id)));
  buildHotspots(s);
  card.hidden = true;
  applyCamera();
  fade.classList.remove('on');
  history.replaceState(null, '', `?spot=${s.id}`);
  // Preload neighbours in the background.
  for (const o of spots) if (o.id !== s.id) void pano(o.id);
}

// ------------------------------------------------ toolbar
const btnInfo = $<HTMLButtonElement>('btn-info');
btnInfo.addEventListener('click', () => {
  showInfo = !showInfo;
  btnInfo.setAttribute('aria-pressed', String(showInfo));
  layer.classList.toggle('show-info', showInfo);
  if (!showInfo) card.hidden = true;
});
function toast(msg: string): void {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 2200);
}
$('btn-share').addEventListener('click', async () => {
  const url = location.href.split('?')[0] + `?spot=${current.id}`;
  const data = { title: 'Bedroom 360° Tour', text: 'Take a look around the new bedroom design in 360°', url };
  try {
    if (navigator.share) await navigator.share(data);
    else {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    }
  } catch {
    /* share sheet dismissed */
  }
});
$('btn-full').addEventListener('click', () => {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.();
});
function hideHint(): void {
  $('hint').classList.add('gone');
}
setTimeout(hideHint, 6000);

// ------------------------------------------------ render on demand (no idle GPU use)
let dirty = true;
function resize(): void {
  renderer.setSize(view.clientWidth, view.clientHeight);
  camera.aspect = view.clientWidth / view.clientHeight;
  camera.updateProjectionMatrix();
  dirty = true;
}
new ResizeObserver(resize).observe(view);
resize();
let lastMap = '';
renderer.setAnimationLoop(() => {
  if (!dirty) return;
  dirty = false;
  renderer.render(scene, camera);
  placeHotspots();
  const key = `${current.id}:${Math.round(yaw)}:${Math.round(fov)}`;
  if (key !== lastMap) {
    lastMap = key;
    drawMap(current);
  }
});

const start = new URLSearchParams(location.search).get('spot') ?? spots[0].id;
void go(start, true).then(() => ((window as unknown as { __tourReady: boolean }).__tourReady = true));
