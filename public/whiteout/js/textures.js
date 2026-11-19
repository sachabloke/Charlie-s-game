// Every surface in the game is painted here in code (no picture files to download): concrete, wallpaper, snow, ice,
// frosted glass, building fronts, signs. Returns the materials the world is built from.
import * as THREE from './three.js';
import { hash2, rng } from './build.js';

const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
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
function tf(u, v, px, py, oct = 4, seed = 0) { let s = 0, a = 0.5, n = 0; for (let i = 0; i < oct; i++) { s += a * pn(u * px, v * py, px, py, seed + i); n += a; px *= 2; py *= 2; a *= 0.5; } return s / n; }

function pix(w, h, fn) {
  const c = cv(w, h), g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data; let i = 0; const out = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { out[3] = 255; fn(x / w, y / h, out); d[i++] = out[0]; d[i++] = out[1]; d[i++] = out[2]; d[i++] = out[3]; }
  g.putImageData(im, 0, 0); return c;
}
function tex(c, { srgb = true, repeat = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso; return t;
}
// Height field -> normal map.
function normalMap(size, hf, strength) {
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

// ---------------------------------------------------------------- surfaces
function concrete(seed, base = 112, frost = 0.5) {
  return pix(512, 512, (u, v, o) => {
    const big = tf(u, v, 4, 4, 5, seed), fine = tf(u, v, 48, 48, 2, seed + 9), streak = tf(u, v, 28, 2, 3, seed + 3);
    let c = base + 46 * (big - 0.5) + 26 * (fine - 0.5) - 34 * Math.max(0, streak - 0.55);
    const seam = Math.min(Math.abs(((v * 2) % 1) - 0.5), Math.abs(((u * 2 + 0.5) % 1) - 0.5)); if (seam > 0.493) c -= 22;
    const pit = tf(u, v, 90, 90, 1, seed + 5); if (pit > 0.83) c -= 30;
    const f = frost * sstep(0.55, 0.78, tf(u, v, 6, 6, 4, seed + 7));
    o[0] = mix(c * 0.94, 214, f); o[1] = mix(c * 0.985, 228, f); o[2] = mix(c * 1.05, 242, f);
  });
}
function wallpaper() {
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
function twoTone(lower, upper, seed, tiles = false) {
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
function ceilingTex() {
  return pix(256, 256, (u, v, o) => {
    const dirt = tf(u, v, 4, 4, 4, 11), crack = Math.abs(tf(u, v, 7, 7, 3, 12) - 0.5), damp = tf(u, v, 3, 3, 3, 13);
    let c = 150 + 30 * (dirt - 0.5) - 45 * sstep(0.6, 0.8, damp); if (crack < 0.006) c -= 40;
    o[0] = c; o[1] = c; o[2] = c * 1.02;
  });
}
function woodFloor() {
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
function lino(seed, base) {
  return pix(256, 256, (u, v, o) => {
    const sp = tf(u, v, 90, 90, 1, seed), dirt = tf(u, v, 5, 5, 4, seed + 1), scuff = tf(u, v, 3, 20, 3, seed + 2);
    let k = 0.7 + 0.45 * dirt + (sp > 0.7 ? 0.12 : 0) - 0.2 * Math.max(0, scuff - 0.6);
    if ((u * 2) % 1 < 0.012 || (v * 2) % 1 < 0.012) k *= 0.6;
    const fr = 0.4 * sstep(0.5, 0.95, tf(u, v, 2, 2, 5, seed + 4)); o[0] = mix(base[0] * k, 200, fr); o[1] = mix(base[1] * k, 214, fr); o[2] = mix(base[2] * k, 232, fr);
  });
}
function tilesTex() {
  return pix(512, 512, (u, v, o) => {
    const n = 4, tx = Math.floor(u * n), ty = Math.floor(v * n), fx = u * n - tx, fy = v * n - ty, dark = (tx + ty) % 2;
    const dirt = tf(u, v, 6, 6, 4, 31), crack = Math.abs(tf(u, v, 5, 5, 3, 32) - 0.5), chip = hash2(tx, ty + 9);
    let c = dark ? [70, 76, 86] : [158, 154, 144], k = 0.68 + 0.5 * dirt + 0.1 * (chip - 0.5);
    if (fx < 0.03 || fy < 0.03) { c = [58, 56, 54]; k = 0.8; }
    if (crack < 0.004) k *= 0.5;
    const fr = 0.42 * sstep(0.5, 0.95, tf(u, v, 2, 2, 5, 33)); o[0] = mix(c[0] * k, 212, fr); o[1] = mix(c[1] * k, 226, fr); o[2] = mix(c[2] * k, 242, fr);
  });
}
function painted(rgb, rust, seed, size = 256) {
  return pix(size, size, (u, v, o) => {
    const n = tf(u, v, 6, 6, 4, seed), fine = tf(u, v, 50, 50, 2, seed + 1), ru = sstep(1 - rust, 1 - rust + 0.12, tf(u, v, 8, 8, 4, seed + 2) * 0.8 + fine * 0.2);
    const k = 0.75 + 0.4 * n; let r = rgb[0] * k, g = rgb[1] * k, b = rgb[2] * k;
    r = mix(r, 96 + 50 * fine, ru); g = mix(g, 56 + 26 * fine, ru); b = mix(b, 34 + 14 * fine, ru);
    const fr = 0.45 * sstep(0.6, 0.85, tf(u, v, 5, 5, 4, seed + 3)); o[0] = mix(r, 212, fr); o[1] = mix(g, 226, fr); o[2] = mix(b, 242, fr);
  });
}
function fabric(rgb, seed) {
  return pix(128, 128, (u, v, o) => {
    const w = ((Math.floor(u * 64) + Math.floor(v * 64)) % 2 ? 1 : 0.86), n = tf(u, v, 4, 4, 4, seed);
    const k = w * (0.7 + 0.5 * n); o[0] = rgb[0] * k; o[1] = rgb[1] * k; o[2] = rgb[2] * k;
  });
}
function woodTex(rgb, seed) {
  return pix(256, 256, (u, v, o) => {
    const grain = tf(u, v, 3, 44, 4, seed), ring = Math.sin((grain * 6 + u * 2) * Math.PI * 2) * 0.5 + 0.5, dirt = tf(u, v, 5, 5, 3, seed + 1);
    const k = 0.62 + 0.3 * ring + 0.3 * (dirt - 0.5); o[0] = rgb[0] * k; o[1] = rgb[1] * k; o[2] = rgb[2] * k;
  });
}
function snowColor() {
  return pix(256, 256, (u, v, o) => {
    const n = tf(u, v, 5, 5, 4, 41), fine = tf(u, v, 70, 70, 2, 42), k = 0.9 + 0.1 * n + 0.04 * (fine - 0.5);
    o[0] = 228 * k; o[1] = 236 * k; o[2] = 250 * k;
  });
}
function iceTex() {
  return pix(256, 256, (u, v, o) => {
    const n = tf(u, v, 4, 4, 4, 51), crack = Math.abs(tf(u, v, 6, 6, 3, 52) - 0.5), crack2 = Math.abs(tf(u, v, 14, 14, 2, 53) - 0.5), bub = tf(u, v, 60, 60, 1, 54);
    let k = 0.8 + 0.35 * n, w = (crack < 0.008 ? 0.8 : 0) + (crack2 < 0.006 ? 0.45 : 0) + (bub > 0.84 ? 0.35 : 0);
    o[0] = mix(150 * k, 240, clamp(w)); o[1] = mix(196 * k, 248, clamp(w)); o[2] = mix(226 * k, 255, clamp(w));
  });
}
// Window glass with frost ferns creeping in from the edges; alpha is how much it hides.
function frostGlass(seed, clear = 0.5) {
  return pix(256, 256, (u, v, o) => {
    const e = Math.min(u, 1 - u, v * 1.3, (1 - v) * 0.8), ridged = 1 - Math.abs(2 * tf(u, v, 10, 10, 4, seed) - 1), fern = Math.pow(ridged, 3);
    const blot = tf(u, v, 3, 3, 3, seed + 4), f = clamp(1.25 - e * (2.2 + clear * 5) + (blot - 0.5) * 1.4);
    const a = clamp(0.14 + f * (0.55 + 0.6 * fern) + 0.12 * fern);
    const c = 200 + 55 * fern; o[0] = c * 0.9; o[1] = c * 0.96; o[2] = Math.min(255, c * 1.02); o[3] = a * 255;
  });
}

// ---------------------------------------------------------------- building fronts
function facade(seed, tint) {
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
function shopfront(seed) {
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

// ---------------------------------------------------------------- signs and posters, all on one sheet
function makeAtlas() {
  const W = 2048, H = 1024, c = cv(W, H), g = c.getContext('2d'), rects = {}; let x = 0, y = 0, row = 0;
  const add = (name, w, h, draw) => {
    if (x + w + 4 > W) { x = 0; y += row + 4; row = 0; }
    g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip(); draw(g, w, h); g.restore();
    rects[name] = [x / W, 1 - (y + h) / H, (x + w) / W, 1 - y / H]; x += w + 4; row = Math.max(row, h);
  };
  const F = (px, f = 'Impact, "Arial Narrow", Arial, sans-serif') => `bold ${px}px ${f}`;
  const grime = (g, w, h, a = 0.25, n = 40) => { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${20 + Math.random() * 30 | 0},${20 + Math.random() * 30 | 0},${24 + Math.random() * 30 | 0},${Math.random() * a})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 4 + Math.random() * 30, 0, 7); g.fill(); } };
  const frostEdge = (g, w, h, a = 0.5) => { const gr = g.createLinearGradient(0, h * 0.55, 0, h); gr.addColorStop(0, 'rgba(220,235,250,0)'); gr.addColorStop(1, `rgba(220,235,250,${a})`); g.fillStyle = gr; g.fillRect(0, 0, w, h); };
  const text = (g, s, x, y, font, col, align = 'center') => { g.font = font; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y); };

  add('evac', 300, 420, (g, w, h) => {
    g.fillStyle = '#d9d2bd'; g.fillRect(0, 0, w, h); g.fillStyle = '#a3261c'; g.fillRect(0, 0, w, 78);
    text(g, 'EVACUATION', w / 2, 30, F(40), '#f1ead8'); text(g, 'ORDER 41', w / 2, 62, F(22), '#f1ead8');
    text(g, 'ALL RESIDENTS', w / 2, 116, F(30), '#22201c'); text(g, 'OF SECTOR 7', w / 2, 150, F(30), '#22201c');
    text(g, 'REPORT TO', w / 2, 196, F(24), '#22201c'); text(g, 'THE TOWER', w / 2, 240, F(54), '#a3261c');
    g.strokeStyle = '#22201c'; g.lineWidth = 6; g.beginPath(); g.moveTo(w / 2, 280); g.lineTo(w / 2, 340); g.moveTo(w / 2 - 22, 318); g.lineTo(w / 2, 342); g.lineTo(w / 2 + 22, 318); g.stroke();
    text(g, 'FOLLOW THE RED LIGHT', w / 2, 372, F(24), '#22201c'); text(g, 'Take only what you can carry.', w / 2, 400, 'italic 15px Georgia, serif', '#3a352c');
    grime(g, w, h, 0.18); frostEdge(g, w, h, 0.35);
  });
  add('billboard', 640, 320, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#27405f'); gr.addColorStop(1, '#132033'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8b04a'; g.beginPath(); g.arc(w * 0.8, h * 0.42, 70, 0, 7); g.fill(); g.fillStyle = '#132033'; g.beginPath(); g.arc(w * 0.8, h * 0.42, 52, 0, 7); g.fill();
    g.fillStyle = '#e8b04a'; g.fillRect(w * 0.8 - 6, h * 0.42 - 40, 12, 80);
    text(g, 'STAY WARM.', 40, 96, F(74), '#e9eef5', 'left'); text(g, 'STAY TOGETHER.', 40, 176, F(74), '#e9eef5', 'left');
    text(g, 'THE TOWER HAS LIGHT FOR EVERYONE', 42, 250, F(26), '#e8b04a', 'left'); text(g, 'CITY COUNCIL  ·  WINTER EMERGENCY', 42, 286, F(18), '#8fa4bf', 'left');
    grime(g, w, h, 0.22, 70); frostEdge(g, w, h, 0.5);
    g.fillStyle = '#132033'; g.beginPath(); g.moveTo(w, 0); g.lineTo(w - 120, 0); g.lineTo(w - 60, 46); g.lineTo(w, 110); g.fill();      // a torn corner
  });
  add('gate', 768, 150, (g, w, h) => {
    g.fillStyle = '#20252d'; g.fillRect(0, 0, w, h); g.strokeStyle = '#d7b24a'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    text(g, 'SECTOR 7  ·  TOWER DISTRICT', w / 2, 58, F(52), '#e9eef5'); text(g, 'SHELTER  ·  WARMTH  ·  LIGHT', w / 2, 112, F(30), '#d7b24a'); grime(g, w, h, 0.2, 50); frostEdge(g, w, h, 0.4);
  });
  add('graffiti', 560, 190, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.font = 'bold 62px "Comic Sans MS", "Marker Felt", "Segoe Print", cursive'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeStyle = 'rgba(232,176,74,0.9)'; g.lineWidth = 3; g.fillStyle = 'rgba(232,176,74,0.92)';
    g.fillText('FOLLOW THE LIGHT', w / 2, 62); g.lineWidth = 12; g.lineCap = 'round'; g.beginPath(); g.moveTo(w / 2, 104); g.lineTo(w / 2, 170); g.moveTo(w / 2 - 28, 142); g.lineTo(w / 2, 174); g.lineTo(w / 2 + 28, 142); g.stroke();
  });
  for (const [n, s] of [['fl2', '2'], ['fl1', '1'], ['flG', 'G']]) add(n, 128, 128, (g, w, h) => { g.clearRect(0, 0, w, h); text(g, s, w / 2, h / 2 + 6, F(120), 'rgba(28,30,34,0.85)'); });
  for (const n of ['31', '32', '33', '34', '35']) add('d' + n, 140, 300, (g, w, h) => {
    g.drawImage(woodTex([120, 84, 54], 70 + +n), 0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 4; g.strokeRect(14, 16, w - 28, 118); g.strokeRect(14, 150, w - 28, 134);
    g.fillStyle = '#b9a35a'; g.fillRect(w / 2 - 20, 40, 40, 26); text(g, n, w / 2, 54, F(20), '#1d1a12'); g.fillStyle = '#8e8a80'; g.fillRect(w - 30, 150, 14, 8);
    frostEdge(g, w, h, 0.45);
  });
  add('mailboxes', 320, 256, (g, w, h) => {
    g.fillStyle = '#4b5560'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 4; r++) for (let q = 0; q < 5; q++) { const x = q * 64 + 4, y = r * 64 + 4; g.fillStyle = (r * 5 + q) % 7 === 3 ? '#161a1f' : '#5f6b78'; g.fillRect(x, y, 56, 56); g.fillStyle = '#20252b'; g.fillRect(x + 8, y + 12, 40, 5); g.fillStyle = '#c8cdd2'; g.fillRect(x + 16, y + 30, 24, 12); text(g, String(11 + r * 5 + q), x + 28, y + 37, F(11), '#22262b'); }
    grime(g, w, h, 0.2); frostEdge(g, w, h, 0.4);
  });
  add('drawing', 220, 170, (g, w, h) => {
    g.fillStyle = '#efe9d8'; g.fillRect(0, 0, w, h); g.lineWidth = 5; g.lineCap = 'round';
    g.strokeStyle = '#e0a020'; g.beginPath(); g.arc(170, 46, 22, 0, 7); g.stroke(); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; g.beginPath(); g.moveTo(170 + Math.cos(a) * 30, 46 + Math.sin(a) * 30); g.lineTo(170 + Math.cos(a) * 40, 46 + Math.sin(a) * 40); g.stroke(); }
    g.strokeStyle = '#3d6fb3'; g.strokeRect(34, 80, 60, 56); g.beginPath(); g.moveTo(28, 82); g.lineTo(64, 50); g.lineTo(100, 82); g.stroke();
    g.strokeStyle = '#b3423d'; for (const x of [124, 150]) { g.beginPath(); g.arc(x, 104, 7, 0, 7); g.moveTo(x, 111); g.lineTo(x, 132); g.moveTo(x - 9, 120); g.lineTo(x + 9, 120); g.moveTo(x, 132); g.lineTo(x - 7, 146); g.moveTo(x, 132); g.lineTo(x + 7, 146); g.stroke(); }
    g.strokeStyle = '#4c9a4c'; g.beginPath(); g.moveTo(10, 150); g.lineTo(210, 150); g.stroke(); text(g, 'me and Ana', 62, 160, 'bold 13px "Comic Sans MS", cursive', '#444');
  });
  add('calendar', 180, 230, (g, w, h) => {
    g.fillStyle = '#e4dfd0'; g.fillRect(0, 0, w, h); g.fillStyle = '#27405f'; g.fillRect(0, 0, w, 50); text(g, 'THE LONG NIGHT', w / 2, 26, F(22), '#e4dfd0');
    text(g, 'DAY', w / 2, 84, F(28), '#333'); text(g, '41', w / 2, 150, F(96), '#a3261c');
    g.strokeStyle = '#a3261c'; g.lineWidth = 3; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(16 + i * 20, 200); g.lineTo(26 + i * 20, 218); g.stroke(); }
    frostEdge(g, w, h, 0.3);
  });
  add('news', 300, 200, (g, w, h) => {
    g.fillStyle = '#d6d0c0'; g.fillRect(0, 0, w, h); text(g, 'THE DAILY SENTINEL', w / 2, 24, 'bold 24px Georgia, serif', '#1c1c1c'); g.fillStyle = '#1c1c1c'; g.fillRect(10, 40, w - 20, 3);
    text(g, 'SUN FAILS TO RISE', w / 2, 76, F(40), '#1c1c1c'); text(g, 'FOR TWELFTH DAY', w / 2, 116, F(40), '#1c1c1c');
    text(g, 'Council opens the Tower to all', w / 2, 150, 'italic 17px Georgia, serif', '#333'); g.fillStyle = '#8a8578'; for (let i = 0; i < 4; i++) g.fillRect(14, 166 + i * 8, w - 28 - (i === 3 ? 90 : 0), 3);
    frostEdge(g, w, h, 0.45);
  });
  add('quarantine', 360, 180, (g, w, h) => {
    g.fillStyle = '#d7b24a'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1b1b'; for (let i = -4; i < 12; i++) { g.beginPath(); g.moveTo(i * 44, 0); g.lineTo(i * 44 + 22, 0); g.lineTo(i * 44 + 22 - 30, 30); g.lineTo(i * 44 - 30, 30); g.fill(); g.beginPath(); g.moveTo(i * 44, h - 30); g.lineTo(i * 44 + 22, h - 30); g.lineTo(i * 44 + 22 - 30, h); g.lineTo(i * 44 - 30, h); g.fill(); }
    text(g, 'ROAD CLOSED', w / 2, 74, F(56), '#1b1b1b'); text(g, 'ICE BEYOND THIS POINT', w / 2, 124, F(26), '#1b1b1b'); grime(g, w, h, 0.2); frostEdge(g, w, h, 0.4);
  });
  add('checkpoint', 420, 130, (g, w, h) => {
    g.fillStyle = '#e4e0d2'; g.fillRect(0, 0, w, h); g.fillStyle = '#a3261c'; g.fillRect(0, 0, 14, h); g.fillRect(w - 14, 0, 14, h);
    text(g, 'CHECKPOINT 7', w / 2, 46, F(52), '#20252d'); text(g, 'TOWER 300 m  ↑', w / 2, 98, F(30), '#a3261c'); grime(g, w, h, 0.2); frostEdge(g, w, h, 0.4);
  });
  add('busdest', 300, 72, (g, w, h) => { g.fillStyle = '#0c0d0f'; g.fillRect(0, 0, w, h); text(g, '7   THE TOWER', w / 2, h / 2 + 2, F(44, '"Courier New", monospace'), '#d79a2a'); });
  add('keypad', 96, 140, (g, w, h) => {
    g.fillStyle = '#2b2f36'; g.fillRect(0, 0, w, h); g.fillStyle = '#0b1410'; g.fillRect(10, 8, w - 20, 24);
    for (let i = 0; i < 12; i++) { const x = 12 + (i % 3) * 26, y = 40 + (i / 3 | 0) * 24; g.fillStyle = '#596270'; g.fillRect(x, y, 20, 18); text(g, '123456789*0#'[i], x + 10, y + 10, F(13), '#e8edf2'); }
  });
  add('radio', 150, 90, (g, w, h) => {
    g.fillStyle = '#3b3229'; g.fillRect(0, 0, w, h); g.fillStyle = '#16130f'; g.fillRect(8, 10, 74, 70); g.fillStyle = '#2a251e'; for (let y = 14; y < 78; y += 6) g.fillRect(10, y, 70, 2);
    g.fillStyle = '#d9cfae'; g.fillRect(90, 12, 52, 26); g.fillStyle = '#a3261c'; g.fillRect(122, 12, 2, 26); g.fillStyle = '#8e8a80'; g.beginPath(); g.arc(102, 62, 10, 0, 7); g.arc(130, 62, 10, 0, 7); g.fill();
  });
  add('clock', 128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#d9d6cc'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill(); g.strokeStyle = '#1e2126'; g.lineWidth = 6; g.stroke();
    g.lineWidth = 3; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; g.beginPath(); g.moveTo(64 + Math.cos(a) * 46, 64 + Math.sin(a) * 46); g.lineTo(64 + Math.cos(a) * 54, 64 + Math.sin(a) * 54); g.stroke(); }
    g.lineWidth = 6; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 26, 64 + 18); g.stroke(); g.lineWidth = 4; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 12, 64 - 44); g.stroke();
    g.fillStyle = 'rgba(220,235,250,0.4)'; g.beginPath(); g.arc(64, 64, 60, 0.3, 2.6); g.fill();
  });
  add('kiosk', 300, 110, (g, w, h) => { g.fillStyle = '#7a2a22'; g.fillRect(0, 0, w, h); text(g, 'NEWS · TEA · MAPS', w / 2, h / 2, F(40), '#eadfc4'); grime(g, w, h, 0.25); frostEdge(g, w, h, 0.5); });
  add('note', 96, 128, (g, w, h) => { g.fillStyle = '#e9e2cc'; g.fillRect(0, 0, w, h); g.fillStyle = '#5a5648'; for (let i = 0; i < 9; i++) g.fillRect(10, 16 + i * 12, w - 20 - (i % 3) * 14, 2); });
  add('exit', 200, 80, (g, w, h) => { g.fillStyle = '#0c3a22'; g.fillRect(0, 0, w, h); text(g, 'EXIT', 74, h / 2 + 3, F(56), '#d6ffe6'); g.strokeStyle = '#d6ffe6'; g.lineWidth = 8; g.beginPath(); g.moveTo(136, 40); g.lineTo(184, 40); g.moveTo(166, 22); g.lineTo(186, 40); g.lineTo(166, 58); g.stroke(); });
  add('stripes', 256, 48, (g, w, h) => { g.fillStyle = '#d7b24a'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1b1b'; for (let i = -2; i < 10; i++) { g.beginPath(); g.moveTo(i * 40, 0); g.lineTo(i * 40 + 20, 0); g.lineTo(i * 40 - 28, h); g.lineTo(i * 40 - 48, h); g.fill(); } grime(g, w, h, 0.25, 20); });
  add('metro', 160, 160, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#a3261c'; g.beginPath(); g.arc(80, 80, 74, 0, 7); g.fill(); text(g, 'M', 80, 88, F(120), '#eee6d2'); frostEdge(g, w, h, 0.5); });
  add('tvoff', 64, 64, (g, w, h) => { g.fillStyle = '#05070a'; g.fillRect(0, 0, w, h); const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(120,150,190,0.25)'); gr.addColorStop(0.5, 'rgba(120,150,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  return { canvas: c, rects };
}

// ---------------------------------------------------------------- little sprites
function glowTex() {
  const c = cv(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.13)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return tex(c, { repeat: false });
}
function puffTex() {
  const c = pix(64, 64, (u, v, o) => { const d = Math.hypot(u - 0.5, v - 0.5) * 2, n = tf(u, v, 4, 4, 3, 90); o[0] = o[1] = o[2] = 255; o[3] = 255 * clamp((1 - d) * 1.3) * clamp(0.35 + n); });
  return tex(c, { repeat: false });
}
function printTex() {
  const c = cv(32, 64), g = c.getContext('2d'); g.clearRect(0, 0, 32, 64); g.fillStyle = 'rgba(255,255,255,1)';
  g.beginPath(); g.ellipse(16, 22, 10, 17, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(16, 52, 8, 9, 0, 0, 7); g.fill(); g.filter = 'blur(2px)'; g.drawImage(c, 0, 0); return tex(c, { repeat: false });
}

// ---------------------------------------------------------------- the material set
export function makeMaterials(envMap) {
  const S = (map, o = {}) => new THREE.MeshStandardMaterial({ map, roughness: 0.9, metalness: 0, ...o });
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
  const atlas = makeAtlas(); T.atlas = tex(atlas.canvas, { repeat: false, aniso: 8 });
  M.signs = S(T.atlas, { roughness: 0.8, alphaTest: 0.3 }); M.signs.userData = { noCast: true };
  M.signsLit = new THREE.MeshStandardMaterial({ map: T.atlas, emissiveMap: T.atlas, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.8 }); M.signsLit.userData = { noCast: true };
  M.far = new THREE.MeshBasicMaterial({ color: 0x0b1322, fog: false });                                                  // the Tower: a shape against the sky
  M.warm = new THREE.MeshStandardMaterial({ color: 0x1a1008, emissive: 0xffa040, emissiveIntensity: 5, roughness: 1 });  // lit doorways and the one lit window
  M.cold = new THREE.MeshStandardMaterial({ color: 0x0c1016, emissive: 0xbfd8ff, emissiveIntensity: 6, roughness: 1 });  // floodlights
  for (const k of ['warm', 'cold', 'far']) M[k].userData = { noCast: true };
  for (const k in M) if (!M[k].userData) M[k].userData = {};
  return { M, rects: atlas.rects, tex: { glow: glowTex(), puff: puffTex(), print: printTex(), snow: T.snow, snowN: T.snowN, atlas: T.atlas } };
}
