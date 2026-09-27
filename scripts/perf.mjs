// Perf probe: frames actually rendered per second while the user drags (the
// power manager skips frames when idle, so rAF ticks are not a load signal).
// Usage: Q=high|medium|low node scripts/perf.mjs [shot] [dpr]
import { chromium } from 'playwright';
const [shot = 'S3', dpr = '2'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: Number(dpr) });
const t0 = Date.now();
await p.goto(`http://localhost:5180/?shot=${shot}${process.env.Q ? `&quality=${process.env.Q}` : ''}&measure=${process.env.M ?? '1'}`);
await p.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
const ready = Date.now() - t0;
await p.waitForTimeout(4000);
const f0 = await p.evaluate(() => window.__frames());
const s = Date.now();
await p.mouse.move(600, 450); await p.mouse.down();
for (let i = 0; i < 180; i++) { await p.mouse.move(600 + (i % 60) * 4, 450); await p.waitForTimeout(16); }
await p.mouse.up();
const fps = ((await p.evaluate(() => window.__frames())) - f0) / ((Date.now() - s) / 1000);
console.log(`shot=${shot} dpr=${dpr} ready=${ready}ms rendered-fps-while-dragging=${fps.toFixed(1)} quality=${JSON.stringify(await p.evaluate(() => window.__quality()))}`);
await b.close();
