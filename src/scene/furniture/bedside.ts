import * as THREE from 'three';
import { BEDSIDE, LAMP, WALLS } from '../../config/room.config';
import { boxBetween, metricBox } from '../../geometry/metric';
import { lathe, mesh, shadows, type InteriorLights, type Mats, type Piece } from './common';
import { smallPlant } from './plants';

/** Walnut 2-drawer table on short tapered legs, drawers facing the room (-Z). */
function table(m: Mats, cx: number): THREE.Group {
  const { base } = m;
  const g = new THREE.Group();
  const B = BEDSIDE;
  const x0 = cx - B.w / 2, x1 = cx + B.w / 2;
  const z1 = WALLS.south - 0.005, z0 = z1 - B.d;
  const front = z0;
  // carcass
  g.add(boxBetween(base.walnutH, x0, x1, B.legH, B.h, z0 + 0.012, z1));
  // two drawer fronts with 3 mm reveals, slightly proud
  const dh = (B.h - B.legH - 0.009) / 2;
  for (let i = 0; i < 2; i++) {
    const y0 = B.legH + 0.003 + i * (dh + 0.003);
    g.add(boxBetween(base.walnutH, x0 + 0.003, x1 - 0.003, y0, y0 + dh, front, front + 0.018));
    const pull = mesh(metricBox(0.07, 0.01, 0.014), base.brass);
    pull.position.set(cx, y0 + dh * 0.62, front - 0.007);
    g.add(pull);
  }
  // tapered legs
  const legGeo = new THREE.CylinderGeometry(0.016, 0.011, B.legH, 16);
  for (const lx of [x0 + 0.04, x1 - 0.04])
    for (const lz of [z0 + 0.05, z1 - 0.04]) {
      const leg = mesh(legGeo, base.walnutV);
      leg.position.set(lx, B.legH / 2, lz);
      g.add(leg);
    }
  return g;
}

/** Brass gourd base, brass stem, cream drum shade lit from inside. */
function lamp(m: Mats, lights: InteriorLights, x: number, z: number, y0: number): THREE.Group {
  const { base, f } = m;
  const g = new THREE.Group();
  const r = LAMP.baseR;
  const bodyH = LAMP.baseH;
  g.add(
    mesh(
      lathe([
        [0, 0],
        [r * 0.7, 0],
        [r * 0.75, 0.012],
        [r, bodyH * 0.3],
        [r * 0.92, bodyH * 0.6],
        [r * 0.45, bodyH * 0.88],
        [0.014, bodyH],
        [0, bodyH],
      ]),
      base.brass,
    ),
  );
  const shadeBottom = LAMP.top - y0 - LAMP.shadeH;
  const stem = mesh(new THREE.CylinderGeometry(0.006, 0.006, shadeBottom + 0.04 - bodyH, 12), base.brass);
  stem.position.y = bodyH + (shadeBottom + 0.04 - bodyH) / 2;
  g.add(stem);
  const sr = LAMP.shadeDia / 2;
  const shade = mesh(new THREE.CylinderGeometry(sr, sr, LAMP.shadeH, 64, 1, true), f.shade, false, true);
  shade.position.y = shadeBottom + LAMP.shadeH / 2;
  g.add(shade);
  for (const y of [shadeBottom, shadeBottom + LAMP.shadeH]) {
    const rim = mesh(new THREE.TorusGeometry(sr, 0.0025, 6, 64), base.brass, false);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = y;
    g.add(rim);
  }
  // Bulb glow card inside the shade.
  const bulb = mesh(new THREE.SphereGeometry(0.025, 16, 12), new THREE.MeshStandardMaterial({ color: '#fff4e0', emissive: '#FFD9A8', emissiveIntensity: 4 }), false, false);
  bulb.position.y = shadeBottom + LAMP.shadeH * 0.45;
  g.add(bulb);
  const L = LAMP.light;
  const pl = new THREE.PointLight(L.color, L.intensity, L.distance, L.decay);
  pl.position.y = shadeBottom + LAMP.shadeH * 0.5;
  pl.castShadow = false;
  g.add(pl);
  lights.lamps.push(pl);
  lights.emissive.push({ material: f.shade, on: f.shade.emissiveIntensity });
  lights.emissive.push({ material: bulb.material as THREE.MeshStandardMaterial, on: 4 });
  // Soft warm halo on the wall behind the shade.
  const halo = mesh(new THREE.PlaneGeometry(LAMP.wallGlowSize, LAMP.wallGlowSize), f.lampGlow, false, false);
  halo.rotation.y = Math.PI;
  halo.position.set(0, shadeBottom + LAMP.shadeH * 0.55, WALLS.south - 0.003 - z);
  halo.renderOrder = 1;
  g.add(halo);
  lights.emissive.push({ material: f.lampGlow, on: f.lampGlow.opacity });
  g.position.set(x, y0, z);
  shadows(g, true, true);
  halo.castShadow = false;
  shade.castShadow = false;
  bulb.castShadow = false;
  return g;
}

function alarmClock(m: Mats): THREE.Group {
  const g = new THREE.Group();
  const body = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 40), m.base.brass);
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.05;
  const face = mesh(new THREE.CircleGeometry(0.039, 40), m.f.clockFace);
  face.position.set(0, 0.05, -0.0176);
  face.rotation.y = Math.PI; // faces -Z (the room)
  for (const s of [-1, 1]) {
    const bell = mesh(new THREE.SphereGeometry(0.018, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m.base.brass);
    bell.position.set(s * 0.028, 0.09, 0);
    bell.rotation.z = -s * 0.5;
    const foot = mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.03, 8), m.base.brass);
    foot.position.set(s * 0.03, 0.012, 0);
    foot.rotation.z = s * 0.4;
    g.add(bell, foot);
  }
  g.add(body, face);
  return shadows(g);
}

/** Stack of books lying flat (covers use the spine atlas). */
export function bookStack(m: Mats, count: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  let y = 0;
  for (let i = 0; i < count; i++) {
    const w = 0.15 + ((seed + i * 7) % 5) * 0.012;
    const d = 0.21 + ((seed + i * 3) % 4) * 0.01;
    const t = 0.022 + ((seed + i) % 3) * 0.008;
    const geo = new THREE.BoxGeometry(w, t, d);
    // Map each book's spine face to a different slot of the atlas.
    const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
    const slot = (seed + i * 3) % 8;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (slot + uv.getX(k)) / 8);
    const book = mesh(geo, m.f.books);
    book.position.y = y + t / 2;
    book.rotation.y = (((seed * 13 + i * 29) % 11) - 5) * 0.03;
    const pages = mesh(new THREE.BoxGeometry(w - 0.006, t - 0.004, 0.004), m.f.paper);
    pages.position.set(0, y + t / 2, -d / 2 + 0.001);
    pages.rotation.y = book.rotation.y;
    g.add(book, pages);
    y += t;
  }
  return shadows(g);
}

export function buildBedside(m: Mats, lights: InteriorLights): Piece {
  const g = new THREE.Group();
  g.name = 'bedside';
  const z = BEDSIDE.centerZ;
  BEDSIDE.centersX.forEach((cx, i) => {
    g.add(table(m, cx));
    const top = BEDSIDE.h;
    g.add(lamp(m, lights, cx + (i === 0 ? 0.04 : -0.04), z + 0.06, top));
    const plant = smallPlant(m, 70 + i, 0.045, 0.075, 0.1, 10);
    // Kept back from the table's front edge so its leaves never overhang (wardrobe door swing).
    plant.position.set(cx + (i === 0 ? -0.12 : 0.12), top, z - 0.06);
    g.add(plant);
    if (i === 0) {
      // East table: alarm clock
      const clock = alarmClock(m);
      clock.position.set(cx + 0.1, top, z - 0.12);
      clock.rotation.y = -0.25;
      g.add(clock);
    } else {
      // West table: three books
      const books = bookStack(m, 3, 5);
      books.position.set(cx - 0.08, top, z - 0.08);
      g.add(books);
    }
  });
  return { group: g };
}
