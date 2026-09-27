import * as THREE from 'three';
import { ACCENT, BEDSIDE, FIXTURES, WALLS } from '../config/room.config';
import type { Materials } from '../materials/library';
import { buildDoors, buildFixtures, buildWindow, type Door, type FixtureSpec } from './openings';
import { buildShell } from './shell';

export interface Room {
  group: THREE.Group;
  interior: THREE.Box3;
  doors: { bedroom: Door; washroom: Door };
  ceiling: THREE.Object3D;
  /** Corridor behind the bedroom door; hidden in dollhouse view. */
  hall: THREE.Object3D;
}

/** M1: architecture only (shell, openings, fixtures). Furniture arrives in M2. */
export function buildRoom(mats: Materials): Room {
  const group = new THREE.Group();
  group.name = 'room';
  const shell = buildShell(mats);
  const doors = buildDoors(mats);
  group.add(shell.group, doors.group, buildWindow(mats));

  const southFace = WALLS.south - ACCENT.offset;
  const toRoomFromSouth = new THREE.Vector3(0, 0, -1);
  const fixtures: FixtureSpec[] = [
    // 2-module switch plate beside the window (REF-D)
    {
      kind: 'switch',
      modules: FIXTURES.switchEast.modules,
      position: new THREE.Vector3(WALLS.east, FIXTURES.switchEast.y, FIXTURES.switchEast.z),
      normal: new THREE.Vector3(-1, 0, 0),
    },
    // sockets above both bedside tables (AGREED: follow the tables)
    ...BEDSIDE.centersX.map<FixtureSpec>((x) => ({
      kind: 'socket',
      modules: 2,
      position: new THREE.Vector3(x, FIXTURES.bedsideSocketY, southFace),
      normal: toRoomFromSouth,
    })),
    // 3-socket board above the desk
    {
      kind: 'socket',
      modules: FIXTURES.deskSocket.sockets,
      position: new THREE.Vector3(FIXTURES.deskSocket.x, FIXTURES.deskSocket.y, southFace),
      normal: toRoomFromSouth,
    },
  ];
  group.add(buildFixtures(mats, fixtures));

  const ceiling = shell.group.getObjectByName('ceiling');
  const hall = shell.group.getObjectByName('hall');
  if (!ceiling || !hall) throw new Error('shell is missing ceiling/hall');
  return { group, interior: shell.interior, doors: { bedroom: doors.bedroom, washroom: doors.washroom }, ceiling, hall };
}
