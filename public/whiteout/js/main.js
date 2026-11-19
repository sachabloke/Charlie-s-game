// WHITEOUT, chapter one. You wake in a frozen flat, get out of the building, and follow the red light down the avenue.
import * as THREE from './three.js';
import { makeMaterials } from './textures.js';
import { buildWorld, Y2, BLOCK } from './world.js';
import { makeSky, makeSnow, makeFlameMaterial, MOON_DIR, FOG_COLOR } from './sky.js';
import { makePost } from './post.js';
import { Sound } from './audio.js';
import { FIRES, TRAIL } from './city.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window: carry on without saving */ } }, del(k) { try { localStorage.removeItem(k); } catch (e) { /* same */ } } };
const params = new URLSearchParams(location.search);

// ------------------------------------------------------------------ the story text
const NOTES = {
  door: { title: 'Taped to the door', text: 'If you are reading this, you finally woke up.\n\nWe waited as long as we could. The heating died on Day 41 and the cold got into everything. Everyone has gone to the Tower.\n\nYour torch is on the table. If the front door downstairs is frozen shut, the caretaker keeps tools in his office. The code is 4172.\n\nFollow the red light. I will be watching for you.\n\n— Ana' },
  corridor: { title: 'A packing list', text: 'THINGS TO TAKE\n\nwarm socks ✓\nBear ✓\ntorch ✓\nthe big blanket ✗ (too heavy)\n\nDad says we can’t take the cat.\n\nI am taking the cat.' },
  logbook: { title: 'Caretaker’s log', text: 'Day 38. Boiler failed again.\n\nDay 40. Pipes burst on the first floor. The whole landing is solid ice.\n\nDay 41. Council vans came. Everyone is to walk south and follow the red light.\n\nI have put barrels out along the avenue. Somebody ought to keep them burning.' },
  lamplighter: { title: 'Under a stone by the fire', text: 'To whoever comes after:\n\nI light the barrels every night, from the flats to the gate.\n\nStay by the fires. Do not stop in the open.\n\n— the Lamplighter' },
  bus: { title: 'Driver’s sheet, Route 7', text: 'Last run.\n\nEngine froze at the junction. Passengers went on by foot.\n\n31 adults\n9 children\n1 cat' },
  checkpoint: { title: 'Checkpoint 7, final entry', text: 'Count through the gate: 2,416.\n\nThe gate stays unlocked. The light stays on.\n\nIf you are late, you are still welcome.' },
};
const NOTE_COUNT = Object.keys(NOTES).length;
const CODE = '4172';

// ------------------------------------------------------------------ renderer and quality
const QUALITY = {
  high: { dpr: 1.5, msaa: 4, bloom: true, shadow: 2048, snow: 7000, torchShadow: true },
  medium: { dpr: 1.1, msaa: 2, bloom: true, shadow: 1024, snow: 4000, torchShadow: false },
  low: { dpr: 0.8, msaa: 0, bloom: false, shadow: 0, snow: 1800, torchShadow: false },
};
let qualityMode = params.get('q') || store.get('wo_quality') || 'auto';
const weak = (navigator.hardwareConcurrency || 4) <= 4 || /Mobi|Android|iPhone|iPad|CrOS/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
let quality = qualityMode === 'auto' ? (weak ? 'medium' : 'high') : qualityMode;
const canvas = $('view');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' }); } catch (e) { $('loading').textContent = 'This device cannot show 3D graphics.'; throw e; }
renderer.toneMapping = THREE.NoToneMapping; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.autoClear = false;
const post = makePost(renderer);
const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0062);
const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 900); camera.rotation.order = 'YXZ'; scene.add(camera);

const sky = makeSky(); sky.mesh.scale.setScalar(400); scene.add(sky.mesh);
let envMap = null;
{ const pm = new THREE.PMREMGenerator(renderer), s = new THREE.Scene(), m = sky.mesh.clone(); s.add(m); envMap = pm.fromScene(s, 0, 0.1, 1000).texture; pm.dispose(); }
const { M: mats, rects, tex } = makeMaterials(envMap);
const world = buildWorld(mats, rects); scene.add(world.group);
const dyn = world.dyn, anchors = world.anchors;

// lights: moon, sky fill, the torch, and two lamps handed to whichever fires are nearest
const hemi = new THREE.HemisphereLight(0x5f7fbd, 0x2b3650, 1.3); scene.add(hemi);
const moon = new THREE.DirectionalLight(0xa6c2ff, 4.6); moon.castShadow = true; moon.shadow.bias = -0.0006; moon.shadow.normalBias = 0.06;
Object.assign(moon.shadow.camera, { left: -42, right: 42, top: 42, bottom: -42, near: 10, far: 330 }); scene.add(moon, moon.target);
const torch = new THREE.SpotLight(0xffe9cc, 0, 40, 0.56, 1.0, 1.4); torch.shadow.mapSize.set(1024, 1024); torch.shadow.bias = -0.002; torch.shadow.camera.near = 0.2; torch.shadow.camera.far = 30;
const TORCH_POWER = 56;
const pool = [0, 1].map(() => { const l = new THREE.PointLight(0xff8a3a, 0, 18, 1.6); scene.add(l); return l; });

// snow, glows, fire
let snow = null;
function buildSnow(n) { if (snow) { scene.remove(snow.points); snow.points.geometry.dispose(); } snow = makeSnow(n); snow.uniforms.uInside.value.set(BLOCK.x0, BLOCK.z0, BLOCK.x1, BLOCK.z1); snow.uniforms.uRoof.value = BLOCK.h; scene.add(snow.points); }
const glowSprites = world.glows.map((g) => { const m = new THREE.SpriteMaterial({ map: tex.glow, color: new THREE.Color(g.color).multiplyScalar(g.beacon ? 5 : 2.4), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }); const s = new THREE.Sprite(m); s.position.set(g.x, g.y, g.z); s.scale.setScalar(g.size); s.userData = g; scene.add(s); return s; });
const flameMat = makeFlameMaterial(), flameGeo = new THREE.PlaneGeometry(1, 1); flameGeo.translate(0, 0.5, 0);
const fires = world.fires.map((f, i) => {
  const mat = flameMat.clone(); mat.uniforms.uSeed.value = i * 1.7; const a = new THREE.Mesh(flameGeo, mat); a.position.set(f.x, f.y - 0.12, f.z); a.scale.set(1.0, 1.45, 1); a.frustumCulled = false; a.renderOrder = 6; scene.add(a);
  const mat2 = flameMat.clone(); mat2.uniforms.uSeed.value = i * 1.7 + 4.3; const a2 = new THREE.Mesh(flameGeo, mat2); a2.position.set(f.x, f.y - 0.1, f.z); a2.scale.set(0.6, 0.95, 1); a2.frustumCulled = false; a2.renderOrder = 6; scene.add(a2);
  const gm = new THREE.SpriteMaterial({ map: tex.glow, color: new THREE.Color(0xff7a28).multiplyScalar(1.6), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true }); const g = new THREE.Sprite(gm); g.position.set(f.x, f.y + 0.4, f.z); g.scale.setScalar(5); scene.add(g);
  return { ...f, mesh: a, glow: g, mat, mat2 };
});
const lightSpots = [...fires.map((f) => ({ x: f.x, y: f.y + 0.7, z: f.z, color: 0xff8a3a, power: 70, range: 20, flicker: 1 })), ...world.spots];

// footprints: a faint trail left by someone else, and your own behind you
const PRINTS = 420; const prints = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.15, 0.32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex.print, color: 0x070d18, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), PRINTS);
prints.frustumCulled = false; prints.renderOrder = 1; scene.add(prints); let printN = 0, printStatic = 0;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
function addPrint(x, z, yaw, left, scale = 1) {
  const i = printN < PRINTS ? printN++ : (printStatic + ((printN++ - printStatic) % (PRINTS - printStatic)));
  const ox = Math.cos(yaw) * (left ? -0.11 : 0.11), oz = -Math.sin(yaw) * (left ? -0.11 : 0.11);
  _p.set(x + ox, world.snowH(x + ox, z + oz) + 0.012, z + oz); _e.set(0, yaw, 0); _q.setFromEuler(_e); _s.set(scale, 1, scale); prints.setMatrixAt(i, _m4.compose(_p, _q, _s)); prints.instanceMatrix.needsUpdate = true;
}
for (let i = 0; i < PRINTS; i++) prints.setMatrixAt(i, _m4.makeScale(0, 0, 0));
{ let left = false; for (let i = 0; i < TRAIL.length - 1; i++) { const [ax, az] = TRAIL[i], [bx, bz] = TRAIL[i + 1], len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(-(bx - ax), -(bz - az)); for (let d = 0; d < len && printN < 300; d += 0.72) { addPrint(ax + (bx - ax) * d / len, az + (bz - az) * d / len, yaw, left = !left, 1.1); } } printStatic = printN; }

// breath
const puffs = [0, 1, 2, 3].map(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.puff, color: 0x9fb2cc, transparent: true, opacity: 0, depthWrite: false, fog: false })); s.visible = false; s.userData = { life: 0, vel: new THREE.Vector3() }; scene.add(s); return s; });
let breathT = 2;

function applyQuality(q) {
  quality = q; const Q = QUALITY[q];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr)); post.setQuality(Q);
  moon.castShadow = Q.shadow > 0; if (Q.shadow) { moon.shadow.mapSize.set(Q.shadow, Q.shadow); if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; } }
  torch.castShadow = Q.torchShadow; buildSnow(Q.snow); resize();
}
function resize() {
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight; renderer.setSize(w, h, false);
  const pr = renderer.getPixelRatio(); post.setSize(Math.max(2, Math.round(w * pr)), Math.max(2, Math.round(h * pr))); camera.aspect = w / h; camera.fov = w < h ? 86 : 72; camera.updateProjectionMatrix();
  if (snow) snow.uniforms.uSize.value = h * pr * 0.085;
}
window.addEventListener('resize', resize); applyQuality(quality);

// ------------------------------------------------------------------ game state
const START = { x: 1.5, y: Y2, z: 11.7, yaw: Math.PI };            // standing at the foot of the bed, facing the smashed window and the avenue beyond
const S = {
  mode: 'title', ui: null, time: 0, played: 0,
  pos: new THREE.Vector3(START.x, START.y, START.z), vel: new THREE.Vector3(), yaw: START.yaw, pitch: 0, vy: 0, bob: 0, stepDist: 0, stepLeft: false,
  flags: { torch: false, torchOn: true, doorNote: false, aptOpen: false, officeOpen: false, crowbar: false, exitOpen: false, beenOut: false },
  notes: [], said: {}, warmth: 100, iceHits: 0, lastSafe: { x: 10.5, y: 0, z: 12.2, yaw: Math.PI }, objective: '', wrong: 0, exposure: 2.0, fade: 1, fadeTo: 1, fadeCol: 0, blur: 0, shake: 0, gust: 0, intro: 0, blackout: 0, ending: 0,
};
const sound = new Sound(); sound.muted = store.get('wo_mute') === '1';
const save = () => { if (S.mode === 'play' || S.mode === 'ui') store.set('wo_save', JSON.stringify({ v: 1, flags: S.flags, notes: S.notes, said: S.said, pos: [S.pos.x, S.pos.y, S.pos.z], yaw: S.yaw, warmth: S.warmth, played: S.played, iceHits: S.iceHits, lastSafe: S.lastSafe, objective: S.objective })); };
const loadSave = () => { try { const d = JSON.parse(store.get('wo_save') || 'null'); return d && d.v === 1 ? d : null; } catch (e) { return null; } };

// ------------------------------------------------------------------ HUD
let subTimer = null; const subQueue = [];
function say(text, ms = 3600) { subQueue.push([text, ms]); if (!subTimer) nextSub(); }
function nextSub() { const n = subQueue.shift(); if (!n) { subTimer = null; $('subs').classList.remove('on'); return; } $('subs').textContent = n[0]; $('subs').classList.add('on'); subTimer = setTimeout(() => { $('subs').classList.remove('on'); subTimer = setTimeout(nextSub, 450); }, n[1]); }
function once(key, text, ms) { if (S.said[key]) return false; S.said[key] = 1; if (text) say(text, ms); return true; }
function setObjective(t) { if (S.objective === t) return; S.objective = t; const el = $('objective'); el.classList.remove('on'); setTimeout(() => { $('objectiveText').textContent = t; el.classList.toggle('on', !!t); }, 350); }
function updateNotesHud() { $('noteCount').textContent = `${S.notes.length} / ${NOTE_COUNT}`; $('notesHud').classList.toggle('on', S.notes.length > 0); }
function showUi(name) { S.ui = name; S.mode = 'ui'; for (const id of ['paper', 'keypad', 'journal', 'pause']) $(id).hidden = id !== name; document.body.classList.add('ui-open'); if (document.pointerLockElement) document.exitPointerLock(); keys = {}; touch.move = null; }
function closeUi() { if (S.mode !== 'ui') return; const was = S.ui; S.ui = null; S.mode = 'play'; for (const id of ['paper', 'keypad', 'journal', 'pause']) $(id).hidden = true; document.body.classList.remove('ui-open'); lockPointer(); if (was === 'paper' && paperThen) { const f = paperThen; paperThen = null; f(); } save(); }
let paperThen = null;
function readNote(id, then) {
  const n = NOTES[id]; if (!S.notes.includes(id)) { S.notes.push(id); updateNotesHud(); }
  $('paperTitle').textContent = n.title; $('paperText').textContent = n.text; paperThen = then || null; sound.page(); showUi('paper');
}
function openJournal() {
  const list = $('journalList'); list.textContent = '';
  if (!S.notes.length) { const p = document.createElement('p'); p.className = 'empty'; p.textContent = 'Nothing yet. Notes you find are kept here.'; list.appendChild(p); }
  for (const id of S.notes) { const b = document.createElement('button'); b.className = 'jitem'; b.textContent = NOTES[id].title; b.addEventListener('click', () => readNote(id)); list.appendChild(b); }
  $('journalCount').textContent = `${S.notes.length} of ${NOTE_COUNT} found`; showUi('journal');
}

// ------------------------------------------------------------------ things you can use
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const interactables = [
  { id: 'torch', pos: anchors.table.clone().add(V(0, 0.05, 0)), r: 1.9, label: 'Take the torch', when: () => !S.flags.torch, act() { S.flags.torch = true; dyn.torch.visible = false; holdTorch(); sound.pickup(); say('It still works.'); setObjective('Leave the flat'); save(); } },
  { id: 'aptDoor', pos: V(10, Y2 + 1.2, 7.25), r: 1.7, label: () => (S.flags.doorNote ? 'Open the door' : 'Read the note on the door'), when: () => !S.flags.aptOpen,
    act() {
      if (!S.flags.torch) { say('There’s a note on the door. Too dark to read it. I need a light.'); setObjective('Find a light'); return; }
      if (!S.flags.doorNote) { S.flags.doorNote = true; dyn.doorNote.visible = false; readNote('door', openApt); return; }
      openApt();
    } },
  { id: 'corridorNote', pos: dyn.notes.corridor.position.clone().add(V(0, 0.2, 0)), r: 2.0, label: 'Pick up the paper', when: () => !S.notes.includes('corridor'), act() { dyn.notes.corridor.visible = false; readNote('corridor'); } },
  { id: 'iceDoor', pos: anchors.iceDoor, r: 2.0, label: 'Look at the door', when: () => !S.said.iceDoor, act() { once('iceDoor', 'Frozen solid. Nobody is getting through there.'); } },
  { id: 'keypad', pos: anchors.keypad, r: 1.8, label: 'Use the keypad', when: () => !S.flags.officeOpen, act() { kpValue = ''; kpShow(); $('kpHint').textContent = S.notes.includes('door') ? 'The code is in your notes.' : 'Four numbers. Someone must have written them down.'; showUi('keypad'); } },
  { id: 'crowbar', pos: anchors.toolboard, r: 1.9, label: 'Take the crowbar', when: () => S.flags.officeOpen && !S.flags.crowbar, act() { S.flags.crowbar = true; dyn.crowbar.visible = false; sound.pickup(); say('This will do.'); setObjective('Break the ice on the front door'); save(); } },
  { id: 'logbook', pos: anchors.logbook, r: 1.7, label: 'Read the logbook', when: () => S.flags.officeOpen && !S.notes.includes('logbook'), act() { dyn.notes.logbook.visible = false; readNote('logbook'); } },
  { id: 'radio', pos: anchors.radio, r: 1.6, label: 'Listen to the radio', when: () => S.flags.officeOpen && !S.said.radio, act() { once('radio', '“…kzzt… Tower to any… kzzt… light is on… come south…”', 5200); } },
  { id: 'mainDoor', pos: V(10.5, 1.3, 13.5), r: 2.1, label: () => (S.flags.crowbar ? 'Break the ice' : 'Open the door'), when: () => !S.flags.exitOpen,
    act() {
      if (!S.flags.crowbar) { say('Frozen shut. I need something to break the ice.'); if (S.flags.doorNote) setObjective('Find tools in the caretaker’s office (code 4172)'); else setObjective('Find something to break the ice'); return; }
      S.iceHits++; S.shake = 0.5; const last = S.iceHits >= 3; sound.iceHit(last);
      dyn.exitIce.children.forEach((m, i) => { if (i % 3 === (S.iceHits - 1) % 3 || last) m.userData.fall = 0.001 + Math.random() * 0.2; });
      if (last) openExit(); else save();
    } },
  { id: 'lamplighter', pos: anchors.lamplighter.clone().add(V(0, 0.1, 0)), r: 2.0, label: 'Read the note', when: () => !S.notes.includes('lamplighter'), act() { noteMeshes.lamplighter.visible = false; readNote('lamplighter'); } },
  { id: 'bus', pos: anchors.bus.clone().add(V(0, 0.2, 0)), r: 2.2, label: 'Read the sheet', when: () => !S.notes.includes('bus'), act() { noteMeshes.bus.visible = false; readNote('bus'); } },
  { id: 'checkpoint', pos: anchors.checkpoint.clone().add(V(0, 0.1, 0)), r: 2.2, label: 'Read the last entry', when: () => !S.notes.includes('checkpoint'), act() { noteMeshes.checkpoint.visible = false; readNote('checkpoint'); } },
];
const noteMeshes = {};
for (const [k, a, ry] of [['lamplighter', anchors.lamplighter, 0.4], ['bus', anchors.bus, 1.2], ['checkpoint', anchors.checkpoint, 0.2]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.28), mats.paper); m.rotation.set(-Math.PI / 2, 0, ry); m.position.copy(a).add(V(0, 0.07, 0)); if (k === 'bus') m.position.y = 0.55; scene.add(m); noteMeshes[k] = m; }
// small markers so things you can pick up catch the eye
const markers = interactables.filter((i) => ['torch', 'corridorNote', 'crowbar', 'logbook', 'lamplighter', 'bus', 'checkpoint'].includes(i.id)).map((it) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: new THREE.Color(0xffd9a0).multiplyScalar(0.9), blending: THREE.AdditiveBlending, depthWrite: false, fog: false, transparent: true })); s.position.copy(it.pos); s.scale.setScalar(0.5); s.renderOrder = 8; scene.add(s); return { it, s }; });

function holdTorch() { camera.add(torch); camera.add(torch.target); torch.position.set(0.22, -0.2, 0.05); torch.target.position.set(0.02, -0.03, -4); torch.intensity = S.flags.torchOn ? TORCH_POWER : 0; }
function restTorch() { scene.add(torch); scene.add(torch.target); torch.position.copy(dyn.torch.position).add(V(-0.13, 0, -0.06)); torch.target.position.copy(dyn.torch.position).add(V(-3.3, -0.25, -1.5)); torch.intensity = TORCH_POWER * 0.7; }
function openApt() { if (S.flags.aptOpen) return; S.flags.aptOpen = true; dyn.aptDoorSolid.off = true; sound.play('creak', { gain: 0.5, rate: 0.6 }); sound.play('door', { gain: 0.35, rate: 0.8, delay: 0.5 }); setObjective('Get out of the building'); save(); }
function openOffice() { S.flags.officeOpen = true; dyn.officeDoorSolid.off = true; dyn.keypadLed.material.emissive.setHex(0x20ff50); sound.play('creak', { gain: 0.4, rate: 0.8, delay: 0.3 }); setObjective('Search the office for tools'); save(); }
function openExit() {
  S.flags.exitOpen = true; dyn.exitSolid.off = true; S.gust = 1; S.shake = 0.9; sound.play('door', { gain: 0.6, rate: 0.6, delay: 0.25 });
  setTimeout(() => say('The whole city… frozen.', 3800), 2600); setTimeout(() => say('There. The red light.', 3600), 7200); setObjective('Follow the red light to the Tower'); save();
}
// put doors, pick-ups and lights where the flags say they should be (after loading a saved game)
function applyFlags(instant) {
  const f = S.flags; dyn.torch.visible = !f.torch; if (f.torch) holdTorch(); else restTorch();
  dyn.doorNote.visible = !f.doorNote; dyn.aptDoorSolid.off = f.aptOpen; dyn.officeDoorSolid.off = f.officeOpen; dyn.exitSolid.off = f.exitOpen; dyn.crowbar.visible = !f.crowbar;
  dyn.keypadLed.material.emissive.setHex(f.officeOpen ? 0x20ff50 : 0xff2010);
  dyn.notes.corridor.visible = !S.notes.includes('corridor'); dyn.notes.logbook.visible = !S.notes.includes('logbook'); for (const k in noteMeshes) noteMeshes[k].visible = !S.notes.includes(k);
  dyn.exitIce.children.forEach((m) => { m.visible = !f.exitOpen; });
  if (instant) { dyn.aptDoor.rotation.y = f.aptOpen ? 1.9 : 0; dyn.officeDoor.rotation.y = -Math.PI / 2 - (f.officeOpen ? 1.7 : 0); dyn.exitL.rotation.y = f.exitOpen ? -1.9 : 0; dyn.exitR.rotation.y = f.exitOpen ? 1.9 : 0; }
  $('warmHud').classList.toggle('on', f.beenOut); updateNotesHud();
}

// keypad
let kpValue = '';
function kpShow() { $('kpDisplay').textContent = (kpValue + '____').slice(0, 4).split('').join(' '); }
function kpPress(k) {
  if (S.ui !== 'keypad') return;
  if (k === 'del') { kpValue = kpValue.slice(0, -1); sound.key(); kpShow(); return; }
  if (kpValue.length >= 4) return; kpValue += k; sound.key(); kpShow();
  if (kpValue.length === 4) setTimeout(() => {
    if (kpValue === CODE) { sound.right(); $('kpDisplay').classList.add('ok'); setTimeout(() => { $('kpDisplay').classList.remove('ok'); closeUi(); openOffice(); }, 650); }
    else { sound.wrong(); S.wrong++; $('kpDisplay').classList.add('bad'); $('kpHint').textContent = S.notes.includes('door') ? 'Not that. Ana’s note has the code: press Notes.' : 'Not that. There was a note on the door of the flat.'; setTimeout(() => { $('kpDisplay').classList.remove('bad'); kpValue = ''; kpShow(); }, 600); }
  }, 180);
}

// ------------------------------------------------------------------ input
let keys = {}; const touch = { on: false, move: null, look: null };
let dragLook = false, dragging = false, lockFailed = false;
function lockPointer() { if (touch.on || S.mode !== 'play') return; try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { lockFailed = true; dragLook = true; document.body.classList.add('drag'); }); } catch (e) { lockFailed = true; dragLook = true; document.body.classList.add('drag'); } }
document.addEventListener('pointerlockerror', () => { lockFailed = true; dragLook = true; document.body.classList.add('drag'); });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && S.mode === 'play' && !touch.on && !dragLook && performance.now() - lastLockAt > 300) openPause(); if (document.pointerLockElement) lastLockAt = performance.now(); });
let lastLockAt = 0;
const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', ShiftLeft: 'run', ShiftRight: 'run' };
window.addEventListener('keydown', (e) => {
  if (e.repeat) return; sound.start('./sounds/');
  if (S.mode === 'ui') {
    if (S.ui === 'keypad') { if (/^Digit\d$|^Numpad\d$/.test(e.code)) kpPress(e.code.slice(-1)); else if (e.code === 'Backspace') kpPress('del'); }
    if (e.code === 'Escape' || (e.code === 'KeyE' && S.ui === 'paper') || (e.code === 'Enter' && S.ui !== 'keypad') || (e.code === 'KeyN' && S.ui === 'journal') || (e.code === 'KeyP' && S.ui === 'pause')) { e.preventDefault(); closeUi(); }
    return;
  }
  if (S.mode === 'intro' && (e.code === 'Space' || e.code === 'Enter') && S.intro > 1.5) { S.intro = Math.max(S.intro, 9.4); return; }
  if (S.mode !== 'play') return;
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = true; e.preventDefault(); }
  else if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); interact(); }
  else if (e.code === 'KeyF') toggleTorch();
  else if (e.code === 'KeyN' || e.code === 'KeyJ' || e.code === 'Tab') { e.preventDefault(); openJournal(); }
  else if (e.code === 'KeyP' || e.code === 'Escape') openPause();
  else if (e.code === 'KeyM') { sound.setMuted(!sound.muted); store.set('wo_mute', sound.muted ? '1' : '0'); syncMute(); }
});
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });
window.addEventListener('blur', () => { keys = {}; });
document.addEventListener('visibilitychange', () => { if (document.hidden && S.mode === 'play') openPause(); });
canvas.addEventListener('mousedown', () => { sound.start('./sounds/'); if (S.mode !== 'play' || touch.on) return; if (dragLook) dragging = true; else if (!document.pointerLockElement) lockPointer(); });
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => { if (S.mode !== 'play') return; if (document.pointerLockElement === canvas || (dragLook && dragging)) look(e.movementX * 0.0023, e.movementY * 0.0023); });
function look(dx, dy) { S.yaw -= dx; S.pitch = clamp(S.pitch - dy, -1.35, 1.35); }
function toggleTorch() { if (!S.flags.torch) return; S.flags.torchOn = !S.flags.torchOn; torch.intensity = S.flags.torchOn ? TORCH_POWER : 0; sound.click(); }
const STICK = 52;
window.addEventListener('touchstart', () => { if (!touch.on) { touch.on = true; document.body.classList.add('touch'); } }, { passive: true, capture: true });
canvas.addEventListener('touchstart', (e) => {
  sound.start('./sounds/');
  for (const t of e.changedTouches) { const st = { id: t.identifier, sx: t.clientX, sy: t.clientY, x: t.clientX, y: t.clientY }; if (t.clientX < window.innerWidth * 0.45) { if (!touch.move) { touch.move = st; const k = $('stick'); k.style.left = t.clientX + 'px'; k.style.top = t.clientY + 'px'; k.classList.add('on'); } } else if (!touch.look) touch.look = st; }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (touch.move && touch.move.id === t.identifier) { touch.move.x = t.clientX; touch.move.y = t.clientY; const dx = t.clientX - touch.move.sx, dy = t.clientY - touch.move.sy, l = Math.min(STICK, Math.hypot(dx, dy)), a = Math.atan2(dy, dx); $('stickKnob').style.transform = `translate(${Math.cos(a) * l}px, ${Math.sin(a) * l}px)`; }
    if (touch.look && touch.look.id === t.identifier) { if (S.mode === 'play') look((t.clientX - touch.look.x) * 0.0052, (t.clientY - touch.look.y) * 0.0046); touch.look.x = t.clientX; touch.look.y = t.clientY; }
  }
  e.preventDefault();
}, { passive: false });
const touchEnd = (e) => { for (const t of e.changedTouches) { if (touch.move && touch.move.id === t.identifier) { touch.move = null; $('stick').classList.remove('on'); $('stickKnob').style.transform = ''; } if (touch.look && touch.look.id === t.identifier) touch.look = null; } };
canvas.addEventListener('touchend', touchEnd); canvas.addEventListener('touchcancel', touchEnd);
const tap = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); sound.start('./sounds/'); fn(e); });
tap('btnUse', () => interact()); tap('btnTorch', toggleTorch); tap('btnNotes', () => { if (S.mode === 'play') openJournal(); }); tap('btnPause', () => { if (S.mode === 'play') openPause(); });
tap('paperClose', closeUi); tap('kpClose', closeUi); tap('journalClose', closeUi); tap('resumeBtn', closeUi);
document.querySelectorAll('#kpKeys button').forEach((b) => b.addEventListener('click', () => kpPress(b.dataset.k)));
function syncMute() { $('muteBtn').textContent = sound.muted ? 'Sound: off' : 'Sound: on'; }
tap('muteBtn', () => { sound.setMuted(!sound.muted); store.set('wo_mute', sound.muted ? '1' : '0'); syncMute(); });
function openPause() { if (S.mode !== 'play') return; $('qualitySel2').value = qualityMode; syncMute(); showUi('pause'); }
for (const id of ['qualitySel', 'qualitySel2']) $(id).addEventListener('change', (e) => { qualityMode = e.target.value; store.set('wo_quality', qualityMode); applyQuality(qualityMode === 'auto' ? (weak ? 'medium' : 'high') : qualityMode); $('qualitySel').value = $('qualitySel2').value = qualityMode; });
tap('restartBtn', () => { store.del('wo_save'); closeUi(); newGame(); });

// ------------------------------------------------------------------ interaction
let current = null; const _fwd = new THREE.Vector3(), _to = new THREE.Vector3(), _eye = new THREE.Vector3();
function findInteract() {
  camera.getWorldDirection(_fwd); _eye.copy(camera.position); let best = null, bs = 0;
  for (const it of interactables) {
    if (!it.when()) continue; _to.copy(it.pos).sub(_eye); const d = _to.length(); if (d > it.r) continue;
    const dot = _to.normalize().dot(_fwd); if (dot < 0.55 && d > 0.8) continue; const sc = dot - d * 0.12; if (!best || sc > bs) { best = it; bs = sc; }
  }
  return best;
}
function interact() { if (S.mode !== 'play') return; const it = findInteract(); if (it) { it.act(); current = null; refreshPrompt(); } }
let promptText = '';
function refreshPrompt() {
  const it = S.mode === 'play' ? findInteract() : null; current = it; const text = it ? (typeof it.label === 'function' ? it.label() : it.label) : '';
  if (text !== promptText) { promptText = text; $('promptText').textContent = text; $('prompt').classList.toggle('on', !!text); $('btnUse').classList.toggle('on', !!text); $('btnUse').textContent = text || 'Use'; }
}

// ------------------------------------------------------------------ moving about
const R = 0.32;
function collide(p) {
  for (let pass = 0; pass < 2; pass++) for (const c of world.colliders) {
    if (c.off || c.y0 >= p.y + 1.7 || c.y1 <= p.y + 0.45) continue;
    if (c.r !== undefined) { const dx = p.x - c.cx, dz = p.z - c.cz, d = Math.hypot(dx, dz), m = c.r + R; if (d < m && d > 1e-6) { p.x += dx / d * (m - d); p.z += dz / d * (m - d); } continue; }
    let lx, lz, hx, hz, cs = 1, sn = 0, cx, cz;
    if (c.hx !== undefined) { cs = Math.cos(c.ry); sn = Math.sin(c.ry); cx = c.cx; cz = c.cz; hx = c.hx; hz = c.hz; const dx = p.x - cx, dz = p.z - cz; lx = dx * cs - dz * sn; lz = dx * sn + dz * cs; }
    else { if (p.x < c.x0 - R || p.x > c.x1 + R || p.z < c.z0 - R || p.z > c.z1 + R) continue; cx = (c.x0 + c.x1) / 2; cz = (c.z0 + c.z1) / 2; hx = (c.x1 - c.x0) / 2; hz = (c.z1 - c.z0) / 2; lx = p.x - cx; lz = p.z - cz; }
    const qx = clamp(lx, -hx, hx), qz = clamp(lz, -hz, hz); let dx = lx - qx, dz = lz - qz; const d2 = dx * dx + dz * dz; if (d2 >= R * R) continue;
    let px, pz;
    if (d2 > 1e-10) { const d = Math.sqrt(d2); px = dx / d * (R - d); pz = dz / d * (R - d); }
    else { const ex = hx - Math.abs(lx) + R, ez = hz - Math.abs(lz) + R; if (ex < ez) { px = Math.sign(lx || 1) * ex; pz = 0; } else { px = 0; pz = Math.sign(lz || 1) * ez; } }
    p.x += px * cs + pz * sn; p.z += -px * sn + pz * cs;
  }
}
const inBlock = (x, z) => x > BLOCK.x0 && x < BLOCK.x1 && z > BLOCK.z0 && z < BLOCK.z1;
function groundAt(x, z, y) {
  if (!inBlock(x, z)) return world.snowH(x, z) - 0.05;
  let best = -1e9; for (const p of world.platforms) { if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue; const h = typeof p.h === 'function' ? p.h(x, z) : p.h; if (h <= y + 0.55 && h > best) best = h; }
  return best;
}
function movePlayer(dt) {
  let ix = 0, iz = 0, run = !!keys.run;
  if (keys.f) iz += 1; if (keys.b) iz -= 1; if (keys.r) ix += 1; if (keys.l) ix -= 1;
  if (touch.move) { const dx = touch.move.x - touch.move.sx, dy = touch.move.y - touch.move.sy, l = Math.hypot(dx, dy); if (l > 6) { const k = Math.min(1, l / STICK); ix = dx / l * k; iz = -dy / l * k; run = l > STICK * 1.35; } }
  const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
  const outside = !inBlock(S.pos.x, S.pos.z), cold = sstep(35, 0, S.warmth), speed = (run ? 5.4 : 3.5) * (outside ? 0.92 : 1) * (1 - 0.3 * cold);
  const sn = Math.sin(S.yaw), cs = Math.cos(S.yaw), tx = (-sn * iz + cs * ix) * speed, tz = (-cs * iz - sn * ix) * speed, a = 1 - Math.exp(-dt * (il > 0 ? 12 : 9));
  S.vel.x = lerp(S.vel.x, tx, a); S.vel.z = lerp(S.vel.z, tz, a);
  const sp = Math.hypot(S.vel.x, S.vel.z), n = Math.max(1, Math.ceil(sp * dt / 0.12)), ox = S.pos.x, oz = S.pos.z;
  for (let i = 0; i < n; i++) { S.pos.x += S.vel.x * dt / n; S.pos.z += S.vel.z * dt / n; collide(S.pos); }
  const g = groundAt(S.pos.x, S.pos.z, S.pos.y);
  if (S.pos.y > g + 0.03) { S.vy -= 16 * dt; S.pos.y = Math.max(g, S.pos.y + S.vy * dt); if (S.pos.y === g) S.vy = 0; } else { S.vy = 0; S.pos.y = lerp(S.pos.y, g, 1 - Math.exp(-dt * 22)); }
  const moved = Math.hypot(S.pos.x - ox, S.pos.z - oz); S.bob += moved * 1.9; S.stepDist += moved;
  if (S.stepDist > (run ? 0.95 : 0.72)) {
    S.stepDist = 0; S.stepLeft = !S.stepLeft;
    if (outside) { sound.play('step-gravel', { gain: 0.34, rate: 0.72 + Math.random() * 0.12, lp: 2600 }); addPrint(S.pos.x, S.pos.z, Math.atan2(-S.vel.x, -S.vel.z), S.stepLeft); }
    else sound.play('step-stone', { gain: 0.3, rate: 0.9 + Math.random() * 0.15 });
  }
  return { outside, sp };
}

// ------------------------------------------------------------------ places that say something as you pass
function triggers(outside) {
  const p = S.pos, f = S.flags;
  if (f.aptOpen && p.z < 6.9 && p.y > 5 && p.x < 14.4) once('corridor', 'Everyone left in a hurry.');
  if (p.x > 14.6 && p.y < 5.2 && p.y > 4.2) once('stairs', 'Snow… inside the building.');
  if (p.x < 14.3 && p.y < 1 && !outside && p.x > 6.2) { if (once('lobby')) { if (!f.exitOpen) setObjective('Find a way out through the front door'); } }
  if (outside && !f.beenOut) { f.beenOut = true; $('warmHud').classList.add('on'); setTimeout(() => showTip('The cold drains your warmth. Fires warm you up again.'), 9500); save(); }
  if (outside) {
    if (Math.hypot(p.x - FIRES[0][0], p.z - FIRES[0][1]) < 4.5) once('fire1', 'Somebody lit this. Not long ago.', 3800);
    if (p.z > 49 && p.z < 66) once('bus', 'Route 7. It never got there.');
    if (p.z > 96 && p.z < 110) once('clock', 'All the clocks stopped at the same time.');
    if (p.z > 132 && p.z < 150) once('window', 'A light. Up there, in that window. Someone is still here.', 5200);
    if (p.z > 164) once('past', 'Almost there. Keep moving.');
    if (p.z > 192) { if (once('plaza', 'The Tower.', 3000)) setObjective('Go through the gate'); }
    if (p.z > 235.1 && p.x > 10.3 && p.x < 12.4 && !S.ending) { S.ending = 0.001; S.mode = 'end'; if (document.pointerLockElement) document.exitPointerLock(); }
  }
}
let tipTimer = null;
function showTip(t) { $('tip').textContent = t; $('tip').classList.add('on'); clearTimeout(tipTimer); tipTimer = setTimeout(() => $('tip').classList.remove('on'), 7000); }

// ------------------------------------------------------------------ title, new game, continue
function newGame() {
  Object.assign(S.flags, { torch: false, torchOn: true, doorNote: false, aptOpen: false, officeOpen: false, crowbar: false, exitOpen: false, beenOut: false });
  S.notes = []; S.said = {}; S.warmth = 100; S.iceHits = 0; S.played = 0; S.wrong = 0; S.ending = 0; S.blackout = 0; S.lastSafe = { x: 10.5, y: 0, z: 12.2, yaw: Math.PI }; S.objective = ''; $('objective').classList.remove('on');
  S.pos.set(START.x, START.y, START.z); S.vel.set(0, 0, 0); S.yaw = START.yaw; S.pitch = 0; S.intro = 0; S.mode = 'intro'; S.fade = 1; S.fadeCol = 0; S.blur = 1;
  dyn.exitIce.children.forEach((m) => { if (m.userData.home) m.position.copy(m.userData.home); m.userData.fall = 0; });
  applyFlags(true); hideTitle(); $('end').hidden = true; document.body.classList.add('playing');
}
function continueGame(d) {
  Object.assign(S.flags, d.flags); S.notes = d.notes || []; S.said = d.said || {}; S.warmth = d.warmth ?? 100; S.played = d.played || 0; S.iceHits = d.iceHits || 0; S.lastSafe = d.lastSafe || S.lastSafe; S.ending = 0; S.blackout = 0;
  S.pos.set(d.pos[0], d.pos[1], d.pos[2]); S.vel.set(0, 0, 0); S.yaw = d.yaw; S.pitch = 0; S.mode = 'play'; S.fade = 1; S.fadeTo = 0; S.fadeCol = 0; S.blur = 0; S.objective = ''; setObjective(d.objective || '');
  applyFlags(true); hideTitle(); $('end').hidden = true; document.body.classList.add('playing'); lockPointer();
}
function hideTitle() { $('title').classList.add('gone'); setTimeout(() => { $('title').hidden = true; }, 900); }
dyn.exitIce.children.forEach((m) => { m.userData.home = m.position.clone(); });
tap('playBtn', () => { sound.start('./sounds/'); newGame(); });
tap('continueBtn', () => { const d = loadSave(); if (d) continueGame(d); });
tap('againBtn', () => { store.del('wo_save'); $('end').hidden = true; newGame(); });
{ const d = loadSave(); $('continueBtn').hidden = !d; if (d) { $('playBtn').textContent = 'New game'; $('playBtn').classList.add('second'); } $('qualitySel').value = qualityMode; }

// the waking-up sequence: eyes open on the ceiling, sit up, stand
const INTRO = [ // time, x, y(above floor), z, yaw, pitch, roll
  [0, 1.2, 0.72, 10.1, 2.2, 1.15, 0.5], [3.2, 1.2, 0.72, 10.1, 2.3, 1.05, 0.45], [5.6, 1.35, 1.12, 10.45, 2.95, 0.14, 0.08], [7.2, 1.45, 1.15, 10.9, 3.1, -0.04, 0], [9.4, START.x, 1.62, START.z, START.yaw, 0.03, 0],
];
function introCam(t) {
  let i = 0; while (i < INTRO.length - 2 && t > INTRO[i + 1][0]) i++; const a = INTRO[i], b = INTRO[i + 1], k = sstep(a[0], b[0], t), L = (j) => lerp(a[j], b[j], k);
  camera.position.set(L(1), Y2 + L(2), L(3)); camera.rotation.set(L(5), L(4), L(6));
}

// ------------------------------------------------------------------ every frame
let last = performance.now(), fpsAcc = 0, fpsN = 0, fpsSince = performance.now(), hudT = 0;
const _c = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; S.time += dt; const t = S.time;
  let outside = !inBlock(S.pos.x, S.pos.z), speed = 0;

  if (S.mode === 'title') {                                            // the title looks down the avenue from above the street
    camera.position.set(10.5 + Math.sin(t * 0.05) * 2.5, 9.5 + Math.sin(t * 0.08) * 0.6, 21); camera.rotation.set(-0.02 + Math.sin(t * 0.07) * 0.015, Math.PI + Math.sin(t * 0.04) * 0.07, 0); outside = true;
    S.fade = lerp(S.fade, 0.0, 1 - Math.exp(-dt * 1.2));
  } else if (S.mode === 'intro') {
    S.intro += dt; const k = S.intro; introCam(k); outside = false;
    const lids = k < 0.6 ? 1 : k < 1.5 ? 1 - sstep(0.6, 1.5, k) * 0.75 : k < 2.2 ? 0.25 + sstep(1.5, 2.2, k) * 0.75 : 1 - sstep(2.2, 3.4, k);   // a slow blink
    S.fade = lids; S.fadeCol = 0; S.blur = 1 - sstep(1, 7.5, k);
    if (k > 1.2) once('i1', '…', 1400); if (k > 3.6) once('i2', 'So cold.', 2400); if (k > 6.6) once('i3', 'How long was I asleep?', 3000);
    if (k >= 9.4) { S.mode = 'play'; S.blur = 0; S.fade = 0; S.fadeTo = 0; S.pitch = 0; S.yaw = START.yaw; setObjective('Find a light'); lockPointer(); showTip(touch.on ? 'Left thumb moves. Right thumb looks around.' : 'W A S D to move, mouse to look, E to use things.'); setTimeout(() => once('i4', 'Where is everybody?', 3000), 2500); save(); }
  } else {
    if (S.mode === 'play' && !S.blackout) { const r = movePlayer(dt); outside = r.outside; speed = r.sp; S.played += dt; triggers(outside); }
    // warmth
    let nearFire = 0; for (const f of fires) nearFire = Math.max(nearFire, 1 - Math.hypot(S.pos.x - f.x, S.pos.z - f.z) / 5);
    if (S.mode === 'play' && !S.blackout) {
      if (nearFire > 0) { S.warmth = Math.min(100, S.warmth + dt * (10 + 26 * nearFire)); const f = fires.reduce((a, b) => (Math.hypot(S.pos.x - a.x, S.pos.z - a.z) < Math.hypot(S.pos.x - b.x, S.pos.z - b.z) ? a : b)); if (nearFire > 0.3) S.lastSafe = { x: f.x - 1.3, y: 0, z: f.z - 1.3, yaw: S.yaw }; }
      else if (outside) S.warmth -= dt * (100 / 38) * (1 + S.gust * 0.6);
      else S.warmth = Math.min(Math.max(S.warmth, 70), S.warmth + dt * 5);
      if (S.warmth < 45 && outside) once('cold1', 'I can’t feel my fingers. I need a fire.', 3600);
      if (S.warmth < 22 && outside && once('cold2', 'Too cold… find the fire…', 3000)) sound.shiver();
      if (S.warmth > 80) { S.said.cold1 = 0; S.said.cold2 = 0; }
      if (S.warmth <= 0) { S.blackout = 0.001; S.fadeTo = 1; S.fadeCol = 0; }
    }
    if (S.blackout) {                                                  // too cold: you come round back at the last warm place
      S.blackout += dt;
      if (S.blackout > 1.6 && S.blackout < 9) { S.pos.set(S.lastSafe.x, S.lastSafe.y, S.lastSafe.z); S.pos.y = groundAt(S.pos.x, S.pos.z, 1); S.vel.set(0, 0, 0); S.warmth = 60; S.blackout = 9; S.fadeTo = 0; say('You stumble back to the warmth. Stay close to the fires.', 4600); save(); }
      if (S.blackout > 10.5) S.blackout = 0;
    }
    if (S.ending) {                                                    // through the gate
      S.ending += dt; S.fadeCol = 1; S.fade = Math.min(1, S.ending / 2.4); S.pos.z += dt * 0.8;
      if (S.ending > 2.6 && $('end').hidden) { const m = Math.floor(S.played / 60), s = Math.floor(S.played % 60); $('endStats').textContent = `Notes found: ${S.notes.length} of ${NOTE_COUNT}   ·   Time: ${m}:${String(s).padStart(2, '0')}`; $('end').hidden = false; document.body.classList.remove('playing'); store.del('wo_save'); }
    } else S.fade = lerp(S.fade, S.fadeTo, 1 - Math.exp(-dt * 2.2));
    const bobY = Math.sin(S.bob * 2) * 0.035 * clamp(speed / 3), bobX = Math.cos(S.bob) * 0.02 * clamp(speed / 3), shiver = sstep(40, 5, S.warmth) * 0.006;
    S.shake = Math.max(0, S.shake - dt * 1.6);
    camera.position.set(S.pos.x + bobX * Math.cos(S.yaw), S.pos.y + 1.62 + bobY, S.pos.z - bobX * Math.sin(S.yaw));
    camera.rotation.set(S.pitch + (Math.random() - 0.5) * (S.shake * 0.05 + shiver), S.yaw + (Math.random() - 0.5) * (S.shake * 0.05 + shiver), Math.cos(S.bob) * 0.004 * clamp(speed / 3));
  }

  // doors swing, ice falls
  const ease = 1 - Math.exp(-dt * 3.2), F = S.flags;
  dyn.aptDoor.rotation.y = lerp(dyn.aptDoor.rotation.y, F.aptOpen ? 1.9 : 0, ease); dyn.officeDoor.rotation.y = lerp(dyn.officeDoor.rotation.y, -Math.PI / 2 - (F.officeOpen ? 1.7 : 0), ease);
  dyn.exitL.rotation.y = lerp(dyn.exitL.rotation.y, F.exitOpen ? -1.9 : 0, ease * 0.7); dyn.exitR.rotation.y = lerp(dyn.exitR.rotation.y, F.exitOpen ? 1.9 : 0, ease * 0.7);
  for (const m of dyn.exitIce.children) if (m.userData.fall) { m.userData.fall += dt; const k = m.userData.fall; m.position.y -= k * 5 * dt; m.position.z -= dt * 0.5; m.rotation.x += dt * 3; if (m.position.y < -0.6) { m.visible = false; m.userData.fall = 0; } }
  S.gust = Math.max(0, S.gust - dt * 0.12);

  // light and air
  const inTitle = S.mode === 'title';
  _c.set(Math.round(camera.position.x / 2) * 2, 0, Math.round(camera.position.z / 2) * 2);
  moon.target.position.copy(_c); moon.position.copy(_c).addScaledVector(MOON_DIR, 160);
  const lit = (g) => (g.blink ? 0.15 + 0.85 * Math.pow(Math.max(0, Math.sin((t / g.blink + g.phase) * Math.PI * 2)), 6) : 1) * (g.flicker ? 1 - g.flicker * 0.35 * (Math.sin(t * 13 + g.x) * Math.sin(t * 5.3) > 0.55 ? 1 : Math.random() * 0.3) : 1);
  for (const s of glowSprites) { const g = s.userData, k = lit(g), d = s.position.distanceTo(camera.position); s.material.opacity = k * (g.fog ? Math.exp(-d * 0.012) : 1); if (g.beacon) s.scale.setScalar(g.size * (0.6 + 0.6 * k)); }
  for (const f of fires) { f.mat.uniforms.uTime.value = t; f.mat2.uniforms.uTime.value = t * 1.3; f.glow.material.opacity = (0.75 + 0.25 * Math.sin(t * 9 + f.x) * Math.sin(t * 4.1)) * Math.exp(-f.glow.position.distanceTo(camera.position) * 0.01); }
  // the two travelling lamps go to the nearest light sources
  lightSpots.forEach((s) => { s.d = Math.hypot(s.x - camera.position.x, s.y - camera.position.y, s.z - camera.position.z); });
  const near = lightSpots.slice().sort((a, b) => a.d - b.d);
  const indoors = !outside && !inTitle, upstairs = indoors && camera.position.y > 2.6;                 // lamps have no shadows, so do not let street fires shine up through the floors
  pool.forEach((l, i) => { const s = near[i]; if (!s || s.d > 60 || upstairs || (indoors && s.z > 30)) { l.intensity = 0; return; } l.position.set(s.x, s.y, s.z); l.color.setHex(s.color); l.distance = s.range; const fl = s.flicker ? 0.8 + 0.2 * Math.sin(t * 11 + s.x * 3) * Math.sin(t * 6.3 + i) + 0.08 * Math.sin(t * 31) : 1; l.intensity = s.power * fl * (1 - sstep(42, 60, s.d)) * (indoors ? 0.3 : 1); });
  dyn.beam.rotation.set(-0.42 + Math.sin(t * 0.11) * 0.06, Math.PI + Math.sin(t * 0.17) * 0.55, 0);
  if (!F.torch) torch.intensity = TORCH_POWER * 0.7 * (0.96 + 0.04 * Math.sin(t * 40));
  for (const m of markers) { const on = m.it.when() && !inTitle; m.s.visible = on; if (on) { const d = m.s.position.distanceTo(camera.position); m.s.material.opacity = (0.35 + 0.25 * Math.sin(t * 2.6)) * sstep(14, 6, d) * sstep(0.5, 1.6, d); } }
  sky.mesh.position.copy(camera.position); sky.uniforms.uTime.value = t;
  snow.uniforms.uTime.value = t; snow.uniforms.uCam.value.copy(camera.position); snow.uniforms.uGust.value = S.gust; camera.getWorldDirection(snow.uniforms.uTorchDir.value); snow.uniforms.uTorch.value = F.torch && F.torchOn ? 1 : 0;
  const open = outside ? 1 : clamp(1 - Math.min(13.8 - camera.position.z, 4) / 4) * 0.5 + (F.exitOpen && camera.position.y < 3 ? 0.25 : 0);
  S.exposure = lerp(S.exposure, inTitle ? 1.5 : outside ? 1.35 : 3.0, 1 - Math.exp(-dt * 0.9));
  // breath
  breathT -= dt; if (breathT < 0 && (S.mode === 'play' || S.mode === 'intro')) { breathT = 3.4 + Math.random(); const s = puffs.find((x) => !x.visible); if (s) { camera.getWorldDirection(_fwd); s.position.copy(camera.position).addScaledVector(_fwd, 0.4); s.position.y -= 0.14; s.userData.vel.copy(_fwd).multiplyScalar(0.35).add(_c.set(S.vel.x, 0.1, S.vel.z)); s.userData.life = 0.001; s.visible = true; } }
  for (const s of puffs) if (s.visible) { const u = s.userData; u.life += dt; const k = u.life / 1.9; s.position.addScaledVector(u.vel, dt); u.vel.multiplyScalar(1 - dt * 1.4); s.scale.setScalar(0.12 + k * 0.55); s.material.opacity = 0.11 * Math.sin(Math.min(1, k) * Math.PI) * (1 - k * 0.3); if (k >= 1) s.visible = false; }
  let radio = 0; if (!outside && F.officeOpen) radio = clamp(1 - Math.hypot(S.pos.x - anchors.radio.x, S.pos.z - anchors.radio.z) / 7) * (S.pos.y < 2 ? 1 : 0);
  let fireVol = 0; for (const f of fires) fireVol = Math.max(fireVol, clamp(1 - Math.hypot(camera.position.x - f.x, camera.position.z - f.z) / 14));
  sound.ambience({ open, gust: S.gust, fire: fireVol * fireVol, radio, on: S.mode !== 'title' || true });

  // the picture
  const u = post.u; u.uExposure.value = S.exposure; u.uFade.value = clamp(S.fade); u.uFadeCol.value.setRGB(S.fadeCol ? 1 : 0, S.fadeCol ? 0.93 : 0, S.fadeCol ? 0.82 : 0); u.uBlur.value = S.blur;
  u.uCold.value = F.beenOut ? sstep(62, 0, S.warmth) : 0; u.uBloom.value = 0.11; u.uVignette.value = 0.55; u.uGrain.value = 0.035;
  post.render(scene, camera);

  // HUD (a few times a second is plenty)
  hudT -= dt; if (hudT < 0) { hudT = 0.12; refreshPrompt(); $('warmFill').style.transform = `scaleX(${clamp(S.warmth / 100)})`; $('warmHud').classList.toggle('low', S.warmth < 35); }
  // automatic step down in quality if the frame rate is poor
  if (qualityMode === 'auto' && S.mode === 'play') { fpsAcc += dt; fpsN++; if (now - fpsSince > 5000) { const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; fpsSince = now; if (fps < 27 && quality === 'high') applyQuality('medium'); else if (fps < 24 && quality === 'medium') applyQuality('low'); } } else { fpsSince = now; fpsAcc = 0; fpsN = 0; }
}
restTorch(); applyFlags(true); document.body.classList.add('ready'); $('loading').hidden = true; $('titleButtons').hidden = false;
requestAnimationFrame(frame);
setInterval(save, 15000);

// for testing and for building on later
window.WHITEOUT = { S, world, camera, scene, renderer, post, torch, moon, hemi, interact, say, newGame, applyFlags, openApt, openOffice, openExit, readNote, closeUi, setObjective, holdTorch, mats,
  interactables, sim(dt, input, yaw) { keys = input; S.yaw = yaw; const r = movePlayer(dt); triggers(r.outside); keys = {}; return r; }, findInteract, groundAt,
  go(x, y, z, yaw = S.yaw, pitch = 0) { S.pos.set(x, y, z); S.yaw = yaw; S.pitch = pitch; S.vel.set(0, 0, 0); }, skip() { if (S.mode === 'intro') S.intro = 9.4; } };
