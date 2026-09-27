import * as THREE from 'three';
import { GOBO, ROOM, SKY_FILL, SUN, WALLS, WINDOW } from '../config/room.config';
import { makeLeafGobo } from '../materials/canvasTextures';
import type { Materials } from '../materials/library';

/** Unit vector pointing towards the sun. Azimuth 0 = North (-Z), clockwise; 90 = East. */
export function sunDirection(azimuthDeg: number, elevationDeg: number, out = new THREE.Vector3()): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azimuthDeg);
  const el = THREE.MathUtils.degToRad(elevationDeg);
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

export interface SunRig {
  sun: THREE.DirectionalLight;
  skyFill: THREE.RectAreaLight;
  gobo: THREE.Mesh;
  setAngles(azimuthDeg: number, elevationDeg: number): void;
  /** Animates the leaf gobo; returns without change when `wobble` is false. */
  update(elapsed: number, wobble: boolean): void;
}

const _corners = Array.from({ length: 8 }, () => new THREE.Vector3());
const _dir = new THREE.Vector3();
const _sway = new THREE.Quaternion();

/**
 * Fits the orthographic shadow frustum tightly around `box` as seen from the
 * light, so the 4096 map spends its texels on the room only.
 */
function fitShadow(light: THREE.DirectionalLight, box: THREE.Box3, extraDepth: number): void {
  const cam = light.shadow.camera;
  cam.position.copy(light.position);
  cam.lookAt(light.target.position);
  cam.updateMatrixWorld(true);
  const { min, max } = box;
  let i = 0;
  for (const x of [min.x, max.x])
    for (const y of [min.y, max.y])
      for (const z of [min.z, max.z]) _corners[i++].set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
  let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity, n = Infinity, f = -Infinity;
  for (const c of _corners) {
    l = Math.min(l, c.x);
    r = Math.max(r, c.x);
    b = Math.min(b, c.y);
    t = Math.max(t, c.y);
    n = Math.min(n, -c.z);
    f = Math.max(f, -c.z);
  }
  cam.left = l - 0.05;
  cam.right = r + 0.05;
  cam.bottom = b - 0.05;
  cam.top = t + 0.05;
  cam.near = Math.max(0.05, n - extraDepth);
  cam.far = f + 0.1;
  cam.updateProjectionMatrix();
}

export function buildSun(scene: THREE.Scene, mats: Materials): SunRig {
  const target = new THREE.Object3D();
  target.position.set(0, 1.0, 0);
  scene.add(target);

  const sun = new THREE.DirectionalLight(SUN.color, SUN.intensity);
  sun.name = 'sun';
  sun.target = target;
  sun.castShadow = true;
  sun.shadow.mapSize.set(SUN.shadowMapSize, SUN.shadowMapSize);
  sun.shadow.radius = SUN.shadowRadius;
  sun.shadow.bias = SUN.shadowBias;
  sun.shadow.normalBias = SUN.shadowNormalBias;
  scene.add(sun);

  // Room plus wall thickness, so the reveals and grille are inside the frustum.
  const shadowBox = new THREE.Box3(
    new THREE.Vector3(-ROOM.halfW - ROOM.wallThickness, 0, -ROOM.halfD - ROOM.wallThickness),
    new THREE.Vector3(ROOM.halfW + ROOM.wallThickness, ROOM.ceilingH, ROOM.halfD + ROOM.wallThickness),
  );

  // Leaf gobo outside the window: invisible, but its alpha-tested depth
  // casts dappled shadows through the opening.
  const goboTex = makeLeafGobo(GOBO.coverage);
  // r186's shadow pass copies alphaMap/alphaTest from the mesh's own material
  // onto the depth material, so the mask must live on an (invisible) material.
  const goboMat = mats.shadowProxy.clone();
  goboMat.alphaMap = goboTex;
  goboMat.alphaTest = 0.5;
  goboMat.shadowSide = THREE.DoubleSide;
  const gobo = new THREE.Mesh(new THREE.PlaneGeometry(GOBO.size, GOBO.size), goboMat);
  gobo.name = 'leafGobo';
  gobo.castShadow = true;
  gobo.receiveShadow = false;
  scene.add(gobo);
  const windowCentre = new THREE.Vector3(WALLS.east + ROOM.wallThickness, WINDOW.sill + WINDOW.height / 2, WINDOW.centerZ);
  const goboBase = new THREE.Vector3();
  const goboQuat = new THREE.Quaternion();

  // Sky fill in the window opening: soft, shadowless (RectAreaLight).
  const skyFill = new THREE.RectAreaLight(SKY_FILL.color, SKY_FILL.intensity, WINDOW.width, WINDOW.height);
  skyFill.position.set(WALLS.east - 0.01, WINDOW.sill + WINDOW.height / 2, WINDOW.centerZ);
  skyFill.lookAt(0, WINDOW.sill + WINDOW.height / 2, WINDOW.centerZ);
  skyFill.name = 'skyFill';
  scene.add(skyFill);

  const setAngles = (azimuthDeg: number, elevationDeg: number) => {
    sunDirection(azimuthDeg, elevationDeg, _dir);
    sun.position.copy(target.position).addScaledVector(_dir, SUN.distance);
    // Gobo sits between the sun and the window, facing the sun.
    goboBase.copy(windowCentre).addScaledVector(_dir, GOBO.distance);
    gobo.position.copy(goboBase);
    gobo.lookAt(goboBase.clone().add(_dir));
    goboQuat.copy(gobo.quaternion);
    fitShadow(sun, shadowBox, SUN.distance);
  };
  setAngles(SUN.azimuthDeg, SUN.elevationDeg);

  const update = (elapsed: number, wobble: boolean) => {
    if (!wobble) return;
    // Gentle wind: slow sway about the sun axis plus a small drift.
    const w = THREE.MathUtils.degToRad(GOBO.wobbleDeg);
    const a = Math.sin(elapsed * Math.PI * 2 * GOBO.wobbleHz) * w + Math.sin(elapsed * 1.7) * w * 0.35;
    gobo.quaternion.copy(goboQuat).premultiply(_sway.setFromAxisAngle(_dir, a));
    gobo.position.copy(goboBase);
    gobo.position.y += Math.sin(elapsed * 0.9) * 0.01;
  };

  return { sun, skyFill, gobo, setAngles, update };
}
