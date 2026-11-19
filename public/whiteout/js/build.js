// Level-building helpers: everything static is collected per material and merged into a handful of meshes,
// so a whole building costs a few draw calls. Also keeps the lists the player collides with and stands on.
import * as THREE from './three.js';

const FACES = [
  // normal, u axis, v axis (indices into x,y,z)
  { n: [1, 0, 0], u: 2, v: 1, flip: true }, { n: [-1, 0, 0], u: 2, v: 1, flip: false },
  { n: [0, 1, 0], u: 0, v: 2, flip: true }, { n: [0, -1, 0], u: 0, v: 2, flip: false },
  { n: [0, 0, 1], u: 0, v: 1, flip: false }, { n: [0, 0, -1], u: 0, v: 1, flip: true },
];
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();

export class Builder {
  constructor() {
    this.groups = new Map();   // material key -> { pos, nor, uv, idx }
    this.colliders = [];       // { x0, z0, x1, z1, y0, y1 } solid boxes
    this.platforms = [];       // { x0, z0, x1, z1, h } things to stand on (h is a number or a function of x,z)
  }
  _g(key) { let g = this.groups.get(key); if (!g) { g = { pos: [], nor: [], uv: [], idx: [] }; this.groups.set(key, g); } return g; }

  // Axis-aligned box from corner to corner. Texture repeats every `uv` metres, so every wall has the same grain.
  // o.solid: also blocks the player. o.skip: string of faces to leave out ('+x-x+y-y+z-z'). o.uv: metres per repeat (or [across, up]). o.org: where the texture starts.
  box(key, x0, y0, z0, x1, y1, z1, o = {}) {
    if (x1 < x0) [x0, x1] = [x1, x0]; if (y1 < y0) [y0, y1] = [y1, y0]; if (z1 < z0) [z0, z1] = [z1, z0];
    const g = this._g(key), s = o.uv || 1, su = Array.isArray(s) ? s[0] : s, sv = Array.isArray(s) ? s[1] : s, org = o.org || [0, 0, 0];
    const lo = [x0, y0, z0], hi = [x1, y1, z1], skip = o.skip || '';
    const names = ['+x', '-x', '+y', '-y', '+z', '-z'];
    for (let f = 0; f < 6; f++) {
      if (skip.includes(names[f])) continue;
      const F = FACES[f], a = F.n[0] ? 0 : F.n[1] ? 1 : 2, pos = F.n[a] > 0 ? hi[a] : lo[a], base = g.pos.length / 3;
      for (let k = 0; k < 4; k++) {
        const uu = k === 1 || k === 2 ? 1 : 0, vv = k >= 2 ? 1 : 0, p = [0, 0, 0];
        p[a] = pos; p[F.u] = uu ? hi[F.u] : lo[F.u]; p[F.v] = vv ? hi[F.v] : lo[F.v];
        g.pos.push(p[0], p[1], p[2]); g.nor.push(F.n[0], F.n[1], F.n[2]);
        g.uv.push((f === 0 || f === 5 ? -1 : 1) * (p[F.u] - org[F.u]) / su, (p[F.v] - org[F.v]) / sv);   // mirrored on two sides so writing reads the right way round
      }
      if (F.flip) g.idx.push(base, base + 2, base + 1, base, base + 3, base + 2); else g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    if (o.solid) this.colliders.push({ x0, z0, x1, z1, y0, y1 });
    return this;
  }
  // Box stretched over a 0..1 texture (signs, posters, doors): the picture shows once on the chosen face.
  panel(key, x0, y0, z0, x1, y1, z1, face, o = {}) {
    const g = this._g(key), f = ['+x', '-x', '+y', '-y', '+z', '-z'].indexOf(face), F = FACES[f];
    const lo = [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], hi = [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)];
    const a = F.n[0] ? 0 : F.n[1] ? 1 : 2, pos = F.n[a] > 0 ? hi[a] : lo[a], base = g.pos.length / 3;
    const mirror = (face === '+x' || face === '-z' || face === '-y') ? 1 : 0; // keep writing the right way round
    const r = o.rect || [0, 0, 1, 1];
    for (let k = 0; k < 4; k++) {
      const uu = k === 1 || k === 2 ? 1 : 0, vv = k >= 2 ? 1 : 0, p = [0, 0, 0];
      p[a] = pos; p[F.u] = uu ? hi[F.u] : lo[F.u]; p[F.v] = vv ? hi[F.v] : lo[F.v];
      g.pos.push(p[0], p[1], p[2]); g.nor.push(F.n[0], F.n[1], F.n[2]);
      const tu = mirror ? 1 - uu : uu, tv = face === '+y' ? 1 - vv : vv;
      g.uv.push(r[0] + tu * (r[2] - r[0]), r[1] + tv * (r[3] - r[1]));
    }
    if (F.flip) g.idx.push(base, base + 2, base + 1, base, base + 3, base + 2); else g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return this;
  }
  // Any three.js geometry, placed with a matrix (or position/rotation/scale shorthand).
  geo(key, geometry, m) {
    const g = this._g(key);
    if (!(m instanceof THREE.Matrix4)) {
      const { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = m || {};
      m = new THREE.Matrix4().compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2], r[3] || 'XYZ')), Array.isArray(s) ? new THREE.Vector3(...s) : new THREE.Vector3(s, s, s));
    }
    const geo = geometry.index ? geometry : geometry.clone(); // non-indexed is fine too
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, base = g.pos.length / 3;
    _nm.getNormalMatrix(m);
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(m); g.pos.push(_v.x, _v.y, _v.z);
      if (N) { _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize(); g.nor.push(_n.x, _n.y, _n.z); } else g.nor.push(0, 1, 0);
      if (U) g.uv.push(U.getX(i), U.getY(i)); else g.uv.push(0, 0);
    }
    if (geo.index) { const I = geo.index; for (let i = 0; i < I.count; i++) g.idx.push(base + I.getX(i)); } else for (let i = 0; i < P.count; i++) g.idx.push(base + i);
    return this;
  }
  // Box turned about the vertical axis (furniture, cars). Centre, size, angle.
  rbox(key, cx, cy, cz, w, h, d, ry = 0, o = {}) {
    const tmp = new Builder(); tmp.box(key, -w / 2, -h / 2, -d / 2, w / 2, h / 2, d / 2, o);
    const src = tmp.groups.get(key), g = this._g(key), base = g.pos.length / 3, c = Math.cos(ry), s = Math.sin(ry);
    for (let i = 0; i < src.pos.length; i += 3) {
      const x = src.pos[i], y = src.pos[i + 1], z = src.pos[i + 2], nx = src.nor[i], nz = src.nor[i + 2];
      g.pos.push(cx + x * c + z * s, cy + y, cz - x * s + z * c); g.nor.push(nx * c + nz * s, src.nor[i + 1], -nx * s + nz * c);
    }
    for (const u of src.uv) g.uv.push(u); for (const i of src.idx) g.idx.push(base + i);
    if (o.solid) this.colliders.push({ cx, cz, hx: w / 2, hz: d / 2, ry, y0: cy - h / 2, y1: cy + h / 2 });   // a turned box
    return this;
  }
  solid(x0, y0, z0, x1, y1, z1) { this.colliders.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1 }); return this.colliders[this.colliders.length - 1]; }
  post(cx, cz, r, y0, y1) { this.colliders.push({ cx, cz, r, y0, y1 }); }                                    // a round thing (lamp post, barrel)
  platform(x0, z0, x1, z1, h) { this.platforms.push({ x0, z0, x1, z1, h }); }

  // A wall running along X (at z from zA to zB thick) with door and window holes cut out.
  // holes: [{ a, b, sill, head }] in world x; sill/head are heights above y0. Returns nothing; pieces are solid.
  wallX(key, xa, xb, zA, zB, y0, y1, holes = [], o = {}) { this._wall(key, 0, xa, xb, zA, zB, y0, y1, holes, o); }
  // A wall running along Z (at x from xA to xB thick).
  wallZ(key, za, zb, xA, xB, y0, y1, holes = [], o = {}) { this._wall(key, 1, za, zb, xA, xB, y0, y1, holes, o); }
  _wall(key, axis, a, b, tA, tB, y0, y1, holes, o) {
    const put = (s, e, ya, yb) => { if (e - s < 1e-4 || yb - ya < 1e-4) return; const so = { ...o, solid: o.solid !== false }; if (axis === 0) this.box(key, s, ya, tA, e, yb, tB, so); else this.box(key, tA, ya, s, tB, yb, e, so); };
    let cur = a;
    for (const h of [...holes].sort((p, q) => p.a - q.a)) {
      put(cur, h.a, y0, y1);
      if (h.sill > 0) put(h.a, h.b, y0, y0 + h.sill);
      if (y0 + h.head < y1) put(h.a, h.b, y0 + h.head, y1);
      cur = h.b;
    }
    put(cur, b, y0, y1);
  }

  // Turn everything collected into meshes.
  finish(materials, { shadows = true } = {}) {
    const group = new THREE.Group();
    for (const [key, g] of this.groups) {
      const mat = materials[key]; if (!mat) { console.warn('no material', key); continue; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.uv, 2));
      geo.setIndex(g.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(g.idx, 1) : new THREE.Uint16BufferAttribute(g.idx, 1));
      geo.computeBoundingSphere(); geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mat); mesh.name = key;
      const ud = mat.userData || {};
      mesh.castShadow = shadows && !ud.noCast; mesh.receiveShadow = !ud.noReceive;
      if (ud.renderOrder) mesh.renderOrder = ud.renderOrder;
      mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      group.add(mesh);
    }
    this.groups.clear();
    return group;
  }
}

// ---- small maths helpers shared by the world and the textures ----
export function hash2(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const sm = (t) => t * t * (3 - 2 * t);
export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
export function fbm(x, y, oct = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
// Repeatable random numbers so the city is the same every time.
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
