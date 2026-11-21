// KIT: surfaces painted in code (no picture files to download): concrete, wallpaper, wood, tiles, snow, ice, frosted glass,
// building fronts. makeMaterials() returns a ready set; a game can also call the painters one by one. Each gets relief (a bump map) too.
import * as THREE from './three.js';
import { hash2, rng } from './build.js';

export const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const sm = (t) => t * t * (3 - 2 * t);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const sstep = (a, b, v) => sm(clamp((v - a) / (b - a)));
const mix = (a, b, t) => a + (b - a) * t;

// Noise that repeats exactly, so tiled textures have no seams. u,v in 0..1; px,py = lattice size.
function pn(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
  const X0 = ((xi % px) + px) % px, X1 = (X0 + 1) % px, Y0 = ((yi % py) + py) % py, Y1 = (Y0 + 1) % py, o = seed * 131;
  const a = hash2(X0 + o, Y0 - o), b = hash2(X1 + o, Y0 - o), c = hash2(X0 + o, Y1 - o), d = hash2(X1 + o, Y1 - o);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}
export function tf(u, v, px, py, oct = 4, seed = 0) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++) { s += a * pn(u * px, v * py, px, py, seed + i); n += a; px *= 2; py *= 2; a *= 0.5; } return s / n; }

export function pix(w, h, fn) {
  const c = cv(w, h), g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data; let i = 0; const out = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { out[3] = 255; fn(x / w, y / h, out); d[i++] = out[0]; d[i++] = out[1]; d[i++] = out[2]; d[i++] = out[3]; }
  g.putImageData(im, 0, 0); return c;
}
export function tex(c, { srgb = true, repeat = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; return t;
}
// Height field -> normal map.
export function normalMap(size, hf, strength) {
  const H = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = hf(x / size, y / size);
  const at = (x, y) => H[((y + size) % size) * size + ((x + size) % size)];
  let k = 0; const c = cv(size, size), g = c.getContext('2d'), im = g.createImageData(size, size), d = im.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let nx = (at(x - 1, y) - at(x + 1, y)) * strength, ny = (at(x, y - 1) - at(x, y + 1)) * strength; const l = Math.hypot(nx, ny, 1);
    d[k++] = (nx / l * 0.5 + 0.5) * 255; d[k++] = (-ny / l * 0.5 + 0.5) * 255; d[k++] = (1 / l * 0.5 + 0.5) * 255; d[k++] = 255;
  }
  g.putImageData(im, 0, 0); return c;
}

// Relief from a painted picture: dark lines (joints, cracks, gaps between planks) become grooves, pale patches stand proud.
export function reliefFrom(canvas, strength = 2.2) {
  const w = canvas.width, h = canvas.height, src = canvas.getContext('2d').getImageData(0, 0, w, h).data, H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) H[i] = (src[i * 4] * 0.3 + src[i * 4 + 1] * 0.59 + src[i * 4 + 2] * 0.11) / 255;
  const at = (x, y) => H[((y + h) % h) * w + ((x + w) % w)], c = cv(w, h), g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data; let k = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const nx = (at(x - 1, y) - at(x + 1, y)) * strength, ny = (at(x, y - 1) - at(x, y + 1)) * strength, l = Math.hypot(nx, ny, 1);
    d[k++] = (nx / l * 0.5 + 0.5) * 255; d[k++] = (-ny / l * 0.5 + 0.5) * 255; d[k++] = (1 / l * 0.5 + 0.5) * 255; d[k++] = 255; }
  g.putImageData(im, 0, 0); return c;
}
// ---------------------------------------------------------------- surfaces
export function concrete(seed, base = 112, frost = 0.5) {
  return pix(512, 512, (u, v, o) => {
    const big = tf(u, v, 4, 4, 5, seed), fine = tf(u, v, 48, 48, 2, seed + 9), streak = tf(u, v, 28, 2, 3, seed + 3);
    let c = base + 46 * (big - 0.5) + 26 * (fine - 0.5) - 34 * Math.max(0, streak - 0.55);
    const seam = Math.min(Math.abs(((v * 2) % 1) - 0.5), Math.abs(((u * 2 + 0.5) % 1) - 0.5)); if (seam > 0.493) c -= 22;
    const pit = tf(u, v, 90, 90, 1, seed + 5); if (pit > 0.83) c -= 30;
    const f = frost * sstep(0.55, 0.78, tf(u, v, 6, 6, 4, seed + 7));
    o[0] = mix(c * 0.94, 214, f); o[1] = mix(c * 0.985, 228, f); o[2] = mix(c * 1.05, 242, f);
  });
}
export function wallpaper() {
  return pix(512, 512, (u, v, o) => {
    const stripe = Math.sin(u * Math.PI * 2 * 12), dot = Math.sin(u * Math.PI * 48) * Math.sin(v * Math.PI * 48);
    const dirt = tf(u, v, 4, 4, 4, 1), damp = tf(u, v, 9, 2, 3, 2), fine = tf(u, v, 64, 64, 2, 3);
    let r = 164 + stripe * 8 + (dot > 0.75 ? -16 : 0), g = 156 + stripe * 7 + (dot > 0.75 ? -9 : 0), b = 126 + stripe * 5;
    const k = 0.82 + 0.26 * dirt - 0.32 * Math.max(0, damp - 0.52) + 0.08 * (fine - 0.5); r *= k; g *= k; b *= k * 1.03;
    const peel = tf(u, v, 3, 3, 4, 4);                                         // a few places where the paper has come away
    if (peel > 0.7) { const e = sstep(0.7, 0.74, peel), p = 158 + 22 * (fine - 0.5); r = mix(r * 0.82, p, e); g = mix(g * 0.82, p * 0.99, e); b = mix(b * 0.82, p * 0.98, e); }
    const fr = 0.5 * sstep(0.58, 0.86, tf(u, v, 5, 5, 4, 6)); o[0] = mix(r, 215, fr); o[1] = mix(g, 228, fr); o[2] = mix(b, 240, fr);
  });
}
// Two-tone painted wall: one repeat = one storey (bottom of the picture is the floor).
export function twoTone(lower, upper, seed, tiles = false) {
  return pix(512, 512, (u, v, o) => {
    const h = 1 - v, dirt = tf(u, v, 5, 5, 4, seed), fine = tf(u, v, 60, 60, 2, seed + 1), drip = tf(u, v, 30, 2, 3, seed + 2);
    const low = h < 0.42, c = low ? lower : upper; let k = 0.74 + 0.42 * dirt + 0.12 * (fine - 0.5) - 0.25 * Math.max(0, drip - 0.6);
    if (Math.abs(h - 0.42) < 0.006) k *= 0.55;
    if (low && tiles) { const gx = (u * 16) % 1, gy = (h * 16) % 1; if (gx < 0.05 || gy < 0.05) k *= 0.62; else k *= 1.05; }
    if (h < 0.05) k *= 0.6 + h * 8;
    const mould = sstep(0.7, 0.8, tf(u, v, 8, 8, 4, seed + 5)) * (h > 0.6 ? 0.45 : 0.15); k *= 1 - mould;
    const fr = 0.5 * sstep(0.62, 0.84, tf(u, v, 6, 6, 4, seed + 7)) * (low ? 1 : 0.6);
    o[0] = mix(c[0] * k, 214, fr); o[1] = mix(c[1] * k, 228, fr); o[2] = mix(c[2] * k, 242, fr);
  });
}
export function ceilingTex() {
  return pix(256, 256, (u, v, o) => {
    const dirt = tf(u, v, 4, 4, 4, 11), crack = Math.abs(tf(u, v, 7, 7, 3, 12) - 0.5), damp = tf(u, v, 3, 3, 3, 13);
    let c = 150 + 30 * (dirt - 0.5) - 45 * sstep(0.6, 0.8, damp); if (crack < 0.006) c -= 40;
    o[0] = c; o[1] = c; o[2] = c * 1.02;
  });
}
export function woodFloor() {
  return pix(512, 512, (u, v, o) => {
    const n = 10, pi = Math.floor(u * n), pu = u * n - pi, ph = hash2(pi, 77), vv = (v + ph) % 1;
    const grain = tf(u * 1, vv, 40, 3, 3, 20 + pi % 5), tone = 0.75 + 0.4 * ph + 0.25 * (grain - 0.5);
    let r = 104 * tone, g = 74 * tone, b = 48 * tone;
    if (pu < 0.04 || pu > 0.97) { r *= 0.4; g *= 0.4; b *= 0.4; }
    if (Math.abs(((vv * 2) % 1) - 0.5) > 0.495) { r *= 0.45; g *= 0.45; b *= 0.45; }
    const dirt = tf(u, v, 6, 6, 4, 22); r *= 0.7 + 0.5 * dirt; g *= 0.7 + 0.5 * dirt; b *= 0.7 + 0.5 * dirt;
    const fr = 0.42 * sstep(0.5, 0.95, tf(u, v, 2, 2, 5, 23)); o[0] = mix(r, 200, fr); o[1] = mix(g, 214, fr); o[2] = mix(b, 232, fr);
  });
}
export function lino(seed, base) {
  return pix(256, 256, (u, v, o) => {
    const sp = tf(u, v, 90, 90, 1, seed), dirt = tf(u, v, 5, 5, 4, seed + 1), scuff = tf(u, v, 3, 20, 3, seed + 2);
    let k = 0.7 + 0.45 * dirt + (sp > 0.7 ? 0.12 : 0) - 0.2 * Math.max(0, scuff - 0.6);
    if ((u * 2) % 1 < 0.012 || (v * 2) % 1 < 0.012) k *= 0.6;
    const fr = 0.4 * sstep(0.5, 0.95, tf(u, v, 2, 2, 5, seed + 4)); o[0] = mix(base[0] * k, 200, fr); o[1] = mix(base[1] * k, 214, fr); o[2] = mix(base[2] * k, 232, fr);
  });
}
export function tilesTex() {
  return pix(512, 512, (u, v, o) => {
    const n = 4, tx = Math.floor(u * n), ty = Math.floor(v * n), fx = u * n - tx, fy = v * n - ty, dark = (tx + ty) % 2;
    const dirt = tf(u, v, 6, 6, 4, 31), crack = Math.abs(tf(u, v, 5, 5, 3, 32) - 0.5), chip = hash2(tx, ty + 9);
    let c = dark ? [70, 76, 86] : [158, 154, 144], k = 0.68 + 0.5 * dirt + 0.1 * (chip - 0.5);
    if (fx < 0.03 || fy < 0.03) { c = [58, 56, 54]; k = 0.8; }
    if (crack < 0.004) k *= 0.5;
    const fr = 0.42 * sstep(0.5, 0.95, tf(u, v, 2, 2, 5, 33)); o[0] = mix(c[0] * k, 212, fr); o[1] = mix(c[1] * k, 226, fr); o[2] = mix(c[2] * k, 242, fr);
  });
}
export function painted(rgb, rust, seed, size = 256) {
  return pix(size, size, (u, v, o) => {
    const n = tf(u, v, 6, 6, 4, seed), fine = tf(u, v, 50, 50, 2, seed + 1), ru = sstep(1 - rust, 1 - rust + 0.12, tf(u, v, 8, 8, 4, seed + 2) * 0.8 + fine * 0.2);
    const k = 0.75 + 0.4 * n; let r = rgb[0] * k, g = rgb[1] * k, b = rgb[2] * k;
    r = mix(r, 96 + 50 * fine, ru); g = mix(g, 56 + 26 * fine, ru); b = mix(b, 34 + 14 * fine, ru);
    const fr = 0.45 * sstep(0.6, 0.85, tf(u, v, 5, 5, 4, seed + 3)); o[0] = mix(r, 212, fr); o[1] = mix(g, 226, fr); o[2] = mix(b, 242, fr);
  });
}
export function fabric(rgb, seed) {
  return pix(128, 128, (u, v, o) => {
    const w = ((Math.floor(u * 64) + Math.floor(v * 64)) % 2 ? 1 : 0.86), n = tf(u, v, 4, 4, 4, seed);
    const k = w * (0.7 + 0.5 * n); o[0] = rgb[0] * k; o[1] = rgb[1] * k; o[2] = rgb[2] * k;
  });
}
export function woodTex(rgb, seed) {
  return pix(256, 256, (u, v, o) => {
    const grain = tf(u, v, 3, 44, 4, seed), ring = Math.sin((grain * 6 + u * 2) * Math.PI * 2) * 0.5 + 0.5, dirt = tf(u, v, 5, 5, 3, seed + 1);
    const k = 0.62 + 0.3 * ring + 0.3 * (dirt - 0.5); o[0] = rgb[0] * k; o[1] = rgb[1] * k; o[2] = rgb[2] * k;
  });
}
export function snowColor() {
  return pix(256, 256, (u, v, o) => {
    const n = tf(u, v, 5, 5, 4, 41), fine = tf(u, v, 70, 70, 2, 42), k = 0.9 + 0.1 * n + 0.04 * (fine - 0.5);
    o[0] = 228 * k; o[1] = 236 * k; o[2] = 250 * k;
  });
}
export function iceTex() {
  return pix(256, 256, (u, v, o) => {
    const n = tf(u, v, 4, 4, 4, 51), crack = Math.abs(tf(u, v, 6, 6, 3, 52) - 0.5), crack2 = Math.abs(tf(u, v, 14, 14, 2, 53) - 0.5), bub = tf(u, v, 60, 60, 1, 54);
    let k = 0.8 + 0.35 * n, w = (crack < 0.008 ? 0.8 : 0) + (crack2 < 0.006 ? 0.45 : 0) + (bub > 0.84 ? 0.35 : 0);
    o[0] = mix(150 * k, 240, clamp(w)); o[1] = mix(196 * k, 248, clamp(w)); o[2] = mix(226 * k, 255, clamp(w));
  });
}
// Window glass with frost ferns creeping in from the edges; alpha is how much it hides.
export function frostGlass(seed, clear = 0.5) {
  return pix(256, 256, (u, v, o) => {
    const e = Math.min(u, 1 - u, v * 1.3, (1 - v) * 0.8), ridged = 1 - Math.abs(2 * tf(u, v, 10, 10, 4, seed) - 1), fern = Math.pow(ridged, 3);
    const blot = tf(u, v, 3, 3, 3, seed + 4), f = clamp(1.25 - e * (2.2 + clear * 5) + (blot - 0.5) * 1.4);
    const a = clamp(0.14 + f * (0.55 + 0.6 * fern) + 0.12 * fern);
    const c = 200 + 55 * fern; o[0] = c * 0.9; o[1] = c * 0.96; o[2] = Math.min(255, c * 1.02); o[3] = a * 255;
  });
}

// ---------------------------------------------------------------- building fronts
export function facade(seed, tint) {
  const base = concrete(60 + seed, 128 + seed * 7 % 20, 0.3), c = cv(512, 512), g = c.getContext('2d'), R = rng(1000 + seed * 77);
  g.drawImage(base, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = tint; g.fillRect(0, 0, 512, 512); g.globalCompositeOperation = 'source-over';
  const W = 128, H = 128;
  for (let s = 0; s < 4; s++) for (let b = 0; b < 4; b++) {
    const x = b * W, y = s * H, wx = x + 30, wy = y + 36, ww = 68, wh = 56;
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x, y, W, 2); g.fillRect(x, y, 2, H);                       // panel joints
    const grd = g.createLinearGradient(0, wy + wh, 0, wy + wh + 46); grd.addColorStop(0, 'rgba(10,12,16,0.5)'); grd.addColorStop(1, 'rgba(10,12,16,0)');
    g.fillStyle = grd; g.fillRect(wx + 4, wy + wh, ww - 8, 46);                                               // stain under the sill
    g.fillStyle = '#05070b'; g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);                                      // recess
    const gg = g.createLinearGradient(0, wy, 0, wy + wh); gg.addColorStop(0, '#3a5078'); gg.addColorStop(0.45, '#1a2740'); gg.addColorStop(1, '#0d1524');
    g.fillStyle = gg; g.fillRect(wx, wy, ww, wh);
    const kind = R();
    if (kind < 0.24) {                                                                                         // smashed
      g.fillStyle = '#010203'; g.beginPath(); const cx = wx + ww * (0.3 + R() * 0.4), cy = wy + wh * (0.3 + R() * 0.4);
      for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, r = 10 + R() * 22; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.9); } g.closePath(); g.fill();
      g.strokeStyle = 'rgba(190,215,240,0.35)'; g.lineWidth = 1; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (R() - 0.5) * 70, cy + (R() - 0.5) * 60); g.stroke(); }
    } else if (kind < 0.4) {                                                                                   // boarded up
      for (let i = 0; i < 5; i++) { g.fillStyle = `rgb(${70 + R() * 30 | 0},${52 + R() * 20 | 0},${36 + R() * 14 | 0})`; g.fillRect(wx - 2, wy + 2 + i * 11, ww + 4, 9); }
    } else if (kind < 0.62) {                                                                                  // a curtain still hanging
      g.fillStyle = `rgba(${150 + R() * 60 | 0},${150 + R() * 40 | 0},${140 + R() * 40 | 0},0.28)`; const cw = 14 + R() * 22; g.fillRect(R() < 0.5 ? wx : wx + ww - cw, wy, cw, wh);
    }
    { const fy = wy + wh - 16 - R() * 14, fg = g.createLinearGradient(0, fy, 0, wy + wh); fg.addColorStop(0, 'rgba(214,230,246,0)'); fg.addColorStop(1, 'rgba(214,230,246,0.5)'); g.fillStyle = fg; g.fillRect(wx, fy, ww, wy + wh - fy); }                   // frost climbing the glass
    g.strokeStyle = '#2a2f38'; g.lineWidth = 3; g.strokeRect(wx, wy, ww, wh); g.lineWidth = 2; g.beginPath(); g.moveTo(wx + ww / 2, wy); g.lineTo(wx + ww / 2, wy + wh); g.stroke();
    g.fillStyle = '#e6eef9'; g.beginPath(); g.moveTo(wx - 6, wy + wh + 5);                                     // snow on the sill
    for (let i = 0; i <= 8; i++) g.lineTo(wx - 6 + (ww + 12) * i / 8, wy + wh - 2 - R() * 5); g.lineTo(wx + ww + 6, wy + wh + 5); g.closePath(); g.fill();
    g.fillStyle = 'rgba(205,228,248,0.9)'; for (let i = 0; i < 7; i++) { const ix = wx - 2 + R() * (ww + 4), il = 4 + R() * 13; g.beginPath(); g.moveTo(ix - 1.6, wy + wh + 5); g.lineTo(ix + 1.6, wy + wh + 5); g.lineTo(ix, wy + wh + 5 + il); g.fill(); }
    if (seed % 2 === 1 && b % 2 === 0) {                                                                       // balcony
      g.fillStyle = '#20242c'; g.fillRect(x + 14, y + 96, 100, 5); g.strokeStyle = '#1a1d24'; g.lineWidth = 1.5;
      for (let i = 0; i <= 10; i++) { g.beginPath(); g.moveTo(x + 14 + i * 10, y + 72); g.lineTo(x + 14 + i * 10, y + 96); g.stroke(); }
      g.strokeRect(x + 14, y + 72, 100, 24); g.fillStyle = '#e6eef9'; g.fillRect(x + 12, y + 69, 104, 4);
    }
  }
  return c;
}
const SHOPS = ['BAKERY', 'PHARMACY', 'BOOKS', 'CAFÉ NORD', 'METRO', 'TAILOR', 'HARDWARE', 'CINEMA'];
export function shopfront(seed) {
  const c = cv(1024, 256), g = c.getContext('2d'), R = rng(5000 + seed * 13);
  g.drawImage(concrete(80 + seed, 78, 0.3), 0, 0, 1024, 256);
  for (let b = 0; b < 4; b++) {
    const x = b * 256, kind = R();
    g.fillStyle = ['#3a2c2a', '#26323a', '#3a3524', '#2a2a33'][(seed + b) % 4]; g.fillRect(x + 8, 10, 240, 44);                  // sign band
    g.font = 'bold 30px Impact, "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(210,205,190,0.55)'; g.fillText(SHOPS[(seed * 3 + b) % SHOPS.length], x + 128, 34);
    g.fillStyle = '#e6eef9'; g.beginPath(); g.moveTo(x + 4, 12); for (let i = 0; i <= 12; i++) g.lineTo(x + 4 + 248 * i / 12, 4 + R() * 7); g.lineTo(x + 252, 12); g.fill();
    if (kind < 0.4) {                                                                                                               // roller shutter
      g.fillStyle = '#3d444d'; g.fillRect(x + 16, 62, 224, 186); g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 2;
      for (let y = 66; y < 248; y += 8) { g.beginPath(); g.moveTo(x + 16, y); g.lineTo(x + 240, y); g.stroke(); }
      g.fillStyle = 'rgba(120,70,40,0.35)'; for (let i = 0; i < 12; i++) g.fillRect(x + 20 + R() * 210, 70 + R() * 170, 4 + R() * 26, 2 + R() * 8);
    } else if (kind < 0.75) {                                                                                                       // dark shop window + door
      const gg = g.createLinearGradient(0, 62, 0, 248); gg.addColorStop(0, '#18233a'); gg.addColorStop(1, '#05070c');
      g.fillStyle = gg; g.fillRect(x + 16, 62, 150, 150); g.fillRect(x + 180, 62, 60, 186);
      g.strokeStyle = '#1c1f26'; g.lineWidth = 5; g.strokeRect(x + 16, 62, 150, 150); g.strokeRect(x + 180, 62, 60, 186);
      g.fillStyle = 'rgba(214,230,246,0.5)'; g.fillRect(x + 16, 150, 150, 62); g.fillRect(x + 180, 180, 60, 68);
      g.strokeStyle = 'rgba(200,220,240,0.4)'; g.lineWidth = 1; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(x + 60 + R() * 60, 100 + R() * 60); g.lineTo(x + 20 + R() * 140, 66 + R() * 140); g.stroke(); }
    } else {                                                                                                                        // boarded
      g.fillStyle = '#07090d'; g.fillRect(x + 16, 62, 224, 186);
      for (let i = 0; i < 9; i++) { g.fillStyle = `rgb(${74 + R() * 30 | 0},${54 + R() * 20 | 0},${38 + R() * 14 | 0})`; g.save(); g.translate(x + 128, 74 + i * 20); g.rotate((R() - 0.5) * 0.12); g.fillRect(-116, -8, 232, 16); g.restore(); }
    }
    g.fillStyle = '#e6eef9'; g.beginPath(); g.moveTo(x, 256); for (let i = 0; i <= 12; i++) g.lineTo(x + 256 * i / 12, 232 + R() * 16); g.lineTo(x + 256, 256); g.fill();     // drifted snow at the foot
  }
  return c;
}

// ---------------------------------------------------------------- little sprites
export function glowTex() {
  const c = cv(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.13)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return tex(c, { repeat: false });
}
export function puffTex() {
  const c = pix(64, 64, (u, v, o) => { const d = Math.hypot(u - 0.5, v - 0.5) * 2, n = tf(u, v, 4, 4, 3, 90); o[0] = o[1] = o[2] = 255; o[3] = 255 * clamp((1 - d) * 1.3) * clamp(0.35 + n); });
  return tex(c, { repeat: false });
}
export function printTex() {
  const c = cv(32, 64), g = c.getContext('2d'); g.clearRect(0, 0, 32, 64); g.fillStyle = 'rgba(255,255,255,1)';
  g.beginPath(); g.ellipse(16, 22, 10, 17, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(16, 52, 8, 9, 0, 0, 7); g.fill(); g.filter = 'blur(2px)'; g.drawImage(c, 0, 0); return tex(c, { repeat: false });
}

// ---------------------------------------------------------------- the material set
// envMap: what shiny things reflect. signs (optional): { canvas, rects } a sheet of signs and posters the game has drawn.
export function makeMaterials(envMap, signs) {
  const S = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0, ...o });
  const relief = (m, strength, scale = 1) => { const n = tex(reliefFrom(m.map.image, strength), { srgb: false }); n.wrapS = m.map.wrapS; n.wrapT = m.map.wrapT; m.normalMap = n; m.normalScale = new THREE.Vector2(scale, scale); return m; };
  const M = {}, T = {};
  T.concrete = tex(concrete(1, 112, 0.34)); T.concreteExt = tex(concrete(2, 98, 0.4));
  M.concrete = S(T.concrete); M.concreteExt = S(T.concreteExt);
  M.wallpaper = S(tex(wallpaper())); M.corridor = S(tex(twoTone([74, 100, 92], [166, 162, 148], 3)));
  M.lobbywall = S(tex(twoTone([150, 154, 150], [128, 146, 160], 5, true)));
  M.ceiling = S(tex(ceilingTex())); M.woodfloor = S(tex(woodFloor()), { roughness: 0.7 }); M.lino = S(tex(lino(7, [112, 100, 86])));
  M.tiles = S(tex(tilesTex()), { roughness: 0.55 });
  M.wood = S(tex(woodTex([118, 86, 56], 1))); M.woodDark = S(tex(woodTex([70, 50, 34], 2))); M.plank = S(tex(woodTex([96, 78, 58], 3)));
  M.fabric = S(tex(fabric([78, 96, 88], 1))); M.mattress = S(tex(fabric([160, 158, 150], 2))); M.blanket = S(tex(fabric([168, 74, 44], 3)));
  M.rug = S(tex(fabric([96, 52, 48], 4))); M.curtain = S(tex(fabric([120, 116, 104], 5)), { side: THREE.DoubleSide });
  M.metalDark = S(tex(painted([52, 58, 66], 0.3, 1)), { roughness: 0.6, metalness: 0.5 });
  M.metalGreen = S(tex(painted([62, 86, 74], 0.35, 2)), { roughness: 0.65, metalness: 0.3 });
  M.rust = S(tex(painted([110, 66, 40], 0.75, 3)), { roughness: 0.85, metalness: 0.3 });
  M.steel = S(tex(painted([150, 156, 164], 0.12, 4)), { roughness: 0.35, metalness: 0.8, envMap, envMapIntensity: 0.6 });
  M.white = S(tex(painted([196, 198, 196], 0.1, 5)), { roughness: 0.6 });
  M.red = S(tex(painted([160, 44, 36], 0.25, 6)), { roughness: 0.55, metalness: 0.2, envMap, envMapIntensity: 0.35 });
  M.carBlue = S(tex(painted([52, 84, 130], 0.2, 7)), { roughness: 0.4, metalness: 0.4, envMap, envMapIntensity: 0.5 });
  M.carGrey = S(tex(painted([120, 124, 128], 0.2, 8)), { roughness: 0.4, metalness: 0.4, envMap, envMapIntensity: 0.5 });
  M.carYellow = S(tex(painted([186, 150, 52], 0.25, 9)), { roughness: 0.45, metalness: 0.3, envMap, envMapIntensity: 0.4 });
  M.black = new THREE.MeshStandardMaterial({ color: 0x07090c, roughness: 0.5 });
  M.darkGlass = new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.12, metalness: 0.6, envMap, envMapIntensity: 0.9 });
  M.paper = new THREE.MeshStandardMaterial({ color: 0xd9d3c0, roughness: 0.95 });
  M.books = S(tex(pix(128, 32, (u, v, o) => { const b = Math.floor(u * 22), h = hash2(b, 5), e = (u * 22) % 1; const k = (e < 0.08 ? 0.4 : 1) * (0.7 + 0.3 * hash2(b, 9)); o[0] = (60 + 150 * h) * k; o[1] = (50 + 100 * hash2(b, 6)) * k; o[2] = (50 + 90 * hash2(b, 7)) * k; })));
  T.snow = tex(snowColor());
  T.snowN = tex(normalMap(256, (u, v) => tf(u, v, 6, 6, 5, 43) + 0.25 * tf(u, v, 40, 40, 2, 44), 5), { srgb: false });
  M.snow = new THREE.MeshStandardMaterial({ map: T.snow, normalMap: T.snowN, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.82, metalness: 0, vertexColors: true });
  M.snowProp = new THREE.MeshStandardMaterial({ map: T.snow, normalMap: T.snowN, normalScale: new THREE.Vector2(0.7, 0.7), roughness: 0.85 });
  M.ice = S(tex(iceTex()), { roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.86, envMap, envMapIntensity: 1.3, emissive: 0x16304a, emissiveIntensity: 0.5 });
  M.icicle = new THREE.MeshStandardMaterial({ color: 0xcfe8fa, roughness: 0.1, transparent: true, opacity: 0.8, envMap, envMapIntensity: 1.6, emissive: 0x1a3550, emissiveIntensity: 0.6 });
  const glass = (seed, clear) => { const m = S(tex(frostGlass(seed, clear), { repeat: false }), { transparent: true, roughness: 0.25, depthWrite: false, envMap, envMapIntensity: 0.7, emissive: 0x2a4266, emissiveIntensity: 0.32, side: THREE.DoubleSide }); m.userData = { noCast: true, renderOrder: 2 }; return m; };
  M.glassA = glass(1, 0.55); M.glassB = glass(2, 0.15);
  M.facadeA = S(tex(facade(0, '#aab4c4'))); M.facadeB = S(tex(facade(1, '#c0b4a6'))); M.facadeC = S(tex(facade(2, '#96a2a8'))); M.facadeD = S(tex(facade(3, '#b3a79a')));
  M.shopA = S(tex(shopfront(0))); M.shopB = S(tex(shopfront(1)));
  for (const [k, st, sc] of [['concrete', 2.6, 1], ['concreteExt', 2.6, 1], ['wallpaper', 1.6, 0.8], ['corridor', 1.8, 0.8], ['lobbywall', 2.4, 1], ['ceiling', 2.0, 0.8], ['woodfloor', 2.6, 1], ['lino', 1.4, 0.6], ['tiles', 3.0, 1],
    ['wood', 1.6, 0.7], ['woodDark', 1.6, 0.7], ['plank', 2.0, 0.8], ['rust', 2.4, 1], ['metalDark', 1.6, 0.6], ['metalGreen', 1.6, 0.6], ['facadeA', 3.0, 1], ['facadeB', 3.0, 1], ['facadeC', 3.0, 1], ['facadeD', 3.0, 1], ['shopA', 2.6, 1], ['shopB', 2.6, 1], ['fabric', 2.0, 0.8], ['blanket', 2.0, 0.8], ['mattress', 1.6, 0.6], ['rug', 2.0, 0.8]]) relief(M[k], st, sc);
  if (signs) { T.atlas = tex(signs.canvas, { repeat: false, aniso: 8 });
    M.signs = S(T.atlas, { roughness: 0.8, alphaTest: 0.3 }); M.signs.userData = { noCast: true };
    M.signsLit = new THREE.MeshStandardMaterial({ map: T.atlas, emissiveMap: T.atlas, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.8 }); M.signsLit.userData = { noCast: true }; }
  M.far = new THREE.MeshBasicMaterial({ color: 0x0b1322, fog: false });                                                  // the Tower: a shape against the sky
  M.warm = new THREE.MeshStandardMaterial({ color: 0x1a1008, emissive: 0xffa040, emissiveIntensity: 5, roughness: 1 });  // lit doorways and the one lit window
  M.cold = new THREE.MeshStandardMaterial({ color: 0x0c1016, emissive: 0xbfd8ff, emissiveIntensity: 6, roughness: 1 });  // floodlights
  for (const k of ['warm', 'cold', 'far']) M[k].userData = { noCast: true };
  for (const k in M) if (!M[k].userData) M[k].userData = {};
  return { M, rects: signs ? signs.rects : {}, tex: { glow: glowTex(), puff: puffTex(), print: printTex(), snow: T.snow, snowN: T.snowN, atlas: T.atlas } };
}
