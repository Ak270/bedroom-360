// Renders the 360 tour panoramas: for each spot, six overscanned cube faces
// through the full post pipeline, stitched to a 4096x2048 equirectangular JPG
// by scripts/stitch360.py. Needs the dev server (npm run dev) on :5180.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const FACE = 1440; // px per face
const FOV = 100; // overscan: seams get context for AO/bloom, cropped in stitching
const { spots } = JSON.parse(readFileSync('src/tour/spots.json', 'utf8'));
const only = process.argv.slice(2);
const tmp = '.capture';
mkdirSync(tmp, { recursive: true });
mkdirSync('public/tour', { recursive: true });

// forward, up per face (matches stitch360.py)
const FACES = {
  px: [[1, 0, 0], [0, 1, 0]],
  nx: [[-1, 0, 0], [0, 1, 0]],
  pz: [[0, 0, 1], [0, 1, 0]],
  nz: [[0, 0, -1], [0, 1, 0]],
  py: [[0, 1, 0], [0, 0, -1]],
  ny: [[0, -1, 0], [0, 0, 1]],
};

const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('http://localhost:5180/?shot=S2&quality=high&measure=0&capture');
await page.waitForFunction(() => window.__ready === true && !!window.__capture, null, { timeout: 120000 });
await page.waitForTimeout(1500);

for (const s of spots) {
  if (only.length && !only.includes(s.id)) continue;
  await page.evaluate((o) => window.__capture.stage(o), { wardrobeOpen: s.wardrobeOpen, doorOpen: true });
  for (const [name, [f, u]] of Object.entries(FACES)) {
    const url = await page.evaluate(([p, f, u, n, fov]) => window.__capture.face(p, f, u, n, fov), [s.pos, f, u, FACE, FOV]);
    writeFileSync(`${tmp}/${s.id}_${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  execFileSync('python3', ['scripts/stitch360.py', tmp, s.id, String(FOV), String(s.heading), `public/tour/pano-${s.id}.jpg`], { stdio: 'inherit' });
}
await browser.close();
