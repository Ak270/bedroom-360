import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { PILLAR, ROOM, WALLS, WARDROBE, WINDOW } from '../config/room.config';
import { ftIn, m, type Measured } from '../scene/measurements';

const OCCLUSION_EVERY = 6; // frames between visibility/occlusion passes
const MAX_TAG_DISTANCE = 18; // covers the dollhouse orbit (S0 is ~11 m out)

interface Tag {
  item: Measured;
  obj: CSS2DObject;
  el: HTMLDivElement;
  card: HTMLElement;
  /** Cached card size in px (re-measured when the compact mode changes). */
  w: number;
  h: number;
  lift: number;
  sx: number;
  sy: number;
}

const LEADER = 14; // px, base leader length (see .dim-tag::after)

/** "6'4" × 7'3" × 3'9"" and "1.92 × 2.20 × 1.15 m" for a Measured size. */
function sizeLines(s: NonNullable<Measured['size']>): [string, string] {
  const parts = s.round ? [s.w, s.h] : [s.w, s.d, s.h];
  const vals = parts.filter((x): x is number => x !== undefined);
  const pre = s.round ? 'Ø' : '';
  return [pre + vals.map(ftIn).join(' × '), pre + vals.map((x) => x.toFixed(2)).join(' × ') + ' m'];
}

/**
 * Measurement overlay: a tag per object (only those on screen and not hidden
 * behind walls/furniture) plus dimension lines for the room itself.
 */
export class MeasureOverlay {
  readonly group = new THREE.Group();
  private readonly css: CSS2DRenderer;
  private readonly tags: Tag[] = [];
  /** Room-dimension pills: fixed obstacles the object tags steer around. */
  private readonly pills: { obj: CSS2DObject; el: HTMLElement }[] = [];
  private readonly ray = new THREE.Raycaster();
  private readonly occluders: Measured[];
  private frame = 0;
  private _enabled = true;
  onPick?: (item: Measured) => void;

  constructor(
    container: HTMLElement,
    items: Measured[],
    private readonly camera: THREE.PerspectiveCamera,
  ) {
    this.group.name = 'measurements';
    this.css = new CSS2DRenderer();
    this.occluders = items.filter((i) => i.occludes !== false);
    this.css.domElement.className = 'measure-layer';
    container.appendChild(this.css.domElement);
    for (const item of items) this.addTag(item);
    this.addRoomDimensions();
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(on: boolean) {
    this._enabled = on;
    this.group.visible = on;
    this.css.domElement.style.display = on ? '' : 'none';
    if (on) this.dirty = true; // refresh on the next frame
  }

  /** Dollhouse view: name + feet-inches only, so ~20 tags fit around the model. */
  setCompact(on: boolean): void {
    this.css.domElement.classList.toggle('compact', on);
    for (const t of this.tags) t.w = 0; // re-measure
    this.dirty = true;
  }

  /** Re-evaluate tag visibility on the next frame (state changed without camera motion). */
  refresh(): void {
    this.dirty = true;
  }

  setSize(w: number, h: number): void {
    this.css.setSize(w, h);
    this.viewW = w;
    this.viewH = h;
    this.dirty = true;
  }

  private addTag(item: Measured): void {
    const el = document.createElement('div');
    el.className = 'dim-tag';
    const [ft, metric] = item.size ? sizeLines(item.size) : ['', ''];
    el.innerHTML =
      `<button type="button" class="dim-card" title="Zoom to ${item.name}">` +
      `<span class="dim-name">${item.name}</span>` +
      (ft ? `<span class="dim-ft">${ft}</span><span class="dim-m">${metric}</span>` : '') +
      (item.note ? `<span class="dim-note">${item.note}</span>` : '') +
      (item.colours?.length
        ? `<span class="dim-colours">${item.colours
            .map((c) => `<span class="dim-colour"><i style="background:${c.hex}"></i><span class="dim-cname">${c.name}</span></span>`)
            .join('')}</span>`
        : '') +
      `</button>`;
    el.querySelector('button')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onPick?.(item);
    });
    const obj = new CSS2DObject(el);
    obj.center.set(0.5, 1); // card sits above its anchor; the leader ends on it
    obj.position.copy(item.anchor);
    this.group.add(obj);
    this.tags.push({ item, obj, el, card: el.querySelector('.dim-card')!, w: 0, h: 0, lift: 0, sx: 0, sy: 0 });
  }

  /** Room width / depth / height as dimension lines with end ticks (REF-C 16'5" x 12'1"). */
  private addRoomDimensions(): void {
    const mat = new THREE.LineBasicMaterial({ color: '#C4622D', transparent: true, opacity: 0.9, depthTest: true });
    const tick = 0.06;
    const line = (a: THREE.Vector3, b: THREE.Vector3, tickAxis: THREE.Vector3, label: string, sub: string) => {
      const pts = [a, b];
      for (const p of [a, b]) pts.push(p.clone().addScaledVector(tickAxis, tick), p.clone().addScaledVector(tickAxis, -tick));
      const g = new THREE.BufferGeometry().setFromPoints([pts[0], pts[1], pts[2], pts[3], pts[4], pts[5]]);
      const seg = new THREE.LineSegments(g, mat);
      this.group.add(seg);
      const el = document.createElement('div');
      el.className = 'dim-room';
      el.innerHTML = `<span>${label}</span><small>${sub}</small>`;
      const o = new CSS2DObject(el);
      o.position.copy(a).add(b).multiplyScalar(0.5);
      this.group.add(o);
      this.pills.push({ obj: o, el });
    };
    const H = ROOM.ceilingH;
    const up = new THREE.Vector3(0, 1, 0);
    // Client measures between pillar faces (CLIENT); wall-to-wall shown alongside.
    const cp = ROOM.pillarProud;
    line(
      new THREE.Vector3(WALLS.west + cp, H - 0.1, WALLS.south - cp - 0.01),
      new THREE.Vector3(WALLS.east - cp, H - 0.1, WALLS.south - cp - 0.01),
      up,
      `Room width ${ftIn(ROOM.clearWidth)} between pillars`,
      `${ftIn(ROOM.width)} wall to wall`,
    );
    line(
      new THREE.Vector3(WARDROBE.faceX + 0.01, H - 0.07, WALLS.north + cp),
      new THREE.Vector3(WARDROBE.faceX + 0.01, H - 0.07, WALLS.south - cp),
      up,
      `Room depth ${ftIn(ROOM.clearDepth)} between pillars`,
      `${ftIn(ROOM.depth)} wall to wall`,
    );
    // Ceiling height in the north-east corner.
    line(
      new THREE.Vector3(WALLS.east - 0.04, 0, WALLS.north + 0.04),
      new THREE.Vector3(WALLS.east - 0.04, H, WALLS.north + 0.04),
      new THREE.Vector3(-1, 0, 0),
      `Ceiling ${ftIn(H)}`,
      m(H),
    );
    // Client sketch (IMG_5675) chains: pillar position along the blue wall,
    // window position along the east wall.
    const zS = WALLS.south - PILLAR.projection - 0.01;
    const yS = 2.62;
    const chainS: [number, number][] = [
      [WALLS.east - cp, PILLAR.x1],
      [PILLAR.x1, PILLAR.x0],
      [PILLAR.x0, WALLS.west + cp],
    ];
    for (const [x0, x1] of chainS) {
      const d = Math.abs(x1 - x0);
      line(new THREE.Vector3(x0, yS, zS), new THREE.Vector3(x1, yS, zS), up, ftIn(d), m(d));
    }
    const xE = WALLS.east - cp - 0.02;
    const yE = WINDOW.sill + WINDOW.height + 0.18;
    const wz0 = WINDOW.centerZ - WINDOW.width / 2;
    const wz1 = WINDOW.centerZ + WINDOW.width / 2;
    const chainE: [number, number][] = [
      [WALLS.south - cp, wz1],
      [wz1, wz0],
      [wz0, WALLS.north + cp],
    ];
    for (const [z0, z1] of chainE) {
      const d = Math.abs(z1 - z0);
      line(new THREE.Vector3(xE, yE, z0), new THREE.Vector3(xE, yE, z1), up, ftIn(d), m(d));
    }
  }

  private readonly _p = new THREE.Vector3();
  private readonly _cam = new THREE.Vector3();
  private readonly _dir = new THREE.Vector3();
  private readonly _hit = new THREE.Vector3();

  /** Call after the WebGL render. Throttles visibility tests; CSS positions every frame. */
  render(scene: THREE.Scene): void {
    if (!this._enabled) return;
    // Tags only move when the camera does: skip DOM work while it is still.
    const still = this.lastView.equals(this.camera.matrixWorld) && this.lastProj.equals(this.camera.projectionMatrix);
    if (still && !this.moving && !this.dirty) return;
    this.lastView.copy(this.camera.matrixWorld);
    this.lastProj.copy(this.camera.projectionMatrix);
    // A settle frame (camera just stopped, or a forced refresh) always gets an exact pass.
    const settle = this.dirty || (still && this.moving);
    this.moving = !still;
    this.dirty = false;
    if (settle || ++this.frame >= OCCLUSION_EVERY) {
      this.frame = 0;
      this.updateVisibility();
    }
    this.css.render(scene, this.camera);
  }

  private viewW = 1;
  private viewH = 1;
  private readonly lastView = new THREE.Matrix4();
  private readonly lastProj = new THREE.Matrix4();
  private dirty = true;
  private moving = false;

  private updateVisibility(): void {
    this.camera.getWorldPosition(this._cam);
    this.camera.updateMatrixWorld();
    for (const t of this.tags) {
      const p = this._p.copy(t.item.anchor);
      const dist = p.distanceTo(this._cam);
      p.project(this.camera);
      let show = p.z < 1 && Math.abs(p.x) < 1.02 && Math.abs(p.y) < 1.02 && dist < MAX_TAG_DISTANCE && (t.item.visibleWhen?.() ?? true);
      if (show) {
        // Hidden if another solid object's box sits between the eye and the
        // anchor. Box tests, not mesh raycasts: ~500 cheap tests per pass.
        // Walls never block from inside, and are cut away from outside.
        this._dir.subVectors(t.item.anchor, this._cam).normalize();
        this.ray.set(this._cam, this._dir);
        for (const o of this.occluders) {
          if (o === t.item || o.id === t.item.inside || (o.occluder ?? o.box).containsPoint(this._cam)) continue;
          const ob = o.occluder ?? o.box;
          if (this.ray.ray.intersectBox(ob, this._hit) && this._hit.distanceTo(this._cam) < dist - 0.08) {
            show = false;
            break;
          }
        }
      }
      if (t.obj.visible !== show) t.obj.visible = show;
      t.sx = (p.x * 0.5 + 0.5) * this.viewW;
      t.sy = (-p.y * 0.5 + 0.5) * this.viewH;
    }
    this.declutter();
  }

  /**
   * Greedy de-overlap: bottom-most tags keep their place; any card that would
   * overlap one already placed is lifted (its leader grows) until it clears.
   */
  private declutter(): void {
    const shown = this.tags.filter((t) => t.obj.visible);
    for (const t of shown) {
      if (t.w === 0) {
        t.w = t.card.offsetWidth || 120;
        t.h = t.card.offsetHeight || 48;
      }
    }
    shown.sort((a, b) => b.sy - a.sy);
    const placed: { l: number; r: number; t: number; b: number }[] = [];
    for (const pill of this.pills) {
      const p = this._p.copy(pill.obj.position).project(this.camera);
      if (p.z >= 1) continue;
      const x = (p.x * 0.5 + 0.5) * this.viewW;
      const y = (-p.y * 0.5 + 0.5) * this.viewH;
      const w = pill.el.offsetWidth / 2 + 3;
      const h = pill.el.offsetHeight / 2 + 3;
      placed.push({ l: x - w, r: x + w, t: y - h, b: y + h });
    }
    for (const t of shown) {
      let lift = 0;
      const l = t.sx - t.w / 2 - 3;
      const r = t.sx + t.w / 2 + 3;
      for (let guard = 0; guard < 12; guard++) {
        const bottom = t.sy - LEADER - lift;
        const top = bottom - t.h;
        const hit = placed.find((p) => l < p.r && r > p.l && top < p.b + 3 && bottom > p.t - 3);
        if (!hit) break;
        lift += bottom - (hit.t - 4);
      }
      lift = Math.min(lift, 220);
      placed.push({ l, r, t: t.sy - LEADER - lift - t.h, b: t.sy - LEADER - lift });
      if (Math.abs(lift - t.lift) > 0.5) {
        t.lift = lift;
        t.el.style.setProperty('--lift', `${lift}px`);
      }
    }
  }
}
