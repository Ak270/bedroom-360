// Captures review screenshots from the named camera shots.
// Usage: node scripts/shots.mjs <outDir> S2 S3 S4 S5 S1   (dev server must be running)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [outDir = 'shots/latest', ...ids] = process.argv.slice(2);
const shots = ids.length ? ids : ['S2', 'S3', 'S4', 'S5', 'S1'];
const base = process.env.BASE_URL ?? 'http://localhost:5180/';
const width = Number(process.env.W ?? 1600);
const height = Number(process.env.H ?? 1000);

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

for (const id of shots) {
  const tune = process.env.EVAL; // optional JS run against window.__dbg (tuning only)
  // Review shots render at the high tier; M=1 keeps the measurement tags on.
  const q = `&quality=${process.env.Q ?? 'high'}&measure=${process.env.M ?? '0'}${process.env.TM ? `&tonemap=${process.env.TM}` : ''}`;
  await page.goto(`${base}?shot=${id}${q}${tune ? '&debug' : ''}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
  if (tune) {
    await page.evaluate(tune);
    await page.evaluate(() => document.querySelector('.lil-gui')?.remove());
  }
  await page.waitForTimeout(1200); // let the loading overlay fade
  const file = `${outDir}/${id}.png`;
  await page.screenshot({ path: file });
  console.log('saved', file);
}
await browser.close();
