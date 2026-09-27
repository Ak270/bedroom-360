import * as THREE from 'three';

/**
 * Cheap planar reflection for the glossy floor (y = 0).
 * Renders the scene mirrored into a low-res target with mipmaps, then the
 * floor shader samples it in screen space at a blurred mip, weighted by
 * Fresnel and masked by the grout roughness. Based on three's Reflector math
 * (oblique near-plane clipping) without its dedicated material.
 */
export interface FloorReflection {
  /** Renders the mirrored view. Call once per frame before the main render. */
  update(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
  setSize(width: number, height: number): void;
  setEnabled(on: boolean): void;
  /** Resolution of the mirror target relative to the drawing buffer. */
  setScale(scale: number): void;
  uniforms: { strength: { value: number }; blurLod: { value: number } };
}

const _plane = new THREE.Plane();
const _normal = new THREE.Vector3(0, 1, 0);
const _mirrorPos = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _rot = new THREE.Matrix4();
const _lookAt = new THREE.Vector3(0, 0, -1);
const _target = new THREE.Vector3();
const _view = new THREE.Vector3();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();
const BACKGROUND_DIM = 0.15;

export function createFloorReflection(
  floorMaterials: THREE.MeshPhysicalMaterial[],
  hideDuringCapture: THREE.Object3D[],
  resolutionScale: number,
  strength: number,
  blurLod: number,
): FloorReflection {
  const rt = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    samples: 0,
  });
  const mirrorCam = new THREE.PerspectiveCamera();
  const uniforms = {
    reflectMap: { value: rt.texture },
    reflectRes: { value: new THREE.Vector2(1, 1) },
    strength: { value: strength },
    blurLod: { value: blurLod },
    enabled: { value: 1 },
  };
  let enabled = true;

  for (const mat of floorMaterials) {
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        uReflectMap: uniforms.reflectMap,
        uReflectRes: uniforms.reflectRes,
        uReflectStrength: uniforms.strength,
        uReflectLod: uniforms.blurLod,
        uReflectOn: uniforms.enabled,
      });
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
uniform sampler2D uReflectMap;
uniform vec2 uReflectRes;
uniform float uReflectStrength;
uniform float uReflectLod;
uniform float uReflectOn;`,
        )
        .replace(
          '#include <opaque_fragment>',
          `{
  // Mirror texture was rendered from the reflected camera with the same
  // projection, so screen UV with a flipped Y indexes it directly.
  vec2 ruv = gl_FragCoord.xy / uReflectRes;
  ruv.x = 1.0 - ruv.x;
  // Perturb by the tangent-space bump so grout lines break the mirror.
  ruv += normal.xz * 0.004;
  vec3 refl = textureLod(uReflectMap, ruv, uReflectLod + roughnessFactor * 6.0).rgb;
  float NoV = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float fres = 0.04 + 0.96 * pow(1.0 - NoV, 5.0);
  float gloss = 1.0 - smoothstep(0.2, 0.6, roughnessFactor);
  outgoingLight += refl * uReflectStrength * gloss * mix(0.35, 1.0, fres) * uReflectOn;
}
#include <opaque_fragment>`,
        );
    };
    mat.customProgramCacheKey = () => 'floor-reflection';
    mat.needsUpdate = true;
  }

  let scale = resolutionScale;
  const setSize = (w: number, h: number) => {
    const rw = Math.max(2, Math.round(w * scale));
    const rh = Math.max(2, Math.round(h * scale));
    rt.setSize(rw, rh);
    uniforms.reflectRes.value.set(w, h);
  };

  const update = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) => {
    if (!enabled) return;
    _plane.setFromNormalAndCoplanarPoint(_normal, _mirrorPos.set(0, 0, 0));
    _camPos.setFromMatrixPosition(camera.matrixWorld);
    if (_camPos.y <= 0) return; // below the floor: nothing to mirror

    // Reflect camera position and look direction across y = 0.
    _view.copy(_camPos);
    _view.y = -_view.y;
    _rot.extractRotation(camera.matrixWorld);
    _lookAt.set(0, 0, -1).applyMatrix4(_rot).add(_camPos);
    _target.copy(_lookAt);
    _target.y = -_target.y;
    mirrorCam.position.copy(_view);
    mirrorCam.up.set(0, 1, 0).applyMatrix4(_rot);
    mirrorCam.up.y = -mirrorCam.up.y;
    mirrorCam.lookAt(_target);
    mirrorCam.far = camera.far;
    mirrorCam.updateMatrixWorld();
    mirrorCam.projectionMatrix.copy(camera.projectionMatrix);

    // Oblique near plane = floor plane, so nothing under the floor leaks in.
    _plane.applyMatrix4(mirrorCam.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const p = mirrorCam.projectionMatrix;
    _q.x = (Math.sign(_clip.x) + p.elements[8]) / p.elements[0];
    _q.y = (Math.sign(_clip.y) + p.elements[9]) / p.elements[5];
    _q.z = -1.0;
    _q.w = (1.0 + p.elements[10]) / p.elements[14];
    _clip.multiplyScalar(2.0 / _clip.dot(_q));
    p.elements[2] = _clip.x;
    p.elements[6] = _clip.y;
    p.elements[10] = _clip.z + 1.0;
    p.elements[14] = _clip.w;

    for (const o of hideDuringCapture) o.visible = false;
    uniforms.enabled.value = 0;
    // Pixels "under the floor" are clipped and show the background; blurred
    // mips would bleed that bright HDRI along wall bases, so dim it here.
    const bgIntensity = scene.backgroundIntensity;
    scene.backgroundIntensity = bgIntensity * BACKGROUND_DIM;
    const prevTarget = renderer.getRenderTarget();
    const prevXr = renderer.xr.enabled;
    renderer.xr.enabled = false;
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, mirrorCam);
    renderer.setRenderTarget(prevTarget);
    renderer.xr.enabled = prevXr;
    scene.backgroundIntensity = bgIntensity;
    uniforms.enabled.value = 1;
    for (const o of hideDuringCapture) o.visible = true;
  };

  return {
    update,
    setSize,
    setScale(s: number) {
      if (s === scale) return;
      scale = s;
      setSize(uniforms.reflectRes.value.x, uniforms.reflectRes.value.y);
    },
    setEnabled(on: boolean) {
      enabled = on;
      uniforms.enabled.value = on ? 1 : 0;
    },
    uniforms: { strength: uniforms.strength, blurLod: uniforms.blurLod },
  };
}
