import type * as THREE from 'three';

/** Drives the loading overlay from the shared LoadingManager. */
export function bindLoading(manager: THREE.LoadingManager): { finish(): void } {
  const root = document.getElementById('loading');
  const fill = document.getElementById('loading-fill');
  const pct = document.getElementById('loading-pct');
  manager.onProgress = (_url, loaded, total) => {
    // Cap at 95%: the last 5% is shader compile + the probe capture.
    const p = Math.round((loaded / Math.max(total, 1)) * 95);
    if (fill) fill.style.width = `${p}%`;
    if (pct) pct.textContent = `${p}%`;
  };
  return {
    finish() {
      if (fill) fill.style.width = '100%';
      if (pct) pct.textContent = '100%';
      root?.classList.add('done');
    },
  };
}
