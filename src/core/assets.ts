import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';

/** Shared loading manager so the loading screen sees every request. */
export const manager = new THREE.LoadingManager();

const texLoader = new THREE.TextureLoader(manager);
const hdrLoader = new HDRLoader(manager);

let maxAnisotropy = 8;
export function setMaxAnisotropy(n: number): void {
  maxAnisotropy = n;
}

export type MapKind = 'color' | 'data';

/** Loads a texture from /public with repeat wrapping and the right colour space. */
export function loadTexture(path: string, kind: MapKind): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    texLoader.load(
      path,
      (t) => {
        t.colorSpace = kind === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = maxAnisotropy;
        resolve(t);
      },
      undefined,
      reject,
    );
  });
}

export interface PbrSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap?: THREE.Texture;
}

/** Loads `tex/<name>_diff|_nor|_rough.jpg`. */
export async function loadPbr(name: string, withRough = true): Promise<PbrSet> {
  const [map, normalMap, roughnessMap] = await Promise.all([
    loadTexture(`tex/${name}_diff.jpg`, 'color'),
    loadTexture(`tex/${name}_nor.jpg`, 'data'),
    withRough ? loadTexture(`tex/${name}_rough.jpg`, 'data') : Promise.resolve(undefined),
  ]);
  return { map, normalMap, roughnessMap };
}

export function loadHdr(path: string): Promise<THREE.DataTexture> {
  return new Promise((resolve, reject) => {
    hdrLoader.load(
      path,
      (t) => {
        t.mapping = THREE.EquirectangularReflectionMapping;
        resolve(t);
      },
      undefined,
      reject,
    );
  });
}

/** Loads an image element (for canvas composition). */
export function loadImage(path: string): Promise<HTMLImageElement> {
  const url = path;
  manager.itemStart(url);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      manager.itemEnd(url);
      resolve(img);
    };
    img.onerror = (e) => {
      manager.itemError(url);
      reject(e);
    };
    img.src = url;
  });
}

/** Clones a texture with its own repeat so one image can serve many surfaces. */
export function withRepeat<T extends THREE.Texture>(tex: T, rx: number, ry: number, rotation = 0): T {
  const t = tex.clone() as T;
  t.repeat.set(rx, ry);
  t.rotation = rotation;
  t.needsUpdate = true;
  return t;
}
