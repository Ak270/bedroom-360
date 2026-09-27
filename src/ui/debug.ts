import type * as THREE from 'three';
import GUI from 'lil-gui';
import { SUN } from '../config/room.config';
import type { EnvironmentRig } from '../lighting/environment';
import type { SunRig } from '../lighting/sun';
import type { Materials } from '../materials/library';
import type { FloorReflection } from '../postfx/floorReflection';
import type { Pipeline } from '../postfx/pipeline';

interface DebugTargets {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  sunRig: SunRig;
  env: EnvironmentRig;
  mats: Materials;
  reflection: FloorReflection;
  pipeline: Pipeline;
}

/** Tuning panel, only created with ?debug in the URL. */
export function createDebugGui({ renderer, scene, sunRig, env, mats, reflection, pipeline }: DebugTargets): GUI {
  const gui = new GUI({ title: 'Debug' });
  const state = { azimuth: SUN.azimuthDeg, elevation: SUN.elevationDeg, recapture: () => env.captureProbe() };
  gui.add(renderer, 'toneMappingExposure', 0.2, 2, 0.01).name('exposure');
  const sun = gui.addFolder('Sun');
  sun.add(sunRig.sun, 'intensity', 0, 12, 0.05);
  sun.addColor(sunRig.sun, 'color');
  const angles = () => sunRig.setAngles(state.azimuth, state.elevation);
  sun.add(state, 'azimuth', 30, 150, 0.5).onChange(angles);
  sun.add(state, 'elevation', 3, 70, 0.5).onChange(angles);
  sun.add(sunRig.skyFill, 'intensity', 0, 15, 0.1).name('sky fill');
  const envF = gui.addFolder('Environment');
  envF.add(scene, 'environmentIntensity', 0, 3, 0.01);
  envF.add(scene, 'backgroundBlurriness', 0, 1, 0.01);
  envF.add(state, 'recapture').name('recapture probe');
  const floor = gui.addFolder('Floor');
  floor.add(mats.floor, 'clearcoat', 0, 1, 0.01);
  floor.add(mats.floor, 'bumpScale', 0, 3, 0.01);
  floor.add(reflection.uniforms.strength, 'value', 0, 2, 0.01).name('reflection');
  floor.add(reflection.uniforms.blurLod, 'value', 0, 6, 0.1).name('reflection blur');
  const post = gui.addFolder('Post');
  const ps = { toneMapping: 'aces', aoView: 'Combined' };
  post.add(ps, 'toneMapping', ['aces', 'agx']).onChange((v: 'aces' | 'agx') => pipeline.setToneMapping(v));
  post.add(pipeline.ao.configuration, 'aoRadius', 0.05, 2, 0.01);
  post.add(pipeline.ao.configuration, 'intensity', 0, 6, 0.1).name('ao intensity');
  post.add(ps, 'aoView', ['Combined', 'AO', 'No AO', 'Split']).onChange((v: 'Combined' | 'AO' | 'No AO' | 'Split') => pipeline.ao.setDisplayMode(v));
  post.add(pipeline.bloom, 'intensity', 0, 2, 0.01).name('bloom');
  post.add(pipeline.bloom.luminanceMaterial, 'threshold', 0, 2, 0.01).name('bloom threshold');
  return gui;
}
