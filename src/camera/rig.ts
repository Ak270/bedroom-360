import * as THREE from 'three';
import CameraControls from 'camera-controls';
import { CAMERA, ROOM, SHOTS, type Shot } from '../config/room.config';

CameraControls.install({ THREE });

export type ViewMode = 'interior' | 'dollhouse';

const _pos = new THREE.Vector3();
const _tgt = new THREE.Vector3();
const _clamped = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _grow = new THREE.Box3();

/**
 * camera-controls with two behaviours (spec 8):
 *  - interior: the eye is kept inside the room (padded box, eye height
 *    0.8..2.2 m), the orbit target inside the walls; wheel dollies towards
 *    the cursor with a floor distance, so zooming never exits the room or
 *    clips into furniture.
 *  - dollhouse: free orbit outside, distance-limited so it cannot dive in.
 */
export class CameraRig {
  readonly controls: CameraControls;
  mode: ViewMode = 'interior';
  private transitioning = 0;
  private readonly eyeBox: THREE.Box3;
  private readonly targetBox: THREE.Box3;
  private colliders: THREE.Box3[] = [];
  onModeChange?: (mode: ViewMode) => void;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
  ) {
    const c = new CameraControls(camera, dom);
    c.dollyToCursor = true;
    c.smoothTime = CAMERA.smoothTime;
    c.draggingSmoothTime = 0.1;
    c.dollySpeed = CAMERA.dollySpeed;
    c.truckSpeed = 1.2;
    this.controls = c;
    const p = CAMERA.interiorPadding;
    this.eyeBox = new THREE.Box3(
      new THREE.Vector3(-ROOM.halfW + p, CAMERA.eyeMin, -ROOM.halfD + p),
      new THREE.Vector3(ROOM.halfW - p, CAMERA.eyeMax, ROOM.halfD - p),
    );
    this.targetBox = new THREE.Box3(
      new THREE.Vector3(-ROOM.halfW + 0.02, 0.05, -ROOM.halfD + 0.02),
      new THREE.Vector3(ROOM.halfW - 0.02, ROOM.ceilingH - 0.05, ROOM.halfD - 0.02),
    );
    this.setMode('interior');
    // Runs before camera-controls' own handler (capture): re-anchor the pivot
    // so the drag that follows turns the view at a calm, predictable rate.
    dom.addEventListener('pointerdown', (e) => this.onPointerDown(e), { capture: true });
    // Side-to-side movement (CLIENT): a sideways two-finger trackpad swipe
    // pans instead of zooming; Shift+drag pans; right-drag pans (default).
    dom.addEventListener('wheel', (e) => this.onWheel(e), { capture: true, passive: false });
    window.addEventListener('pointerup', () => {
      this.controls.mouseButtons.left = CameraControls.ACTION.ROTATE;
    });
  }

  private onWheel(e: WheelEvent): void {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.2 || Math.abs(e.deltaX) < 1) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // keep camera-controls from treating it as a zoom
    this.strafe(e.deltaX * CAMERA.swipePan);
  }

  /** Move sideways (metres, + = right), smoothly; walls/furniture still clamp. */
  strafe(d: number): void {
    void this.controls.truck(d, 0, true);
  }

  /** Walk forward/back on the floor plane (metres, + = forward). */
  walk(d: number): void {
    void this.controls.forward(d, true);
  }

  /** Furniture volumes the eye must stay out of (padded by CAMERA.furnitureMargin). */
  setColliders(boxes: THREE.Box3[]): void {
    this.colliders = boxes;
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button === 0 && e.shiftKey) {
      this.controls.mouseButtons.left = CameraControls.ACTION.TRUCK;
      return;
    }
    if (this.mode !== 'interior' || this.transitioning > 0 || e.button !== 0) return;
    const c = this.controls;
    const dist = c.distance;
    const I = CAMERA.interior;
    if (dist > CAMERA.orbitMaxDistance || dist < CAMERA.lookPivot * 2) {
      // Look-around: pivot just ahead of the eye, along the current view ray (no visual jump).
      if (dist > CAMERA.lookPivot * 2) {
        c.getPosition(_pos, false);
        this.camera.getWorldDirection(_fwd);
        _tgt.copy(_pos).addScaledVector(_fwd, CAMERA.lookPivot);
        void c.setLookAt(_pos.x, _pos.y, _pos.z, _tgt.x, _tgt.y, _tgt.z, false);
      }
      c.azimuthRotateSpeed = c.polarRotateSpeed = I.lookSpeed;
    } else {
      // Something close was focused: orbit it, slowly.
      c.azimuthRotateSpeed = c.polarRotateSpeed = I.orbitSpeed;
    }
  }

  static isInside(pos: [number, number, number]): boolean {
    return Math.abs(pos[0]) < ROOM.halfW && Math.abs(pos[2]) < ROOM.halfD && pos[1] < ROOM.ceilingH;
  }

  setMode(mode: ViewMode): void {
    const c = this.controls;
    const d = mode === 'interior' ? CAMERA.interior : CAMERA.dollhouse;
    c.minDistance = d.minDistance;
    c.maxDistance = d.maxDistance;
    c.minPolarAngle = THREE.MathUtils.degToRad(d.minPolarDeg);
    c.maxPolarAngle = THREE.MathUtils.degToRad(d.maxPolarDeg);
    c.azimuthRotateSpeed = c.polarRotateSpeed = d.orbitSpeed;
    // Interior: dollying past the minimum walks forward (target moves ahead).
    c.infinityDolly = mode === 'interior';
    const changed = mode !== this.mode;
    this.mode = mode;
    if (changed) this.onModeChange?.(mode);
  }

  /** Animated (or instant) move to a pose; the interior clamp pauses meanwhile. */
  async moveTo(pos: [number, number, number], target: [number, number, number], fov: number, animate: boolean): Promise<void> {
    const mode: ViewMode = CameraRig.isInside(pos) ? 'interior' : 'dollhouse';
    // Relax limits during the flight, apply the destination's afterwards.
    this.controls.minDistance = 0;
    this.controls.maxDistance = Infinity;
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI;
    this.transitioning++;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    try {
      await this.controls.setLookAt(...pos, ...target, animate);
    } finally {
      this.transitioning--;
      this.setMode(mode);
    }
  }

  goToShot(shot: Shot, animate: boolean): Promise<void> {
    return this.moveTo(shot.pos, shot.target, shot.fov, animate);
  }

  /** Frames a world box from roughly the current viewing direction, staying inside. */
  focusBox(box: THREE.Box3, animate = true): Promise<void> {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) * 0.5;
    const fovRad = THREE.MathUtils.degToRad(this.camera.fov);
    const dist = THREE.MathUtils.clamp((radius / Math.sin(fovRad / 2)) * CAMERA.focusMargin, 0.6, 3.2);
    this.camera.getWorldPosition(_pos);
    _dir.subVectors(center, _pos);
    if (this.mode === 'dollhouse' || _dir.lengthSq() < 1e-6) _dir.set(-0.3, -0.35, 1); // come in from the doorway side
    _dir.y = Math.min(_dir.y, 0); // never look up at an object from below
    _dir.normalize();
    _clamped.copy(center).addScaledVector(_dir, -dist);
    this.eyeBox.clampPoint(_clamped, _clamped);
    return this.moveTo(
      [_clamped.x, _clamped.y, _clamped.z],
      [center.x, center.y, center.z],
      this.mode === 'dollhouse' ? SHOTS[2].fov : this.camera.fov,
      animate,
    );
  }

  /** Per-frame: advance the controls, then keep the eye and target in the room. */
  update(dt: number): boolean {
    const moved = this.controls.update(dt);
    if (this.mode !== 'interior' || this.transitioning > 0) return moved;
    // Clamp the *end* pose with smoothing on: a wall reads as a soft stop, not a snap.
    this.controls.getPosition(_pos, true);
    this.controls.getTarget(_tgt, true);
    let fix = false;
    if (!this.targetBox.containsPoint(_tgt)) {
      this.targetBox.clampPoint(_tgt, _tgt);
      void this.controls.setTarget(_tgt.x, _tgt.y, _tgt.z, true);
      fix = true;
    }
    _clamped.copy(_pos);
    this.eyeBox.clampPoint(_clamped, _clamped);
    // Push the eye out of padded furniture volumes along the shallowest axis.
    for (const b of this.colliders) {
      _grow.copy(b).expandByScalar(CAMERA.furnitureMargin);
      if (!_grow.containsPoint(_clamped)) continue;
      const dx0 = _clamped.x - _grow.min.x, dx1 = _grow.max.x - _clamped.x;
      const dy1 = _grow.max.y - _clamped.y;
      const dz0 = _clamped.z - _grow.min.z, dz1 = _grow.max.z - _clamped.z;
      const m = Math.min(dx0, dx1, dy1, dz0, dz1);
      if (m === dx0) _clamped.x = _grow.min.x;
      else if (m === dx1) _clamped.x = _grow.max.x;
      else if (m === dy1) _clamped.y = _grow.max.y;
      else if (m === dz0) _clamped.z = _grow.min.z;
      else _clamped.z = _grow.max.z;
    }
    this.eyeBox.clampPoint(_clamped, _clamped);
    if (!_clamped.equals(_pos)) {
      void this.controls.setPosition(_clamped.x, _clamped.y, _clamped.z, true);
      fix = true;
    }
    return moved || fix;
  }
}
