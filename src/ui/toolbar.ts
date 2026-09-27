import type { ViewMode } from '../camera/rig';

export interface ToolbarActions {
  toggleMeasure(on: boolean): void;
  setView(mode: ViewMode): void;
  toggleDoor(): void;
  toggleWardrobe(): void;
  /** One movement tick; called repeatedly while a move-pad button is held. */
  move(dir: 'left' | 'right' | 'forward' | 'back'): void;
}

/** Minimal floating toolbar (full shot/lighting UI lands in M5). */
export class Toolbar {
  private readonly root: HTMLDivElement;
  private readonly measureBtn: HTMLButtonElement;
  private readonly viewBtn: HTMLButtonElement;
  private mode: ViewMode = 'interior';

  constructor(parent: HTMLElement, actions: ToolbarActions, measureOn: boolean) {
    this.root = document.createElement('div');
    this.root.className = 'toolbar';
    this.root.innerHTML = `
      <button type="button" class="tb-btn" data-k="measure" aria-pressed="${measureOn}">Measurements</button>
      <button type="button" class="tb-btn" data-k="view">Dollhouse</button>
      <button type="button" class="tb-btn" data-k="door">Door</button>
      <button type="button" class="tb-btn" data-k="wardrobe">Wardrobe</button>
      <span class="tb-hint">Drag: look · Shift+drag, right-drag, two-finger swipe or ←→: move sideways · ↑↓/scroll: walk/zoom · double-click: zoom to object</span>`;
    parent.appendChild(this.root);

    // Move pad (bottom-right): press and hold to keep moving.
    const pad = document.createElement('div');
    pad.className = 'move-pad';
    pad.setAttribute('aria-label', 'Move');
    pad.innerHTML = `
      <button type="button" data-dir="forward" aria-label="Walk forward">▲</button>
      <button type="button" data-dir="left" aria-label="Move left">◀</button>
      <button type="button" data-dir="back" aria-label="Walk back">▼</button>
      <button type="button" data-dir="right" aria-label="Move right">▶</button>`;
    parent.appendChild(pad);
    let timer = 0;
    const stop = () => window.clearInterval(timer);
    pad.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      const dir = b.dataset.dir as 'left' | 'right' | 'forward' | 'back';
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        stop();
        actions.move(dir);
        timer = window.setInterval(() => actions.move(dir), 90);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stop);
    });
    this.measureBtn = this.root.querySelector('[data-k="measure"]')!;
    this.viewBtn = this.root.querySelector('[data-k="view"]')!;
    this.measureBtn.addEventListener('click', () => {
      const on = this.measureBtn.getAttribute('aria-pressed') !== 'true';
      this.measureBtn.setAttribute('aria-pressed', String(on));
      actions.toggleMeasure(on);
    });
    this.viewBtn.addEventListener('click', () => actions.setView(this.mode === 'interior' ? 'dollhouse' : 'interior'));
    this.root.querySelector('[data-k="door"]')!.addEventListener('click', () => actions.toggleDoor());
    this.root.querySelector('[data-k="wardrobe"]')!.addEventListener('click', () => actions.toggleWardrobe());
  }

  /** Reflect the current view in the toggle ("Dollhouse" when inside, "Inside" when out). */
  setMode(mode: ViewMode): void {
    this.mode = mode;
    this.viewBtn.textContent = mode === 'interior' ? 'Dollhouse' : 'Inside';
  }
}
