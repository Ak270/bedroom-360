// Verifies power states, sideways movement and wardrobe door clearance in the running app.
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
p.on('pageerror', (e) => errors.push(e.message));
p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await p.goto('http://localhost:5180/?shot=S2&debug&measure=0');
await p.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });

// 1) Rendered frames/s: while dragging, then idle, then asleep.
const rate = async (ms, during) => {
  const f0 = await p.evaluate(() => window.__frames());
  const t0 = Date.now();
  if (during) await during(); else await p.waitForTimeout(ms);
  const f1 = await p.evaluate(() => window.__frames());
  return ((f1 - f0) / ((Date.now() - t0) / 1000)).toFixed(1);
};
const dragging = await rate(0, async () => {
  await p.mouse.move(600, 450); await p.mouse.down();
  for (let i = 0; i < 90; i++) { await p.mouse.move(600 + (i % 30) * 6, 450); await p.waitForTimeout(16); }
  await p.mouse.up();
});
await p.waitForTimeout(3000);
const idle = await rate(4000);
await p.waitForTimeout(9000);
const asleep = await rate(4000);
console.log(`rendered fps  dragging=${dragging}  idle=${idle}  asleep=${asleep}  quality=${JSON.stringify(await p.evaluate(() => window.__quality()))}`);

// 2) Sideways movement: trackpad swipe (wheel deltaX), arrow key, move pad.
const camX = () => p.evaluate(() => window.__dbg.camera.position.x);
const x0 = await camX();
await p.mouse.move(720, 450);
for (let i = 0; i < 10; i++) { await p.mouse.wheel(40, 0); await p.waitForTimeout(20); }
await p.waitForTimeout(800);
const x1 = await camX();
await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(800);
const x2 = await camX();
const pad = await p.$('.move-pad [data-dir="right"]');
const bb = await pad.boundingBox();
await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.waitForTimeout(500); await p.mouse.up(); await p.waitForTimeout(800);
const x3 = await camX();
console.log(`sideways: swipe ${(x1 - x0).toFixed(2)} m, ←← ${(x2 - x1).toFixed(2)} m, pad → ${(x3 - x2).toFixed(2)} m`);

// 3) Wardrobe fully open: real clearance to the bed and west bedside table meshes.
await p.evaluate(() => { const w = window.__dbg.furniture.wardrobe; w.doors.forEach((d) => w.setOpen(d, 1)); });
const c = await p.evaluate(() => {
  const d = window.__dbg, T = d.THREE, scene = d.scene; scene.updateMatrixWorld(true);
  const bedBox = new T.Box3().setFromObject(scene.getObjectByName('bed'));
  const west = new T.Box3();
  scene.getObjectByName('bedside').children.forEach((ch) => { const bb = new T.Box3().setFromObject(ch); if (bb.getCenter(new T.Vector3()).x < -1) west.union(bb); });
  let minBed = Infinity, minTable = Infinity;
  for (const door of d.furniture.wardrobe.doors) {
    const lb = new T.Box3().setFromObject(door.pivot);
    if (lb.min.y > 2.1) continue;
    minBed = Math.min(minBed, Math.max(bedBox.min.x - lb.max.x, lb.min.z - bedBox.max.z, bedBox.min.z - lb.max.z));
    minTable = Math.min(minTable, Math.max(west.min.x - lb.max.x, west.min.z - lb.max.z, lb.min.z - west.max.z));
  }
  return { doors: d.furniture.wardrobe.doors.length, interiorVisible: d.furniture.wardrobe.isOpen, gapBedCm: (minBed * 100).toFixed(1), gapWestTableCm: (minTable * 100).toFixed(1) };
});
console.log('wardrobe open:', JSON.stringify(c));
console.log('errors:', errors.length ? errors.slice(0, 5) : 'none');
await b.close();
