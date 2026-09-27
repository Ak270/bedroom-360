import * as THREE from 'three';
import { ENVIRONMENT } from '../config/room.config';
import { loadHdr } from '../core/assets';

/**
 * Rolls the equirect columns so a chosen feature of the HDRI faces
 * `targetAzimuthDeg` (0 = North/-Z, clockwise). Editing pixels keeps the
 * background, reflections and PMREM consistent without relying on rotation
 * conventions.
 *  - 'sun':     the brightest texel
 *  - 'foliage': the greenest column in the band just above the horizon, so the
 *               window frames tree canopy (the interior probe, not the HDRI,
 *               carries the room lighting, so the HDRI sun need not align).
 */
function alignEquirect(tex: THREE.DataTexture, targetAzimuthDeg: number, feature: 'sun' | 'foliage'): void {
  const { width, height } = tex.image;
  const data = tex.image.data as Uint16Array | Float32Array;
  const half = data instanceof Uint16Array;
  const read = (i: number) => (half ? THREE.DataUtils.fromHalfFloat(data[i]) : data[i]);
  let bestX = 0;
  if (feature === 'sun') {
    let best = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x += 2) {
        const i = (y * width + x) * 4;
        const l = 0.2126 * read(i) + 0.7152 * read(i + 1) + 0.0722 * read(i + 2);
        if (l > best) {
          best = l;
          bestX = x;
        }
      }
    }
  } else {
    // Rows are stored top-down (flipY): elevation 5..35 deg above the horizon.
    const y0 = Math.floor(height * (0.5 - 35 / 180));
    const y1 = Math.floor(height * (0.5 - 5 / 180));
    const score = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      let g = 0;
      for (let y = y0; y < y1; y += 2) {
        const i = (y * width + x) * 4;
        const r = read(i), gg = read(i + 1), b = read(i + 2);
        g += gg / (r + gg + b + 1e-4);
      }
      score[x] = g;
    }
    // Smooth over ~30 deg so we pick a wide canopy, not one leaf.
    const k = Math.round(width / 12);
    let best = -1;
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let j = -k; j <= k; j++) sum += score[(x + j + width) % width];
      if (sum > best) {
        best = sum;
        bestX = x;
      }
    }
  }
  // three's equirect lookup: u = atan2(dir.z, dir.x) / 2PI + 0.5
  const az = THREE.MathUtils.degToRad(targetAzimuthDeg);
  const dir = new THREE.Vector2(Math.sin(az), -Math.cos(az)); // (x, z)
  const targetU = Math.atan2(dir.y, dir.x) / (Math.PI * 2) + 0.5;
  const shift = Math.round(targetU * width - (bestX + 0.5));
  const stride = 4;
  const copy = data.slice();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (((x + shift) % width) + width) % width;
      const src = (y * width + x) * stride;
      const dst = (y * width + nx) * stride;
      for (let c = 0; c < stride; c++) data[dst + c] = copy[src + c];
    }
  }
  tex.needsUpdate = true;
}

export interface EnvironmentRig {
  hdri: THREE.DataTexture;
  hdriEnv: THREE.Texture;
  /** Re-captures the lit interior as the IBL (call after lighting changes). */
  captureProbe(): void;
  dispose(): void;
}

export async function setupEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  windowAzimuthDeg: number,
): Promise<EnvironmentRig> {
  const hdri = await loadHdr(ENVIRONMENT.hdri);
  alignEquirect(hdri, windowAzimuthDeg, ENVIRONMENT.align);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const hdriEnv = pmrem.fromEquirectangular(hdri).texture;

  scene.background = hdri;
  scene.backgroundBlurriness = ENVIRONMENT.blurInterior;
  scene.backgroundIntensity = ENVIRONMENT.backgroundIntensity;
  scene.environment = hdriEnv;
  scene.environmentIntensity = ENVIRONMENT.intensity;

  // Interior probe: a cube capture of the sun-lit room from its centre. Used
  // as the IBL it gives bounce light and correct reflections (blue wall,
  // window glow) on the glossy floor instead of an outdoor forest.
  const cubeRT = new THREE.WebGLCubeRenderTarget(ENVIRONMENT.probe.size, { type: THREE.HalfFloatType });
  const cubeCam = new THREE.CubeCamera(0.05, 40, cubeRT);
  cubeCam.position.set(0, ENVIRONMENT.probe.y, 0);
  scene.add(cubeCam);
  let probeEnv: THREE.Texture | null = null;

  const captureProbe = () => {
    if (!ENVIRONMENT.probe.enabled) return;
    scene.environment = hdriEnv;
    scene.environmentIntensity = ENVIRONMENT.intensity;
    for (let b = 0; b < ENVIRONMENT.probe.bounces; b++) {
      cubeCam.update(renderer, scene);
      const next = pmrem.fromCubemap(cubeRT.texture).texture;
      probeEnv?.dispose();
      probeEnv = next;
      scene.environment = probeEnv;
      scene.environmentIntensity = ENVIRONMENT.probe.intensity;
    }
  };

  return {
    hdri,
    hdriEnv,
    captureProbe,
    dispose() {
      probeEnv?.dispose();
      cubeRT.dispose();
      pmrem.dispose();
    },
  };
}
