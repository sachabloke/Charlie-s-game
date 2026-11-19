// The block of flats you wake up in: flat 34 on the second floor, the corridor, the stairwell, and the lobby with the caretaker's office.
// Distances are metres. X runs east, Z runs south (towards the avenue and the Tower), Y is up.
import * as THREE from './three.js';
import { Builder, fbm, rng } from './build.js';
import { buildCity } from './city.js';

export const FLOOR = 3.2, Y2 = 6.4;                       // storey height; height of the second floor
export const BLOCK = { x0: 0, z0: 0, x1: 21, z1: 14, h: 22.4 };

export function buildWorld(mats, rects) {
  const B = new Builder(), R = rects, rand = rng(7);
  const icicles = [];                                      // { x, y, z, len, r } hung at the end as one instanced mesh
  const dyn = {}, anchors = {}, fires = [], glows = [], spots = [];
  const sign = (name, face, x0, y0, z0, x1, y1, z1, lit = false) => B.panel(lit ? 'signsLit' : 'signs', x0, y0, z0, x1, y1, z1, face, { rect: R[name] });
  const icicleRow = (x0, z0, x1, z1, y, n, maxLen = 0.5) => { for (let i = 0; i < n; i++) { const t = (i + rand()) / n; icicles.push({ x: x0 + (x1 - x0) * t, y, z: z0 + (z1 - z0) * t, len: maxLen * (0.25 + 0.75 * rand() * rand()), r: 0.011 + rand() * 0.016 }); } };

  // lumpy snow heaps
  const lump = [0, 1, 2].map((k) => { const g = new THREE.SphereGeometry(1, 14, 9), P = g.attributes.position; for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), n = 0.75 + 0.5 * fbm(x * 1.7 + k * 9, z * 1.7 + y * 1.3 + k * 4, 3); P.setXYZ(i, x * n, Math.max(y, -0.15) * n, z * n); } g.computeVertexNormals(); return g; });
  const mound = (x, y, z, rx, ry, rz, rot = 0) => B.geo('snowProp', lump[(Math.abs(x * 7 + z * 3) | 0) % 3], { p: [x, y, z], r: [0, rot, 0], s: [rx, ry, rz] });
  const cyl = (key, x, y0, z, r, h, seg = 10, r2 = r) => B.geo(key, new THREE.CylinderGeometry(r2, r, h, seg), { p: [x, y0 + h / 2, z] });

  // A window in a wall that runs along X: frame, cross bar and (unless broken) a frosted pane.
  const windowX = (a, b, ys, yh, z, glass) => {
    const f = 0.06, d = 0.2;
    B.box('white', a, ys, z - d, b, ys + f, z + d + 0.04); B.box('white', a, yh - f, z - d, b, yh, z + d); B.box('white', a, ys, z - d, a + f, yh, z + d); B.box('white', b - f, ys, z - d, b, yh, z + d);
    if (glass) { B.box('white', (a + b) / 2 - 0.025, ys, z - 0.03, (a + b) / 2 + 0.025, yh, z + 0.03); B.panel(glass, a + f, ys + f, z, b - f, yh - f, z, '+z'); }
  };
  const WIN = (a) => ({ a, b: a + 1.6, sill: 0.9, head: 2.3 });
  const DOOR = (a, w = 1.0, head = 2.1) => ({ a, b: a + w, sill: 0, head });

  // ================================================================== SHELL
  const H = BLOCK.h;
  // outside faces that have no real windows: painted building front
  const fa = { uv: [12, 12.8], org: [0, 0, 0] };
  B.box('facadeA', 0, 0, 0, 0.15, H, 14, { ...fa, solid: true, skip: '+x+y-y' });                         // west
  B.box('facadeA', 20.85, 0, 0, 21, H, 14, { ...fa, solid: true, skip: '-x+y-y' });                       // east
  B.box('facadeA', 0, 0, 0, 21, H, 0.15, { ...fa, solid: true, skip: '+z+y-y' });                         // north (never seen)
  B.box('facadeA', 0, 9.6, 13.85, 21, H, 14, { ...fa, skip: '-z+y-y' });                                  // south, third floor up
  B.box('facadeA', 12, Y2, 13.85, 15, 9.6, 14, { ...fa, skip: '-z+y-y' });
  B.box('facadeA', 0, FLOOR, 13.85, 15, Y2, 14, { ...fa, skip: '-z+y-y' });                               // south, first floor
  B.box('snowProp', -0.2, H, -0.2, 21.2, H + 0.4, 14.2, { uv: 4 });
  B.colliders.push({ x0: 0, z0: 0, x1: 21, z1: 4.45, y0: 0, y1: H });
  // what you can stand on
  B.platform(0, 0, 21, 14, 0);                                                                             // ground floor
  B.platform(0, 4.45, 14.5, 14, Y2);                                                                       // second floor
  B.platform(14.5, 4.6, 20.7, 7.2, Y2); B.platform(14.5, 4.6, 20.7, 7.2, FLOOR);                           // stair landings (north)
  B.platform(14.6, 11, 20.7, 13.7, 4.8); B.platform(14.6, 11, 20.7, 13.7, 1.6);                            // half landings (south)

  // ================================================================== SECOND FLOOR: flat 34 and the corridor
  const Y = Y2, C = Y + 2.9;
  B.box('ceiling', 0.15, Y - 0.3, 4.45, 14.5, Y - 0.02, 13.85, { uv: 3 });                                 // the slab (its underside is the lobby ceiling)
  B.box('woodfloor', 0.15, Y - 0.02, 7.1, 12.05, Y, 13.85, { uv: 2, skip: '-y' });
  B.box('lino', 0.15, Y - 0.02, 4.45, 14.5, Y, 7.1, { uv: 2, skip: '-y' });
  B.box('ceiling', 0.15, C, 4.45, 14.5, C + 0.3, 13.85, { uv: 3 });
  const WIN4 = [WIN(0.7), WIN(3.7), WIN(6.7), WIN(9.7)];
  B.wallX('wallpaper', 0.15, 12.05, 13.7, 13.85, Y, C, WIN4, { uv: 2 });
  B.wallX('concreteExt', 0, 12, 13.85, 14, Y, Y + FLOOR, WIN4, { uv: 3, solid: false });
  windowX(0.7, 2.3, Y + 0.9, Y + 2.3, 13.85, null);                                                        // the bedroom window is smashed: the cold comes in here
  windowX(3.7, 5.3, Y + 0.9, Y + 2.3, 13.85, 'glassA'); windowX(6.7, 8.3, Y + 0.9, Y + 2.3, 13.85, 'glassB'); windowX(9.7, 11.3, Y + 0.9, Y + 2.3, 13.85, 'glassA');
  B.box('wallpaper', 0.15, Y, 7.2, 0.3, C, 13.7, { uv: 2, solid: true });                                  // west wall
  B.wallZ('wallpaper', 7.2, 13.7, 5.9, 6.1, Y, C, [DOOR(8.6)], { uv: 2 });                                 // bedroom | living room
  B.wallX('wallpaper', 0.3, 12.05, 7.1, 7.2, Y, C, [DOOR(9.5)], { uv: 2 });                                // flat | corridor
  B.wallX('corridor', 0.3, 14.4, 7.0, 7.1, Y, C, [DOOR(9.5)], { uv: FLOOR, org: [0, Y, 0] });
  B.box('wallpaper', 11.9, Y, 7.2, 12.05, C, 13.7, { uv: 2, solid: true });                                // east wall of the flat
  B.box('corridor', 0.3, Y, 4.45, 14.4, C, 4.6, { uv: FLOOR, org: [0, Y, 0], solid: true });               // corridor north wall
  B.box('corridor', 0.15, Y, 4.6, 0.3, C, 7.0, { uv: FLOOR, org: [0, Y, 0], solid: true });                // corridor west end
  B.wallZ('corridor', 4.6, 7.0, 14.4, 14.45, Y, C, [DOOR(5.2, 1.1)], { uv: FLOOR, org: [0, Y, 0] });       // corridor east end -> stairs
  for (const z of [7.2, 13.7]) B.box('woodDark', 0.3, Y, z === 7.2 ? z : z - 0.03, 12, Y + 0.1, z === 7.2 ? z + 0.03 : z, {});   // skirting

  // --- bedroom (x 0.3..5.9, z 7.2..13.7)
  B.box('wood', 0.32, Y, 9.3, 2.55, Y + 0.28, 10.9, { solid: true }); B.box('wood', 0.3, Y, 9.3, 0.42, Y + 1.0, 10.9);          // bed frame + headboard
  B.solid(0.32, Y, 9.3, 2.55, Y + 0.6, 10.9);
  B.box('mattress', 0.45, Y + 0.28, 9.36, 2.5, Y + 0.48, 10.84, { uv: 0.5 }); B.rbox('white', 0.85, Y + 0.55, 10.1, 0.5, 0.14, 0.8, 0.08);
  B.rbox('blanket', 1.9, Y + 0.52, 10.2, 1.3, 0.1, 1.5, 0.12, { uv: 0.4 }); B.rbox('blanket', 2.5, Y + 0.3, 10.6, 0.5, 0.5, 1.0, 0.3, { uv: 0.4 });
  B.box('wood', 0.35, Y, 8.6, 0.85, Y + 0.5, 9.1, { solid: true }); B.box('black', 0.45, Y + 0.5, 8.72, 0.7, Y + 0.6, 8.95); B.geo('white', new THREE.CylinderGeometry(0.04, 0.035, 0.1, 8), { p: [0.6, Y + 0.55, 9.02] });
  B.box('woodDark', 0.5, Y, 7.22, 2.2, Y + 2.0, 7.8, { solid: true }); B.box('black', 1.33, Y + 0.1, 7.8, 1.36, Y + 1.9, 7.81);    // wardrobe
  B.box('rug', 1.6, Y, 9.0, 4.4, Y + 0.015, 11.6, { uv: 0.5 });
  B.box('woodDark', 5.5, Y, 11.2, 5.88, Y + 1.9, 13.2, { solid: true });                                                             // bookshelf
  for (let i = 0; i < 4; i++) { B.box('books', 5.46, Y + 0.25 + i * 0.42, 11.3, 5.52, Y + 0.52 + i * 0.42, 11.3 + 1.0 + rand() * 0.8, { uv: [0.8, 0.3] }); }
  for (const a of [0.9, 3.9]) { for (let i = 0; i < 8; i++) B.box('steel', a + 0.05 + i * 0.15, Y + 0.12, 13.52, a + 0.15 + i * 0.15, Y + 0.75, 13.66); }   // radiators under the windows
  B.box('curtain', 3.55, Y + 0.3, 13.6, 3.95, Y + 2.45, 13.63, { uv: 0.5 }); B.box('curtain', 5.2, Y + 0.9, 13.6, 5.5, Y + 2.45, 13.63, { uv: 0.5 });
  B.rbox('curtain', 2.45, Y + 1.5, 13.55, 0.5, 1.9, 0.03, 0.25, { uv: 0.5 });                                                         // the torn one by the smashed window
  B.rbox('wood', 3.9, Y + 0.25, 12.6, 0.45, 0.05, 0.45, 0.5); B.rbox('wood', 3.75, Y + 0.45, 12.75, 0.45, 0.5, 0.05, 0.5); for (const [dx, dz] of [[-0.15, -0.15], [0.15, 0.15]]) B.rbox('wood', 3.9 + dx, Y + 0.12, 12.6 + dz, 0.04, 0.25, 0.04, 0.5);   // toppled chair
  mound(1.5, Y, 13.25, 1.25, 0.26, 0.6); mound(2.7, Y, 13.35, 0.9, 0.15, 0.45); mound(0.8, Y, 12.7, 0.6, 0.12, 0.7); mound(1.9, Y, 12.5, 0.9, 0.07, 0.6); mound(1.5, Y + 0.9, 13.82, 0.85, 0.1, 0.2);          // snow blown in
  icicleRow(0.75, 13.86, 2.25, 13.86, Y + 2.3, 9, 0.55); icicleRow(3.75, 13.98, 5.25, 13.98, Y + 2.3, 6, 0.3);
  sign('drawing', '+x', 0.3, Y + 1.25, 11.6, 0.31, Y + 1.72, 12.2);
  B.box('woodDark', 8.6 - 0.04, Y, 5.86, 8.6, Y + 2.1, 6.14); B.box('woodDark', 9.6, Y, 5.86, 9.64, Y + 2.1, 6.14);                  // door frame between the rooms
  B.rbox('woodDark', 6.42, Y + 1.03, 8.52, 0.9, 2.06, 0.05, -1.25);                                                                  // that door stands open

  // --- living room and kitchen (x 6.1..11.9, z 7.2..13.7)
  B.box('fabric', 6.15, Y, 10.6, 7.05, Y + 0.42, 12.9, { uv: 0.4, solid: true }); B.box('fabric', 6.15, Y + 0.42, 10.6, 6.4, Y + 0.85, 12.9, { uv: 0.4 });   // sofa
  B.box('fabric', 6.15, Y + 0.42, 10.6, 7.05, Y + 0.62, 10.8, { uv: 0.4 }); B.box('fabric', 6.15, Y + 0.42, 12.7, 7.05, Y + 0.62, 12.9, { uv: 0.4 });
  B.rbox('blanket', 6.75, Y + 0.48, 11.9, 0.7, 0.12, 1.1, 0.2, { uv: 0.4 }); B.solid(6.15, Y, 10.6, 7.05, Y + 0.85, 12.9);
  B.box('wood', 8.3, Y + 0.7, 10.7, 9.7, Y + 0.76, 11.6, { uv: 0.7 }); for (const [x, z] of [[8.36, 10.76], [9.6, 10.76], [8.36, 11.5], [9.6, 11.5]]) B.box('wood', x, Y, z, x + 0.06, Y + 0.7, z + 0.06);
  B.solid(8.3, Y, 10.7, 9.7, Y + 0.76, 11.6); anchors.table = new THREE.Vector3(9.0, Y + 0.76, 11.15);
  for (const [x, z, r] of [[8.0, 11.2, 1.4], [9.2, 12.1, 3.3]]) { B.rbox('wood', x, Y + 0.45, z, 0.42, 0.05, 0.42, r); B.rbox('wood', x - Math.cos(r) * 0.19, Y + 0.68, z + Math.sin(r) * 0.19, 0.05, 0.45, 0.42, r); for (const k of [-1, 1]) B.rbox('wood', x + k * 0.15, Y + 0.22, z + k * 0.15, 0.04, 0.44, 0.04, r); }
  B.geo('white', new THREE.CylinderGeometry(0.035, 0.035, 0.09, 8), { p: [9.35, Y + 0.805, 10.95] }); B.rbox('paper', 8.6, Y + 0.765, 11.35, 0.21, 0.004, 0.3, 0.4);
  B.box('rug', 7.4, Y, 10.2, 10.4, Y + 0.015, 12.6, { uv: 0.5 });
  B.box('woodDark', 11.4, Y, 10.4, 11.88, Y + 0.55, 12.1, { solid: true }); B.box('black', 11.55, Y + 0.6, 10.6, 11.62, Y + 1.25, 11.9); sign('tvoff', '-x', 11.545, Y + 0.64, 10.64, 11.55, Y + 1.21, 11.86);   // dead television
  B.box('white', 6.2, Y, 7.25, 6.95, Y + 1.8, 7.95, { solid: true }); B.box('black', 6.9, Y + 1.15, 7.94, 6.93, Y + 1.5, 7.96);       // fridge
  sign('drawing', '+z', 6.3, Y + 1.2, 7.95, 6.72, Y + 1.52, 7.955);
  B.box('woodDark', 7.0, Y, 7.25, 9.3, Y + 0.88, 7.85, { solid: true }); B.box('steel', 6.98, Y + 0.88, 7.23, 9.32, Y + 0.92, 7.88); B.box('black', 8.0, Y + 0.921, 7.38, 8.6, Y + 0.925, 7.75);   // counter + sink
  B.box('woodDark', 7.0, Y + 1.5, 7.25, 9.3, Y + 2.2, 7.6); for (let i = 0; i < 4; i++) B.geo('steel', new THREE.CylinderGeometry(0.04, 0.04, 0.11, 8), { p: [7.2 + i * 0.16, Y + 0.975, 7.5 + (i % 2) * 0.12] });    // tins lined up
  B.box('woodDark', 10.75, Y, 7.25, 11.85, Y + 0.45, 7.6, { solid: true }); B.rbox('black', 11.0, Y + 0.52, 7.42, 0.28, 0.12, 0.1, 0.2); B.rbox('black', 11.4, Y + 0.52, 7.44, 0.28, 0.12, 0.1, -0.3);     // shoe rack, boots
  cyl('metalDark', 11.5, Y, 13.2, 0.14, 0.03); cyl('metalDark', 11.5, Y, 13.2, 0.02, 1.6, 6); cyl('fabric', 11.5, Y + 1.5, 13.2, 0.2, 0.3, 10, 0.13);     // standing lamp
  for (const a of [6.9, 9.9]) for (let i = 0; i < 8; i++) B.box('steel', a + 0.05 + i * 0.15, Y + 0.12, 13.52, a + 0.15 + i * 0.15, Y + 0.75, 13.66);
  icicleRow(6.75, 13.98, 8.25, 13.98, Y + 2.3, 5, 0.3); icicleRow(9.75, 13.98, 11.25, 13.98, Y + 2.3, 7, 0.4);
  sign('calendar', '-x', 11.89, Y + 1.3, 8.4, 11.9, Y + 1.85, 8.83);
  B.box('woodDark', 9.46, Y, 7.0, 9.5, Y + 2.14, 7.2); B.box('woodDark', 10.5, Y, 7.0, 10.54, Y + 2.14, 7.2); B.box('woodDark', 9.46, Y + 2.1, 7.0, 10.54, Y + 2.14, 7.2);     // front door frame
  anchors.aptDoor = new THREE.Vector3(10.0, Y, 7.1);

  // --- corridor (x 0.3..14.4, z 4.6..7.0)
  for (const [n, x] of [['d31', 1.6], ['d32', 5.4], ['d33', 9.2]]) { sign(n, '+z', x, Y, 4.6, x + 0.95, Y + 2.05, 4.61); B.box('woodDark', x - 0.05, Y, 4.6, x, Y + 2.1, 4.64); B.box('woodDark', x + 0.95, Y, 4.6, x + 1.0, Y + 2.1, 4.64); }
  sign('d35', '-z', 12.6, Y, 6.99, 13.55, Y + 2.05, 7.0);
  for (const x of [3, 8.5, 12.5]) B.box('white', x - 0.5, C - 0.06, 5.65, x + 0.5, C, 5.95);                                           // dead strip lights
  B.rbox('white', 5.6, C - 0.3, 5.8, 1.0, 0.06, 0.3, 0.3);
  B.rbox('carBlue', 4.2, Y + 0.3, 6.5, 0.75, 0.6, 0.3, 0.2, { solid: true }); B.rbox('rust', 5.2, Y + 0.14, 6.3, 0.6, 0.28, 0.45, -0.5); B.rbox('fabric', 7.4, Y + 0.2, 5.0, 0.5, 0.4, 0.35, 0.9, { uv: 0.4 });   // cases left behind
  for (let i = 0; i < 9; i++) B.rbox('paper', 1 + rand() * 12, Y + 0.004 + i * 0.001, 4.9 + rand() * 1.8, 0.21, 0.003, 0.3, rand() * 6);
  B.box('red', 13.9, Y + 0.4, 6.86, 14.15, Y + 1.0, 6.99);                                                                            // fire-hose box
  sign('exit', '-x', 14.39, Y + 2.25, 5.35, 14.4, Y + 2.55, 6.15, true); anchors.exitSign = new THREE.Vector3(14.3, Y + 2.4, 5.75);
  sign('evac', '+x', 0.3, Y + 0.9, 5.3, 0.31, Y + 2.1, 6.2);
  mound(0.9, Y, 5.0, 0.5, 0.12, 0.35);

  // ================================================================== STAIRWELL (x 14.6..20.7, z 4.6..13.7), three storeys
  const door1 = DOOR(5.2, 1.1);
  for (let k = 0; k < 3; k++) B.wallZ('concrete', 4.6, 13.7, 14.45, 14.6, k * FLOOR, (k + 1) * FLOOR, k === 1 ? [] : [door1], { uv: 3 });
  B.box('concrete', 14.6, 0, 4.45, 20.85, 9.6, 4.6, { uv: 3, solid: true }); B.box('concrete', 20.7, 0, 4.6, 20.85, 9.6, 13.7, { uv: 3, solid: true });
  const SW = [{ a: 15.7, b: 17.3, sill: 2.5, head: 3.9 }, { a: 18.7, b: 20.3, sill: 2.5, head: 3.9 }], SW2 = [WIN(15.7), WIN(18.7)];
  B.wallX('concrete', 14.6, 20.7, 13.7, 13.85, 0, 4.8, SW, { uv: 3 }); B.wallX('concrete', 14.6, 20.7, 13.7, 13.85, 4.8, 9.6, SW2, { uv: 3 });
  B.wallX('concreteExt', 15, 21, 13.85, 14, 0, 4.8, SW, { uv: 3, solid: false }); B.wallX('concreteExt', 15, 21, 13.85, 14, 4.8, 9.6, SW2, { uv: 3, solid: false });
  windowX(15.7, 17.3, 2.5, 3.9, 13.85, 'glassB'); windowX(18.7, 20.3, 2.5, 3.9, 13.85, 'glassA'); windowX(15.7, 17.3, 5.7, 7.1, 13.85, null); windowX(18.7, 20.3, 5.7, 7.1, 13.85, 'glassB');
  B.box('concrete', 14.6, 9.3, 4.6, 20.7, 9.6, 13.7, { uv: 3 });                                                                       // roof of the stairwell
  B.box('concrete', 14.6, -0.2, 4.6, 20.7, 0, 13.7, { uv: 3 });
  B.box('concrete', 17.5, 0, 7.2, 17.8, 9.3, 11.0, { uv: 3, solid: true });                                                           // the wall between the two flights
  for (const y of [Y2, FLOOR]) B.box('concrete', 14.6, y - 0.2, 4.6, 20.7, y, 7.2, { uv: 3 });
  for (const y of [4.8, 1.6]) B.box('concrete', 14.6, y - 0.2, 11.0, 20.7, y, 13.7, { uv: 3 });
  const flight = (x0, x1, yTop, dir) => {                                                                                              // dir +1: goes down towards the south; -1: down towards the north
    for (let i = 0; i < 10; i++) { const top = yTop - (i + 1) * 0.16, za = dir > 0 ? 7.2 + i * 0.38 : 11.0 - (i + 1) * 0.38; B.box('concrete', x0, top - 0.34, za, x1, top, za + 0.38, { uv: 3 }); }
    B.platform(x0, 7.2, x1, 11.0, dir > 0 ? (x, z) => yTop - 1.6 * Math.min(1, Math.max(0, (z - 7.2) / 3.8)) : (x, z) => yTop - 1.6 * Math.min(1, Math.max(0, (11.0 - z) / 3.8)));
  };
  flight(14.6, 17.5, Y2, 1); flight(17.8, 20.7, 4.8, -1); flight(14.6, 17.5, FLOOR, 1); flight(17.8, 20.7, 1.6, -1);
  B.box('metalDark', 14.6, 0, 7.2, 17.5, 2.6, 7.26, { solid: true }); for (let i = 0; i < 12; i++) B.box('black', 14.7 + i * 0.24, 0.1, 7.19, 14.74 + i * 0.24, 2.5, 7.2);   // cage under the stairs
  sign('fl2', '+z', 16.6, Y2 + 1.2, 4.6, 17.5, Y2 + 2.1, 4.61); sign('fl1', '+z', 16.6, FLOOR + 1.2, 4.6, 17.5, FLOOR + 2.1, 4.61); sign('flG', '+z', 16.6, 1.2, 4.6, 17.5, 2.1, 4.61);
  sign('graffiti', '-x', 20.69, 4.8 + 1.0, 11.2, 20.7, 4.8 + 1.85, 13.5); sign('graffiti', '-x', 20.69, 1.6 + 1.0, 11.2, 20.7, 1.6 + 1.85, 13.5);
  cyl('rust', 20.5, 0, 4.85, 0.07, 9.3, 8); cyl('rust', 20.3, 0, 4.85, 0.04, 9.3, 6);
  // the first-floor door is sealed in ice
  sign('d32', '+x', 14.6, FLOOR, 5.25, 14.61, FLOOR + 2.05, 6.25);
  for (const [x, y, z, s, sy] of [[14.9, 0.55, 5.6, 0.75, 1.1], [15.0, 1.5, 6.1, 0.6, 0.9], [14.95, 0.3, 6.55, 0.55, 0.5], [15.25, 0.25, 5.2, 0.4, 0.4], [14.85, 2.0, 5.5, 0.45, 0.5]])
    B.geo('ice', new THREE.IcosahedronGeometry(1, 0), { p: [x, FLOOR + y, z], r: [x * 3, z * 2, y], s: [s * 0.6, sy, s] });
  B.solid(14.6, FLOOR, 4.9, 15.5, FLOOR + 2.4, 7.0);
  icicleRow(14.7, 4.7, 20.6, 4.7, FLOOR - 0.2, 14, 0.5); icicleRow(14.7, 11.1, 20.6, 11.1, 4.6, 16, 0.6); icicleRow(15.75, 13.86, 17.25, 13.86, 7.1, 9, 0.6);
  mound(16.5, 4.8, 13.2, 1.0, 0.3, 0.55); mound(15.4, 4.8, 12.6, 0.5, 0.15, 0.4);
  anchors.iceDoor = new THREE.Vector3(15.2, FLOOR + 1.2, 5.8);

  // ================================================================== GROUND FLOOR: lobby and the caretaker's office
  B.box('ceiling', 0.15, 2.9, 4.45, 14.5, 3.2, 13.85, { uv: 3 });
  B.box('tiles', 6.1, -0.2, 4.6, 14.45, 0, 13.85, { uv: 1.6 }); B.box('lino', 0.15, -0.2, 7.2, 6.1, 0, 13.85, { uv: 2 });
  const G = [WIN(0.7), WIN(3.7), { a: 6.7, b: 8.3, sill: 0.5, head: 2.5 }, { a: 9.6, b: 11.4, sill: 0, head: 2.4 }, { a: 12.6, b: 14.2, sill: 0.5, head: 2.5 }];
  B.wallX('lobbywall', 0.15, 14.45, 13.7, 13.85, 0, 2.9, G, { uv: FLOOR });
  B.wallX('concreteExt', 0, 15, 13.85, 14, 0, FLOOR, G, { uv: 3, solid: false });
  windowX(0.7, 2.3, 0.9, 2.3, 13.85, 'glassB'); windowX(3.7, 5.3, 0.9, 2.3, 13.85, 'glassB'); windowX(6.7, 8.3, 0.5, 2.5, 13.85, 'glassA'); windowX(12.6, 14.2, 0.5, 2.5, 13.85, 'glassA');
  for (const a of [0.7, 3.7]) for (let i = 0; i < 5; i++) B.rbox('plank', a + 0.8, 1.0 + i * 0.29, 13.66, 1.8, 0.2, 0.03, (rand() - 0.5) * 0.08, { uv: 0.6 });   // office windows boarded from inside
  B.wallZ('lobbywall', 7.2, 13.7, 5.9, 6.1, 0, 2.9, [DOOR(9.4)], { uv: FLOOR });                                                      // office | lobby
  B.box('lobbywall', 0.3, 0, 7.0, 6.1, 2.9, 7.2, { uv: FLOOR, solid: true }); B.box('lobbywall', 5.9, 0, 4.6, 6.1, 2.9, 7.0, { uv: FLOOR, solid: true });
  B.box('lobbywall', 6.1, 0, 4.45, 14.45, 2.9, 4.6, { uv: FLOOR, solid: true }); B.box('lobbywall', 0.15, 0, 7.2, 0.3, 2.9, 13.7, { uv: FLOOR, solid: true });
  B.wallZ('lobbywall', 4.6, 13.7, 14.4, 14.45, 0, 2.9, [door1], { uv: FLOOR });
  // lobby furniture
  sign('mailboxes', '+x', 6.1, 0.7, 4.9, 6.11, 1.9, 6.7); B.box('metalDark', 6.1, 0.65, 4.85, 6.16, 1.95, 6.75);
  sign('evac', '+z', 11.2, 0.8, 4.6, 12.1, 2.05, 4.61); B.box('woodDark', 11.1, 0.7, 4.6, 12.2, 2.15, 4.605);
  B.box('steel', 7.4, 0, 4.6, 8.3, 2.15, 4.66); B.box('steel', 8.9, 0, 4.6, 9.4, 2.15, 4.66); B.box('black', 8.3, 0, 4.6, 8.9, 2.15, 4.62); B.box('metalDark', 7.3, 2.15, 4.6, 9.5, 2.3, 4.68);   // the lift, stuck half open
  B.box('steel', 9.55, 1.0, 4.6, 9.67, 1.25, 4.63);
  B.box('wood', 12.4, 0.4, 11.0, 14.3, 0.46, 11.5, { solid: true }); B.box('metalDark', 12.5, 0, 11.1, 12.56, 0.4, 11.4); B.box('metalDark', 14.14, 0, 11.1, 14.2, 0.4, 11.4); B.solid(12.4, 0, 11.0, 14.3, 0.5, 11.5);    // bench
  cyl('rust', 13.4, 0, 12.9, 0.26, 0.5, 10, 0.32); cyl('woodDark', 13.4, 0.5, 12.9, 0.035, 1.0, 6); for (let i = 0; i < 5; i++) B.rbox('metalGreen', 13.4 + Math.cos(i * 1.3) * 0.3, 1.45 - i * 0.05, 12.9 + Math.sin(i * 1.3) * 0.3, 0.7, 0.02, 0.12, i * 1.3);    // dead palm
  B.solid(13.1, 0, 12.6, 13.7, 1.5, 13.2);
  B.box('rug', 9.3, 0, 12.4, 11.7, 0.02, 13.6, { uv: 0.5 });
  mound(10.5, 0, 13.5, 1.1, 0.16, 0.3); mound(7.5, 0.5, 13.8, 0.85, 0.1, 0.2);
  B.rbox('carYellow', 8.2, 0.3, 9.4, 0.04, 0.62, 0.34, 0.35); B.rbox('carYellow', 8.38, 0.3, 9.4, 0.04, 0.62, 0.34, -0.35 + 0.7);                     // fallen "wet floor" sign
  for (const x of [8, 12]) for (const z of [7, 10.5]) B.box('white', x - 0.5, 2.84, z - 0.15, x + 0.5, 2.9, z + 0.15);
  B.box('metalDark', 9.56, 0, 13.66, 9.6, 2.44, 13.9); B.box('metalDark', 11.4, 0, 13.66, 11.44, 2.44, 13.9); B.box('metalDark', 9.56, 2.4, 13.66, 11.44, 2.44, 13.9);    // main door frame
  icicleRow(9.7, 14.02, 11.3, 14.02, 2.4, 8, 0.4); icicleRow(0, 14.03, 15, 14.03, FLOOR, 40, 0.7);
  anchors.mainDoor = new THREE.Vector3(10.5, 0, 13.8);
  B.box('woodDark', 5.86, 0, 9.36, 6.14, 2.14, 9.4); B.box('woodDark', 5.86, 0, 10.4, 6.14, 2.14, 10.44); B.box('woodDark', 5.86, 2.1, 9.36, 6.14, 2.14, 10.44);
  anchors.officeDoor = new THREE.Vector3(6.0, 0, 9.9); anchors.keypad = new THREE.Vector3(6.12, 1.3, 10.7);
  B.box('metalDark', 6.1, 1.12, 10.6, 6.14, 1.48, 10.82); sign('keypad', '+x', 6.14, 1.14, 10.62, 6.145, 1.46, 10.8);
  // office
  B.box('wood', 1.6, 0.7, 9.2, 3.5, 0.76, 10.1, { uv: 0.7 }); B.box('woodDark', 1.65, 0, 9.25, 2.2, 0.7, 10.05); B.box('woodDark', 3.4, 0, 9.25, 3.45, 0.7, 10.05); B.solid(1.6, 0, 9.2, 3.5, 0.76, 10.1);
  B.rbox('metalDark', 2.6, 0.45, 8.6, 0.45, 0.06, 0.45, 0.4); B.rbox('metalDark', 2.6, 0.7, 8.4, 0.45, 0.5, 0.05, 0.4); cyl('metalDark', 2.6, 0, 8.6, 0.03, 0.42, 6);
  B.rbox('metalDark', 2.5, 0.82, 9.6, 0.36, 0.12, 0.22, 0.25); sign('radio', '+z', 2.32, 0.76, 9.72, 2.68, 0.98, 9.725); B.box('woodDark', 2.3, 0.76, 9.5, 2.7, 0.99, 9.72);   // the radio
  anchors.radio = new THREE.Vector3(2.5, 0.9, 9.75);
  B.geo('steel', new THREE.CylinderGeometry(0.07, 0.085, 0.2, 10), { p: [3.2, 0.86, 9.5] }); B.rbox('paper', 1.95, 0.765, 9.7, 0.22, 0.01, 0.3, -0.2);
  B.box('metalGreen', 0.35, 0, 7.25, 1.35, 1.9, 7.75, { solid: true }); B.box('metalGreen', 1.45, 0, 7.25, 2.0, 1.3, 7.8, { solid: true });                 // lockers, filing cabinet
  B.box('wood', 3.0, 0.9, 7.22, 5.7, 0.94, 7.55); B.box('wood', 3.0, 1.5, 7.22, 5.7, 1.54, 7.55); for (let i = 0; i < 6; i++) B.rbox(['rust', 'carBlue', 'white', 'woodDark'][i % 4], 3.3 + i * 0.42, (i % 2 ? 1.54 : 0.94) + 0.11, 7.4, 0.3, 0.22, 0.24, rand() * 0.4);
  B.box('plank', 0.3, 1.0, 11.0, 0.33, 2.0, 12.6, { uv: 0.6 }); anchors.toolboard = new THREE.Vector3(0.36, 1.45, 11.8);                                   // tool board (the crowbar hangs here)
  B.rbox('steel', 0.36, 1.75, 11.25, 0.03, 0.3, 0.06, 0); B.rbox('rust', 0.36, 1.3, 12.35, 0.03, 0.45, 0.08, 0); B.rbox('rust', 0.36, 1.2, 11.2, 0.03, 0.12, 0.3, 0);
  B.box('metalDark', 3.9, 0, 12.0, 5.8, 0.3, 12.8, { solid: true }); B.box('blanket', 3.95, 0.3, 12.05, 5.75, 0.42, 12.75, { uv: 0.4 }); B.rbox('fabric', 4.3, 0.47, 12.4, 0.5, 0.1, 0.4, 0.2, { uv: 0.4 });      // camp bed
  cyl('rust', 5.3, 0, 8.0, 0.2, 0.34, 10); sign('calendar', '+x', 0.3, 1.3, 9.3, 0.31, 1.95, 9.8);
  for (const x of [1.5, 4.5]) B.box('white', x - 0.5, 2.84, 10.2, x + 0.5, 2.9, 10.5);
  anchors.logbook = new THREE.Vector3(1.95, 0.78, 9.7);

  // ================================================================== things that move (their own meshes)
  const pivotDoor = (matKey, w, h, x, y, z, ry, hingeLeft = true) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), mats[matKey]); m.position.set(hingeLeft ? w / 2 : -w / 2, h / 2, 0); m.castShadow = true; m.receiveShadow = true; g.add(m); return g;
  };
  // flat 34's front door (hinge on the west side, opens into the corridor)
  dyn.aptDoor = pivotDoor('woodDark', 1.0, 2.08, 9.5, Y, 7.1, 0); dyn.aptDoorSolid = B.solid(9.5, Y, 7.0, 10.5, Y + 2.1, 7.2);
  { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), mats.paper); p.position.set(0.5, 1.45, 0.03); dyn.aptDoor.add(p); dyn.doorNote = p; }
  dyn.officeDoor = pivotDoor('metalGreen', 1.0, 2.08, 6.0, 0, 9.4, -Math.PI / 2); dyn.officeDoorSolid = B.solid(5.9, 0, 9.4, 6.1, 2.1, 10.4);
  // the stair doors stand ajar
  for (const y of [0, Y2]) { dyn['stairDoor' + y] = pivotDoor('metalGreen', 1.08, 2.08, 14.52, y, 5.2, -Math.PI / 2 - 1.9); }
  // main doors: two glass leaves, frozen over
  const leaf = (x, left) => { const g = new THREE.Group(); g.position.set(x, 0, 13.78); const fr = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.38, 0.05), mats.metalDark); fr.scale.set(1, 1, 1); const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 2.0), mats.glassB); gl.position.set(left ? 0.45 : -0.45, 1.25, 0.0);
    const bars = new THREE.Group(); for (const [bx, by, bw, bh] of [[0, 0.06, 0.9, 0.12], [0, 2.32, 0.9, 0.12], [-0.41, 1.19, 0.08, 2.38], [0.41, 1.19, 0.08, 2.38]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.05), mats.metalDark); b.position.set((left ? 0.45 : -0.45) + bx, by, 0); b.castShadow = true; bars.add(b); }
    g.add(bars, gl); return g; };
  dyn.exitL = leaf(9.6, true); dyn.exitR = leaf(11.4, false); dyn.exitSolid = B.solid(9.6, 0, 13.6, 11.4, 2.4, 14.0);
  { const g = new THREE.Group(), geo = new THREE.IcosahedronGeometry(1, 0);                      // jagged slabs of ice across both leaves
    for (const [x, y, s, sy, sz] of [[9.85, 0.45, 0.55, 0.75, 0.3], [10.45, 0.3, 0.7, 0.5, 0.34], [11.1, 0.5, 0.55, 0.8, 0.3], [10.15, 1.25, 0.6, 0.8, 0.24], [10.85, 1.35, 0.6, 0.75, 0.26], [10.5, 2.0, 0.85, 0.5, 0.22], [9.8, 1.9, 0.4, 0.6, 0.2], [11.2, 1.95, 0.4, 0.55, 0.2], [10.5, 0.95, 0.5, 0.55, 0.3]]) {
      const m = new THREE.Mesh(geo, mats.ice); m.position.set(x, y, 13.6); m.scale.set(s, sy, sz); m.rotation.set(x * 2.3, y * 3.1, x + y); m.castShadow = true; g.add(m); }
    dyn.exitIce = g; }
  // things to pick up
  { const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 10), mats.metalDark), head = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.024, 0.06, 12), mats.steel), lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), mats.cold);
    body.rotation.x = Math.PI / 2; head.rotation.x = Math.PI / 2; head.position.z = 0.11; lens.position.z = 0.141; g.add(body, head, lens); g.position.set(9.0, Y + 0.76 + 0.036, 11.15); g.rotation.y = -2.0; dyn.torch = g; }
  { const g = new THREE.Group(); const bar = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.7, 0.03), mats.red), hook = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.14), mats.red); hook.position.set(0, 0.34, 0.06); const tip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.09, 0.05), mats.steel); tip.position.set(0, -0.37, 0.01);
    g.add(bar, hook, tip); g.position.set(0.37, 1.5, 11.8); g.rotation.x = 0.15; dyn.crowbar = g; }
  const noteMesh = (x, y, z, ry = 0, flat = true) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), mats.paper); m.position.set(x, y, z); if (flat) m.rotation.set(-Math.PI / 2, 0, ry); else m.rotation.y = ry; return m; };
  dyn.notes = { corridor: noteMesh(4.75, Y + 0.012, 5.6, 0.5), logbook: noteMesh(1.95, 0.78, 9.7, -0.2) };
  { const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.1), new THREE.MeshStandardMaterial({ color: 0x100404, emissive: 0xff2010, emissiveIntensity: 4 })); m.position.set(6.15, 1.445, 10.71); dyn.keypadLed = m; }

  // ================================================================== the city outside
  const city = buildCity({ B, mats, R, rand, sign, mound, cyl, icicles, icicleRow, fires, glows, spots, anchors, dyn });

  // ================================================================== bake
  const group = B.finish(mats);
  { const geo = new THREE.ConeGeometry(1, 1, 5); geo.translate(0, -0.5, 0); const im = new THREE.InstancedMesh(geo, mats.icicle, icicles.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    icicles.forEach((c, i) => { p.set(c.x, c.y, c.z); s.set(c.r, c.len, c.r); im.setMatrixAt(i, m4.compose(p, q, s)); }); im.castShadow = false; im.frustumCulled = false; group.add(im); }
  for (const k of ['aptDoor', 'officeDoor', 'stairDoor0', 'stairDoor' + Y2, 'exitL', 'exitR', 'exitIce', 'torch', 'crowbar', 'keypadLed']) group.add(dyn[k]);
  for (const k in dyn.notes) group.add(dyn.notes[k]);
  group.add(city.group);
  return { group, colliders: B.colliders, platforms: B.platforms, dyn, anchors, fires, glows, spots, snowH: city.snowH, trail: city.trail, updateCity: city.update };
}
