import * as THREE from 'three';
import type { FloorReflection } from '../postfx/floorReflection';
import type { Pipeline } from '../postfx/pipeline';
import { FEATURES, POSTFX, QUALITY, SUN } from '../config/room.config';
import type { SunRig } from '../lighting/sun';
import type { InteriorLights } from '../scene/furniture/common';

export type Tier = 'high' | 'medium' | 'low';

interface Targets {
  renderer: THREE.WebGLRenderer;
  reflection: FloorReflection;
  sunRig: SunRig;
  lights: InteriorLights;
  pipeline: Pipeline;
  onResize(): void;
}

/**
 * Adaptive quality (spec 7): measures FPS in 1 s windows and first trades
 * resolution, then features, to hold the target frame rate.
 *   high   - planar reflection every frame, LED area lights, 4096 shadows, leaf wobble
 *            (the 5 LED area lights alone halve the frame rate on an M2)
 *   medium - reflection at 1/3 res every 2nd frame, no LED area lights, 2048 shadows, still leaves
 *   low    - no reflection, no AO, 2048 shadows (mobile tier starts here)
 *   AO: N8AO half-res 'Medium' on high, 'Performance' on medium
 */
export class Quality {
  tier: Tier;
  pixelRatio: number;
  private readonly maxRatio: number;
  private frames = 0;
  private elapsed = 0;
  private warmup: number = QUALITY.warmupSeconds;
  private goodWindows = 0;
  private frameNo = 0;
  private shadowDirty = true;
  private locked = false;
  private highRejected = false;

  constructor(private t: Targets) {
    this.maxRatio = Math.min(window.devicePixelRatio || 1, QUALITY.maxDpr);
    const mobile = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;
    // Desktop starts at medium and earns "high" with sustained headroom.
    this.tier = mobile ? 'low' : 'medium';
    this.pixelRatio = Math.min(this.maxRatio, mobile ? QUALITY.mobileStartDpr : QUALITY.startDpr);
    const forced = new URLSearchParams(location.search).get('quality') as Tier | null;
    if (forced && ['high', 'medium', 'low'].includes(forced)) {
      this.tier = forced;
      this.locked = true;
    }
    this.apply();
  }

  /** Something that casts sun shadows moved (door, sun angle); redraw the map once. */
  markShadowsDirty(): void {
    this.shadowDirty = true;
  }

  /** Call once per frame before rendering. Decides what gets redrawn this frame. */
  /** `measure` = false while the power manager throttles frames (idle FPS is not a performance signal). */
  beginFrame(dt: number, measure = true): { reflection: boolean; shadows: boolean } {
    this.frameNo++;
    if (measure) this.sample(dt);
    else this.frames = this.elapsed = 0;
    const shadows = FEATURES.sunlight && (this.shadowDirty || (this.leafWobble && this.frameNo % 2 === 0));
    this.shadowDirty = false;
    const reflection = FEATURES.floorReflection && (this.tier === 'high' || (this.tier === 'medium' && this.frameNo % 2 === 0));
    return { reflection, shadows };
  }

  get leafWobble(): boolean {
    return FEATURES.sunlight && this.tier === 'high' && QUALITY.leafWobble;
  }

  /**
   * Down: resolution to 1x first, then tiers (medium -> low), then resolution
   * below 1x. Up: resolution back to max, then one try at "high" (never
   * retried after it fails, so there is no oscillation).
   */
  private sample(dt: number): void {
    if (this.locked || dt <= 0 || dt > 0.5) return; // ignore tab switches / hitches
    if (this.warmup > 0) {
      this.warmup -= dt; // shader compiles and uploads make the first seconds slow
      return;
    }
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed < 1) return;
    const fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    if (fps < QUALITY.lowFps) {
      this.goodWindows = 0;
      if (this.tier === 'high') {
        this.tier = 'medium';
        this.highRejected = true;
      } else if (this.pixelRatio > 1.01) {
        this.pixelRatio = Math.max(1, this.pixelRatio * 0.85);
      } else if (this.tier === 'medium') {
        this.tier = 'low';
      } else if (this.pixelRatio > QUALITY.minDpr + 0.01) {
        this.pixelRatio = Math.max(QUALITY.minDpr, this.pixelRatio * 0.85);
      } else return;
      this.warmup = 1; // let the change settle (and recompiles finish) before judging
      this.apply();
    } else if (fps > QUALITY.highFps && ++this.goodWindows >= 3) {
      this.goodWindows = 0;
      if (this.pixelRatio < this.maxRatio - 0.01) {
        this.pixelRatio = Math.min(this.maxRatio, this.pixelRatio * 1.1);
      } else if (this.tier === 'low') {
        this.tier = 'medium';
      } else if (this.tier === 'medium' && !this.highRejected) {
        this.tier = 'high';
      } else return;
      this.warmup = 1;
      this.apply();
    }
  }

  private apply(): void {
    const { renderer, reflection, sunRig, lights, pipeline } = this.t;
    // AO: quality drops before anything gets blurred; off on low (mobile tier).
    pipeline.setAO(this.tier === 'low' ? null : POSTFX.aoQuality[this.tier]);
    renderer.setPixelRatio(this.pixelRatio);
    this.t.onResize();
    reflection.setEnabled(FEATURES.floorReflection && this.tier !== 'low');
    reflection.setScale(this.tier === 'high' ? 0.5 : 0.33);
    // Area lights cost per pixel; below high the emissive strips carry the look.
    for (const l of lights.leds) l.visible = this.tier === 'high';
    const size = this.tier === 'high' ? SUN.shadowMapSize : 2048;
    const shadow = sunRig.sun.shadow;
    if (shadow.mapSize.x !== size) {
      shadow.mapSize.set(size, size);
      shadow.map?.dispose();
      shadow.map = null;
    }
    this.shadowDirty = true;
  }

  describe(): { tier: Tier; pixelRatio: number } {
    return { tier: this.tier, pixelRatio: Math.round(this.pixelRatio * 100) / 100 };
  }
}
