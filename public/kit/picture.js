// KIT: the picture: the scene is drawn in real light levels, then "developed" once at the end (glow, exposure, night colour, grain).
// Slimmed down from Lake Valley's pipeline (src/core/pipeline.js and src/mods/post.js) so it also runs on tablets.
import * as THREE from './three.js';

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const tri = new THREE.BufferGeometry();
tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
tri.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
class Full {
  constructor(fragment, uniforms) {
    this.material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: 'varying vec2 vUv;\n' + fragment, uniforms, depthTest: false, depthWrite: false });
    this.u = uniforms; this.mesh = new THREE.Mesh(tri, this.material); this.mesh.frustumCulled = false;
  }
  render(renderer, target) { renderer.setRenderTarget(target); renderer.render(this.mesh, cam); }
}
let TYPE = THREE.HalfFloatType;                                           // real light levels need this; very old phones fall back to ordinary colour
const hdr = (o = {}) => new THREE.WebGLRenderTarget(1, 1, { type: TYPE, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, ...o });

const DOWN = `uniform sampler2D tColor; uniform vec2 uTexel; uniform float uFirst;
float kw(vec3 c) { return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722))); }
void main() { vec2 t = uTexel;
  vec3 a = texture2D(tColor, vUv + t * vec2(-1, -1)).rgb, b = texture2D(tColor, vUv + t * vec2(1, -1)).rgb, c = texture2D(tColor, vUv + t * vec2(-1, 1)).rgb, d = texture2D(tColor, vUv + t * vec2(1, 1)).rgb;
  if (uFirst > 0.5) { float w1 = kw(a), w2 = kw(b), w3 = kw(c), w4 = kw(d); gl_FragColor = vec4(min((a * w1 + b * w2 + c * w3 + d * w4) / (w1 + w2 + w3 + w4), vec3(200.0)), 1.0); }   /* single hot pixels must not flicker */
  else gl_FragColor = vec4((a + b + c + d) * 0.25, 1.0); }`;
const UP = `uniform sampler2D tColor, tBase; uniform vec2 uTexel; uniform float uMix;
void main() { vec2 t = uTexel; vec3 s = texture2D(tColor, vUv).rgb * 4.0;
  s += (texture2D(tColor, vUv + t * vec2(-1, 0)).rgb + texture2D(tColor, vUv + t * vec2(1, 0)).rgb + texture2D(tColor, vUv + t * vec2(0, 1)).rgb + texture2D(tColor, vUv + t * vec2(0, -1)).rgb) * 2.0;
  s += texture2D(tColor, vUv + t * vec2(-1, 1)).rgb + texture2D(tColor, vUv + t * vec2(1, 1)).rgb + texture2D(tColor, vUv + t * vec2(-1, -1)).rgb + texture2D(tColor, vUv + t * vec2(1, -1)).rgb;
  gl_FragColor = vec4(mix(texture2D(tBase, vUv).rgb, s / 16.0, uMix), 1.0); }`;
const FINAL = `uniform sampler2D tColor, tBloom; uniform float uBloom, uExposure, uVignette, uGrain, uFrame, uCold, uFade, uNight, uBlur, uAspect; uniform vec3 uFadeCol; uniform vec2 uTexel;
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
const mat3 R2020_TO_SRGB = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
const mat3 SRGB_TO_R2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
vec3 agxCurve(vec3 x) { vec3 x2 = x * x, x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232; }
vec3 agx(vec3 color) {
  const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
  const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
  color = inset * (SRGB_TO_R2020 * color); color = clamp((log2(max(color, 1e-10)) + 12.47393) / 16.5, 0.0, 1.0); color = agxCurve(color);
  color = pow(max(color, 0.0), vec3(1.12)); float l = dot(color, vec3(0.2126, 0.7152, 0.0722)); color = l + (color - l) * 1.2;
  color = outset * color; color = pow(max(vec3(0.0), color), vec3(2.2)); return clamp(R2020_TO_SRGB * color, 0.0, 1.0); }
void main() {
  vec2 uv = vUv; vec3 c = texture2D(tColor, uv).rgb;
  if (uBlur > 0.01) { vec2 o = uTexel * uBlur * 6.0; c = (c + texture2D(tColor, uv + o).rgb + texture2D(tColor, uv - o).rgb + texture2D(tColor, uv + o * vec2(1, -1)).rgb + texture2D(tColor, uv + o * vec2(-1, 1)).rgb
    + texture2D(tBloom, uv).rgb * 3.0) / 8.0; }                                                    /* waking up: the world swims into focus */
  c = mix(c, texture2D(tBloom, uv).rgb, uBloom);
  /* night eyes (from Lake Valley): in very little light the eye sees no colour, so the dark reads silver-blue while fires and lamps keep their warmth */
  float nL = dot(c, vec3(0.2126, 0.7152, 0.0722)); float rod = uNight * (1.0 - smoothstep(-7.5, -3.2, log2(max(nL, 1e-9))));
  float ys = dot(c, vec3(0.06, 0.56, 0.38)); c = mix(c, vec3(0.78, 0.92, 1.16) * mix(nL, ys, 0.5), rod);
  c = agx(c * uExposure); c = pow(c, vec3(1.0 / 2.2));
  /* film look: cool shadows, warm lights, a gentle S so darks have weight */
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c *= mix(vec3(0.90, 0.99, 1.12), vec3(1.05, 1.01, 0.95), smoothstep(0.1, 0.7, l));
  c = mix(c, c * c * (3.0 - 2.0 * c), 0.3);
  vec2 q = vUv - 0.5; float r2 = dot(q, q) * 2.6; c *= 1.0 - uVignette * smoothstep(0.2, 1.0, r2);
  /* the cold: frost creeps in from the edges of your sight */
  if (uCold > 0.001) { vec2 p = vUv * vec2(uAspect, 1.0); float n = vn(p * 7.0) * 0.6 + vn(p * 23.0) * 0.4, ridged = 1.0 - abs(2.0 * vn(p * 40.0 + n * 3.0) - 1.0);
    float edge = smoothstep(1.05 - uCold * 0.95, 1.25 - uCold * 0.6, sqrt(r2) + (n - 0.5) * 0.5); float f = edge * (0.55 + 0.45 * ridged * ridged);
    c = mix(c, vec3(0.80, 0.90, 1.0) * (0.55 + 0.5 * ridged), clamp(f, 0.0, 0.92)); c = mix(c, vec3(dot(c, vec3(0.3, 0.6, 0.1))) * vec3(0.9, 0.97, 1.08), uCold * 0.35); }
  float g = hash(gl_FragCoord.xy + fract(uFrame * 0.617) * 311.0) + hash(gl_FragCoord.yx * 1.7 + fract(uFrame * 0.383) * 173.0) - 1.0;
  c += g * uGrain * (0.35 + 0.65 * (1.0 - l));
  c = mix(c, uFadeCol, uFade);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }`;


// ---------------- soft shadow where things meet (Lake Valley's ambient occlusion: a horizon search in view space, half size) ----------------
const DEPTH = `uniform sampler2D tDepth; uniform float uNear, uFar; uniform vec2 uInvP;
float linZ(float d) { return uNear * uFar / (uFar - d * (uFar - uNear)); }
vec3 vpos(vec2 uv) { float z = linZ(texture2D(tDepth, uv).r); return vec3((uv * 2.0 - 1.0) * uInvP * z, -z); }
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }`;
const AO = DEPTH + `uniform vec2 uTexel, uProjXY, uRes; uniform float uRadius, uFrame;
#define PI 3.14159265
#define HPI 1.5707963
void main() {
  vec2 uv = (floor(vUv / uTexel) + 0.5) * uTexel;
  float d = texture2D(tDepth, uv).r; if (d >= 0.99999) { gl_FragColor = vec4(1.0, 6e4, 0.0, 1.0); return; }
  vec3 P = vpos(uv); float dist = -P.z;
  vec3 Pl = vpos(uv - vec2(uTexel.x, 0.0)), Pr = vpos(uv + vec2(uTexel.x, 0.0)), Pd = vpos(uv - vec2(0.0, uTexel.y)), Pu = vpos(uv + vec2(0.0, uTexel.y));
  vec3 dx = abs(Pl.z - P.z) < abs(Pr.z - P.z) ? P - Pl : Pr - P, dy = abs(Pd.z - P.z) < abs(Pu.z - P.z) ? P - Pd : Pu - P;
  vec3 N = normalize(cross(dx, dy)), V = normalize(-P);
  float R = uRadius * clamp(dist * 0.06, 1.0, 5.0);
  vec2 rUV = R * uProjXY * 0.5 / dist; float rPix = rUV.y * uRes.y;
  if (rPix < 3.0) { gl_FragColor = vec4(1.0, dist, 0.0, 1.0); return; }
  rUV *= min(1.0, 110.0 / rPix);
  float fr = 0.62 * R, fMul = -1.0 / fr, fAdd = (R - fr) / fr + 1.0;
  float n0 = ign(gl_FragCoord.xy + uFrame * vec2(5.588, 3.167)), n1 = fract(n0 * 7.31 + 0.37), vis = 0.0;
  for (int s = 0; s < SLICES; s++) {
    float phi = (float(s) + n0) / float(SLICES) * PI; vec2 om = vec2(cos(phi), sin(phi)); vec3 dirV = vec3(om, 0.0);
    vec3 ortho = dirV - dot(dirV, V) * V, axis = normalize(cross(dirV, V)), pN = N - axis * dot(N, axis); float pl = length(pN) + 1e-5;
    float sg = sign(dot(ortho, pN)), cosN = clamp(dot(pN, V) / pl, 0.0, 1.0), n = sg * acos(cosN);
    float low0 = cos(n + HPI), low1 = cos(n - HPI), hc0 = low0, hc1 = low1;
    for (int j = 0; j < STEPS; j++) {
      float t = (float(j) + n1) / float(STEPS); t = t * t; vec2 o = max(t, 1.5 / rPix) * rUV * om;
      vec3 a = vpos(uv + o) - P, b = vpos(uv - o) - P; float la = length(a), lb = length(b);
      if (la > 1e-4) hc0 = max(hc0, mix(low0, dot(a / la, V), clamp(la * fMul + fAdd, 0.0, 1.0)));
      if (lb > 1e-4) hc1 = max(hc1, mix(low1, dot(b / lb, V), clamp(lb * fMul + fAdd, 0.0, 1.0)));
    }
    float h0 = n + clamp(-acos(clamp(hc1, -1.0, 1.0)) - n, -HPI, HPI), h1 = n + clamp(acos(clamp(hc0, -1.0, 1.0)) - n, -HPI, HPI);
    vis += pl * ((cosN + 2.0 * h0 * sin(n) - cos(2.0 * h0 - n)) + (cosN + 2.0 * h1 * sin(n) - cos(2.0 * h1 - n))) * 0.25;
  }
  gl_FragColor = vec4(clamp(vis / float(SLICES), 0.0, 1.0), dist, 0.0, 1.0); }`;
// depth-aware blur for a half-size layer whose alpha (or green, for the shadow layer) holds the distance
const BLUR = `uniform sampler2D tIn; uniform vec2 uTexel; uniform float uKeyG;
void main() { vec4 c = texture2D(tIn, vUv); float key = uKeyG > 0.5 ? c.g : c.a; vec4 s = vec4(0.0); float w = 0.0, tol = 0.04 * key + 0.03;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) { vec4 t = texture2D(tIn, vUv + vec2(float(i), float(j)) * uTexel); float k = max(0.0, 1.0 - abs((uKeyG > 0.5 ? t.g : t.a) - key) / tol); s += t * k; w += k; }
  s = w > 0.0 ? s / w : c; gl_FragColor = uKeyG > 0.5 ? vec4(s.r, key, 0.0, 1.0) : vec4(s.rgb, key); }`;

// ---------------- mist with beams of light in it: each view ray is walked through the air, asking the moon's shadow map "is this bit of air lit?" ----------------
const MIST = DEPTH + `uniform sampler2D tShadow; uniform mat4 uViewInv, uShadowM; uniform vec3 uCam, uMoonDir, uMoonCol, uTorchDir, uTorchCol, uAir; uniform vec4 uInside; uniform vec2 uTexel;
uniform float uFrame, uTime, uHaze, uMist, uMistH, uDust, uRoof, uTorch, uHasShadow, uReach;
const vec4 UNPACK = (255.0 / 256.0) / vec4(16777216.0, 65536.0, 256.0, 1.0);
float lit(vec3 p) { if (uHasShadow < 0.5) return 1.0; vec4 sc = uShadowM * vec4(p, 1.0); sc.xyz /= sc.w; if (sc.x < 0.0 || sc.x > 1.0 || sc.y < 0.0 || sc.y > 1.0 || sc.z > 1.0) return 1.0; return step(sc.z - 0.0015, dot(texture2D(tShadow, sc.xy), UNPACK)); }
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 uv = (floor(vUv / uTexel) + 0.5) * uTexel; float d = texture2D(tDepth, uv).r; vec3 P = vpos(uv); float dist = -P.z;
  vec3 W = (uViewInv * vec4(P, 1.0)).xyz, ray = W - uCam; float len = length(ray); vec3 dir = ray / max(len, 1e-4); float reach = min(len, uReach);
  float jit = ign(gl_FragCoord.xy + uFrame * vec2(5.588, 3.167)), stepL = reach / float(MSTEPS);
  float cosM = dot(dir, uMoonDir), g = 0.55, phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosM, 1.5) * 0.25 + 0.2;      /* air glows most looking towards the light */
  float cosT = dot(dir, uTorchDir), cone = smoothstep(0.80, 0.94, cosT) * uTorch;
  vec3 sum = vec3(0.0); float trans = 1.0;
  for (int i = 0; i < MSTEPS; i++) {
    float t = (float(i) + jit) * stepL; vec3 p = uCam + dir * t;
    bool inside = p.x > uInside.x && p.x < uInside.z && p.z > uInside.y && p.z < uInside.w && p.y < uRoof;
    float drift = 0.55 + 0.9 * vn(p.xz * 0.11 + vec2(uTime * 0.06, uTime * 0.02) + p.y * 0.3);
    float dens = inside ? uDust : uHaze + uMist * exp(-max(p.y, 0.0) / uMistH) * drift;
    vec3 L = uMoonCol * phase * lit(p) + uAir * (inside ? 0.25 : 1.0);
    L += uTorchCol * cone * (0.9 / (0.6 + t * t * 0.22));                                                                         /* the torch beam showing in the air */
    sum += L * dens * stepL * trans; trans *= exp(-dens * stepL * 0.6);
  }
  gl_FragColor = vec4(sum, d >= 0.99999 ? 6e4 : min(dist, 6e4)); }`;

// ---------------- put the layers together (before the glow, so lit mist glows too) ----------------
const COMPOSE = `uniform sampler2D tColor, tDepth, tAO, tMist; uniform vec2 uHalf; uniform float uNear, uFar, uAOOn, uMistOn, uAOStrength, uExposure, uShowAO;
float linZ(float d) { return uNear * uFar / (uFar - d * (uFar - uNear)); }
void main() { vec3 col = texture2D(tColor, vUv).rgb; float d = texture2D(tDepth, vUv).r, dist = d >= 0.99999 ? 6e4 : linZ(d);
  vec2 p = vUv * uHalf - 0.5, f = fract(p), b = (floor(p) + 0.5) / uHalf; float ao = 0.0, wa = 0.0, wm = 0.0; vec3 mist = vec3(0.0);
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) { vec2 q = b + vec2(float(i), float(j)) / uHalf; float bl = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
    if (uAOOn > 0.5) { vec2 t = texture2D(tAO, q).rg; float k = bl * max(0.001, 1.0 - abs(t.g - dist) / (0.05 * dist + 0.03)); ao += t.r * k; wa += k; }
    if (uMistOn > 0.5) { vec4 t = texture2D(tMist, q); float k = bl * max(0.001, 1.0 - abs(min(t.a, 2000.0) - min(dist, 2000.0)) / (0.08 * min(dist, 2000.0) + 0.05)); mist += t.rgb * k; wm += k; } }
  if (uAOOn > 0.5 && d < 0.99999) { ao = min(1.0, ao / wa / 0.93); ao = mix(1.0, ao * ao * (1.4 - 0.4 * ao), uAOStrength); ao = mix(ao, 1.0, smoothstep(60.0, 200.0, dist));
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722)) * uExposure; ao = mix(ao, 1.0, clamp(lum * 1.6, 0.0, 1.0) * 0.55);        /* lit surfaces keep their direct light; only the dim fill is shaded */
    col *= mix(vec3(ao), pow(vec3(ao), vec3(1.0, 0.95, 0.88)), 0.5); if (uShowAO > 0.5) col = vec3(ao * 0.2); }
  if (uMistOn > 0.5) col += mist / max(wm, 1e-4);
  gl_FragColor = vec4(col, 1.0); }`;

export function makePost(renderer) {
  const gl = renderer.getContext(); if (!gl.getExtension('EXT_color_buffer_half_float') && !gl.getExtension('EXT_color_buffer_float')) TYPE = THREE.UnsignedByteType;
  const newScene = (samples) => { const t = hdr({ depthBuffer: true, samples }); t.depthTexture = new THREE.DepthTexture(1, 1, THREE.FloatType); t.depthTexture.minFilter = t.depthTexture.magFilter = THREE.NearestFilter; return t; };
  let scene = newScene(0), samples = 0, levels = 5, Q = { bloom: true, ao: 0, mist: 0 };
  const down = [], up = []; for (let i = 0; i < 6; i++) { down.push(hdr()); up.push(hdr()); }
  const half = (o) => hdr({ minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, ...o }), aoA = half(), aoB = half(), miA = half(), miB = half(), comp = hdr();
  for (const t of [aoA, aoB, miA, miB]) { t.texture.minFilter = t.texture.magFilter = THREE.NearestFilter; }
  const V2 = () => ({ value: new THREE.Vector2() }), F = (v = 0) => ({ value: v }), T = () => ({ value: null });
  const depthU = () => ({ tDepth: T(), uNear: F(0.1), uFar: F(900), uInvP: V2() });
  const pDown = new Full(DOWN, { tColor: T(), uTexel: V2(), uFirst: F() });
  const pUp = new Full(UP, { tColor: T(), tBase: T(), uTexel: V2(), uMix: F(0.6) });
  let pAO = null, pMist = null; const aoU = { ...depthU(), uTexel: V2(), uProjXY: V2(), uRes: V2(), uRadius: F(0.7), uFrame: F() };
  const mistU = { ...depthU(), tShadow: T(), uViewInv: { value: new THREE.Matrix4() }, uShadowM: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonCol: { value: new THREE.Color(0.5, 0.6, 1) },
    uTorchDir: { value: new THREE.Vector3(0, 0, -1) }, uTorchCol: { value: new THREE.Color(1, 0.9, 0.75) }, uAir: { value: new THREE.Color(0.02, 0.03, 0.05) }, uInside: { value: new THREE.Vector4(0, 0, 0, 0) }, uTexel: V2(),
    uFrame: F(), uTime: F(), uHaze: F(0.004), uMist: F(0.03), uMistH: F(3.5), uDust: F(0.02), uRoof: F(0), uTorch: F(0), uHasShadow: F(0), uReach: F(70) };
  const pBlur = new Full(BLUR, { tIn: T(), uTexel: V2(), uKeyG: F() });
  const pComp = new Full(COMPOSE, { tColor: T(), tDepth: T(), tAO: T(), tMist: T(), uHalf: V2(), uNear: F(0.1), uFar: F(900), uAOOn: F(), uMistOn: F(), uAOStrength: F(1), uExposure: F(1), uShowAO: F() });
  const fin = new Full(FINAL, { tColor: T(), tBloom: T(), uBloom: F(0.1), uExposure: F(1), uVignette: F(0.5), uGrain: F(0.03), uFrame: F(),
    uCold: F(), uFade: F(), uFadeCol: { value: new THREE.Color(0, 0, 0) }, uNight: F(0.75), uBlur: F(), uAspect: F(1), uTexel: V2() });
  const size = new THREE.Vector2(1, 1), hsize = new THREE.Vector2(1, 1); let frame = 0;
  const P = {
    u: fin.u, mist: mistU, compose: pComp.u,
    // { msaa, bloom, ao: 0 | steps per slice, mist: 0 | steps along each ray }
    setQuality(q) {
      Q = q;
      if (q.msaa !== samples) { samples = q.msaa; scene.dispose(); scene = newScene(samples); scene.setSize(size.x, size.y); }
      if (pAO) pAO.material.dispose(); pAO = q.ao ? new Full(`#define SLICES 2\n#define STEPS ${q.ao}\n` + AO, aoU) : null;
      if (pMist) pMist.material.dispose(); pMist = q.mist ? new Full(`#define MSTEPS ${q.mist}\n` + MIST, mistU) : null;
    },
    setSize(w, h) {
      size.set(w, h); scene.setSize(w, h); comp.setSize(w, h); fin.u.uAspect.value = w / h; fin.u.uTexel.value.set(1 / w, 1 / h);
      hsize.set(Math.max(2, w >> 1), Math.max(2, h >> 1)); for (const t of [aoA, aoB, miA, miB]) t.setSize(hsize.x, hsize.y);
      let lw = w, lh = h; levels = 0;
      for (let i = 0; i < 6; i++) { lw = Math.max(2, lw >> 1); lh = Math.max(2, lh >> 1); down[i].setSize(lw, lh); up[i].setSize(lw, lh); levels++; if (Math.min(lw, lh) < 12) break; }
    },
    // light: { dir, color, shadow (a three.js light shadow) } for the beams; opts: { time, torchDir, torchOn, exposure }
    render(world, camera, light, opts = {}) {
      frame = (frame + 1) % 64;
      renderer.setRenderTarget(scene); renderer.clear(); renderer.render(world, camera);
      let colour = scene.texture; const useAO = !!pAO, useMist = !!pMist && !!light;
      if (useAO || useMist) {
        const pm = camera.projectionMatrix.elements, depth = scene.depthTexture, inv = [1 / pm[0], 1 / pm[5]];
        for (const u of [aoU, mistU]) { u.tDepth.value = depth; u.uNear.value = camera.near; u.uFar.value = camera.far; u.uInvP.value.set(inv[0], inv[1]); u.uTexel.value.set(1 / hsize.x, 1 / hsize.y); u.uFrame.value = frame; }
        const blur = (src, dst, keyG) => { pBlur.u.tIn.value = src.texture; pBlur.u.uTexel.value.set(1 / hsize.x, 1 / hsize.y); pBlur.u.uKeyG.value = keyG; pBlur.render(renderer, dst); };
        if (useAO) { aoU.uProjXY.value.set(pm[0], pm[5]); aoU.uRes.value.copy(hsize); pAO.render(renderer, aoA); blur(aoA, aoB, 1); }
        if (useMist) {
          const sh = light.shadow, ok = sh && sh.map && sh.map.texture; mistU.uHasShadow.value = ok ? 1 : 0; if (ok) { mistU.tShadow.value = sh.map.texture; mistU.uShadowM.value.copy(sh.matrix); }
          mistU.uViewInv.value.copy(camera.matrixWorld); mistU.uCam.value.setFromMatrixPosition(camera.matrixWorld); mistU.uMoonDir.value.copy(light.dir); mistU.uMoonCol.value.copy(light.color);
          mistU.uTime.value = opts.time || 0; mistU.uTorch.value = opts.torchOn ? 1 : 0; if (opts.torchDir) mistU.uTorchDir.value.copy(opts.torchDir);
          pMist.render(renderer, miA); blur(miA, miB, 0);
        }
        const c = pComp.u; c.tColor.value = scene.texture; c.tDepth.value = depth; c.tAO.value = aoB.texture; c.tMist.value = miB.texture; c.uHalf.value.copy(hsize); c.uNear.value = camera.near; c.uFar.value = camera.far;
        c.uAOOn.value = useAO ? 1 : 0; c.uMistOn.value = useMist ? 1 : 0; c.uExposure.value = opts.exposure || 1; pComp.render(renderer, comp); colour = comp.texture;
      }
      let bloomTex = colour;
      if (Q.bloom) {
        let src = { texture: colour, width: size.x, height: size.y };
        for (let i = 0; i < levels; i++) { pDown.u.tColor.value = src.texture; pDown.u.uTexel.value.set(1 / src.width, 1 / src.height); pDown.u.uFirst.value = i === 0 ? 1 : 0; pDown.render(renderer, down[i]); src = down[i]; }
        let acc = down[levels - 1];
        for (let i = levels - 2; i >= 0; i--) { pUp.u.tColor.value = acc.texture; pUp.u.tBase.value = down[i].texture; pUp.u.uTexel.value.set(1 / acc.width, 1 / acc.height); pUp.render(renderer, up[i]); acc = up[i]; }
        bloomTex = acc.texture;
      }
      fin.u.tColor.value = colour; fin.u.tBloom.value = bloomTex; fin.u.uFrame.value = (fin.u.uFrame.value + 1) % 1000;
      const b = fin.u.uBloom.value; if (!Q.bloom) fin.u.uBloom.value = 0;
      fin.render(renderer, null); fin.u.uBloom.value = b;
    },
  };
  return P;
}
