// The picture: the scene is drawn in real light levels, then "developed" once at the end (glow, exposure, night colour, grain).
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

export function makePost(renderer) {
  const gl = renderer.getContext(); if (!gl.getExtension('EXT_color_buffer_half_float') && !gl.getExtension('EXT_color_buffer_float')) TYPE = THREE.UnsignedByteType;
  let scene = hdr({ depthBuffer: true, samples: 0 }), samples = 0, levels = 5, bloomOn = true;
  const down = [], up = [];
  for (let i = 0; i < 6; i++) { down.push(hdr()); up.push(hdr()); }
  const pDown = new Full(DOWN, { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 } });
  const pUp = new Full(UP, { tColor: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 0.6 } });
  const fin = new Full(FINAL, { tColor: { value: null }, tBloom: { value: null }, uBloom: { value: 0.1 }, uExposure: { value: 1 }, uVignette: { value: 0.5 }, uGrain: { value: 0.03 }, uFrame: { value: 0 },
    uCold: { value: 0 }, uFade: { value: 0 }, uFadeCol: { value: new THREE.Color(0, 0, 0) }, uNight: { value: 0.75 }, uBlur: { value: 0 }, uAspect: { value: 1 }, uTexel: { value: new THREE.Vector2() } });
  const size = new THREE.Vector2(1, 1);
  const P = {
    u: fin.u,
    setQuality({ msaa, bloom }) {
      bloomOn = bloom;
      if (msaa !== samples) { samples = msaa; scene.dispose(); scene = hdr({ depthBuffer: true, samples }); scene.setSize(size.x, size.y); }
    },
    setSize(w, h) {
      size.set(w, h); scene.setSize(w, h); fin.u.uAspect.value = w / h; fin.u.uTexel.value.set(1 / w, 1 / h);
      let lw = w, lh = h; levels = 0;
      for (let i = 0; i < 6; i++) { lw = Math.max(2, lw >> 1); lh = Math.max(2, lh >> 1); down[i].setSize(lw, lh); up[i].setSize(lw, lh); levels++; if (Math.min(lw, lh) < 12) break; }
    },
    render(world, camera) {
      renderer.setRenderTarget(scene); renderer.clear(); renderer.render(world, camera);
      let bloomTex = scene.texture;
      if (bloomOn) {
        let src = scene;
        for (let i = 0; i < levels; i++) { pDown.u.tColor.value = src.texture; pDown.u.uTexel.value.set(1 / src.width, 1 / src.height); pDown.u.uFirst.value = i === 0 ? 1 : 0; pDown.render(renderer, down[i]); src = down[i]; }
        let acc = down[levels - 1];
        for (let i = levels - 2; i >= 0; i--) { pUp.u.tColor.value = acc.texture; pUp.u.tBase.value = down[i].texture; pUp.u.uTexel.value.set(1 / acc.width, 1 / acc.height); pUp.render(renderer, up[i]); acc = up[i]; }
        bloomTex = acc.texture;
      }
      fin.u.tColor.value = scene.texture; fin.u.tBloom.value = bloomTex; fin.u.uFrame.value = (fin.u.uFrame.value + 1) % 1000;
      const b = fin.u.uBloom.value; if (!bloomOn) fin.u.uBloom.value = 0;
      fin.render(renderer, null); fin.u.uBloom.value = b;
    },
  };
  return P;
}
