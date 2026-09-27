import * as THREE from 'three';
import type { Materials } from '../../materials/library';
import type { FurnitureMaterials } from '../../materials/furniture';

export interface Mats {
  base: Materials;
  f: FurnitureMaterials;
}

/** Lights owned by furniture, grouped so presets (M5) can drive them together. */
export interface InteriorLights {
  lamps: THREE.PointLight[];
  sconce: THREE.SpotLight[];
  leds: THREE.RectAreaLight[];
  /** Emissive materials to dim with their light (lamp shades, LED strips, screens). */
  emissive: { material: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial; on: number }[];
}

export interface Piece {
  group: THREE.Group;
  update?(elapsed: number, dt: number): void;
}

export function newLights(): InteriorLights {
  return { lamps: [], sconce: [], leds: [], emissive: [] };
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true, receive = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export function shadows<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}

/** Revolved profile [radius, y][] with metric-ish UVs (u around, v up). */
export function lathe(profile: [number, number][], segments = 48): THREE.LatheGeometry {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segments,
  );
}

/**
 * Downward warm LED strip (under shelves / the dresser top): an emissive bar
 * plus a thin shadowless RectAreaLight. `alongZ` sets the strip's long axis.
 */
export function ledStrip(
  lights: InteriorLights,
  length: number,
  intensity: number,
  color: string,
  position: THREE.Vector3,
  alongZ: boolean,
): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#2a2622', emissive: color, emissiveIntensity: 3, roughness: 0.4 });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? 0.012 : length, 0.006, alongZ ? length : 0.012), mat);
  bar.position.copy(position);
  g.add(bar);
  // rotation.x = -PI/2 points the light's -Z down; local X stays X, local Y maps to Z.
  const rect = new THREE.RectAreaLight(color, intensity, alongZ ? 0.03 : length, alongZ ? length : 0.03);
  rect.rotation.x = -Math.PI / 2;
  rect.position.copy(position).y -= 0.004;
  g.add(rect);
  lights.leds.push(rect);
  lights.emissive.push({ material: mat, on: 3 });
  return g;
}
