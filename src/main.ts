import * as THREE from 'three';
import gsap from 'gsap';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { CAMERA, DRESSER, ENVIRONMENT, FEATURES, FLOOR, POWER, RENDER, SHOTS, WARDROBE } from './config/room.config';
import { manager, setMaxAnisotropy } from './core/assets';
import { createMaterials } from './materials/library';
import { createFurnitureMaterials } from './materials/furniture';
import { buildFurniture } from './scene/furniture';
import { buildRoom } from './scene/room';
import { buildMeasurements, type Measured } from './scene/measurements';
import { buildSun } from './lighting/sun';
import { setupEnvironment } from './lighting/environment';
import { CameraRig, type ViewMode } from './camera/rig';
import { Quality } from './render/quality';
import { bindLoading } from './ui/loading';
import { createDebugGui } from './ui/debug';
import { MeasureOverlay } from './ui/measure';
import { Toolbar } from './ui/toolbar';
import { createFloorReflection } from './postfx/floorReflection';
import { Pipeline, type ToneMap } from './postfx/pipeline';

declare global {
  interface Window {
    /** Set once the first frames are on screen (used by the screenshot script). */
    __ready?: boolean;
    __goToShot?: (id: string) => Promise<void>;
    __quality?: () => { tier: string; pixelRatio: number };
    /** Frames actually rendered (the power manager skips most rAF ticks when idle). */
    __frames?: () => number;
    /** 360 capture (?capture): stage the room, then render one overscanned cube face. */
    __capture?: {
      stage(opts: { wardrobeOpen: boolean; doorOpen: boolean }): Promise<void>;
      face(pos: number[], forward: number[], up: number[], size: number, fovDeg: number): string;
    };
    /** Live objects for tuning from the console (only with ?debug). */
    __dbg?: Record<string, unknown>;
  }
}

/**
 * CLIENT (heat): the oval mirror shows one still image of the room, rendered
 * once from the mirror looking into the room, instead of a live reflection.
 */
function bakeMirrorPhoto(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
  const glass = scene.getObjectByName('mirrorGlass') as THREE.Mesh | undefined;
  if (!glass) return;
  const mr = DRESSER.mirror;
  const rt = new THREE.WebGLRenderTarget(384, 960, { type: THREE.HalfFloatType });
  const cam = new THREE.PerspectiveCamera(58, mr.w / mr.h, 0.05, 20);
  cam.position.set(WARDROBE.faceX + 0.06, mr.y, mr.z);
  cam.lookAt(WARDROBE.faceX + 4, mr.y - 0.35, mr.z + 0.6);
  // Hide the glass itself and the measurement overlay (lines) for the photo.
  const overlay = scene.getObjectByName('measurements');
  const overlayWas = overlay?.visible ?? false;
  if (overlay) overlay.visible = false;
  glass.visible = false;
  renderer.setRenderTarget(rt);
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  glass.visible = true;
  if (overlay) overlay.visible = overlayWas;
  // Emissive so the photo keeps its own light; a little gloss keeps it reading as glass.
  glass.material = new THREE.MeshStandardMaterial({
    color: '#0a0a0a',
    emissive: '#ffffff',
    emissiveMap: rt.texture,
    emissiveIntensity: 0.95,
    roughness: 0.12,
    metalness: 0,
    envMapIntensity: 0.25,
  });
}

const shotById = (id: string) => SHOTS.find((s) => s.id.toLowerCase() === id.toLowerCase());

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const loading = bindLoading(manager);

  // ------------------------------------------------ renderer
  const container = document.getElementById('app');
  if (!container) throw new Error('#app missing');
  // No MSAA on the canvas: the composer renders off-screen and SMAA handles edges.
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(1); // the quality manager sets the real ratio
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMappingExposure = RENDER.exposure;
  // CLIENT (heat): no sunlight -> no shadow-casting light -> no shadow maps at all.
  renderer.shadowMap.enabled = FEATURES.sunlight;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft was removed in r18x; radius softens PCF
  // The quality manager decides when the sun shadow map is redrawn: only when
  // a caster moves, not on every frame.
  renderer.shadowMap.autoUpdate = false;
  container.appendChild(renderer.domElement);
  setMaxAnisotropy(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.03, 60);
  const rig = new CameraRig(camera, renderer.domElement);

  // ------------------------------------------------ content
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const [mats, fmats] = await Promise.all([createMaterials(aniso), createFurnitureMaterials(aniso)]);
  const room = buildRoom(mats);
  scene.add(room.group);
  const furniture = buildFurniture({ base: mats, f: fmats });
  scene.add(furniture.group);
  const sunRig = buildSun(scene, mats);
  if (!FEATURES.sunlight) {
    sunRig.sun.visible = false;
    sunRig.gobo.visible = false;
    // The invisible 0.23 m walls only exist to cast sun shadows.
    const proxies = room.group.getObjectByName('shadowProxies');
    if (proxies) proxies.visible = false;
  }
  const env = await setupEnvironment(renderer, scene, ENVIRONMENT.windowAzimuthDeg);

  const floors: THREE.Object3D[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material === mats.floor) floors.push(o);
  });
  const reflection = createFloorReflection([mats.floor], floors, FLOOR.reflection.scale, FLOOR.reflection.strength, FLOOR.reflection.blurLod);
  // The planar reflection carries the sharp mirror; keep the probe's share low to avoid doubling.
  mats.floor.envMapIntensity = FEATURES.floorReflection ? FLOOR.reflection.envMapIntensity : 1;
  if (!FEATURES.floorReflection) reflection.setEnabled(false);

  // ------------------------------------------------ measurements
  const items = buildMeasurements();
  // Wardrobe storage zones: tagged only while the wardrobe is open.
  for (const z of furniture.wardrobe.zones) {
    items.push({
      id: `wardrobe-${z.name.toLowerCase()}`,
      name: `Wardrobe · ${z.name}`,
      box: new THREE.Box3().setFromCenterAndSize(z.anchor, new THREE.Vector3(0.1, 0.1, 0.1)),
      anchor: z.anchor,
      note: z.detail,
      occludes: false,
      visibleWhen: () => furniture.wardrobe.isOpen,
      inside: 'wardrobe',
    });
  }
  const measure = new MeasureOverlay(document.body, items, camera);
  scene.add(measure.group);
  measure.enabled = params.get('measure') !== '0';

  // ------------------------------------------------ post-processing
  const pipeline = new Pipeline(renderer, scene, camera);
  const tm = params.get('tonemap');
  if (tm === 'agx' || tm === 'aces') pipeline.setToneMapping(tm as ToneMap);

  // ------------------------------------------------ sizing + adaptive quality
  const drawSize = new THREE.Vector2();
  const resize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    pipeline.setSize(w, h);
    renderer.getDrawingBufferSize(drawSize);
    reflection.setSize(drawSize.x, drawSize.y);
    measure.setSize(w, h);
  };
  const quality = new Quality({ renderer, reflection, sunRig, lights: furniture.lights, pipeline, onResize: resize });
  new ResizeObserver(resize).observe(container);
  window.__quality = () => quality.describe();

  // ------------------------------------------------ doors
  const door = room.doors.bedroom;
  const doorState = { v: 0 };
  const setDoor = (open: boolean, animate: boolean) => {
    gsap.killTweensOf(doorState);
    const onUpdate = () => {
      door.setOpen(doorState.v);
      quality.markShadowsDirty();
    };
    if (animate) gsap.to(doorState, { v: open ? 1 : 0, duration: 1.4, ease: 'power2.inOut', onUpdate });
    else {
      doorState.v = open ? 1 : 0;
      onUpdate();
    }
  };

  // ------------------------------------------------ wardrobe doors (click one, or all from the toolbar)
  const wardrobe = furniture.wardrobe;
  const swingDoor = (d: (typeof wardrobe.doors)[number], open: boolean, delay = 0) => {
    gsap.killTweensOf(d);
    gsap.to(d, { open: open ? 1 : 0, duration: 1.1, delay, ease: 'power2.inOut', onUpdate: () => wardrobe.setOpen(d, d.open) });
  };
  const slideDrawer = (dr: (typeof wardrobe.drawers)[number], open: boolean, delay = 0) => {
    gsap.killTweensOf(dr);
    gsap.to(dr, { open: open ? 1 : 0, duration: 0.7, delay, ease: 'power2.inOut', onUpdate: () => wardrobe.setDrawer(dr, dr.open) });
  };
  const anyDrawerOpen = () => wardrobe.drawers.some((dr) => dr.open > 0.01);
  /** Closing: drawers slide in first so no door swings into an open drawer. */
  const closeDrawersThen = (after: () => void) => {
    if (!anyDrawerOpen()) return after();
    wardrobe.drawers.forEach((dr) => slideDrawer(dr, false));
    gsap.delayedCall(0.75, after);
  };
  // Opening: doors swing, then every internal drawer slides out in turn.
  const toggleAllWardrobe = () => {
    const open = wardrobe.doors.every((d) => d.open < 0.5);
    if (open) {
      wardrobe.doors.forEach((d, i) => swingDoor(d, true, i * 0.06));
      wardrobe.drawers.forEach((dr, i) => slideDrawer(dr, true, 1.0 + i * 0.15));
    } else {
      closeDrawersThen(() => wardrobe.doors.forEach((d, i) => swingDoor(d, false, i * 0.06)));
    }
    gsap.delayedCall(0.2, () => measure.refresh());
    gsap.delayedCall(2.2, () => measure.refresh());
  };
  // A click (not a drag) on a door leaf toggles that door.
  const clickRay = new THREE.Raycaster();
  const clickNdc = new THREE.Vector2();
  let downAt: { x: number; y: number } | null = null;
  renderer.domElement.addEventListener('pointerdown', (e) => (downAt = { x: e.clientX, y: e.clientY }));
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    clickNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    clickRay.setFromCamera(clickNdc, camera);
    const hit = clickRay.intersectObjects([room.group, furniture.group], true)[0];
    const drawer = hit?.object.userData.wardrobeDrawer;
    if (drawer) {
      slideDrawer(drawer, drawer.open < 0.5);
      return;
    }
    const door = hit?.object.userData.wardrobeDoor;
    if (door) {
      if (door.open < 0.5) swingDoor(door, true);
      else closeDrawersThen(() => swingDoor(door, false));
      gsap.delayedCall(0.2, () => measure.refresh());
    }
  });

  // ------------------------------------------------ camera: shots, focus, modes
  const goToShot = async (id: string, animate: boolean) => {
    const s = shotById(id);
    if (!s) return;
    setDoor(!!s.doorOpen, animate);
    await rig.goToShot(s, animate);
  };
  const focusItem = (item: Measured) => void rig.focusBox(item.box, true);
  // Solid furniture the eye may not walk into (flat/overhead items excluded).
  rig.setColliders(items.filter((i) => i.occludes !== false).map((i) => i.occluder ?? i.box));

  const toolbar = new Toolbar(
    document.body,
    {
      toggleMeasure: (on) => (measure.enabled = on),
      setView: (mode: ViewMode) => void goToShot(mode === 'dollhouse' ? 'S0' : 'S2', true),
      toggleDoor: () => setDoor(doorState.v < 0.5, true),
      toggleWardrobe: toggleAllWardrobe,
      move: (dir) => {
        wake();
        const step = CAMERA.keyStep * 0.5;
        if (dir === 'left') rig.strafe(-step);
        else if (dir === 'right') rig.strafe(step);
        else if (dir === 'forward') rig.walk(step);
        else rig.walk(-step);
      },
    },
    measure.enabled,
  );
  rig.onModeChange = (mode) => {
    toolbar.setMode(mode);
    measure.setCompact(mode === 'dollhouse');
    // The corridor would block the cutaway from outside; the HDRI reads better as a soft backdrop.
    room.hall.visible = mode === 'interior';
    scene.backgroundBlurriness = mode === 'interior' ? ENVIRONMENT.blurInterior : ENVIRONMENT.blurDollhouse;
  };
  measure.onPick = focusItem;

  // Double-click: zoom to the measured object under the cursor (or the mesh itself).
  const picker = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickTargets: THREE.Object3D[] = [room.group, furniture.group];
  const probe = new THREE.Box3();
  const size = new THREE.Vector3();
  renderer.domElement.addEventListener('dblclick', (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    picker.setFromCamera(ndc, camera);
    const hit = picker.intersectObjects(pickTargets, true).find((h) => {
      const mat = (h.object as THREE.Mesh).material as THREE.Material;
      return mat.colorWrite !== false && !mat.transparent;
    });
    if (!hit) return;
    let best: Measured | null = null;
    let bestVol = Infinity;
    for (const it of items) {
      probe.copy(it.box).expandByScalar(0.04);
      if (!probe.containsPoint(hit.point)) continue;
      it.box.getSize(size);
      const vol = Math.max(size.x, 0.02) * Math.max(size.y, 0.02) * Math.max(size.z, 0.02);
      if (vol < bestVol) {
        bestVol = vol;
        best = it;
      }
    }
    if (best) focusItem(best);
    else {
      const b = new THREE.Box3().setFromObject(hit.object);
      if (b.getSize(size).length() < 3) void rig.focusBox(b, true);
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    const n = Number(e.key);
    if (e.key.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 8) void goToShot(SHOTS[n].id, true);
    if (e.key === 'm' || e.key === 'M') measure.enabled = !measure.enabled;
    if (e.key === 'o' || e.key === 'O') toggleAllWardrobe();
    // Walk / side-step: arrows or WASD.
    const step = CAMERA.keyStep;
    const k = e.key.toLowerCase();
    if (k === 'arrowleft' || k === 'a') rig.strafe(-step);
    else if (k === 'arrowright' || k === 'd') rig.strafe(step);
    else if (k === 'arrowup' || k === 'w') rig.walk(step);
    else if (k === 'arrowdown' || k === 's') rig.walk(-step);
    else return;
    e.preventDefault();
  });

  // ------------------------------------------------ first shot + probe
  const start = shotById(params.get('shot') ?? 'S2') ?? SHOTS[2];
  await goToShot(start.id, false);
  rig.update(0);
  rig.onModeChange(rig.mode);
  renderer.shadowMap.needsUpdate = true;
  env.captureProbe();
  if (FEATURES.mirror === 'photo') bakeMirrorPhoto(renderer, scene);

  // 360 capture mode freezes the interactive loop; frames are rendered by hand.
  let capturePaused = false;
  if (params.has('capture')) {
    window.__capture = {
      async stage({ wardrobeOpen, doorOpen }) {
        capturePaused = true;
        measure.enabled = false;
        document.querySelectorAll<HTMLElement>('.toolbar, .move-pad').forEach((e) => (e.hidden = true));
        pipeline.setCaptureMode(true);
        door.setOpen(doorOpen ? 1 : 0);
        for (const d of wardrobe.doors) wardrobe.setOpen(d, wardrobeOpen ? 1 : 0);
        for (const dr of wardrobe.drawers) wardrobe.setDrawer(dr, wardrobeOpen ? 1 : 0);
        room.hall.visible = true;
        scene.backgroundBlurriness = ENVIRONMENT.blurInterior;
      },
      face(pos, forward, up, size, fovDeg) {
        renderer.setPixelRatio(1);
        renderer.setSize(size, size, false);
        pipeline.setSize(size, size);
        camera.fov = fovDeg;
        camera.aspect = 1;
        camera.updateProjectionMatrix();
        camera.position.set(pos[0], pos[1], pos[2]);
        camera.up.set(up[0], up[1], up[2]);
        camera.lookAt(pos[0] + forward[0], pos[1] + forward[1], pos[2] + forward[2]);
        camera.updateMatrixWorld();
        // Render twice so temporal effects (AO denoise) settle, then read back immediately.
        pipeline.render(1 / 60);
        pipeline.render(1 / 60);
        return renderer.domElement.toDataURL('image/png');
      },
    };
  }

  window.__goToShot = (id: string) => goToShot(id, false).then(() => void rig.update(0));

  if (params.has('debug')) {
    createDebugGui({ renderer, scene, sunRig, env, mats, reflection, pipeline });
    window.__dbg = { THREE, renderer, scene, camera, rig, sunRig, env, mats, fmats, room, furniture, reflection, quality, measure, pipeline };
  }

  // ------------------------------------------------ loop
  // Power manager (CLIENT: laptop heating): 60 fps cap while interacting, a
  // low idle rate once everything is still, and no drawing at all after that.
  let lastActive = performance.now();
  const wake = () => (lastActive = performance.now());
  for (const ev of ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const) window.addEventListener(ev, wake, { passive: true, capture: true });
  window.addEventListener('pointermove', (e) => e.buttons && wake(), { passive: true });
  window.addEventListener('resize', wake);
  let lastRender = 0;
  window.__frames = () => frames;
  let elapsed = 0;
  let frames = 0;
  renderer.setAnimationLoop((now) => {
    if (capturePaused) return;
    const idleFor = (now - lastActive) / 1000;
    const animating = gsap.globalTimeline.getChildren(true, true, false).some((c) => c.isActive());
    if (animating) wake();
    const state = frames < 3 || idleFor < POWER.idleAfter ? 'active' : idleFor < POWER.sleepAfter ? 'idle' : 'sleep';
    if (state === 'sleep') return; // canvas keeps the last frame; any input wakes it
    const interval = 1000 / (state === 'active' ? POWER.maxFps : POWER.idleFps);
    if (now - lastRender < interval - 1.5) return;
    const dt = lastRender ? Math.min((now - lastRender) / 1000, 0.1) : 1 / 60;
    lastRender = now;
    elapsed += dt;
    const t = elapsed;
    if (rig.update(dt)) wake();
    const plan = quality.beginFrame(dt, state === 'active');
    sunRig.update(t, quality.leafWobble);
    furniture.update(t, dt);
    renderer.shadowMap.needsUpdate = plan.shadows;
    if (plan.reflection) reflection.update(renderer, scene, camera);
    pipeline.render(dt);
    measure.render(scene);
    if (++frames === 3) {
      loading.finish();
      window.__ready = true;
    }
  });
}

main().catch((err) => {
  console.error(err);
  const title = document.querySelector('#loading .loading-title');
  if (title) title.textContent = 'Could not load the room. See the console for details.';
});
