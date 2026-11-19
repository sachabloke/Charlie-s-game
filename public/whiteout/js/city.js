// The frozen city outside: the cross street in front of the flats, the long avenue south, the plaza and the Tower gate.
import * as THREE from './three.js';
import { fbm } from './build.js';
import { makeBeam } from './sky.js';

export const TRAIL = [[10.5, 15], [12.5, 19.5], [13, 23], [10, 34], [5.5, 48], [3.2, 58], [4, 66], [5, 76], [8, 90], [12, 104], [15.5, 112], [16, 124], [13.5, 134], [10.5, 148], [10.5, 160], [8, 175], [8, 185], [10.5, 198], [16.6, 205], [17.2, 214], [11.8, 226], [11.3, 235]];
export const FIRES = [[14.5, 20.5], [4.4, 82], [16.8, 133], [4.5, 186]];
export const GATE = { x0: 8.7, x1: 12.3, z: 236 };
export const TOWER = { x: 10.5, z: 300 };

export function buildCity(ctx) {
  const { B, mats, R, rand, sign, mound, cyl, icicles, icicleRow, fires, glows, spots, anchors, dyn } = ctx;
  const group = new THREE.Group(), rects = [], drifts = [];
  const sstep = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

  // ------------------------------------------------------------------ buildings
  const FAC = ['facadeA', 'facadeB', 'facadeC', 'facadeD'];
  const building = (x0, z0, x1, z1, h, f, shops = '') => {
    B.box(FAC[f], x0, 0, z0, x1, h, z1, { uv: [12, 12.8], org: [x0, 0, z0], skip: '+y-y', solid: true });
    B.box('snowProp', x0 - 0.25, h, z0 - 0.25, x1 + 0.25, h + 0.4, z1 + 0.25, { uv: 4, skip: '-y' });
    B.box('concreteExt', x0 + 1, h + 0.4, z0 + 1, x0 + 4, h + 2.6, z0 + 4, { uv: 3 }); B.box('snowProp', x0 + 0.9, h + 2.6, z0 + 0.9, x0 + 4.1, h + 2.85, z0 + 4.1, { uv: 4 });   // roof hut
    rects.push({ x0, z0, x1, z1 });
    const sm = (x0 + z0) % 2 > 1 ? 'shopA' : 'shopB', so = { uv: [12, 3.2] };
    if (shops.includes('+x')) { B.box(sm, x1, 0, z0, x1 + 0.07, 3.2, z1, { ...so, org: [0, 0, z0], skip: '-x+y-y+z-z' }); B.box('snowProp', x1, 3.2, z0, x1 + 0.4, 3.34, z1, { uv: 4 }); icicleRow(x1 + 0.36, z0, x1 + 0.36, z1, 3.2, Math.round((z1 - z0) * 1.6), 0.75); }
    if (shops.includes('-x')) { B.box(sm, x0 - 0.07, 0, z0, x0, 3.2, z1, { ...so, org: [0, 0, z0], skip: '+x+y-y+z-z' }); B.box('snowProp', x0 - 0.4, 3.2, z0, x0, 3.34, z1, { uv: 4 }); icicleRow(x0 - 0.36, z0, x0 - 0.36, z1, 3.2, Math.round((z1 - z0) * 1.6), 0.75); }
    if (shops.includes('-z')) { B.box(sm, x0, 0, z0 - 0.07, x1, 3.2, z0, { ...so, org: [x0, 0, 0], skip: '+x-x+y-y+z' }); B.box('snowProp', x0, 3.2, z0 - 0.4, x1, 3.34, z0, { uv: 4 }); icicleRow(x0, z0 - 0.36, x1, z0 - 0.36, 3.2, Math.round((x1 - x0) * 1.6), 0.75); }
    if (shops.includes('+z')) { B.box(sm, x0, 0, z1, x1, 3.2, z1 + 0.07, { ...so, org: [x0, 0, 0], skip: '+x-x+y-y-z' }); B.box('snowProp', x0, 3.2, z1, x1, 3.34, z1 + 0.4, { uv: 4 }); icicleRow(x0, z1 + 0.36, x1, z1 + 0.36, 3.2, Math.round((x1 - x0) * 1.6), 0.75); }
  };
  rects.push({ x0: 0, z0: 0, x1: 21, z1: 14 });
  // the row the flats stand in
  building(-48, -10, -24, 14, 25.6, 1, '+z'); building(-24, -10, 0, 14, 19.2, 2, '+z'); building(21, -10, 45, 14, 28.8, 3, '+z'); building(45, -10, 72, 14, 16, 1, '+z');
  building(-60, 8, -48, 40, 22.4, 2, '+x');                                                               // closes the street to the west
  building(72, 8, 84, 40, 22.4, 0, '-x');                                                                 // and far to the east, beyond the barricade
  // the avenue, west side then east side
  building(-48.5, 34, -0.5, 61, 32, 3, '+x-z'); building(-30.5, 64, -0.5, 97, 22.4, 0, '+x'); building(-30.5, 97, -0.5, 127, 38.4, 1, '+x'); building(-30.5, 130, -0.5, 160, 25.6, 2, '+x'); building(-30.5, 160, -0.5, 190, 35.2, 3, '+x+z');
  building(21.5, 34, 72.5, 58, 25.6, 2, '-x-z'); building(21.5, 58, 51.5, 91, 41.6, 0, '-x'); building(21.5, 94, 51.5, 124, 19.2, 1, '-x'); building(21.5, 124, 51.5, 157, 28.8, 3, '-x'); building(21.5, 157, 51.5, 190, 25.6, 0, '-x+z');
  // alleys are choked with snow and junk
  for (const [x0, x1, z0, z1, dir] of [[-6, -0.5, 61, 64, -1], [-6, -0.5, 127, 130, -1], [21.5, 27, 91, 94, 1]]) {
    B.solid(x0, 0, z0, x1, 6, z1); const xm = dir < 0 ? -1.6 : 22.6;
    mound(xm, 0, (z0 + z1) / 2, 2.2, 1.9, 1.7); mound(xm - dir * 1.2, 0.8, (z0 + z1) / 2 + 0.4, 1.6, 1.6, 1.5); B.rbox('plank', xm + dir * 0.7, 0.6, z0 + 0.8, 1.0, 0.9, 1.0, 0.4, { uv: 0.6 }); B.rbox('rust', xm + dir * 0.9, 0.5, z1 - 0.8, 0.7, 1.0, 0.7, 0.2);
    B.box('snowProp', Math.min(x0, x1) - 24, 0, z0, Math.max(x0, x1), 1.0, z1, { uv: 4 });
  }
  // the plaza and what stands round it
  building(-36.5, 190, -24.5, 240, 28.8, 1, '+x'); building(45.5, 190, 57.5, 240, 32, 2, '-x');
  building(-24.5, 246, -3.5, 270, 41.6, 0); building(24.5, 246, 45.5, 270, 44.8, 3);

  // ------------------------------------------------------------------ the Tower gate (south end of the plaza)
  const gw = { uv: 3, solid: true };
  B.box('concrete', -24.5, 0, 236, GATE.x0, 9, 239, gw); B.box('concrete', GATE.x1, 0, 236, 45.5, 9, 239, gw); B.box('concrete', GATE.x0, 4.4, 236, GATE.x1, 9, 239, { uv: 3 });
  B.box('snowProp', -24.7, 9, 235.8, 45.7, 9.4, 239.2, { uv: 4 }); icicleRow(-24, 235.95, 45, 235.95, 9, 90, 1.2); icicleRow(GATE.x0, 236.05, GATE.x1, 236.05, 4.4, 12, 0.5);
  rects.push({ x0: -24.5, z0: 236, x1: 45.5, z1: 239 });
  for (let x = -22; x < 45; x += 6) { if (x > 1 && x < 20) continue; B.box('concrete', x, 0, 235.6, x + 0.9, 9, 236, { uv: 3 }); }
  sign('gate', '-z', 3.3, 5.1, 235.9, 17.7, 7.9, 235.95); sign('stripes', '-z', GATE.x0 - 0.5, 0, 235.93, GATE.x0, 4.4, 235.95); sign('stripes', '-z', GATE.x1, 0, 235.93, GATE.x1 + 0.5, 4.4, 235.95);
  B.box('metalDark', GATE.x0, 0, 236.4, 10.5, 4.3, 236.6, { uv: 1 }); for (let i = 0; i < 4; i++) B.box('rust', GATE.x0 + 0.1, 0.4 + i * 1.1, 236.36, 10.45, 0.55 + i * 1.1, 236.4);       // left leaf, shut
  B.solid(GATE.x0, 0, 236.4, 10.5, 4.3, 236.6);
  B.rbox('metalDark', 12.0, 2.15, 237.3, 1.8, 4.3, 0.2, 1.25);                                                                                                                       // right leaf, ajar
  B.box('warm', 10.5, 0, 238.9, GATE.x1, 4.3, 239);                                                                                                                                   // light from inside
  B.box('concrete', GATE.x0, 0, 239, GATE.x1, 4.4, 239.3, { uv: 3, solid: true });
  glows.push({ x: 11.4, y: 2.1, z: 237.6, color: 0xffa040, size: 9, fog: true }); spots.push({ x: 11.4, y: 2.2, z: 235.2, color: 0xffa550, power: 60, range: 22 });
  for (const x of [1.5, 19.5]) { B.box('metalDark', x - 0.3, 8.4, 235.3, x + 0.3, 8.9, 235.9); B.box('cold', x - 0.22, 8.38, 235.3, x + 0.22, 8.4, 235.8); glows.push({ x, y: 8.3, z: 235.4, color: 0xbfd8ff, size: 7, fog: true }); spots.push({ x, y: 7.6, z: 233.5, color: 0xbcd6ff, power: 90, range: 30 }); }
  anchors.gate = new THREE.Vector3(11.4, 0, 235.6);
  // the Tower itself, far beyond the wall
  B.geo('far', new THREE.CylinderGeometry(8, 14, 150, 8), { p: [TOWER.x, 75, TOWER.z] }); B.geo('far', new THREE.CylinderGeometry(11, 8, 10, 8), { p: [TOWER.x, 155, TOWER.z] });
  B.geo('far', new THREE.CylinderGeometry(0.6, 2.2, 60, 6), { p: [TOWER.x, 190, TOWER.z] });
  for (const [y, s, ph] of [[220, 16, 0], [162, 11, 0.5], [110, 9, 0.25], [60, 8, 0.75]]) glows.push({ x: TOWER.x, y, z: TOWER.z - (y > 200 ? 0 : 11), color: 0xff2a18, size: s, fog: false, blink: 2.6, phase: ph, beacon: true });
  dyn.beam = makeBeam(300, 20); dyn.beam.position.set(TOWER.x, 158, TOWER.z); group.add(dyn.beam);

  // ------------------------------------------------------------------ street furniture
  const lamp = (x, z, toward, lit = false) => {
    cyl('metalDark', x, 0, z, 0.1, 7.2, 8, 0.07); B.post(x, z, 0.16, 0, 3);
    B.box('metalDark', Math.min(x, x + toward * 1.7), 7.1, z - 0.05, Math.max(x, x + toward * 1.7), 7.2, z + 0.05); B.box('metalDark', x + toward * 1.7 - 0.3, 6.95, z - 0.14, x + toward * 1.7 + 0.3, 7.1, z + 0.14);
    mound(x + toward * 1.7, 7.1, z, 0.36, 0.14, 0.2); icicleRow(x + toward * 0.2, z, x + toward * 1.9, z, 7.1, 6, 0.45);
    if (lit) { B.box('warm', x + toward * 1.7 - 0.22, 6.93, z - 0.1, x + toward * 1.7 + 0.22, 6.95, z + 0.1); glows.push({ x: x + toward * 1.7, y: 6.9, z, color: 0xffb060, size: 5, fog: true, flicker: 1 }); spots.push({ x: x + toward * 1.7, y: 6.4, z, color: 0xffb468, power: 70, range: 22, flicker: 1 }); }
  };
  [40, 66, 92, 118, 144, 170].forEach((z) => lamp(1.3, z, 1)); [53, 79, 105, 131, 157, 183].forEach((z) => lamp(19.7, z, -1, z === 105));
  for (const x of [-30, -8, 30, 52]) lamp(x, 16.8, 0.0001);
  for (const x of [9.2, 11.8]) B.box('black', x - 0.012, 6.6, 34, x + 0.012, 6.63, 190);                                               // tram wires
  for (let z = 40; z < 190; z += 26) { B.box('black', 1.3, 6.9, z - 0.012, 19.7, 6.93, z + 0.012); icicleRow(3, z, 18, z, 6.9, 10, 0.5); }

  const car = (x, z, ry, mat, van = false) => {
    const L = van ? 5.0 : 4.3, Wd = van ? 1.95 : 1.75, c = Math.cos(ry), s = Math.sin(ry), at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    B.rbox(mat, x, 0.62, z, L, van ? 0.9 : 0.62, Wd, ry, { solid: true, uv: 1.5 }); B.colliders[B.colliders.length - 1].y1 = 1.9;
    const [cx, cz] = at(van ? 0.3 : -0.25, 0), ch = van ? 0.75 : 0.5, cy = (van ? 1.07 : 0.93) + ch / 2;
    B.rbox('darkGlass', cx, cy, cz, van ? 3.6 : 2.25, ch, Wd - 0.12, ry); B.rbox(mat, cx, cy + ch / 2 + 0.03, cz, van ? 3.6 : 2.1, 0.06, Wd - 0.16, ry, { uv: 1.5 });
    for (const [lx, lz] of [[L * 0.32, Wd / 2], [L * 0.32, -Wd / 2], [-L * 0.32, Wd / 2], [-L * 0.32, -Wd / 2]]) { const [wx, wz] = at(lx, lz); B.geo('black', new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10), { p: [wx, 0.34, wz], r: [Math.PI / 2, ry, 0, 'YXZ'] }); }
    mound(cx, cy + ch / 2, cz, (van ? 2.0 : 1.3), 0.3, Wd * 0.52, ry); const [bx, bz] = at(L * 0.36, 0); mound(bx, van ? 1.05 : 0.9, bz, 0.85, 0.2, Wd * 0.5, ry); const [tx, tz] = at(-L * 0.4, 0); mound(tx, van ? 1.05 : 0.92, tz, 0.6, 0.16, Wd * 0.48, ry);
    drifts.push({ x, z, r: 2.6, h: 0.32 }, { x: x + s * 1.2, z: z + c * 1.2, r: 1.5, h: 0.25 });
  };
  car(6, 38, 1.72, 'carBlue'); car(15.5, 47, 0.3, 'carGrey'); car(3.6, 90, 1.3, 'carYellow'); car(16.5, 97, 1.65, 'carGrey');
  car(9, 112, 0.9, 'carBlue'); car(11.9, 116.6, 2.2, 'carGrey'); car(7, 119.5, 0.25, 'white', true);
  car(5, 142, 1.57, 'carGrey'); car(15, 150, 1.4, 'carBlue'); car(-12, 24, 0.1, 'carGrey'); car(33, 27.5, -0.12, 'carBlue'); car(41, 21, 0.4, 'white', true);

  // the bus, slewed across the avenue with its door open
  { const x = 11, z = 58, ry = 1.05, c = Math.cos(ry), s = Math.sin(ry), at = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    B.rbox('carYellow', x, 1.75, z, 11, 2.7, 2.5, ry, { solid: true, uv: 2 }); B.colliders[B.colliders.length - 1].y0 = 0;
    B.rbox('darkGlass', x, 2.25, z, 10.6, 1.0, 2.54, ry); B.rbox('black', x, 0.42, z, 10.2, 0.3, 2.3, ry);
    for (const lx of [-3.6, 3.6]) for (const lz of [-1.2, 1.2]) { const [wx, wz] = at(lx, lz); B.geo('black', new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12), { p: [wx, 0.5, wz], r: [Math.PI / 2, ry, 0, 'YXZ'] }); }
    const [dx, dz] = at(3.9, -1.26); B.rbox('black', dx, 1.45, dz, 1.1, 2.0, 0.06, ry);                                               // open door (west side)
    for (const lx of [-3.5, 0, 3.5]) { const [mx, mz] = at(lx, 0); mound(mx, 3.1, mz, 2.2, 0.35, 1.3, ry); }
    drifts.push({ x: 13.5, z: 60, r: 4, h: 0.5 }, { x: 8.5, z: 56, r: 3, h: 0.3 });
    const [sx, sz] = at(5.52, 0); const m = signMesh('busdest', 2.0, 0.48, true); m.position.set(sx, 2.95, sz); m.rotation.y = ry + Math.PI / 2; group.add(m);
    const [nx, nz] = at(3.9, -1.75); anchors.bus = new THREE.Vector3(nx, 0.5, nz); B.rbox('carBlue', nx, 0.28, nz, 0.7, 0.5, 0.28, ry + 0.3, { solid: true });      // a case dropped by the door
  }
  function signMesh(name, w, h, lit = false) {
    const g = new THREE.PlaneGeometry(w, h), r = R[name], uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, r[0] + uv.getX(i) * (r[2] - r[0]), r[1] + uv.getY(i) * (r[3] - r[1]));
    return new THREE.Mesh(g, lit ? mats.signsLit : mats.signs);
  }

  // the tram at the dead end to the west, and the barricade to the east
  B.rbox('red', -34, 1.9, 24.5, 14, 2.9, 2.6, 0.07, { solid: true, uv: 2 }); B.colliders[B.colliders.length - 1].y0 = 0; B.rbox('darkGlass', -34, 2.4, 24.5, 13.4, 1.0, 2.64, 0.07); B.rbox('black', -34, 0.3, 24.5, 12, 0.5, 2.2, 0.07);
  for (const lx of [-4.5, 0, 4.5]) mound(-34 + lx, 3.3, 24.5 - lx * 0.07, 2.6, 0.4, 1.4); mound(-44, 0, 25, 5, 3.2, 9); mound(-41, 0, 17, 3.5, 2.2, 3.5); mound(-42, 0, 32, 4, 2.4, 3); B.solid(-48, 0, 14, -41.5, 5, 34);
  drifts.push({ x: -38, z: 24, r: 7, h: 0.9 });
  for (let i = 0; i < 9; i++) { const z = 15.2 + i * 2.2; B.rbox('concreteExt', 60.5 + (i % 2) * 0.25, 0.5, z, 0.7, 1.0, 2.0, (i % 3 - 1) * 0.06, { uv: 2 }); mound(60.5, 1.0, z, 0.45, 0.16, 1.0); }
  B.solid(60, 0, 14, 62, 6, 34); for (let i = 0; i < 6; i++) cyl('metalDark', 61.2, 0, 16 + i * 3.4, 0.05, 3.2, 6); B.box('black', 61.18, 1.0, 14, 61.22, 3.1, 34, {});
  sign('quarantine', '-x', 61.1, 1.5, 21.5, 61.17, 3.0, 26.5); drifts.push({ x: 59, z: 24, r: 5, h: 0.5 });

  // fire barrels: someone has been keeping them lit
  for (const [x, z] of FIRES) {
    cyl('rust', x, 0, z, 0.3, 0.92, 12, 0.32); B.post(x, z, 0.4, 0, 2); fires.push({ x, y: 0.95, z });
    B.rbox('plank', x + 1.1, 0.25, z + 0.7, 0.55, 0.42, 0.55, 0.3, { solid: true, uv: 0.6 }); B.rbox('plank', x - 0.9, 0.2, z + 1.0, 1.1, 0.14, 0.8, -0.2, { uv: 0.6 });
    for (let i = 0; i < 4; i++) B.rbox('woodDark', x - 1.0 + i * 0.07, 0.34 + (i % 2) * 0.09, z + 0.9 + i * 0.12, 0.7, 0.08, 0.1, 0.6 + i);
  }
  anchors.lamplighter = new THREE.Vector3(FIRES[0][0] + 1.1, 0.47, FIRES[0][1] + 0.7);

  // news kiosk
  B.box('red', 1.0, 0, 76.9, 3.4, 2.5, 79.1, { solid: true, uv: 1.5 }); B.box('metalDark', 0.8, 2.5, 76.7, 3.9, 2.62, 79.3); mound(2.3, 2.6, 78, 1.7, 0.3, 1.4); icicleRow(3.88, 76.8, 3.88, 79.2, 2.5, 12, 0.45);
  B.box('black', 3.4, 1.0, 77.2, 3.42, 2.0, 78.8); B.box('wood', 3.4, 0.95, 77.1, 3.75, 1.0, 78.9); sign('kiosk', '+x', 3.4, 2.05, 77.0, 3.43, 2.45, 79.0); sign('news', '-z', 1.5, 0.9, 76.88, 2.9, 1.83, 76.9);
  drifts.push({ x: 1.5, z: 80.2, r: 2, h: 0.5 });
  // stopped clock and the metro steps
  cyl('metalDark', 18.6, 0, 104, 0.09, 3.6, 8); B.post(18.6, 104, 0.15, 0, 3); B.box('metalDark', 18.1, 3.6, 103.9, 19.1, 4.6, 104.1); sign('clock', '-z', 18.15, 3.65, 103.88, 19.05, 4.55, 103.9); sign('clock', '+z', 18.15, 3.65, 104.1, 19.05, 4.55, 104.12); mound(18.6, 4.6, 104, 0.5, 0.14, 0.14);
  for (const [x0, z0, x1, z1] of [[18.3, 108, 18.4, 113], [18.3, 113, 21.2, 113.1], [18.3, 108, 19.2, 108.1]]) { B.box('metalDark', x0, 0, z0, x1, 1.1, z1, { solid: true }); }
  mound(19.9, 0, 110.6, 1.5, 0.9, 2.4); cyl('metalDark', 18.6, 0, 107.4, 0.07, 3.4, 8); sign('metro', '-z', 18.0, 3.0, 107.33, 19.2, 4.2, 107.35); sign('metro', '+z', 18.0, 3.0, 107.45, 19.2, 4.2, 107.47); B.box('metalDark', 18.0, 3.0, 107.35, 19.2, 4.2, 107.45);
  // the footbridge with the council's billboard
  B.box('facadeC', -0.5, 6.4, 126.5, 21.5, 9.6, 129.5, { uv: [12, 12.8], org: [0.5, 6.4, 126.5], skip: '+y-y' }); B.box('concreteExt', -0.5, 6.1, 126.5, 21.5, 6.4, 129.5, { uv: 3 }); B.box('snowProp', -0.5, 9.6, 126.3, 21.5, 9.95, 129.7, { uv: 4 });
  for (const x of [0.2, 20.8]) { B.box('concreteExt', x - 0.4, 0, 127.5, x + 0.4, 6.1, 128.5, { uv: 3, solid: true }); }
  icicleRow(0, 126.55, 21, 126.55, 6.1, 40, 1.5); icicleRow(0, 129.45, 21, 129.45, 6.1, 40, 1.5);
  B.box('metalDark', 5.3, 10.2, 126.7, 15.7, 15.6, 126.9); sign('billboard', '-z', 5.5, 10.4, 126.66, 15.5, 15.4, 126.7); for (const x of [6.5, 14.5]) B.box('metalDark', x - 0.1, 9.9, 126.9, x + 0.1, 15.6, 127.1); mound(10.5, 15.6, 126.8, 5.2, 0.3, 0.3);
  // checkpoint
  for (const [xa, xb] of [[0.6, 7.8], [13.2, 20.4]]) { for (let r = 0; r < 3; r++) for (let x = xa + (r % 2) * 0.3; x < xb - 0.3; x += 0.62) B.rbox('fabric', x + 0.3, 0.3 + r * 0.3, 162 + (rand() - 0.5) * 0.08, 0.6, 0.3, 0.42, (rand() - 0.5) * 0.2, { uv: 0.4 }); B.solid(xa, 0, 161.7, xb, 1.4, 162.3); mound((xa + xb) / 2, 1.1, 162, (xb - xa) / 2, 0.2, 0.4); }
  for (const x of [7.9, 13.1]) { B.box('metalDark', x - 0.1, 0, 161.9, x + 0.1, 6.3, 162.1); B.post(x, 162, 0.2, 0, 3); } B.box('metalDark', 7.8, 4.6, 161.9, 13.2, 4.75, 162.1); B.box('metalDark', 7.8, 6.15, 161.9, 13.2, 6.3, 162.1);
  sign('checkpoint', '-z', 8.2, 4.8, 161.86, 12.8, 6.1, 161.9); icicleRow(8, 162, 13, 162, 4.6, 10, 0.6);
  B.geo('red', new THREE.BoxGeometry(4.6, 0.12, 0.12), { p: [8.45, 3.2, 162.6], r: [0, 0, 1.36] }); B.box('metalDark', 7.8, 0, 162.45, 8.1, 1.2, 162.75);
  B.box('metalGreen', 13.6, 0, 163.2, 15.8, 2.5, 165.4, { solid: true }); B.box('darkGlass', 13.58, 1.1, 163.6, 13.6, 1.9, 165.0); B.box('wood', 13.3, 1.0, 163.5, 13.6, 1.05, 165.1); mound(14.7, 2.5, 164.3, 1.3, 0.25, 1.3);
  anchors.checkpoint = new THREE.Vector3(13.44, 1.06, 164.3);
  // plaza: the frozen fountain
  const FX = 10.5, FZ = 210;
  B.geo('concreteExt', new THREE.CylinderGeometry(5, 5.2, 0.75, 28), { p: [FX, 0.37, FZ] }); B.geo('ice', new THREE.CylinderGeometry(4.6, 4.6, 0.1, 28), { p: [FX, 0.74, FZ] }); B.post(FX, FZ, 5.2, 0, 3);
  cyl('concreteExt', FX, 0.7, FZ, 0.7, 2.0, 12, 0.5); B.geo('concreteExt', new THREE.CylinderGeometry(2.1, 0.6, 0.5, 16), { p: [FX, 2.9, FZ] }); cyl('concreteExt', FX, 3.1, FZ, 0.3, 1.3, 10, 0.2); B.geo('concreteExt', new THREE.CylinderGeometry(1.0, 0.3, 0.3, 12), { p: [FX, 4.5, FZ] });
  for (let i = 0; i < 44; i++) { const a = i / 44 * Math.PI * 2; icicles.push({ x: FX + Math.cos(a) * 2.05, y: 3.15, z: FZ + Math.sin(a) * 2.05, len: 0.9 + rand() * 1.4, r: 0.05 + rand() * 0.05 }); }
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2; icicles.push({ x: FX + Math.cos(a) * 0.98, y: 4.65, z: FZ + Math.sin(a) * 0.98, len: 0.5 + rand() * 0.9, r: 0.04 + rand() * 0.03 }); }
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; B.geo('ice', new THREE.IcosahedronGeometry(1, 1), { p: [FX + Math.cos(a) * 3.1, 1.25, FZ + Math.sin(a) * 3.1], r: [0, -a, 0.5], s: [1.1, 0.5, 0.22] }); B.geo('ice', new THREE.IcosahedronGeometry(1, 0), { p: [FX + Math.cos(a) * 4.1, 0.9, FZ + Math.sin(a) * 4.1], r: [a, a, 0], s: 0.3 }); }
  mound(FX, 4.6, FZ, 0.9, 0.3, 0.9); drifts.push({ x: FX - 5, z: FZ - 3, r: 3, h: 0.5 }, { x: FX + 6, z: FZ + 4, r: 3, h: 0.4 });
  for (const [x, z, ry] of [[-2, 202, 0.4], [23, 204, -0.5], [-3, 220, -0.3], [24, 222, 0.4]]) { B.rbox('wood', x, 0.5, z, 1.8, 0.07, 0.5, ry, { solid: true }); B.rbox('metalDark', x, 0.25, z, 1.6, 0.5, 0.06, ry); mound(x, 0.52, z, 0.9, 0.16, 0.3, ry); cyl('metalDark', x * 1 + 3 * Math.sign(10 - x), 0, z, 0.1, 6, 8, 0.07); B.post(x + 3 * Math.sign(10 - x), z, 0.16, 0, 3); mound(x + 3 * Math.sign(10 - x), 6, z, 0.3, 0.2, 0.3); }
  // the one lit window, high above the avenue: somebody is still here
  B.box('warm', 21.42, 16.9, 139.7, 21.5, 18.3, 141.3); glows.push({ x: 21.3, y: 17.6, z: 140.5, color: 0xffa040, size: 6, fog: true, flicker: 0.4 });
  anchors.window = new THREE.Vector3(21.4, 17.6, 140.5);
  // odds and ends on the pavements
  for (const [x, z] of [[1.6, 45], [19.4, 70], [1.6, 108], [19.4, 140], [1.8, 176]]) { cyl('metalGreen', x, 0, z, 0.26, 0.95, 10); B.post(x, z, 0.3, 0, 2); mound(x, 0.95, z, 0.32, 0.18, 0.32); }
  for (const [x, z] of [[18.8, 44], [2.0, 121], [18.9, 172]]) { cyl('red', x, 0, z, 0.2, 1.25, 10); B.post(x, z, 0.26, 0, 2); mound(x, 1.25, z, 0.26, 0.14, 0.26); }                      // post boxes
  for (const z of [36, 62.5, 99, 128.6, 158.5]) for (const x of [-0.42, 21.42]) { cyl('rust', x, 0, z, 0.07, 12, 6); }                                                                    // drainpipes
  for (const [x, z, s] of [[2, 50, 1], [19, 60, 1.3], [19.6, 86, 1], [1.2, 100, 1.2], [1.5, 136, 1.4], [19.8, 150, 1.1], [1.4, 166, 1], [20, 178, 1.3], [-20, 16, 1.5], [36, 16, 1.2], [50, 32.5, 1.6], [-22, 32.6, 1.4]]) { mound(x, 0, z, 1.6 * s, 0.75 * s, 1.5 * s); drifts.push({ x, z, r: 2.6 * s, h: 0.35 * s }); }

  // ------------------------------------------------------------------ the snow on the ground
  const segD = (px, pz, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, t = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz))); return Math.hypot(px - ax - dx * t, pz - az - dz * t); };
  const snowH = (x, z) => {
    const n = fbm(x * 0.06 + 3.1, z * 0.06 + 1.7, 3), n2 = fbm(x * 0.31 + 9, z * 0.31, 2);
    let h = 0.06 + 0.24 * n + 0.07 * n2, d = 99;
    for (const r of rects) { const dx = Math.max(r.x0 - x, 0, x - r.x1), dz = Math.max(r.z0 - z, 0, z - r.z1), q = dx > dz ? (dz === 0 ? dx : Math.hypot(dx, dz)) : (dx === 0 ? dz : Math.hypot(dx, dz)); if (q < d) d = q; }
    h += 0.6 * Math.exp(-d * 0.7) * (0.35 + 1.1 * n2);
    for (const dr of drifts) { const q = ((x - dr.x) ** 2 + (z - dr.z) ** 2) / (dr.r * dr.r); if (q < 6) h += dr.h * Math.exp(-q * 1.6); }
    let dt = 99; for (let i = 0; i < TRAIL.length - 1; i++) { if (Math.abs(z - (TRAIL[i][1] + TRAIL[i + 1][1]) / 2) > 22) continue; const q = segD(x, z, TRAIL[i][0], TRAIL[i][1], TRAIL[i + 1][0], TRAIL[i + 1][1]); if (q < dt) dt = q; }
    h -= 0.09 * Math.exp(-dt * dt * 2.2); h *= 0.45 + 0.55 * sstep(0.3, 1.6, dt);
    for (const [fx, fz] of FIRES) { const q = Math.hypot(x - fx, z - fz); if (q < 2.6) h *= 0.12 + 0.88 * sstep(0.6, 2.6, q); }
    const dd = Math.hypot(x - 10.5, (z - 14.2) * 1.2); if (dd < 3.5) h *= 0.3 + 0.7 * sstep(0.8, 3.5, dd);
    const dg = Math.hypot(x - 11.4, z - 236); if (dg < 4) h *= 0.2 + 0.8 * sstep(1, 4, dg);
    return Math.max(0.02, h);
  };
  const patch = (x0, z0, x1, z1) => {
    const c = 0.5, nx = Math.round((x1 - x0) / c), nz = Math.round((z1 - z0) / c), n = (nx + 1) * (nz + 1), pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = new Uint32Array(nx * nz * 6);
    const hs = new Float32Array((nx + 3) * (nz + 3)), H = (i, j) => hs[(j + 1) * (nx + 3) + i + 1];
    for (let j = -1; j <= nz + 1; j++) for (let i = -1; i <= nx + 1; i++) hs[(j + 1) * (nx + 3) + i + 1] = snowH(x0 + i * c, z0 + j * c);
    let k = 0, q = 0;
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++, k++) {
      const h = H(i, j), x = x0 + i * c, z = z0 + j * c; pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      const gx = (H(i - 1, j) - H(i + 1, j)) / (2 * c), gz = (H(i, j - 1) - H(i, j + 1)) / (2 * c), l = Math.hypot(gx, 1, gz); nor[k * 3] = gx / l; nor[k * 3 + 1] = 1 / l; nor[k * 3 + 2] = gz / l;
      const hollow = (H(i - 1, j) + H(i + 1, j) + H(i, j - 1) + H(i, j + 1)) / 4 - h, s = Math.min(1, Math.max(0.55, 0.9 - hollow * 9 + 0.1 * fbm(x * 0.9, z * 0.9, 2)));
      col[k * 3] = s * 0.93; col[k * 3 + 1] = s * 0.97; col[k * 3 + 2] = s; uv[k * 2] = x / 3; uv[k * 2 + 1] = z / 3;
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; idx[q++] = a; idx[q++] = d; idx[q++] = b; idx[q++] = b; idx[q++] = d; idx[q++] = e; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    const m = new THREE.Mesh(g, mats.snow); m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false; group.add(m);
  };
  patch(-48.5, 14, 72, 34);
  for (let z = 34; z < 190; z += 39) patch(-0.5, z, 21.5, z + 39);                    // the avenue, in four pieces so only what is in view gets drawn
  patch(-24.5, 190, 45.5, 236);
  B.box('concreteExt', -60, -0.5, 14.02, 85, -0.04, 245, { uv: 3, skip: '-y+x-x+z-z' });   // whatever shows through at the edges is dark ground, not sky

  return { group, snowH, trail: TRAIL, update() {} };
}
