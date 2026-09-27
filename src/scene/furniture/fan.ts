import * as THREE from 'three';
import { FAN, FEATURES, ROOM } from '../../config/room.config';
import { lathe, mesh, shadows, type Mats, type Piece } from './common';

/** 3-blade walnut/brass ceiling fan (REF-D), rotating at FAN.rpm. */
export function buildFan({ base }: Mats): Piece {
  const g = new THREE.Group();
  g.name = 'fan';
  const H = ROOM.ceilingH;
  const canopy = mesh(lathe([[0, 0], [0.06, 0], [0.075, -0.02], [0.07, -0.055], [0.02, -0.07], [0, -0.07]]), base.brass);
  canopy.position.y = H;
  const rod = mesh(new THREE.CylinderGeometry(0.011, 0.011, FAN.downRod, 16), base.brass);
  rod.position.y = H - FAN.downRod / 2;
  g.add(canopy, rod);

  const rotor = new THREE.Group();
  const motorTop = H - FAN.downRod;
  rotor.add(
    mesh(
      lathe([
        [0, 0],
        [0.03, 0],
        [0.085, -0.02],
        [0.1, -0.05],
        [0.095, -0.085],
        [0.06, -0.11],
        [0.02, -0.12],
        [0, -0.12],
      ]),
      base.brass,
    ),
  );
  // Blade: tapered paddle with rounded tip, slight pitch.
  const bladeLen = FAN.sweep / 2 - 0.12;
  const s = new THREE.Shape();
  s.moveTo(0, -0.045);
  s.lineTo(bladeLen - 0.05, -0.065);
  s.quadraticCurveTo(bladeLen + 0.005, -0.06, bladeLen, 0);
  s.quadraticCurveTo(bladeLen + 0.005, 0.06, bladeLen - 0.05, 0.065);
  s.lineTo(0, 0.045);
  s.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 1 });
  bladeGeo.rotateX(-Math.PI / 2); // lay the paddle flat (XZ)
  for (let i = 0; i < FAN.blades; i++) {
    const arm = new THREE.Group();
    const holder = mesh(new THREE.BoxGeometry(0.1, 0.012, 0.03), base.brass);
    holder.position.set(0.12, -0.075, 0);
    const blade = mesh(bladeGeo, base.walnutH);
    blade.position.set(0.12, -0.075, 0);
    blade.rotation.x = THREE.MathUtils.degToRad(12);
    arm.add(holder, blade);
    arm.rotation.y = (i / FAN.blades) * Math.PI * 2;
    rotor.add(arm);
  }
  rotor.position.y = motorTop;
  g.add(rotor);
  g.position.set(FAN.x, 0, FAN.z);
  // The spinning rotor would force a sun-shadow redraw every frame; the fan
  // sits far from the window beam, so it only receives shadows.
  shadows(g, false, true);

  const omega = (FAN.rpm / 60) * Math.PI * 2;
  if (!FEATURES.fanSpins) return { group: g }; // CLIENT: fan off, nothing to animate
  return {
    group: g,
    update(_t, dt) {
      rotor.rotation.y -= omega * dt;
    },
  };
}
