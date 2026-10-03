// Maths Royale client: 3D third-person view (three.js), networking, input and HUD.
import * as THREE from './vendor/three.module.min.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const mini = $('minimap'); const mctx = mini.getContext('2d');
const RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
const RCOLOR = { common: '#b8bcc4', uncommon: '#4cd137', rare: '#3b9dff', epic: '#b15cff', legendary: '#ffb400' };
const RLABEL = { common: 'COMMON', uncommon: 'UNCOMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY' };
const WNAME = { pistol: 'Pistol', smg: 'SMG', shotgun: 'Shotgun', rifle: 'Assault Rifle', sniper: 'Sniper' };
const WMAG = { pistol: 12, smg: 30, shotgun: 5, rifle: 25, sniper: 3 };
const CNAME = { bandage: 'Bandage', medkit: 'Medkit', minishield: 'Mini Shield', shieldpotion: 'Shield Potion' };
const CICON = { bandage: '🩹', medkit: '🧰', minishield: '🧪', shieldpotion: '🛡️' };
const HATS = ['cap', 'tophat', 'headband', 'helmet', 'bandana', 'crown', 'none', 'bucket', 'cat', 'viking'];
const HAT_NAMES = { cap: 'Cap', tophat: 'Top hat', headband: 'Headband', helmet: 'Helmet', bandana: 'Bandana', crown: 'Crown', none: 'Hair', bucket: 'Bucket', cat: 'Cat ears', viking: 'Viking' };
const SKIN_COLORS = ['#3b9dff', '#ff5e7e', '#ffd32a', '#2ed573', '#ff9f43', '#c56cf0', '#18dcff', '#f368e0', '#ff4757', '#7bed9f', '#ffffff', '#2f3542'];
const CHEST_RANGE = 85;

// ---------- state ----------
let ws = null, myId = null, room = null, hostId = null, phase = 'join';
let world = null; // {size, obstacles, chests: Map, mode}
let S = null; // latest server state
const view = new Map(); // smoothed positions per player id
let keys = {}, shooting = false, reloadPulse = false;
let yaw = 0, pitch = 0.3, locked = false;
const pred = { x: 0, y: 0, valid: false }; // where WE think our character is (moves instantly)
const SPEED = 270, PLAYER_R = 20;
const WRATE = { pistol: 330, smg: 95, shotgun: 850, rifle: 170, sniper: 1300 }; let lastLocalShot = 0;
function pointInObstacle(x, y, pad = 0) { for (const o of world.obstacles) { if (o.t === 'r') { if (x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) return true; } else if (Math.hypot(x - o.x, y - o.y) < o.r + pad) return true; } return false; }
function resolveCircle(p, r) {
  for (const o of world.obstacles) {
    if (o.t === 'r') { const cx = Math.max(o.x, Math.min(p.x, o.x + o.w)), cy = Math.max(o.y, Math.min(p.y, o.y + o.h)); const dx = p.x - cx, dy = p.y - cy; const d = Math.hypot(dx, dy); if (d >= r) continue; if (d < 1e-6) { const l = p.x - o.x, rr = o.x + o.w - p.x, t = p.y - o.y, b = o.y + o.h - p.y; const m = Math.min(l, rr, t, b); if (m === l) p.x = o.x - r; else if (m === rr) p.x = o.x + o.w + r; else if (m === t) p.y = o.y - r; else p.y = o.y + o.h + r; } else { p.x = cx + (dx / d) * r; p.y = cy + (dy / d) * r; } }
    else { const d = Math.hypot(p.x - o.x, p.y - o.y); const min = o.r + r; if (d < min) { const dx = d < 1e-6 ? 1 : (p.x - o.x) / d, dy = d < 1e-6 ? 0 : (p.y - o.y) / d; p.x = o.x + dx * min; p.y = o.y + dy * min; } }
  }
  p.x = Math.max(r, Math.min(world.size - r, p.x)); p.y = Math.max(r, Math.min(world.size - r, p.y));
}
function moveVector() {
  let f = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
  let r = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
  const mv = stickVec(touch.move);
  if (touch.enabled && touch.move && mv.len > 0.12) { f = -mv.y; r = mv.x; }
  let mx = Math.cos(yaw) * f - Math.sin(yaw) * r, my = Math.sin(yaw) * f + Math.cos(yaw) * r;
  const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
  return { mx, my };
}
function predictMove(me, dt) {
  if (!me || !me.al || !world) { pred.valid = false; return; }
  if (!pred.valid || Math.hypot(pred.x - me.x, pred.y - me.y) > 140) { pred.x = me.x; pred.y = me.y; pred.valid = true; }
  if (!inQuestion() && !me.q) { const { mx, my } = moveVector(); const sp = SPEED * (S.me && S.me.useEnd > S.now ? 0.45 : 1); pred.x += mx * sp * dt; pred.y += my * sp * dt; resolveCircle(pred, PLAYER_R); }
  const k = 1 - Math.pow(0.25, dt); pred.x += (me.x - pred.x) * k; pred.y += (me.y - pred.y) * k; // gently agree with the server
}
let question = null, qTimerStart = 0, qTimerLen = 0, resultTimeout = null;
let feedItems = [], shake = 0, myHpLast = 100, lastStreak = 0, slotsKey = '';
const flashes = new Map();
let jumpV = 0, jumpY = 0; // purely visual hop
function renderScoreboard() {
  if (!S) return;
  const rows = [...S.players].sort((a, b) => (b.k - a.k) || (b.ok - a.ok));
  $('scoreboard').innerHTML = '<table><tr><th>Player</th><th>Elims</th><th>Sums right</th><th>Status</th></tr>' + rows.map((p) => `<tr class="${p.id === myId ? 'me' : ''}"><td><span class="dot" style="background:${p.c}"></span> ${esc(p.n)}</td><td>${p.k}</td><td>${p.ok}</td><td>${p.al ? 'Alive' : 'Out'}</td></tr>`).join('') + '</table>';
}

// ---------- sound ----------
let actx = null;
function sfx(type) {
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime; const g = actx.createGain(); g.connect(actx.destination);
    const tone = (f, dur, delay = 0, kind = 'square') => { const o = actx.createOscillator(); o.type = kind; o.frequency.setValueAtTime(f, t + delay); o.connect(g); o.start(t + delay); o.stop(t + delay + dur); };
    g.gain.setValueAtTime(0.0001, t);
    if (type === 'shoot') { g.gain.exponentialRampToValueAtTime(0.09, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09); tone(160 + Math.random() * 60, 0.09, 0, 'sawtooth'); }
    else if (type === 'hit') { g.gain.exponentialRampToValueAtTime(0.08, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07); tone(1200, 0.06, 0, 'square'); }
    else if (type === 'hurt') { g.gain.exponentialRampToValueAtTime(0.12, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); tone(90, 0.2, 0, 'triangle'); }
    else if (type === 'correct') { g.gain.exponentialRampToValueAtTime(0.1, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6); tone(660, 0.15, 0, 'sine'); tone(880, 0.2, 0.15, 'sine'); tone(1320, 0.3, 0.3, 'sine'); }
    else if (type === 'wrong') { g.gain.exponentialRampToValueAtTime(0.1, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5); tone(200, 0.25, 0, 'sawtooth'); tone(150, 0.25, 0.25, 'sawtooth'); }
    else if (type === 'chest') { g.gain.exponentialRampToValueAtTime(0.07, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); tone(500, 0.1, 0, 'sine'); tone(700, 0.2, 0.1, 'sine'); }
    else if (type === 'pickup') { g.gain.exponentialRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15); tone(900, 0.12, 0, 'sine'); }
  } catch (e) { /* no audio */ }
}

// ---------- networking ----------
function connect(name, code) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, room: code }));
  ws.onmessage = (ev) => handle(JSON.parse(ev.data));
  ws.onclose = () => { if (phase !== 'join') { showScreen('join'); $('joinErr').textContent = 'Disconnected from the server. Press PLAY to rejoin.'; phase = 'join'; } hideQuestion(); $('gameover').classList.add('hidden'); $('scoreboard').classList.add('hidden'); if (document.pointerLockElement) document.exitPointerLock(); if (room) $('room').value = room; $('joinBtn').disabled = false; };
  ws.onerror = () => { $('joinErr').textContent = 'Could not reach the server.'; $('joinBtn').disabled = false; };
}
const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

function handle(m) {
  switch (m.t) {
    case 'error': $('joinErr').textContent = m.msg; $('joinBtn').disabled = false; if (phase === 'join') { try { ws.close(); } catch (e) {} } break;
    case 'joined': myId = m.id; room = m.room; $('roomCode').textContent = room; sendSkin(); break;
    case 'lobby': hostId = m.hostId; renderLobby(m); if (m.phase === 'lobby') { phase = 'lobby'; showScreen('lobby'); hideQuestion(); $('gameover').classList.add('hidden'); } break;
    case 'world': world = { size: m.size, obstacles: m.obstacles, chests: new Map(m.chests.map((c) => [c.id, { x: c.x, y: c.y }])), mode: m.mode }; view.clear(); feedItems = []; phase = 'playing'; buildWorld(); showScreen('game'); hideQuestion(); $('gameover').classList.add('hidden'); if (document.activeElement) document.activeElement.blur(); toast(m.mode === 'br' ? 'Find a chest and answer the sum to get a gun!' : 'Fight! Open chests for better guns.', 3500); break;
    case 'state': onState(m); break;
    case 'question': showQuestion(m); break;
    case 'result': onResult(m); break;
    case 'gameover': phase = 'ended'; showGameOver(m); break;
    case 'closeq': hideQuestion(); break;
  }
}
const myName = () => { const p = S && S.players.find((p) => p.id === myId); return p ? p.n : ''; };
function onState(m) {
  S = m;
  for (const p of m.players) {
    let v = view.get(p.id);
    if (!v) { v = { x: p.x, y: p.y, a: p.a }; view.set(p.id, v); }
    if (Math.hypot(v.x - p.x, v.y - p.y) > 300) { v.x = p.x; v.y = p.y; }
  }
  for (const c of m.chests) if (c.length > 4 && world) { world.chests.set(c[0], { x: c[3], y: c[4] }); const g = chestMeshes.get(c[0]); if (g) g.position.set(c[3], 0, c[4]); }
  const me = m.players.find((p) => p.id === myId);
  if (m.me && m.me.streak !== lastStreak) { if (m.me.streak > 0 && m.me.streak % 3 === 0) { toast(`🔥 ${m.me.streak} sums in a row! +25 shield`, 2500); sfx('correct'); } lastStreak = m.me.streak; }
  if (me) { if (me.hp < myHpLast && me.al) { shake = Math.min(14, shake + (myHpLast - me.hp) * 0.5); sfx('hurt'); } myHpLast = me.hp; }
  for (const e of m.events) {
    if (e.k === 'hit') { spawnSparks(e.x, 40, e.y, 8, 0xffb347, 150); if (e.who === myId) { sfx('hit'); floater(e.x, 70, e.y, String(e.dmg), '#ffd34d'); } else if (e.victim === myId) floater(e.x, 70, e.y, '-' + e.dmg, '#ff6b6b'); }
    else if (e.k === 'shot') { if (e.id !== myId) flashes.set(e.id, performance.now()); }
    else if (e.k === 'kill') { const vp = m.players.find((p) => p.n === e.victim); spawnBoom(e.x, e.y, vp ? vp.c : '#ffffff'); addFeed(`<span style="color:${e.killerColor || '#aaa'}">${esc(e.killer || 'The storm')}</span> eliminated <span style="color:${e.victimColor}">${esc(e.victim)}</span> ${e.killer ? 'with a ' + esc(e.weapon) : ''}`); if (e.victimId === myId) toast(`Eliminated by ${e.killer || 'the storm'}!`, 2500); if (e.killerId === myId) { toast(`You eliminated ${e.victim}!`, 2000); floater(e.x, 110, e.y, '+1 ELIMINATION', '#ffd34d', 22); } }
    else if (e.k === 'answer') addFeed(`<span style="color:${e.color}">${esc(e.name)}</span> ${e.correct ? '✅ got a <b>' + esc(e.topic) + '</b> sum right' : '❌ missed a <b>' + esc(e.topic) + '</b> sum'}`);
    else if (e.k === 'info') { addFeed(esc(e.msg)); if (/storm/i.test(e.msg)) toast(e.msg, 2500); }
  }
  updateHud();
}

// ---------- screens ----------
function showScreen(name) {
  $('join').classList.toggle('hidden', name !== 'join');
  $('lobby').classList.toggle('hidden', name !== 'lobby');
  $('hud').classList.toggle('hidden', name !== 'game');
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let mySkin = { hat: localStorage.getItem('mr_hat') || 'cap', color: localStorage.getItem('mr_color') || '#3b9dff' };
if (!HATS.includes(mySkin.hat)) mySkin.hat = 'cap'; if (!SKIN_COLORS.includes(mySkin.color)) mySkin.color = '#3b9dff';
function sendSkin() { localStorage.setItem('mr_hat', mySkin.hat); localStorage.setItem('mr_color', mySkin.color); send({ t: 'skin', hat: mySkin.hat, color: mySkin.color }); renderSkinPicker(); }
function renderSkinPicker() {
  $('hatRow').innerHTML = HATS.map((h) => `<button class="pick${h === mySkin.hat ? ' on' : ''}" data-hat="${h}">${HAT_NAMES[h]}</button>`).join('');
  $('colorRow').innerHTML = SKIN_COLORS.map((c) => `<button class="swatch${c === mySkin.color ? ' on' : ''}" data-color="${c}" style="background:${c}"></button>`).join('');
  previewAvatar(mySkin.color, mySkin.hat);
}
$('hatRow').addEventListener('click', (e) => { const b = e.target.closest('[data-hat]'); if (b) { mySkin.hat = b.dataset.hat; sfx('pickup'); sendSkin(); } });
$('colorRow').addEventListener('click', (e) => { const b = e.target.closest('[data-color]'); if (b) { mySkin.color = b.dataset.color; sfx('pickup'); sendSkin(); } });
function renderLobby(m) {
  const list = $('playerList'); list.innerHTML = '';
  for (const p of m.players) { const li = document.createElement('li'); li.innerHTML = `<span class="dot" style="background:${p.color}"></span>${esc(p.name)}${p.id === myId ? ' (you)' : ''}${p.id === m.hostId ? '<span class="tag">HOST</span>' : ''}${p.isBot ? '<span class="tag">BOT</span>' : ''}`; list.appendChild(li); }
  const isHost = m.hostId === myId;
  $('hostControls').classList.toggle('hidden', !isHost); $('waitMsg').classList.toggle('hidden', isHost);
  $('mode').value = m.settings.mode; $('difficulty').value = m.settings.difficulty; $('bots').value = String(m.settings.bots);
  $('lobbyBtn').classList.toggle('hidden', !isHost); $('goWait').classList.toggle('hidden', isHost);
}
function showGameOver(m) {
  hideQuestion(); if (document.pointerLockElement) document.exitPointerLock();
  $('winnerText').textContent = m.winner ? `🏆 ${m.winner.name} wins!` : 'Game over!';
  let html = '<tr><th>Player</th><th>Eliminations</th><th>Sums right</th><th>Sums wrong</th></tr>';
  for (const p of m.board) html += `<tr><td><span class="dot" style="background:${p.color}"></span> ${esc(p.name)}${p.id === myId ? ' (you)' : ''}</td><td>${p.kills}</td><td>${p.correct}</td><td>${p.wrong}</td></tr>`;
  $('board').innerHTML = html;
  const rep = m.reports[myId]; let r = '<b>Your maths report</b>';
  const topics = rep ? Object.entries(rep).sort((a, b) => (b[1].wrong - a[1].wrong) || (b[1].right - a[1].right)) : [];
  if (!topics.length) r += '<div class="muted">No sums answered this game. Open some chests!</div>';
  for (const [topic, s] of topics) r += `<div class="topic"><span>${esc(topic)}</span><span><span class="good">${s.right} right</span> · <span class="bad">${s.wrong} wrong</span></span></div>`;
  $('report').innerHTML = r;
  $('lobbyBtn').classList.toggle('hidden', m.hostId !== myId); $('goWait').classList.toggle('hidden', m.hostId === myId);
  $('gameover').classList.remove('hidden');
}

// ---------- question UI ----------
function showQuestion(m) {
  question = m; clearTimeout(resultTimeout);
  if (document.pointerLockElement) document.exitPointerLock();
  const col = RCOLOR[m.rarity] || '#fff';
  $('qHeader').textContent = m.kind === 'respawn' ? 'SOLVE THIS TO RESPAWN' : `${RLABEL[m.rarity]} CHEST`;
  $('qHeader').style.background = col + '33'; $('qHeader').style.color = col; $('qHeader').style.border = `2px solid ${col}`;
  $('qTopic').textContent = m.topic; $('qText').textContent = m.text; $('qHint').textContent = m.hint ? 'Hint: ' + m.hint : '';
  $('qInput').value = ''; $('qInput').disabled = false; $('qForm').classList.remove('hidden'); $('qResult').classList.add('hidden');
  $('qCancel').classList.toggle('hidden', m.kind === 'respawn');
  qTimerStart = performance.now(); qTimerLen = m.timeLimit;
  $('question').classList.remove('hidden'); $('question').classList.remove('resultOnly'); setTimeout(() => $('qInput').focus(), 30);
  keys = {}; shooting = false;
}
function hideQuestion() { question = null; clearTimeout(resultTimeout); $('question').classList.add('hidden'); $('qInput').blur(); if (phase === 'playing' && !touch.enabled && !document.pointerLockElement) { try { canvas.requestPointerLock(); } catch (e) { /* needs a click */ } } }
function onResult(m) {
  const box = $('qResult'); box.classList.remove('hidden'); $('qForm').classList.add('hidden'); $('qCancel').classList.add('hidden');
  if (m.correct) { box.className = 'good'; box.innerHTML = `✅ Correct!${m.loot && m.loot.length ? `<small>You got: ${m.loot.map(esc).join(', ')}</small>` : ''}${m.dropped && m.dropped.length ? `<small>Bag full, left on the floor: ${m.dropped.map(esc).join(', ')}</small>` : ''}${m.kind === 'respawn' ? '<small>Respawning…</small>' : ''}`; sfx('correct'); if (m.kind === 'chest') sfx('chest'); }
  else { box.className = 'bad'; box.innerHTML = `${m.timeout ? '⏰ Out of time!' : '❌ Not quite.'}<small>The answer was <b>${esc(m.answer)}</b>${m.kind === 'respawn' ? '. Another sum is coming…' : '. The chest stays locked.'}</small>`; sfx('wrong'); }
  question = null; $('question').classList.add('resultOnly');
  resultTimeout = setTimeout(hideQuestion, m.correct ? 1500 : 2600);
  if (phase === 'playing' && !touch.enabled) { try { canvas.requestPointerLock(); } catch (e) { /* needs a click */ } }
}
$('qForm').addEventListener('submit', (e) => { e.preventDefault(); if (!question) return; const a = $('qInput').value.trim(); if (!a) return; $('qInput').disabled = true; send({ t: 'answer', a }); });
$('qCancel').addEventListener('click', () => { if (question && question.kind === 'chest') { send({ t: 'cancel' }); hideQuestion(); } });
const inQuestion = () => question !== null;

// ---------- HUD ----------
function addFeed(html) { feedItems.push({ html, at: performance.now() }); if (feedItems.length > 6) feedItems.shift(); renderFeed(); }
let feedKey = '';
function renderFeed() { const now = performance.now(); feedItems = feedItems.filter((f) => now - f.at < 7000); const html = feedItems.map((f) => `<div>${f.html}</div>`).join(''); if (html !== feedKey) { feedKey = html; $('feed').innerHTML = html; } }
let toastTimer = null;
function toast(msg, ms = 2000) { $('toast').textContent = msg; $('toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.add('hidden'), ms); }
function nearestChest(me) {
  if (!world || !S) return null; let best = null, bd = CHEST_RANGE;
  for (const c of S.chests) { const pos = world.chests.get(c[0]); if (!pos || c[2] === 1) continue; const d = Math.hypot(pos.x - me.x, pos.y - me.y); if (d < bd) { bd = d; best = { id: c[0], state: c[2], rarity: c[1] }; } }
  return best;
}
function nearestDrop(me) {
  if (!S) return null; let best = null, bd = 90;
  for (const d of S.drops) { const dd = Math.hypot(d.x - me.x, d.y - me.y); if (dd < bd) { bd = dd; best = d; } }
  return best;
}
const dropName = (d) => d.type === 'weapon' ? `${RLABEL[d.rarity][0] + RLABEL[d.rarity].slice(1).toLowerCase()} ${WNAME[d.key]}` : `${CNAME[d.key]}${d.count > 1 ? ' ×' + d.count : ''}`;
function interact() {
  const me = S && S.players.find((p) => p.id === myId); if (!me || !me.al) return;
  const c = nearestChest(me); if (c && c.state === 0) { send({ t: 'open', id: c.id }); return; }
  const d = nearestDrop(me); if (d) send({ t: 'pickup', id: d.id });
}
function updateHud() {
  if (!S) return;
  const me = S.players.find((p) => p.id === myId);
  if (me) { $('hpFill').style.width = me.hp + '%'; $('hpText').textContent = me.hp; $('shFill').style.width = me.sh + '%'; $('shText').textContent = me.sh; }
  if (S.timeLeft != null) { const s = Math.ceil(S.timeLeft / 1000); $('timer').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  else if (S.storm) { $('timer').textContent = S.storm.shrinking ? '🌀 Storm shrinking!' : `Storm in ${Math.ceil(S.storm.nextIn / 1000)}s`; }
  $('aliveCount').textContent = `${S.alive} player${S.alive === 1 ? '' : 's'} alive`;
  const inv = S.me ? S.me.inv : []; let html = '';
  for (let i = 0; i < 5; i++) {
    const it = inv[i]; const active = S.me && S.me.slot === i;
    if (!it) html += `<div class="slot${active ? ' active' : ''}"><span class="num">${i + 1}</span><span class="muted">empty</span></div>`;
    else if (it.type === 'weapon') html += `<div class="slot${active ? ' active' : ''}" style="border-color:${active ? '#ffd34d' : RCOLOR[it.rarity]}"><span class="num">${i + 1}</span><img class="gicon" src="${GUN_ICON[it.key]}" alt=""><span class="name" style="color:${RCOLOR[it.rarity]}">${WNAME[it.key]}</span><span class="ammo">${S.me.reloadEnd > S.now && active ? '…' : it.ammo}/${WMAG[it.key]}</span></div>`;
    else html += `<div class="slot${active ? ' active' : ''}"><span class="num">${i + 1}</span><span class="icon">${CICON[it.key]}</span><span class="name">${CNAME[it.key]}</span><span class="ammo">×${it.count}</span></div>`;
  }
  if (html !== slotsKey) { slotsKey = html; $('slots').innerHTML = html; }
  const pr = $('prompt'); let text = '';
  if (me && me.al) {
    const c = nearestChest(me);
    if (c) text = c.state === 0 ? 'Press <b>E</b> to open the chest' : c.state === 2 ? 'Someone is opening this chest…' : c.state === 3 ? 'Locked for a moment…' : '';
    else { const d = nearestDrop(me); if (d) { const full = inv.filter(Boolean).length >= 5 && !(d.type === 'consumable' && inv.some((it) => it && it.type === 'consumable' && it.key === d.key)); text = full ? `Bag full: press <b>E</b> to swap for the ${esc(dropName(d))}` : `Press <b>E</b> to pick up the ${esc(dropName(d))}`; } }
    if (S.me && S.me.useEnd > S.now) text = `Using… ${Math.ceil((S.me.useEnd - S.now) / 1000)}s`;
    else if (S.me && S.me.reloadEnd > S.now) text = 'Reloading…';
    else if (S.me && inv[S.me.slot] && inv[S.me.slot].type === 'consumable') text = text || 'Click to use ' + CNAME[inv[S.me.slot].key];
  } else if (me && !me.al && S.me && S.me.spectating) text = 'You are out. Watching the others…';
  if (pr.innerHTML !== text) pr.innerHTML = text; pr.classList.toggle('hidden', !text);
  if (touch.enabled) { const c = me && me.al && nearestChest(me); const d = me && me.al && !c && nearestDrop(me); $('btnOpen').classList.toggle('hidden', !((c && c.state === 0) || d)); $('btnOpen').innerHTML = d && !(c && c.state === 0) ? 'PICK<br>UP' : 'OPEN<br>CHEST'; $('btnJump').classList.toggle('hidden', !(me && me.al)); const cur = S.me && inv[S.me.slot]; $('btnUse').classList.toggle('hidden', !(cur && cur.type === 'consumable')); $('btnReload').classList.toggle('hidden', !(cur && cur.type === 'weapon')); $('btnFire').classList.toggle('hidden', !(me && me.al)); }
  const outside = me && me.al && S.storm && Math.hypot(me.x - S.storm.x, me.y - S.storm.y) > S.storm.r;
  $('stormTint').classList.toggle('hidden', !outside);
  renderFeed();
}

// ---------- input ----------
const CODE_KEYS = { Space: ' ', Tab: 'tab', KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', ArrowUp: 'arrowup', ArrowDown: 'arrowdown', ArrowLeft: 'arrowleft', ArrowRight: 'arrowright', KeyE: 'e', KeyR: 'r', KeyQ: 'q', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5' };
const keyOf = (e) => CODE_KEYS[e.code] || e.key.toLowerCase();
window.addEventListener('keydown', (e) => {
  if (inQuestion()) { if (e.key === 'Escape') $('qCancel').click(); return; }
  if (phase !== 'playing' || e.target === $('qInput') || (e.target.tagName === 'INPUT' && e.target.offsetParent !== null)) return;
  const k = keyOf(e); keys[k] = true;
  if (k >= '1' && k <= '5') send({ t: 'slot', i: +k - 1 });
  if (k === 'r') reloadPulse = true;
  if (k === 'q') send({ t: 'drop' });
  if (k === 'e') interact();
  if (k === ' ' && jumpV === 0 && jumpY === 0) jumpV = 230;
  if (k === 'tab') { $('scoreboard').classList.remove('hidden'); renderScoreboard(); e.preventDefault(); }
  if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
});
window.addEventListener('keyup', (e) => { keys[keyOf(e)] = false; if (keyOf(e) === 'tab') $('scoreboard').classList.add('hidden'); });
window.addEventListener('blur', () => { keys = {}; shooting = false; $('scoreboard').classList.add('hidden'); });
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return; if (!actx) sfx('pickup');
  const realMouse = !(e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents);
  if (phase === 'playing' && realMouse && !inQuestion() && !document.pointerLockElement) { canvas.requestPointerLock(); return; }
  if (realMouse) shooting = true;
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) shooting = false; });
document.addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { yaw += e.movementX * 0.0025; pitch = THREE.MathUtils.clamp(pitch + e.movementY * 0.002, -0.15, 0.9); } });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (!locked) shooting = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// touch: left half = move stick, right half = look, buttons = fire/open/use/reload
const touch = { enabled: false, move: null, look: null, fire: false };
const STICK_R = 42;
function enableTouch() { if (touch.enabled) return; touch.enabled = true; document.body.classList.add('touch'); }
window.addEventListener('touchstart', enableTouch, { passive: true, once: true });
const stickVec = (st) => { if (!st) return { x: 0, y: 0, len: 0, a: 0 }; const dx = st.x - st.sx, dy = st.y - st.sy; const len = Math.min(1, Math.hypot(dx, dy) / STICK_R); const a = Math.atan2(dy, dx); return { x: Math.cos(a) * len, y: Math.sin(a) * len, len, a }; };
canvas.addEventListener('touchstart', (e) => {
  enableTouch(); if (!actx) sfx('pickup');
  for (const t of e.changedTouches) { const st = { id: t.identifier, sx: t.clientX, sy: t.clientY, x: t.clientX, y: t.clientY, lx: t.clientX, ly: t.clientY }; if (t.clientX < window.innerWidth / 2) { if (!touch.move) touch.move = st; } else if (!touch.look) touch.look = st; }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (touch.move && touch.move.id === t.identifier) { touch.move.x = t.clientX; touch.move.y = t.clientY; }
    if (touch.look && touch.look.id === t.identifier) { yaw += (t.clientX - touch.look.lx) * 0.007; pitch = THREE.MathUtils.clamp(pitch + (t.clientY - touch.look.ly) * 0.005, -0.15, 0.9); touch.look.lx = t.clientX; touch.look.ly = t.clientY; }
  }
  e.preventDefault();
}, { passive: false });
const touchEnd = (e) => { for (const t of e.changedTouches) { if (touch.move && touch.move.id === t.identifier) touch.move = null; if (touch.look && touch.look.id === t.identifier) touch.look = null; } };
canvas.addEventListener('touchend', touchEnd); canvas.addEventListener('touchcancel', touchEnd);
const fireBtn = $('btnFire');
fireBtn.addEventListener('touchstart', (e) => { touch.fire = true; e.preventDefault(); }, { passive: false });
fireBtn.addEventListener('touchend', (e) => { touch.fire = false; e.preventDefault(); }, { passive: false });
fireBtn.addEventListener('touchcancel', () => { touch.fire = false; });
$('btnOpen').addEventListener('click', interact);
$('btnJump').addEventListener('click', () => { if (jumpV === 0 && jumpY === 0) jumpV = 230; });
$('btnReload').addEventListener('click', () => { reloadPulse = true; });
$('btnUse').addEventListener('click', () => send({ t: 'use' }));
$('slots').addEventListener('click', (e) => { const slot = e.target.closest('.slot'); if (!slot) return; const i = [...$('slots').children].indexOf(slot); if (i >= 0) send({ t: 'slot', i }); });

setInterval(() => {
  if (phase !== 'playing' || !S) return;
  const me = S.players.find((p) => p.id === myId); if (!me || !me.al) return;
  const { mx, my } = moveVector();
  const shoot = (shooting && locked) || touch.fire;
  if (shoot && !inQuestion() && S.me) { const w = S.me.inv[S.me.slot]; const t = performance.now(); if (w && w.type === 'weapon' && w.ammo > 0 && S.me.reloadEnd <= S.now && t - lastLocalShot >= WRATE[w.key]) { lastLocalShot = t; flashes.set(myId, t); sfx('shoot'); } }
  send({ t: 'input', i: { mx, my, a: yaw, s: shoot && !inQuestion(), rl: reloadPulse } });
  reloadPulse = false;
}, 50);

// ---------- join / lobby buttons ----------
$('joinBtn').addEventListener('click', () => {
  const name = $('name').value.trim() || 'Player'; const code = $('room').value.trim().toUpperCase();
  localStorage.setItem('mr_name', name); $('joinErr').textContent = ''; $('joinBtn').disabled = true; connect(name, code);
});
$('name').value = localStorage.getItem('mr_name') || '';
$('name').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinBtn').click(); });
$('room').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('joinBtn').click(); });
const pushSettings = () => send({ t: 'settings', mode: $('mode').value, difficulty: $('difficulty').value, bots: +$('bots').value });
$('mode').addEventListener('change', pushSettings); $('difficulty').addEventListener('change', pushSettings); $('bots').addEventListener('change', pushSettings);
$('startBtn').addEventListener('click', () => { sfx('pickup'); send({ t: 'start' }); });
$('lobbyBtn').addEventListener('click', () => send({ t: 'lobby' }));

// =====================================================================
//                              3D WORLD
// =====================================================================
const QUALITY = { high: { grass: 650, shadow: 2048, dpr: 1.5, fog: [1100, 3200] }, medium: { grass: 320, shadow: 1024, dpr: 1, fog: [800, 2400] }, low: { grass: 100, shadow: 0, dpr: 0.75, fog: [450, 1500] } };
let qualityMode = localStorage.getItem('mr_quality') || 'auto';
let quality = qualityMode === 'auto' ? ((navigator.hardwareConcurrency || 4) <= 4 || /Mobi|Android|iPhone|iPad/.test(navigator.userAgent) ? 'medium' : 'high') : qualityMode;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== 'low', powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY[quality].dpr));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
const scene = new THREE.Scene();
const SKY = 0xbfe9ff;
scene.fog = new THREE.Fog(SKY, 1100, 3200);
const camera = new THREE.PerspectiveCamera(70, 1, 1, 9000);
// gradient sky dome
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(7000, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x2f7fe8) }, mid: { value: new THREE.Color(0x7cc4ff) }, bottom: { value: new THREE.Color(0xd8f3ff) } },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h < 0.0 ? bottom : (h < 0.25 ? mix(bottom, mid, h/0.25) : mix(mid, top, (h-0.25)/0.75)); gl_FragColor = vec4(c, 1.0); }' }));
scene.add(skyDome);
const hemi = new THREE.HemisphereLight(0xdff3ff, 0x5a9a3a, 1.05); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff4dc, 1.7); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 10; sun.shadow.camera.far = 3000;
sun.shadow.camera.left = -900; sun.shadow.camera.right = 900; sun.shadow.camera.top = 900; sun.shadow.camera.bottom = -900; sun.shadow.bias = -0.0005;
scene.add(sun); scene.add(sun.target);
if (QUALITY[quality].shadow === 0) sun.castShadow = false; else sun.shadow.mapSize.set(QUALITY[quality].shadow, QUALITY[quality].shadow);
scene.fog.near = QUALITY[quality].fog[0]; scene.fog.far = QUALITY[quality].fog[1];
const worldGroup = new THREE.Group(); scene.add(worldGroup);
const dynGroup = new THREE.Group(); scene.add(dynGroup);
function resize() { renderer.setSize(window.innerWidth, window.innerHeight, false); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); }
function applyQuality(q) {
  quality = q; const Q = QUALITY[q];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr)); resize();
  sun.castShadow = Q.shadow > 0; if (Q.shadow > 0) { sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  scene.fog.near = Q.fog[0]; scene.fog.far = Q.fog[1];
  GRASS.per = Q.grass; for (const m of GRASS.meshes) m.userData.cell = null;
}
// automatic downgrade when the frame rate is poor
let fpsAcc = 0, fpsN = 0, fpsSince = performance.now();
function watchFps(dt) {
  if (qualityMode !== 'auto') return; fpsAcc += dt; fpsN++;
  if (performance.now() - fpsSince < 4000) return;
  const fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; fpsSince = performance.now();
  if (fps < 30 && quality === 'high') { applyQuality('medium'); toast('Graphics lowered for smoother play', 2500); }
  else if (fps < 26 && quality === 'medium') { applyQuality('low'); toast('Graphics set to low for smoother play', 2500); }
}
$('quality').value = qualityMode;
$('quality').addEventListener('change', () => { qualityMode = $('quality').value; localStorage.setItem('mr_quality', qualityMode); applyQuality(qualityMode === 'auto' ? 'medium' : qualityMode); });
window.addEventListener('resize', resize); resize();

const hash = (x, y) => { let h = (Math.round(x) * 374761393 + Math.round(y) * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function texFromCanvas(c, repeat) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); } t.anisotropy = 4; return t; }
function mat(color, opts = {}) { return new THREE.MeshLambertMaterial({ color, ...opts }); }
function box(w, h, d, material, x = 0, y = 0, z = 0, shadow = true) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material); m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; return m; }
function disposeGroup(g) { g.traverse((o) => { if (o.geometry && o.geometry !== PART_GEO && o.geometry !== BULLET_GEO && o.geometry !== bladeGeo) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (m.userData && m.userData.shared) continue; if (m.map && m.map.dispose && !(m.map.userData && m.map.userData.shared)) m.map.dispose(); m.dispose(); } } }); while (g.children.length) g.remove(g.children[0]); }

// grass texture
function makeGrassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#4fb03c'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 70; i++) { const x = Math.random() * 512, y = Math.random() * 512, rx = 20 + Math.random() * 60, ry = 14 + Math.random() * 36, rot = Math.random() * Math.PI; g.fillStyle = Math.random() < 0.5 ? 'rgba(70,140,60,0.45)' : 'rgba(120,180,80,0.35)'; for (const ox of [-512, 0, 512]) for (const oy of [-512, 0, 512]) { g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, rot, 0, Math.PI * 2); g.fill(); } }
  g.lineWidth = 2; g.lineCap = 'round';
  for (let i = 0; i < 900; i++) { const x = Math.random() * 512, y = Math.random() * 512; g.strokeStyle = Math.random() < 0.5 ? 'rgba(35,95,45,0.5)' : 'rgba(180,235,130,0.4)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 6, y - 4 - Math.random() * 7); g.stroke(); }
  for (let i = 0; i < 30; i++) { g.fillStyle = ['#f4d35e', '#ffffff', '#ff8fa3'][i % 3]; g.beginPath(); g.arc(Math.random() * 512, Math.random() * 512, 2.5, 0, Math.PI * 2); g.fill(); }
  const t = texFromCanvas(c, 14); t.userData.shared = true; return t;
}
const grassTex = makeGrassTexture();
function makeWallTexture(base) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,0.08)'; for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 ? 0 : 32; x < 256; x += 64) g.fillRect(x, y, 32, 32);
  // windows
  for (const wx of [40, 160]) { g.fillStyle = '#1f3a5a'; g.fillRect(wx, 70, 56, 70); g.fillStyle = '#9fd3ff'; g.fillRect(wx + 6, 76, 20, 26); g.fillRect(wx + 30, 76, 20, 26); g.fillRect(wx + 6, 108, 20, 26); g.fillRect(wx + 30, 108, 20, 26); g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.strokeRect(wx, 70, 56, 70); }
  const t = texFromCanvas(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function makeFaceTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#f5c86a'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#222'; g.fillRect(16, 20, 9, 12); g.fillRect(39, 20, 9, 12);
  g.strokeStyle = '#222'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.arc(32, 36, 12, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
  const t = texFromCanvas(c); t.userData.shared = true; return t;
}
const faceTex = makeFaceTexture();
function makeTextSprite(draw, w = 256, h = 64, scale = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, c);
  const t = texFromCanvas(c); const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
  const sp = new THREE.Sprite(m); sp.scale.set(w / 4 * scale, h / 4 * scale, 1); sp.userData.canvas = c; sp.userData.ctx = g; sp.userData.tex = t; return sp;
}
function makeGlowTexture(color) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 10, 64, 64, 64); grd.addColorStop(0, color); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return texFromCanvas(c);
}
const glowTex = {}; for (const r of RARITY) { glowTex[r] = makeGlowTexture(RCOLOR[r]); glowTex[r].userData.shared = true; }
const flashTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#ffe680'; g.beginPath(); for (let i = 0; i < 16; i++) { const r = i % 2 ? 10 : 30; const a = (i / 16) * Math.PI * 2; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } g.closePath(); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(32, 32, 9, 0, Math.PI * 2); g.fill(); const t = texFromCanvas(c); t.userData.shared = true; return t; })();
const cloudTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d'); g.fillStyle = 'rgba(255,255,255,0.9)'; for (const [x, y, r] of [[70, 80, 40], [120, 60, 50], [175, 75, 42], [100, 90, 35], [150, 92, 38]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); } const t = texFromCanvas(c); t.userData.shared = true; return t; })();

// 2D gun drawing (icons for the HUD)
function drawGun2D(ctx, key, rarity) {
  const acc = RCOLOR[rarity] || '#999'; const metal = '#2f3640', dark = '#1e272e', wood = '#8d5524';
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill(); };
  if (key === 'pistol') { ctx.fillStyle = metal; rr(8, -4, 18, 7, 2); ctx.fillStyle = dark; rr(10, 2, 6, 8, 2); ctx.fillStyle = acc; ctx.fillRect(14, -3, 8, 2); }
  else if (key === 'smg') { ctx.fillStyle = dark; rr(2, -3, 10, 7, 2); ctx.fillStyle = metal; rr(8, -5, 26, 9, 2); ctx.fillStyle = dark; rr(16, 3, 6, 11, 2); ctx.fillStyle = metal; ctx.fillRect(34, -2, 8, 3); ctx.fillStyle = acc; ctx.fillRect(12, -4, 14, 2); }
  else if (key === 'shotgun') { ctx.fillStyle = wood; rr(0, -4, 14, 9, 3); ctx.fillStyle = metal; rr(12, -4, 34, 7, 2); ctx.fillStyle = wood; rr(22, 1, 12, 5, 2); ctx.fillStyle = dark; ctx.fillRect(40, -3, 8, 5); ctx.fillStyle = acc; ctx.fillRect(14, -3, 10, 2); }
  else if (key === 'rifle') { ctx.fillStyle = dark; rr(-2, -3, 12, 8, 2); ctx.fillStyle = metal; rr(8, -5, 22, 10, 2); ctx.fillStyle = dark; rr(14, 4, 7, 12, 2); ctx.fillStyle = metal; ctx.fillRect(28, -2, 16, 4); ctx.fillStyle = dark; ctx.fillRect(10, -7, 12, 3); ctx.fillStyle = acc; ctx.fillRect(12, -4, 14, 2); }
  else if (key === 'sniper') { ctx.fillStyle = wood; rr(-4, -3, 16, 8, 3); ctx.fillStyle = metal; rr(10, -4, 22, 8, 2); ctx.fillRect(30, -2, 28, 4); ctx.fillStyle = dark; rr(14, -9, 14, 5, 2); ctx.fillStyle = '#74b9ff'; ctx.fillRect(26, -8, 2, 3); ctx.fillStyle = acc; ctx.fillRect(14, -3, 12, 2); ctx.fillStyle = dark; ctx.fillRect(46, 2, 2, 7); ctx.fillRect(52, 2, 2, 7); }
}
const GUN_ICON = {}; const GUN_SPAN = { pistol: [8, 26], smg: [2, 42], shotgun: [0, 48], rifle: [-2, 44], sniper: [-4, 58] };
for (const key of Object.keys(WNAME)) { const c = document.createElement('canvas'); c.width = 120; c.height = 60; const g = c.getContext('2d'); const [a, b] = GUN_SPAN[key]; const sc = Math.min(4, 110 / (b - a)); g.translate(60 - ((a + b) / 2) * sc, 30); g.scale(sc, sc); drawGun2D(g, key, 'common'); GUN_ICON[key] = c.toDataURL(); }

// ----- 3D guns -----
const MAT = { metal: mat(0x2f3640), dark: mat(0x1e272e), wood: mat(0x8d5524), skin: mat(0xf5c86a), gold: mat(0xffd34d), white: mat(0xffffff), grey: mat(0x95a5a6) };
for (const m of Object.values(MAT)) m.userData.shared = true;
function makeGun(key, rarity) {
  const g = new THREE.Group(); const acc = mat(RCOLOR[rarity] || '#999', { emissive: new THREE.Color(RCOLOR[rarity] || '#999'), emissiveIntensity: 0.25 });
  if (key === 'pistol') { g.add(box(16, 6, 5, MAT.metal, 10, 0, 0)); g.add(box(5, 8, 4, MAT.dark, 5, -6, 0)); g.add(box(8, 2, 5.2, acc, 12, 2, 0)); }
  else if (key === 'smg') { g.add(box(26, 8, 6, MAT.metal, 12, 0, 0)); g.add(box(8, 6, 5, MAT.dark, -4, 0, 0)); g.add(box(5, 12, 4, MAT.dark, 10, -9, 0)); g.add(box(10, 3, 3, MAT.metal, 29, 1, 0)); g.add(box(14, 2, 6.2, acc, 10, 3, 0)); }
  else if (key === 'shotgun') { g.add(box(14, 8, 6, MAT.wood, -4, 0, 0)); g.add(box(34, 6, 5, MAT.metal, 18, 1, 0)); g.add(box(12, 5, 6, MAT.wood, 16, -4, 0)); g.add(box(10, 5, 5, MAT.dark, 40, 1, 0)); g.add(box(10, 2, 5.2, acc, 10, 3, 0)); }
  else if (key === 'rifle') { g.add(box(12, 8, 6, MAT.dark, -6, 0, 0)); g.add(box(22, 9, 7, MAT.metal, 10, 0, 0)); g.add(box(7, 13, 5, MAT.dark, 8, -10, 0)); g.add(box(18, 4, 4, MAT.metal, 30, 1, 0)); g.add(box(12, 3, 4, MAT.dark, 10, 6, 0)); g.add(box(14, 2, 7.2, acc, 10, 3.5, 0)); }
  else { g.add(box(16, 8, 6, MAT.wood, -8, 0, 0)); g.add(box(22, 7, 6, MAT.metal, 10, 0, 0)); g.add(box(30, 4, 4, MAT.metal, 36, 1, 0)); g.add(box(14, 5, 5, MAT.dark, 12, 7, 0)); g.add(box(2, 3, 3, mat(0x74b9ff), 19, 7, 0)); g.add(box(12, 2, 6.2, acc, 10, 3, 0)); }
  g.userData.tip = { pistol: 20, smg: 34, shotgun: 46, rifle: 40, sniper: 52 }[key] || 24;
  return g;
}
// ----- avatar -----
function makeHat(kind, color) {
  const g = new THREE.Group(); const col = mat(color); const dark = mat(new THREE.Color(color).multiplyScalar(0.6));
  if (kind === 'cap') { g.add(box(18, 5, 18, dark, 0, 72, 0)); g.add(box(10, 2, 16, dark, 13, 70.5, 0)); }
  else if (kind === 'tophat') { const cyl = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 18, 16), mat(0x111111)); cyl.position.y = 79; cyl.castShadow = true; g.add(cyl); const brim = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 2, 16), mat(0x111111)); brim.position.y = 71; g.add(brim); g.add(box(17, 4, 17, mat(0xc0392b), 0, 73, 0)); }
  else if (kind === 'headband') { g.add(box(17.5, 4, 17.5, col, 0, 66, 0)); g.add(box(17.6, 1.2, 17.6, MAT.white, 0, 66, 0)); }
  else if (kind === 'helmet') { const s = new THREE.Mesh(new THREE.SphereGeometry(10.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x2d3436)); s.position.y = 64; s.castShadow = true; g.add(s); g.add(box(3, 5, 14, mat(0x74b9ff), 9, 64, 0)); }
  else if (kind === 'bandana') { g.add(box(17.5, 3.5, 17.5, mat(0x6c5ce7), 0, 68, 0)); g.add(box(8, 2, 5, mat(0xa29bfe), -12, 66, 0)); }
  else if (kind === 'crown') { const c = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 7, 8), MAT.gold); c.position.y = 73; c.castShadow = true; g.add(c); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 4), MAT.gold); cone.position.set(Math.cos(a) * 8, 79, Math.sin(a) * 8); g.add(cone); } g.add(box(3, 3, 3, mat(0xe84393), 9, 74, 0)); }
  else if (kind === 'bucket') { const b = new THREE.Mesh(new THREE.CylinderGeometry(9, 13, 8, 12), MAT.grey); b.position.y = 72; b.castShadow = true; g.add(b); const t = new THREE.Mesh(new THREE.CylinderGeometry(8, 9, 6, 12), mat(0x636e72)); t.position.y = 78; g.add(t); }
  else if (kind === 'cat') { for (const z of [-6, 6]) { const ear = new THREE.Mesh(new THREE.ConeGeometry(4, 9, 4), mat(0xff9f43)); ear.position.set(0, 74, z); ear.castShadow = true; g.add(ear); } g.add(box(17.5, 3, 17.5, mat(0xff9f43), 0, 69, 0)); }
  else if (kind === 'viking') { const s = new THREE.Mesh(new THREE.SphereGeometry(10.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.grey); s.position.y = 64; s.castShadow = true; g.add(s); for (const sgn of [-1, 1]) { const horn = new THREE.Mesh(new THREE.ConeGeometry(3, 12, 8), MAT.white); horn.position.set(0, 72, sgn * 11); horn.rotation.x = -sgn * 0.9; g.add(horn); } }
  else { g.add(box(17.5, 6, 17.5, mat(0x4e342e), -1, 70.5, 0)); g.add(box(4, 9, 17.5, mat(0x4e342e), -8, 64, 0)); }
  return g;
}
function makeAvatar(color, hat) {
  const g = new THREE.Group(); const col = mat(color); const dark = mat(new THREE.Color(color).multiplyScalar(0.6));
  const legs = [], arms = [];
  const trouser = mat(new THREE.Color(color).offsetHSL(0.5, 0, -0.15)), shoe = mat(0x222222);
  for (const z of [-5, 5]) { const hip = new THREE.Group(); hip.position.set(0, 22, z); hip.add(box(9, 16, 9, trouser, 0, -8, 0)); hip.add(box(10, 6, 10, shoe, 0.5, -19, 0)); g.add(hip); legs.push(hip); }
  g.add(box(12, 24, 20, col, 0, 42, 0)); g.add(box(12.4, 4, 20.4, shoe, 0, 31, 0)); g.add(box(12.6, 6, 8, mat(0xffffff), 0, 48, 0));
  for (const z of [-14, 14]) { const sh = new THREE.Group(); sh.position.set(0, 52, z); const arm = box(8, 22, 8, col, 0, -11, 0); const hand = box(8.2, 6, 8.2, MAT.skin, 0, -20, 0); sh.add(arm); sh.add(hand); sh.rotation.z = -Math.PI / 2 + 0.15; g.add(sh); arms.push(sh); }
  const head = new THREE.Mesh(new THREE.BoxGeometry(16, 16, 16), [new THREE.MeshLambertMaterial({ map: faceTex }), MAT.skin, MAT.skin, MAT.skin, MAT.skin, MAT.skin]); head.position.y = 62; head.castShadow = true; g.add(head);
  g.add(makeHat(hat, color));
  g.add(box(6, 16, 14, dark, -9, 44, 0)); // backpack
  const gunHolder = new THREE.Group(); gunHolder.position.set(12, 50, 10); g.add(gunHolder);
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); flash.scale.set(26, 26, 1); flash.visible = false; gunHolder.add(flash);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(30, 1.5, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })); ring.rotation.x = Math.PI / 2; ring.position.y = 4; ring.visible = false; g.add(ring);
  const tag = makeTextSprite(() => {}, 256, 80, 0.75); tag.position.y = 96; g.add(tag);
  g.userData = { legs, arms, gunHolder, flash, ring, tag, gunKey: null, gunRarity: null, hat, color, tagKey: '' };
  return g;
}
function updateTag(av, p, isMe) {
  const key = `${p.n}|${p.hp}|${p.sh}|${p.q}|${p.u}`; if (av.userData.tagKey === key) return; av.userData.tagKey = key;
  const sp = av.userData.tag; const g = sp.userData.ctx; const c = sp.userData.canvas; g.clearRect(0, 0, c.width, c.height);
  g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; const tw = g.measureText(p.n).width + 24;
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.roundRect(128 - tw / 2, 4, tw, 36, 8); g.fill();
  g.fillStyle = isMe ? '#ffd34d' : '#fff'; g.fillText(p.n, 128, 31);
  g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(64, 48, 128, 12); g.fillStyle = p.hp > 35 ? '#2ed573' : '#ff6b6b'; g.fillRect(66, 50, 124 * p.hp / 100, 8);
  if (p.sh > 0) { g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(64, 62, 128, 8); g.fillStyle = '#3b9dff'; g.fillRect(66, 64, 124 * p.sh / 100, 4); }
  if (p.q) { g.font = '30px serif'; g.fillText('🤔', 128 + tw / 2 + 20, 34); }
  if (p.u) { g.font = '26px serif'; g.fillText('💊', 128 - tw / 2 - 20, 34); }
  sp.userData.tex.needsUpdate = true;
}

// ----- static world -----
function buildWorld() {
  disposeGroup(worldGroup); disposeGroup(dynGroup); chestMeshes.clear(); playerMeshes.clear(); dropMeshes.clear(); solids.length = 0; bulletPool.length = 0; particles.length = 0; clouds.length = 0; for (const f of floaters) f.el.remove(); floaters.length = 0;
  const size = world.size;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshLambertMaterial({ map: grassTex })); ground.rotation.x = -Math.PI / 2; ground.position.set(size / 2, 0, size / 2); ground.receiveShadow = true; worldGroup.add(ground);
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(size * 6, size * 6), mat(0x46a238)); outer.rotation.x = -Math.PI / 2; outer.position.set(size / 2, -1, size / 2); worldGroup.add(outer);
  const wallMat = new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false });
  for (const [x, z, w, d] of [[size / 2, 0, size, 6], [size / 2, size, size, 6], [0, size / 2, 6, size], [size, size / 2, 6, size]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 90, d), wallMat); m.position.set(x, 45, z); worldGroup.add(m); }
  for (const o of world.obstacles) {
    if (o.t === 'r') {
      const h = 110 + hash(o.x, o.y) * 70; const base = o.c || '#8d6e63';
      const wall = makeWallTexture(base); wall.repeat.set(Math.max(1, Math.round(o.w / 180)), 1);
      const wallZ = wall.clone(); wallZ.repeat.set(Math.max(1, Math.round(o.h / 180)), 1); wallZ.needsUpdate = true;
      const mx = new THREE.MeshLambertMaterial({ map: wallZ }), mz = new THREE.MeshLambertMaterial({ map: wall }), top = mat(new THREE.Color(base).multiplyScalar(0.55));
      const b = new THREE.Mesh(new THREE.BoxGeometry(o.w, h, o.h), [mx, mx, top, top, mz, mz]); b.position.set(o.x + o.w / 2, h / 2, o.y + o.h / 2); b.castShadow = true; b.receiveShadow = true; worldGroup.add(b); solids.push(b);
      const roof = box(o.w + 18, 10, o.h + 18, mat(new THREE.Color(base).multiplyScalar(0.5)), o.x + o.w / 2, h + 5, o.y + o.h / 2); worldGroup.add(roof);
      const ridge = o.w >= o.h ? box(o.w, 14, 16, mat(new THREE.Color(base).multiplyScalar(0.7)), o.x + o.w / 2, h + 16, o.y + o.h / 2) : box(16, 14, o.h, mat(new THREE.Color(base).multiplyScalar(0.7)), o.x + o.w / 2, h + 16, o.y + o.h / 2); worldGroup.add(ridge);
      const chim = box(16, 30, 16, mat(0x6d4c41), o.x + 24 + hash(o.y, o.x) * (o.w - 48), h + 20, o.y + 24 + hash(o.x + 1, o.y) * (o.h - 48)); worldGroup.add(chim);
      const door = box(2, 44, 24, mat(0x4e342e), o.x + o.w + 0.5, 22, o.y + o.h / 2, false); worldGroup.add(door);
    } else if (o.k === 'tree') {
      const t = makeTree(o); worldGroup.add(t); t.traverse((m) => { if (m.isMesh) solids.push(m); });
    } else {
      const r = o.r; const m = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 0.95, 0), new THREE.MeshLambertMaterial({ color: 0x8fa0a6, flatShading: true })); m.position.set(o.x, r * 0.35, o.y); m.scale.y = 0.65; m.rotation.set(hash(o.x, o.y) * 3, hash(o.y, o.x) * 3, 0); m.castShadow = true; m.receiveShadow = true; worldGroup.add(m); solids.push(m);
    }
  }
  // hills on the horizon (outside the playable square)
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + hash(i, 7) * 0.15; const d = 2250 + hash(i, 3) * 900; const hx = size / 2 + Math.cos(a) * d, hz = size / 2 + Math.sin(a) * d;
    const w = 420 + hash(i, 11) * 700, hgt = 180 + hash(i, 13) * 420;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(w, hgt, 7, 1), new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(0.3 + hash(i, 5) * 0.08, 0.55, 0.32 + hash(i, 9) * 0.15), flatShading: true }));
    hill.position.set(hx, hgt / 2 - 10, hz); hill.rotation.y = hash(i, 2) * 3; hill.scale.z = 0.7 + hash(i, 4) * 0.6; worldGroup.add(hill);
    if (hash(i, 17) < 0.5) { const snow = new THREE.Mesh(new THREE.ConeGeometry(w * 0.3, hgt * 0.3, 7, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })); snow.position.set(hx, hgt * 0.85 - 10, hz); snow.rotation.y = hill.rotation.y; snow.scale.z = hill.scale.z; worldGroup.add(snow); }
  }
  // decorative trees beyond the walls
  for (let i = 0; i < 90; i++) { const a = hash(i, 21) * Math.PI * 2, d = 1750 + hash(i, 23) * 500; const o = { x: size / 2 + Math.cos(a) * d, y: size / 2 + Math.sin(a) * d, r: 30 + hash(i, 25) * 30 }; worldGroup.add(makeTree(o, false)); }
  initGrass();
  // chests
  for (const [id, pos] of world.chests) { const g = makeChest(); g.position.set(pos.x, 0, pos.y); g.rotation.y = hash(pos.x, pos.y) * Math.PI * 2; worldGroup.add(g); chestMeshes.set(id, g); }
  // clouds
  for (let i = 0; i < 10; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false })); sp.scale.set(700, 350, 1); sp.position.set(Math.random() * size * 1.6 - size * 0.3, 650 + Math.random() * 200, Math.random() * size * 1.6 - size * 0.3); sp.userData.speed = 6 + Math.random() * 8; worldGroup.add(sp); clouds.push(sp); }
  // storm
  storm.wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 600, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0x8e44ad, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); storm.wall.position.y = 300; storm.wall.visible = false; worldGroup.add(storm.wall);
  storm.ring = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 50, 64, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })); storm.ring.position.y = 25; storm.ring.visible = false; worldGroup.add(storm.ring);
}
const clouds = []; const storm = { wall: null, ring: null }; const solids = [];
const chestMeshes = new Map(), playerMeshes = new Map(), dropMeshes = new Map();
const TREE_MATS = { trunk: new THREE.MeshLambertMaterial({ color: 0x9b3b1f }), trunk2: new THREE.MeshLambertMaterial({ color: 0x7a4a2a }), greens: [0x3fae2a, 0x5ed12f, 0x2f8f22, 0x8ee03a, 0x45c23a].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true })) };
function makeTree(o, shadow = true) {
  const g = new THREE.Group(); g.position.set(o.x, 0, o.y); g.rotation.y = hash(o.x, o.y) * Math.PI * 2;
  const r = o.r, kind = hash(o.y, o.x), scale = 1.6 + hash(o.x + 3, o.y) * 0.8;
  const trunkMat = kind < 0.5 ? TREE_MATS.trunk : TREE_MATS.trunk2;
  if (kind < 0.5) { // pine: tall trunk + stacked cones
    const H = r * scale * 1.2;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.26, H, 7), trunkMat); trunk.position.y = H / 2; trunk.castShadow = shadow; g.add(trunk);
    for (let i = 0; i < 3; i++) { const cw = r * (1.5 - i * 0.35) * scale * 0.55, ch = r * 1.1 * scale * 0.55; const cone = new THREE.Mesh(new THREE.ConeGeometry(cw, ch, 7), TREE_MATS.greens[(Math.floor(hash(o.x, o.y + i) * 5))]); cone.position.y = H * 0.55 + i * ch * 0.62; cone.castShadow = shadow; g.add(cone); }
  } else { // round: trunk + clustered blobs
    const H = r * scale * 0.9;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.2, r * 0.32, H, 7), trunkMat); trunk.position.y = H / 2; trunk.castShadow = shadow; g.add(trunk);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const br = r * (0.55 + hash(o.x + i, o.y) * 0.3) * scale * 0.6; const blob = new THREE.Mesh(new THREE.IcosahedronGeometry(br, 1), TREE_MATS.greens[(i + Math.floor(hash(o.x, o.y) * 5)) % 5]); blob.position.set(Math.cos(a) * r * 0.45 * scale * 0.6, H + Math.sin(i * 1.7) * r * 0.2 * scale, Math.sin(a) * r * 0.45 * scale * 0.6); blob.castShadow = shadow; g.add(blob); }
    const top = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.7 * scale * 0.6, 1), TREE_MATS.greens[1]); top.position.y = H + r * 0.45 * scale; top.castShadow = shadow; g.add(top);
  }
  return g;
}
// ---- dense swaying grass around the player (instanced) ----
const GRASS = { cell: 360, per: 650, meshes: [], cells: new Map(), time: { value: 0 } };
const bladeTex = (() => { const c = document.createElement('canvas'); c.width = 32; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#5fd13a'; g.beginPath(); g.moveTo(10, 64); g.lineTo(22, 64); g.lineTo(17, 0); g.lineTo(15, 0); g.closePath(); g.fill(); g.fillStyle = '#b7f36a'; g.beginPath(); g.moveTo(14, 64); g.lineTo(18, 64); g.lineTo(16, 4); g.closePath(); g.fill(); const t = texFromCanvas(c); t.userData.shared = true; return t; })();
function makeBladeGeometry() { const a = new THREE.PlaneGeometry(7, 26); a.translate(0, 13, 0); const b = a.clone(); b.rotateY(Math.PI / 2); const merged = new THREE.BufferGeometry(); const pos = [], uv = [], idx = []; let off = 0; for (const geo of [a, b]) { const p = geo.attributes.position.array, u = geo.attributes.uv.array, ix = geo.index.array; for (let i = 0; i < p.length; i++) pos.push(p[i]); for (let i = 0; i < u.length; i++) uv.push(u[i]); for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off); off += p.length / 3; } merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); merged.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); merged.setIndex(idx); merged.computeVertexNormals(); return merged; }
const bladeGeo = makeBladeGeometry();
const bladeMat = new THREE.MeshLambertMaterial({ map: bladeTex, alphaTest: 0.5, side: THREE.DoubleSide });
bladeMat.onBeforeCompile = (sh) => { sh.uniforms.uTime = GRASS.time; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float wx = instanceMatrix[3][0], wz = instanceMatrix[3][2];\n float sway = sin(uTime * 1.6 + wx * 0.02 + wz * 0.013) * 0.6 + sin(uTime * 2.7 + wz * 0.05) * 0.4;\n transformed.x += sway * 5.0 * uv.y * uv.y;\n transformed.z += cos(uTime * 1.3 + wx * 0.03) * 2.5 * uv.y * uv.y;'); };
function initGrass() {
  for (const m of GRASS.meshes) worldGroup.remove(m); GRASS.meshes = []; GRASS.cells.clear();
  GRASS.per = QUALITY[quality].grass;
  for (let i = 0; i < 9; i++) { const m = new THREE.InstancedMesh(bladeGeo, bladeMat, QUALITY.high.grass); m.receiveShadow = true; m.frustumCulled = false; m.userData.cell = null; worldGroup.add(m); GRASS.meshes.push(m); }
}
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler();
function fillGrassCell(mesh, cx, cz) {
  const size = GRASS.cell; let n = 0; const rects = world.obstacles.filter((o) => o.t === 'r');
  for (let i = 0; i < GRASS.per; i++) {
    const hx = hash(cx * 1000 + i, cz * 777 + 1), hz = hash(cz * 1000 + i, cx * 333 + 2);
    const x = cx * size + hx * size, z = cz * size + hz * size;
    if (x < 10 || z < 10 || x > world.size - 10 || z > world.size - 10) continue;
    let blocked = false; for (const o of rects) if (x > o.x - 6 && x < o.x + o.w + 6 && z > o.y - 6 && z < o.y + o.h + 6) { blocked = true; break; } if (blocked) continue;
    const sc = 0.7 + hash(i, cx + cz) * 0.9; _s.set(sc, sc * (0.8 + hash(i + 5, cx) * 0.7), sc); _e.set(0, hash(i, cz) * Math.PI, 0); _q.setFromEuler(_e); _p.set(x, 0, z);
    _m4.compose(_p, _q, _s); mesh.setMatrixAt(n++, _m4);
  }
  mesh.count = n; mesh.instanceMatrix.needsUpdate = true; mesh.userData.cell = `${cx},${cz}`;
}
function updateGrass(fx, fz) {
  if (!GRASS.meshes.length || !world) return;
  const ccx = Math.floor(fx / GRASS.cell), ccz = Math.floor(fz / GRASS.cell);
  const wanted = []; for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) wanted.push([ccx + dx, ccz + dz]);
  const have = new Set(GRASS.meshes.map((m) => m.userData.cell));
  const missing = wanted.filter(([x, z]) => !have.has(`${x},${z}`)); const wantedKeys = new Set(wanted.map(([x, z]) => `${x},${z}`));
  for (const m of GRASS.meshes) { if (!missing.length) break; if (!wantedKeys.has(m.userData.cell)) { const [x, z] = missing.pop(); fillGrassCell(m, x, z); } }
}
function makeChest() {
  const g = new THREE.Group();
  g.add(box(48, 26, 32, mat(0x8d5a2b), 0, 13, 0));
  const lidPivot = new THREE.Group(); lidPivot.position.set(-24, 26, 0); const lid = box(48, 12, 32, mat(0x6d4320), 24, 6, 0); lidPivot.add(lid); g.add(lidPivot);
  const bandMat = mat(0xb8bcc4, { emissive: new THREE.Color(0xb8bcc4), emissiveIntensity: 0.3 });
  const b1 = box(5, 40, 33, bandMat, -14, 20, 0), b2 = box(5, 40, 33, bandMat, 12, 20, 0); lidPivot.add(box(5, 13, 33, bandMat, 10, 6, 0)); lidPivot.add(box(5, 13, 33, bandMat, 36, 6, 0)); g.add(box(5, 27, 33, bandMat, -14, 13, 0)); g.add(box(5, 27, 33, bandMat, 12, 13, 0)); void b1; void b2;
  g.add(box(8, 10, 3, MAT.gold, 0, 22, 17));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex.common, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8 })); glow.scale.set(120, 120, 1); glow.position.y = 6; g.add(glow);
  const mark = makeTextSprite((c) => { c.font = 'bold 72px sans-serif'; c.textAlign = 'center'; c.fillStyle = '#fff'; c.lineWidth = 8; c.strokeStyle = '#000'; c.strokeText('?', 64, 90); c.fillText('?', 64, 90); }, 128, 128, 0.8); mark.position.y = 80; mark.visible = false; g.add(mark);
  const lock = makeTextSprite((c) => { c.font = '80px serif'; c.textAlign = 'center'; c.fillText('🔒', 64, 96); }, 128, 128, 0.7); lock.position.y = 70; lock.visible = false; g.add(lock);
  g.userData = { lidPivot, bandMat, glow, mark, lock, rarity: null, open: false };
  return g;
}
function updateChest(g, rarityIdx, state, now) {
  const rar = RARITY[rarityIdx]; const u = g.userData;
  if (u.rarity !== rar) { u.rarity = rar; u.bandMat.color.set(RCOLOR[rar]); u.bandMat.emissive.set(RCOLOR[rar]); u.glow.material.map = glowTex[rar]; u.glow.material.needsUpdate = true; }
  const open = state === 1; u.lidPivot.rotation.z = open ? 1.9 : 0; u.glow.visible = !open; u.bandMat.emissiveIntensity = open ? 0 : 0.35 + Math.sin(now / 300) * 0.15;
  u.glow.scale.setScalar(110 + Math.sin(now / 280) * 12); u.mark.visible = state === 2; u.lock.visible = state === 3;
}
function makeDrop(d) {
  const g = new THREE.Group();
  if (d.type === 'weapon') { const gun = makeGun(d.key, d.rarity); gun.rotation.z = 0.5; gun.position.set(-20, 18, 0); g.add(gun); }
  else { const sp = makeTextSprite((c) => { c.font = '90px serif'; c.textAlign = 'center'; c.fillText(CICON[d.key], 64, 100); if (d.count > 1) { c.font = 'bold 36px sans-serif'; c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 6; c.strokeText('×' + d.count, 96, 120); c.fillText('×' + d.count, 96, 120); } }, 128, 128, 1); sp.position.y = 22; g.add(sp); }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex[d.rarity || 'common'], transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 })); glow.scale.set(70, 70, 1); glow.position.y = 3; g.add(glow);
  return g;
}

// ----- particles & floaters -----
const particles = []; const PART_GEO = new THREE.BoxGeometry(4, 4, 4);
const sparkMats = new Map();
function spawnSparks(x, y, z, n, color, speed) { const key = String(color instanceof THREE.Color ? color.getHex() : color); let m = sparkMats.get(key); if (!m) { m = new THREE.MeshBasicMaterial({ color }); sparkMats.set(key, m); } for (let i = 0; i < n; i++) { const mesh = new THREE.Mesh(PART_GEO, m); mesh.position.set(x, y, z); const a = Math.random() * Math.PI * 2, b = (Math.random() - 0.3) * Math.PI; const sp = speed * (0.4 + Math.random()); particles.push({ mesh, vx: Math.cos(a) * Math.cos(b) * sp, vy: Math.sin(b) * sp + 60, vz: Math.sin(a) * Math.cos(b) * sp, life: 0.5 + Math.random() * 0.4, max: 0.9 }); dynGroup.add(mesh); } }
function spawnBoom(x, z, color) { spawnSparks(x, 40, z, 40, new THREE.Color(color), 260); spawnSparks(x, 40, z, 20, 0xffffff, 180); floater(x, 90, z, 'ELIMINATED', '#ff6b6b', 26); }
function updateParticles(dt) { for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= dt; if (p.life <= 0) { dynGroup.remove(p.mesh); particles.splice(i, 1); continue; } p.vy -= 400 * dt; p.mesh.position.x += p.vx * dt; p.mesh.position.y = Math.max(2, p.mesh.position.y + p.vy * dt); p.mesh.position.z += p.vz * dt; p.mesh.scale.setScalar(Math.max(0.1, p.life / p.max)); } }
const floaters = [];
function floater(x, y, z, text, color, size = 20) { const el = document.createElement('div'); el.className = 'floater'; el.textContent = text; el.style.color = color; el.style.fontSize = size + 'px'; $('floaters').appendChild(el); floaters.push({ el, pos: new THREE.Vector3(x, y, z), life: 1.1, vy: 60 }); }
const _v = new THREE.Vector3();
function updateFloaters(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.life -= dt; if (f.life <= 0) { f.el.remove(); floaters.splice(i, 1); continue; } f.pos.y += f.vy * dt; _v.copy(f.pos).project(camera); if (_v.z > 1) { f.el.style.display = 'none'; continue; } f.el.style.display = ''; f.el.style.left = ((_v.x + 1) / 2 * window.innerWidth) + 'px'; f.el.style.top = ((1 - _v.y) / 2 * window.innerHeight) + 'px'; f.el.style.opacity = Math.min(1, f.life * 2); }
}

// ----- bullets pool -----
const bulletPool = []; const BULLET_GEO = new THREE.BoxGeometry(18, 3, 3); const BULLET_MAT = new THREE.MeshBasicMaterial({ color: 0xfff1a0 });
function syncBullets() {
  const n = S.bullets.length; while (bulletPool.length < n) { const m = new THREE.Mesh(BULLET_GEO, BULLET_MAT); dynGroup.add(m); bulletPool.push(m); }
  for (let i = 0; i < bulletPool.length; i++) { const m = bulletPool[i]; if (i < n) { const b = S.bullets[i]; m.visible = true; m.position.set(b[0], 42, b[1]); m.rotation.y = -b[2]; } else m.visible = false; }
}

// ----- preview renderer (lobby) -----
let previewR = null, previewScene = null, previewCam = null, previewAv = null;
function previewAvatar(color, hat) {
  const pc = $('preview');
  if (!previewR) { previewR = new THREE.WebGLRenderer({ canvas: pc, antialias: true, alpha: true }); previewR.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); previewR.setSize(pc.width, pc.height, false); previewScene = new THREE.Scene(); previewCam = new THREE.PerspectiveCamera(40, 1, 1, 1000); previewCam.position.set(150, 95, 0); previewCam.lookAt(0, 45, 0); previewScene.add(new THREE.HemisphereLight(0xffffff, 0x446644, 1.1)); const d = new THREE.DirectionalLight(0xffffff, 1.2); d.position.set(80, 150, 60); previewScene.add(d); const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 32), mat(0x3f7a3a)); floor.rotation.x = -Math.PI / 2; previewScene.add(floor); }
  if (previewAv) { previewScene.remove(previewAv); disposeGroup(previewAv); }
  previewAv = makeAvatar(color, hat); previewAv.userData.tag.visible = false; const gun = makeGun('rifle', 'legendary'); previewAv.userData.gunHolder.add(gun); previewScene.add(previewAv);
}

// ----- main loop -----
const camRay = new THREE.Raycaster(); const _camTarget = new THREE.Vector3(), _camHead = new THREE.Vector3(), _camDir = new THREE.Vector3();
let lastFrame = performance.now(); const camPos = new THREE.Vector3(1600, 120, 1800), camLook = new THREE.Vector3(1600, 40, 1600);
function frame(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
  if ((phase === 'playing' || phase === 'ended') && S && world) draw(dt, now);
  else if (phase === 'lobby' && previewR && previewAv) { previewAv.rotation.y = now / 1500; previewAv.userData.legs.forEach((l, i) => { l.rotation.z = Math.sin(now / 150) * 0.5 * (i ? 1 : -1); }); previewR.render(previewScene, previewCam); }
  $('focusHint').classList.toggle('hidden', !(phase === 'playing' && !touch.enabled && !inQuestion() && !locked && S && S.players.some((p) => p.id === myId && p.al)));
  if (question && qTimerLen) { const f = Math.max(0, 1 - (performance.now() - qTimerStart) / qTimerLen); $('qTimer').style.width = f * 100 + '%'; $('qTimer').style.background = f < 0.3 ? '#ff6b6b' : '#3b9dff'; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function draw(dt, now) {
  const k = 1 - Math.pow(0.001, dt);
  for (const p of S.players) { const v = view.get(p.id); if (!v) continue; if (!(p.id === myId && p.al && pred.valid)) { v.x += (p.x - v.x) * k; v.y += (p.y - v.y) * k; } let da = p.a - v.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; v.a += da * Math.min(1, dt * 18); }
  const me = S.players.find((p) => p.id === myId);
  predictMove(me, dt); watchFps(dt);
  if (me && me.al && pred.valid) { const v = view.get(myId); if (v) { v.x = pred.x; v.y = pred.y; } }
  let focus = me && view.get(myId), focusP = me;
  if (me && !me.al) { const other = S.players.find((p) => p.al); if (other) { focus = view.get(other.id); focusP = other; } }
  // players
  const seen = new Set();
  for (const p of S.players) {
    if (!p.al) continue; const v = view.get(p.id); if (!v) continue; seen.add(p.id);
    let av = playerMeshes.get(p.id);
    if (!av || av.userData.hat !== (p.h || 'cap') || av.userData.color !== p.c) { if (av) { dynGroup.remove(av); disposeGroup(av); } av = makeAvatar(p.c, p.h || 'cap'); dynGroup.add(av); playerMeshes.set(p.id, av); }
    const u = av.userData;
    av.position.set(v.x, 0, v.y); av.rotation.y = -(p.id === myId && me.al ? yaw : v.a);
    const moving = Math.hypot(p.x - v.x, p.y - v.y) > 1.5 || (p.id === myId && (keys.w || keys.a || keys.s || keys.d || keys.arrowup || keys.arrowdown || keys.arrowleft || keys.arrowright || (touch.move && stickVec(touch.move).len > 0.12)));
    u.legs[0].rotation.z = moving ? Math.sin(now / 120) * 0.7 : 0; u.legs[1].rotation.z = moving ? -Math.sin(now / 120) * 0.7 : 0;
    av.position.y = moving ? Math.abs(Math.sin(now / 120)) * 2 : 0;
    if (p.id === myId) { if (jumpV !== 0 || jumpY > 0) { jumpY += jumpV * dt; jumpV -= 700 * dt; if (jumpY <= 0) { jumpY = 0; jumpV = 0; } } av.position.y += jumpY; if (jumpY > 0) { u.legs[0].rotation.z = 0.5; u.legs[1].rotation.z = -0.5; } }
    if (u.gunKey !== p.w || u.gunRarity !== p.wr) { while (u.gunHolder.children.length > 1) { const c = u.gunHolder.children[1]; u.gunHolder.remove(c); disposeGroup(c); } u.gunKey = p.w; u.gunRarity = p.wr; if (p.w && WNAME[p.w]) { const gun = makeGun(p.w, p.wr || 'common'); u.gunHolder.add(gun); u.flash.position.x = gun.userData.tip; } }
    u.flash.visible = (flashes.get(p.id) || 0) > now - 60; if (u.flash.visible) u.flash.material.rotation = Math.random() * 6;
    u.ring.visible = !!p.pr; if (p.pr) u.ring.rotation.z = now / 400;
    updateTag(av, p, p.id === myId);
  }
  for (const [id, av] of playerMeshes) if (!seen.has(id)) { dynGroup.remove(av); disposeGroup(av); playerMeshes.delete(id); }
  // chests, drops, bullets
  for (const c of S.chests) { const g = chestMeshes.get(c[0]); if (g) updateChest(g, c[1], c[2], now); }
  const dseen = new Set();
  for (const d of S.drops) { dseen.add(d.id); let g = dropMeshes.get(d.id); if (!g) { g = makeDrop(d); g.position.set(d.x, 0, d.y); dynGroup.add(g); dropMeshes.set(d.id, g); } g.position.y = Math.sin(now / 300 + d.x) * 3; g.rotation.y = now / 800; }
  for (const [id, g] of dropMeshes) if (!dseen.has(id)) { dynGroup.remove(g); disposeGroup(g); dropMeshes.delete(id); }
  syncBullets(); updateParticles(dt);
  // storm
  if (S.storm && storm.wall) { const s = S.storm; storm.wall.visible = true; storm.wall.position.set(s.x, 300, s.y); storm.wall.scale.set(s.r, 1, s.r); storm.wall.material.opacity = 0.3 + Math.sin(now / 500) * 0.06; storm.ring.visible = s.tr < s.r; storm.ring.position.set(s.tx, 25, s.ty); storm.ring.scale.set(s.tr, 1, s.tr); }
  for (const c of clouds) { c.position.x += c.userData.speed * dt; if (c.position.x > world.size + 300) c.position.x = -300; }
  GRASS.time.value = now / 1000; if (focus) updateGrass(focus.x, focus.y);
  // camera
  if (focus) {
    const a = focusP === me && me.al ? yaw : focus.a;
    const fx = Math.cos(a), fz = Math.sin(a);
    const dist = 130 + pitch * 50, h = 58 + pitch * 150, side = 28; // over the right shoulder
    const target = _camTarget.set(focus.x - fx * dist - fz * side, Math.max(25, h), focus.y - fz * dist + fx * side);
    // camera collision: pull the camera in if a tree or house is in the way
    const head = _camHead.set(focus.x, 55, focus.y); const dir = _camDir.copy(target).sub(head); const full = dir.length(); dir.normalize();
    camRay.set(head, dir); camRay.far = full; const hits = camRay.intersectObjects(solids, false);
    if (hits.length) { const d = Math.max(30, hits[0].distance - 12); target.copy(head).addScaledVector(dir, d); }
    const snap = focusP === me ? 1 - Math.pow(0.0001, dt) : 1 - Math.pow(0.01, dt);
    camPos.lerp(target, snap);
    camLook.set(focus.x + fx * 120 - fz * side, 52 + (0.3 - pitch) * 40, focus.y + fz * 120 + fx * side);
    shake = Math.max(0, shake - dt * 40);
    camera.position.copy(camPos); if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; }
    camera.lookAt(camLook); skyDome.position.copy(camera.position);
    sun.position.set(focus.x + 400, 700, focus.y + 250); sun.target.position.set(focus.x, 0, focus.y);
  }
  updateFloaters(dt);
  renderer.render(scene, camera);
  drawMinimap(me);
}
function drawMinimap(me) {
  const sc = mini.width / world.size;
  mctx.clearRect(0, 0, mini.width, mini.height);
  mctx.fillStyle = '#3f7a3a'; mctx.fillRect(0, 0, mini.width, mini.height);
  mctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (const o of world.obstacles) { if (o.t === 'r') mctx.fillRect(o.x * sc, o.y * sc, o.w * sc, o.h * sc); }
  for (const c of S.chests) { const pos = world.chests.get(c[0]); if (!pos || c[2] === 1) continue; mctx.fillStyle = RCOLOR[RARITY[c[1]]]; mctx.fillRect(pos.x * sc - 2, pos.y * sc - 2, 4, 4); }
  if (S.storm) {
    const s = S.storm; mctx.fillStyle = 'rgba(120,40,200,0.45)'; mctx.beginPath(); mctx.rect(0, 0, mini.width, mini.height); mctx.arc(s.x * sc, s.y * sc, s.r * sc, 0, Math.PI * 2, true); mctx.fill('evenodd');
    mctx.strokeStyle = '#fff'; mctx.lineWidth = 1; mctx.setLineDash([3, 3]); mctx.beginPath(); mctx.arc(s.tx * sc, s.ty * sc, s.tr * sc, 0, Math.PI * 2); mctx.stroke(); mctx.setLineDash([]);
  }
  if (me && me.al) { const v = view.get(myId) || me; mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(v.x * sc, v.y * sc, 4, 0, Math.PI * 2); mctx.fill(); mctx.strokeStyle = '#fff'; mctx.beginPath(); mctx.moveTo(v.x * sc, v.y * sc); mctx.lineTo(v.x * sc + Math.cos(yaw) * 9, v.y * sc + Math.sin(yaw) * 9); mctx.stroke(); }
}
