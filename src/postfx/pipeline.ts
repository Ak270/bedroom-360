import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass, type N8AOQuality } from 'n8ao';
import { POSTFX } from '../config/room.config';

export type ToneMap = 'aces' | 'agx';

/**
 * Render pipeline (spec 7): scene -> N8AO (half-res) -> bloom + tone mapping
 * (ACES, AgX toggle) + vignette + grain -> SMAA. Everything before tone
 * mapping stays linear HDR (half-float targets), so bloom sees real lamp and
 * LED intensities; the renderer's own tone mapping is therefore disabled.
 */
export class Pipeline {
  readonly composer: EffectComposer;
  readonly ao: N8AOPostPass;
  private readonly toneMapping: ToneMappingEffect;
  readonly bloom: BloomEffect;
  private readonly vignette: VignetteEffect;
  private readonly grain: NoiseEffect;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    renderer.toneMapping = THREE.NoToneMapping; // done in ToneMappingEffect (exposure still from renderer)
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    this.composer.addPass(new RenderPass(scene, camera));

    const size = renderer.getSize(new THREE.Vector2());
    this.ao = new N8AOPostPass(scene, camera, size.x, size.y);
    const c = this.ao.configuration;
    c.aoRadius = POSTFX.ao.radius;
    c.distanceFalloff = POSTFX.ao.distanceFalloff;
    c.intensity = POSTFX.ao.intensity;
    c.halfRes = POSTFX.ao.halfRes;
    c.gammaCorrection = false; // not the last pass: colour stays linear until tone mapping
    this.ao.setQualityMode(POSTFX.aoQuality.high);
    this.composer.addPass(this.ao);

    this.bloom = new BloomEffect({
      luminanceThreshold: POSTFX.bloom.threshold,
      luminanceSmoothing: POSTFX.bloom.smoothing,
      intensity: POSTFX.bloom.intensity,
      radius: POSTFX.bloom.radius,
      mipmapBlur: true,
    });
    this.toneMapping = new ToneMappingEffect({ mode: POSTFX.toneMapping === 'agx' ? ToneMappingMode.AGX : ToneMappingMode.ACES_FILMIC });
    const vignette = new VignetteEffect({ darkness: POSTFX.vignette.darkness, offset: POSTFX.vignette.offset });
    const grain = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN });
    grain.blendMode.opacity.value = POSTFX.grain;
    this.vignette = vignette;
    this.grain = grain;
    this.composer.addPass(new EffectPass(camera, this.bloom, this.toneMapping, vignette, grain));
    // SMAA last, on the tone-mapped image.
    this.composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
  }

  /** 360 capture: per-view vignette/grain would show as seams between cube faces. */
  setCaptureMode(on: boolean): void {
    this.vignette.blendMode.opacity.value = on ? 0 : 1;
    this.grain.blendMode.opacity.value = on ? 0 : POSTFX.grain;
  }

  setToneMapping(mode: ToneMap): void {
    this.toneMapping.mode = mode === 'agx' ? ToneMappingMode.AGX : ToneMappingMode.ACES_FILMIC;
  }

  /** Quality tiers: AO quality drops before anything is blurred; off on low/mobile. */
  setAO(quality: N8AOQuality | null): void {
    this.ao.enabled = quality !== null;
    if (quality) this.ao.setQualityMode(quality);
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height, false);
  }

  render(dt: number): void {
    this.composer.render(dt);
  }
}
