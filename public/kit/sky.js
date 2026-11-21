// KIT: the night sky (moon, stars, a slow aurora), the falling snow, fire, and the Tower's searchlight.
import * as THREE from './three.js';

export const MOON_DIR = new THREE.Vector3(0.22, 0.5, 0.84).normalize();   // where the moon sits: low over the avenue, south of the flat
export const FOG_COLOR = new THREE.Color(0x101a2c);

const NOISE = `
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 7.1; a *= 0.5; } return s; }`;

export function makeSky() {
  const uniforms = { uTime: { value: 0 }, uMoon: { value: MOON_DIR }, uFog: { value: FOG_COLOR }, uAurora: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false, uniforms,
    vertexShader: 'varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * mat4(mat3(modelViewMatrix)) * vec4(position, 1.0); gl_Position = p.xyww; }',
    fragmentShader: NOISE + `
uniform float uTime, uAurora; uniform vec3 uMoon, uFog; varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir); float h = max(d.y, 0.0);
  vec3 zen = vec3(0.012, 0.022, 0.055), mid = vec3(0.035, 0.065, 0.125);
  vec3 c = mix(uFog, mid, smoothstep(0.0, 0.22, h)); c = mix(c, zen, smoothstep(0.15, 0.9, h));
  /* stars */
  vec2 sp = d.xz / (abs(d.y) + 0.35) * 90.0; vec2 cell = floor(sp); float st = hash(cell);
  if (st > 0.985 && d.y > 0.02) { vec2 f = fract(sp) - 0.5 - (vec2(hash(cell + 3.1), hash(cell + 7.7)) - 0.5) * 0.6; float tw = 0.7 + 0.3 * sin(uTime * (1.5 + st * 40.0) + st * 90.0);
    c += vec3(0.8, 0.9, 1.0) * smoothstep(0.16, 0.0, length(f)) * (st - 0.985) * 70.0 * tw * smoothstep(0.02, 0.3, h); }
  /* aurora: tall curtains drifting over the southern sky */
  if (d.y > 0.03) { vec2 ap = d.xz / (d.y + 0.25); float warp = fbm(ap * 0.7 + vec2(uTime * 0.012, 0.0));
    float band = sin(ap.x * 1.6 + warp * 5.5 + uTime * 0.02), curt = smoothstep(0.55, 1.0, band) + 0.5 * smoothstep(0.2, 1.0, sin(ap.x * 3.1 - warp * 4.0 + 1.7));
    float rays = 0.55 + 0.45 * vn(vec2(ap.x * 14.0 + warp * 9.0, uTime * 0.07));
    float mask = smoothstep(0.05, 0.3, d.y) * smoothstep(1.0, 0.35, d.y) * smoothstep(-0.3, 0.5, d.z);
    vec3 ac = mix(vec3(0.10, 0.85, 0.48), vec3(0.42, 0.25, 0.85), smoothstep(0.25, 0.75, d.y));
    c += ac * curt * rays * mask * 0.20 * uAurora; }
  /* high thin cloud */
  float cl = fbm(d.xz / (h + 0.12) * 0.9 + vec2(uTime * 0.004, 0.0)); c = mix(c, uFog * 1.5 + 0.02, smoothstep(0.45, 0.9, cl) * 0.45 * smoothstep(0.0, 0.15, h));
  /* the moon and its halo */
  float m = dot(d, uMoon); c += vec3(0.55, 0.68, 0.95) * (pow(max(m, 0.0), 40.0) * 0.12 + pow(max(m, 0.0), 600.0) * 0.5);
  float disc = smoothstep(0.99955, 0.9997, m); vec3 md = d - uMoon; float mare = fbm(md.xy * 160.0); c = mix(c, vec3(2.6, 2.75, 3.0) * (0.72 + 0.4 * mare), disc);
  c = mix(uFog, c, smoothstep(-0.02, 0.1, d.y));
  gl_FragColor = vec4(c, 1.0); }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat); mesh.frustumCulled = false; mesh.renderOrder = -10;
  return { mesh, uniforms };
}

// Snowfall: flakes live in a box that follows the camera, and nothing falls inside the block of flats.
export function makeSnow(count) {
  const geo = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos[i * 3] = Math.random(); pos[i * 3 + 1] = Math.random(); pos[i * 3 + 2] = Math.random(); seed[i] = Math.random(); }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(44, 26, 44) }, uWind: { value: new THREE.Vector3(1.6, 0, -0.7) },
    uSize: { value: 1 }, uInside: { value: new THREE.Vector4(0, 0, 21, 14) }, uRoof: { value: 23 }, uGust: { value: 0 }, uTorch: { value: 0 }, uTorchDir: { value: new THREE.Vector3(0, 0, -1) } };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, uniforms, blending: THREE.NormalBlending,
    vertexShader: `uniform float uTime, uSize, uRoof, uGust, uTorch; uniform vec3 uCam, uBox, uWind, uTorchDir; uniform vec4 uInside; attribute float aSeed; varying float vA; varying float vLit;
void main() {
  float fall = 0.9 + aSeed * 1.1; vec3 p = position * uBox;
  p += uWind * uTime * (0.6 + aSeed * 0.8) * (1.0 + uGust * 2.0); p.y -= uTime * fall;
  p.x += sin(uTime * 0.7 + aSeed * 40.0) * 0.35; p.z += cos(uTime * 0.6 + aSeed * 23.0) * 0.35;
  p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
  bool inside = p.x > uInside.x && p.x < uInside.z && p.z > uInside.y && p.z < uInside.w && p.y < uRoof;
  vec4 mv = viewMatrix * vec4(p, 1.0); float dist = -mv.z;
  gl_Position = inside ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * mv;
  gl_PointSize = clamp(uSize * (0.35 + aSeed * 0.75) / max(dist, 0.3), 1.0, uSize * 0.06);
  vA = smoothstep(21.0, 12.0, dist) * smoothstep(0.25, 1.2, dist) * (0.45 + 0.55 * aSeed);
  vec3 toP = normalize(p - uCam); vLit = uTorch * pow(max(dot(toP, uTorchDir), 0.0), 14.0) * smoothstep(14.0, 1.0, dist); }`,
    fragmentShader: `varying float vA; varying float vLit; void main() { vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0; float a = smoothstep(1.0, 0.25, d) * vA; if (a < 0.01) discard;
  gl_FragColor = vec4(vec3(0.5, 0.62, 0.85) + vec3(4.0, 3.6, 3.0) * vLit, a * 0.8); }`,
  });
  const points = new THREE.Points(geo, mat); points.frustumCulled = false; points.renderOrder = 5;
  return { points, uniforms };
}

// A flame as one flat card that always faces you; the shape comes from moving noise.
export function makeFlameMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uSeed: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); vec3 sc = vec3(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz), 1.0);
  mv.xy += position.xy * sc.xy; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: NOISE + `uniform float uTime, uSeed; varying vec2 vUv;
void main() { vec2 p = vUv; float x = (p.x - 0.5) * 2.0; float t = uTime * 1.9 + uSeed * 10.0;
  float n = fbm(vec2(p.x * 3.4 + uSeed * 5.0, p.y * 2.4 - t)), n2 = fbm(vec2(p.x * 8.0 - uSeed, p.y * 5.0 - t * 2.1));
  float sway = (n - 0.5) * 1.1 * p.y + sin(t * 1.3 + p.y * 5.0) * 0.08 * p.y;
  float width = pow(1.0 - p.y, 0.8) * (0.62 + 0.3 * n2);
  float body = 1.0 - abs(x + sway) / max(width, 0.001);
  float tongues = 0.6 + 0.4 * sin(x * 9.0 + n2 * 7.0 + t * 2.0);
  float f = clamp(body, 0.0, 1.0) * smoothstep(0.0, 0.1, p.y) * (0.5 + 0.8 * n) * (1.0 - p.y * (0.45 + 0.7 * n2 * tongues));
  f = smoothstep(0.06, 0.7, f);
  vec3 col = mix(vec3(1.0, 0.13, 0.02), vec3(1.0, 0.58, 0.12), smoothstep(0.08, 0.5, f)); col = mix(col, vec3(1.0, 0.93, 0.62), smoothstep(0.55, 1.0, f));
  gl_FragColor = vec4(col * f * 5.0, f); }`,
  });
}

// The searchlight on the Tower: a long faint cone sweeping through the snow.
export function makeBeam(len = 260, spread = 16) {
  const geo = new THREE.CylinderGeometry(spread, 0.6, len, 24, 1, true); geo.translate(0, len / 2, 0); geo.rotateX(Math.PI / 2);   // points along +z from its origin
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uLen: { value: len }, uPower: { value: 1 } },
    vertexShader: 'varying float vT; varying vec3 vN; varying vec3 vV; uniform float uLen; void main() { vT = position.z / uLen; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vT; varying vec3 vN; varying vec3 vV; uniform float uPower; void main() { float rim = pow(abs(dot(normalize(vN), normalize(vV))), 2.5); float a = rim * (1.0 - vT) * (1.0 - vT) * smoothstep(0.0, 0.02, vT); gl_FragColor = vec4(vec3(0.75, 0.86, 1.0) * a * 0.5 * uPower, 1.0); }',
  });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 4; return mesh;
}
