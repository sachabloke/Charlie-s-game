'use strict';
// Authoritative game simulation for one room.
const maths = require('./maths');
const { RARITIES, RARITY_INFO, WEAPONS, CONSUMABLES, rollRarity, makeLoot, makeWeapon, makeConsumable, itemName, rand, pick } = require('./items');

const TICK_MS = 50;
const WORLD = 3200;
const PLAYER_R = 20;
const SPEED = 270;
const CHEST_COUNT = 42;
const CHEST_RANGE = 85;
const PICKUP_RANGE = 40;
const QUESTION_MS = 30000;
const CHEST_RESPAWN_MS = 70000;
const DM_DURATION_MS = 8 * 60 * 1000;
const MAX_PLAYERS = 8;
const SPAWN_PROTECT_MS = 3000;
const BOT_NAMES = ['Bot Alex', 'Bot Maya', 'Bot Zed', 'Bot Pip', 'Bot Rex', 'Bot Ivy', 'Bot Max'];
const BOT_COLORS = ['#ff7675', '#fdcb6e', '#e17055', '#00cec9', '#fab1a0', '#a29bfe', '#55efc4'];
const PLAYER_COLORS = ['#3b9dff', '#ff5e7e', '#ffd32a', '#2ed573', '#ff9f43', '#c56cf0', '#18dcff', '#f368e0', '#ff4757', '#7bed9f', '#ffffff', '#2f3542'];
const HATS = ['cap', 'tophat', 'headband', 'helmet', 'bandana', 'crown', 'none', 'bucket', 'cat', 'viking'];

let nextId = 1;
const uid = () => (nextId++).toString(36);
const now = () => Date.now();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// ---------- geometry ----------
function pointInObstacle(x, y, obstacles, pad = 0) {
  for (const o of obstacles) {
    if (o.t === 'r') { if (x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) return true; }
    else if (dist(x, y, o.x, o.y) < o.r + pad) return true;
  }
  return false;
}
function resolveCircle(p, r, obstacles) {
  for (const o of obstacles) {
    if (o.t === 'r') {
      const cx = clamp(p.x, o.x, o.x + o.w), cy = clamp(p.y, o.y, o.y + o.h);
      let dx = p.x - cx, dy = p.y - cy; const d = Math.hypot(dx, dy);
      if (d >= r) continue;
      if (d < 1e-6) { // centre is inside the rectangle: push out of nearest edge
        const left = p.x - o.x, right = o.x + o.w - p.x, top = p.y - o.y, bottom = o.y + o.h - p.y;
        const m = Math.min(left, right, top, bottom);
        if (m === left) p.x = o.x - r; else if (m === right) p.x = o.x + o.w + r; else if (m === top) p.y = o.y - r; else p.y = o.y + o.h + r;
      } else { p.x = cx + (dx / d) * r; p.y = cy + (dy / d) * r; }
    } else {
      const d = dist(p.x, p.y, o.x, o.y); const min = o.r + r;
      if (d < min) { const dx = d < 1e-6 ? 1 : (p.x - o.x) / d, dy = d < 1e-6 ? 0 : (p.y - o.y) / d; p.x = o.x + dx * min; p.y = o.y + dy * min; }
    }
  }
  p.x = clamp(p.x, r, WORLD - r); p.y = clamp(p.y, r, WORLD - r);
}
function lineBlocked(x1, y1, x2, y2, obstacles) {
  const len = dist(x1, y1, x2, y2); const steps = Math.max(1, Math.ceil(len / 24));
  for (let i = 1; i < steps; i++) { const t = i / steps; if (pointInObstacle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, obstacles)) return true; }
  return false;
}

function generateWorld() {
  const obstacles = [];
  const ok = (x, y, rad) => {
    if (dist(x, y, WORLD / 2, WORLD / 2) < 220) return false; // keep the middle open
    for (const o of obstacles) {
      const ox = o.t === 'r' ? o.x + o.w / 2 : o.x, oy = o.t === 'r' ? o.y + o.h / 2 : o.y;
      const orad = o.t === 'r' ? Math.hypot(o.w, o.h) / 2 : o.r;
      if (dist(x, y, ox, oy) < rad + orad + 70) return false;
    }
    return true;
  };
  for (let i = 0; i < 16; i++) for (let tries = 0; tries < 30; tries++) {
    const w = rand(120, 320), h = rand(120, 300); const x = rand(100, WORLD - 100 - w), y = rand(100, WORLD - 100 - h);
    if (ok(x + w / 2, y + h / 2, Math.hypot(w, h) / 2)) { obstacles.push({ t: 'r', x, y, w, h, k: 'building', c: pick(['#8d6e63', '#78909c', '#a1887f', '#90a4ae', '#bcaaa4']) }); break; }
  }
  for (let i = 0; i < 55; i++) for (let tries = 0; tries < 30; tries++) {
    const r = rand(24, 46); const x = rand(80, WORLD - 80), y = rand(80, WORLD - 80);
    if (ok(x, y, r)) { obstacles.push({ t: 'c', x, y, r, k: 'tree' }); break; }
  }
  for (let i = 0; i < 18; i++) for (let tries = 0; tries < 30; tries++) {
    const r = rand(28, 60); const x = rand(80, WORLD - 80), y = rand(80, WORLD - 80);
    if (ok(x, y, r)) { obstacles.push({ t: 'c', x, y, r, k: 'rock' }); break; }
  }
  return obstacles;
}

class Game {
  constructor(code, onEmpty) {
    this.code = code; this.onEmpty = onEmpty;
    this.players = new Map();
    this.phase = 'lobby'; this.hostId = null;
    this.settings = { mode: 'dm', bots: 2, difficulty: 'normal' };
    this.obstacles = []; this.chests = []; this.bullets = []; this.drops = [];
    this.events = []; this.storm = null; this.startedAt = 0; this.endsAt = 0; this.endedAt = 0;
    this.colorIdx = 0;
    this.last = now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  // ---------- players ----------
  humans() { return [...this.players.values()].filter((p) => !p.isBot); }
  newPlayer(name, isBot) {
    const color = isBot ? BOT_COLORS[this.colorIdx++ % BOT_COLORS.length] : PLAYER_COLORS[this.colorIdx++ % PLAYER_COLORS.length];
    return {
      id: uid(), name: String(name).slice(0, 14) || 'Player', isBot, color, hat: HATS[Math.floor(Math.random() * HATS.length)], ws: null,
      x: WORLD / 2, y: WORLD / 2, angle: 0, hp: 100, shield: 0, alive: false, spectating: false,
      inv: [null, null, null, null, null], slot: 0, lastShot: 0, reloadEnd: 0, useEnd: 0, useItem: null,
      input: { u: 0, d: 0, l: 0, r: 0, a: 0, s: 0 },
      question: null, kills: 0, deaths: 0, correct: 0, wrong: 0, byTopic: {}, protectUntil: 0, diedAt: 0, lastTopic: null,
      bot: null, stormDamageAcc: 0,
    };
  }
  addHuman(ws, name) {
    if (this.humans().length >= MAX_PLAYERS) { send(ws, { t: 'error', msg: 'That room is full.' }); return null; }
    const p = this.newPlayer(name, false); p.ws = ws; this.players.set(p.id, p);
    if (!this.hostId) this.hostId = p.id;
    send(ws, { t: 'joined', id: p.id, room: this.code });
    if (this.phase === 'playing') {
      send(ws, { t: 'world', size: WORLD, obstacles: this.obstacles, chests: this.chests.map((c) => ({ id: c.id, x: c.x, y: c.y })), mode: this.settings.mode });
      if (this.settings.mode === 'dm') this.spawn(p); else { p.spectating = true; this.pushEvent({ k: 'info', msg: `${p.name} is watching until the next round.` }); }
      this.pushEvent({ k: 'info', msg: `${p.name} joined the game.` });
    } else if (this.phase === 'ended') {
      send(ws, this.lastGameOver || { t: 'lobby' });
    }
    this.broadcastLobby();
    return p;
  }
  removePlayer(id) {
    const p = this.players.get(id); if (!p) return;
    if (p.alive && this.phase === 'playing') this.dropAll(p);
    if (p.question && p.question.chestId) { const c = this.chests.find((c) => c.id === p.question.chestId); if (c) c.busyBy = null; }
    this.players.delete(id);
    if (this.hostId === id) { const h = this.humans()[0]; this.hostId = h ? h.id : null; }
    if (this.humans().length === 0) { clearInterval(this.timer); this.onEmpty(this.code); return; }
    this.pushEvent({ k: 'info', msg: `${p.name} left.` });
    this.broadcastLobby();
  }
  setBots(n) {
    n = clamp(n | 0, 0, 4);
    const bots = [...this.players.values()].filter((p) => p.isBot);
    while (bots.length > n) { const b = bots.pop(); this.players.delete(b.id); }
    while (bots.length < n) {
      const used = new Set([...this.players.values()].map((p) => p.name));
      const b = this.newPlayer(BOT_NAMES.find((nm) => !used.has(nm)) || 'Bot', true);
      b.bot = { target: null, retarget: 0, openUntil: 0, chest: null, strafe: 1, lastX: 0, lastY: 0, stuck: 0 };
      this.players.set(b.id, b); bots.push(b);
    }
  }

  // ---------- messages ----------
  handle(p, m) {
    switch (m.t) {
      case 'settings': if (p.id === this.hostId && this.phase === 'lobby') {
        if (m.mode === 'dm' || m.mode === 'br') this.settings.mode = m.mode;
        if (['easy', 'normal', 'hard'].includes(m.difficulty)) this.settings.difficulty = m.difficulty;
        if (Number.isInteger(m.bots)) { this.settings.bots = clamp(m.bots, 0, 4); }
        this.broadcastLobby();
      } break;
      case 'start': if (p.id === this.hostId && this.phase === 'lobby') this.startGame(); break;
      case 'skin': if (HATS.includes(m.hat)) p.hat = m.hat; if (PLAYER_COLORS.includes(m.color)) p.color = m.color; this.broadcastLobby(); break;
      case 'lobby': if (p.id === this.hostId && this.phase === 'ended') this.toLobby(); break;
      case 'input': if (m.i) { const i = m.i; p.input = { u: +!!i.u, d: +!!i.d, l: +!!i.l, r: +!!i.r, a: +i.a || 0, s: +!!i.s, mx: clamp(+i.mx || 0, -1, 1), my: clamp(+i.my || 0, -1, 1) }; if (i.rl) this.reload(p); } break;
      case 'slot': if (Number.isInteger(m.i) && m.i >= 0 && m.i < 5 && !p.useItem) p.slot = m.i; break;
      case 'use': this.useConsumable(p); break;
      case 'drop': this.dropSlot(p); break;
      case 'open': this.tryOpenChest(p, m.id); break;
      case 'answer': this.answer(p, m.a); break;
      case 'cancel': this.cancelQuestion(p); break;
      case 'ping': send(p.ws, { t: 'pong', c: m.c }); break;
    }
  }

  // ---------- lobby / rounds ----------
  broadcastLobby() {
    const msg = { t: 'lobby', phase: this.phase, hostId: this.hostId, settings: this.settings, players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, color: p.color, hat: p.hat })) };
    for (const p of this.humans()) send(p.ws, msg);
  }
  toLobby() {
    this.phase = 'lobby'; this.bullets = []; this.drops = []; this.events = []; this.storm = null; this.lastGameOver = null;
    for (const p of this.players.values()) { p.alive = false; p.spectating = false; p.question = null; }
    this.broadcastLobby();
  }
  startGame() {
    this.setBots(this.settings.bots);
    this.obstacles = generateWorld();
    this.chests = [];
    for (let i = 0; i < CHEST_COUNT; i++) { const s = this.freeSpot(60); this.chests.push({ id: uid(), x: s.x, y: s.y, rarity: rollRarity(), state: 'closed', busyBy: null, respawnAt: 0 }); }
    this.bullets = []; this.drops = []; this.events = [];
    this.phase = 'playing'; this.startedAt = now();
    this.endsAt = this.settings.mode === 'dm' ? this.startedAt + DM_DURATION_MS : 0;
    this.storm = this.settings.mode === 'br' ? { x: WORLD / 2, y: WORLD / 2, r: WORLD * 0.78, tx: WORLD / 2, ty: WORLD / 2, tr: WORLD * 0.78, fromR: WORLD * 0.78, fromX: WORLD / 2, fromY: WORLD / 2, shrinkStart: 0, shrinkEnd: 0, nextAt: this.startedAt + 50000, phase: 0 } : null;
    const worldMsg = { t: 'world', size: WORLD, obstacles: this.obstacles, chests: this.chests.map((c) => ({ id: c.id, x: c.x, y: c.y })), mode: this.settings.mode };
    for (const p of this.players.values()) {
      p.kills = 0; p.deaths = 0; p.correct = 0; p.wrong = 0; p.byTopic = {}; p.spectating = false; p.question = null;
      this.spawn(p, true);
      if (!p.isBot) send(p.ws, worldMsg);
    }
    this.broadcastLobby();
  }
  endGame(winner) {
    this.phase = 'ended'; this.endedAt = now();
    for (const p of this.players.values()) p.question = null;
    const board = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, color: p.color, kills: p.kills, deaths: p.deaths, correct: p.correct, wrong: p.wrong, alive: p.alive }))
      .sort((a, b) => (b.kills - a.kills) || (b.correct - a.correct));
    const reports = {}; for (const p of this.humans()) reports[p.id] = p.byTopic;
    this.lastGameOver = { t: 'gameover', winner: winner ? { id: winner.id, name: winner.name } : null, board, reports, hostId: this.hostId };
    for (const p of this.humans()) send(p.ws, this.lastGameOver);
  }

  freeSpot(pad, margin = 80) {
    for (let i = 0; i < 200; i++) {
      const x = rand(margin, WORLD - margin), y = rand(margin, WORLD - margin);
      if (this.storm && dist(x, y, this.storm.x, this.storm.y) > this.storm.r * 0.9) continue;
      if (!pointInObstacle(x, y, this.obstacles, pad)) return { x, y };
    }
    return { x: WORLD / 2, y: WORLD / 2 };
  }
  spawn(p, first = false) {
    // Spawn away from enemies when possible
    let best = null, bestD = -1;
    for (let i = 0; i < 12; i++) {
      const s = this.freeSpot(PLAYER_R + 40, 350);
      let d = Infinity; for (const o of this.players.values()) if (o !== p && o.alive) d = Math.min(d, dist(s.x, s.y, o.x, o.y));
      if (d > bestD) { bestD = d; best = s; }
    }
    p.x = best.x; p.y = best.y; p.hp = 100; p.shield = 0; p.alive = true; p.spectating = false;
    p.inv = [first && this.settings.mode === 'br' ? null : makeWeapon('pistol', 'common'), null, null, null, null];
    p.slot = 0; p.reloadEnd = 0; p.useEnd = 0; p.useItem = null; p.question = null; p.protectUntil = now() + SPAWN_PROTECT_MS;
    if (p.bot) { this.botReleaseChest(p); p.bot.target = null; }
  }

  // ---------- inventory ----------
  giveItem(p, item) {
    if (item.type === 'consumable') {
      const max = CONSUMABLES[item.key].stack;
      for (const it of p.inv) if (it && it.type === 'consumable' && it.key === item.key && it.count < max) { const take = Math.min(max - it.count, item.count); it.count += take; item.count -= take; if (item.count <= 0) return true; }
    }
    const empty = p.inv.indexOf(null);
    if (empty >= 0) { p.inv[empty] = item; if (p.inv[p.slot] === null) p.slot = empty; return true; }
    return false;
  }
  spawnDrop(x, y, item) {
    const a = Math.random() * Math.PI * 2, d = rand(20, 50);
    const pos = { x: clamp(x + Math.cos(a) * d, 30, WORLD - 30), y: clamp(y + Math.sin(a) * d, 30, WORLD - 30) };
    resolveCircle(pos, 12, this.obstacles);
    this.drops.push({ id: uid(), x: pos.x, y: pos.y, item, at: now() });
  }
  dropAll(p) { for (let i = 0; i < 5; i++) if (p.inv[i]) { this.spawnDrop(p.x, p.y, p.inv[i]); p.inv[i] = null; } }
  dropSlot(p) { if (!p.alive || p.useItem) return; const it = p.inv[p.slot]; if (!it) return; p.inv[p.slot] = null; this.spawnDrop(p.x, p.y, it); }

  // ---------- chests & questions ----------
  tierFor(rarity) {
    let t = RARITY_INFO[rarity].tier;
    if (this.settings.difficulty === 'easy') t = Math.max(1, t - 1);
    if (this.settings.difficulty === 'hard') t = Math.min(4, t + 1);
    return t;
  }
  tryOpenChest(p, chestId) {
    if (!p.alive || p.question || this.phase !== 'playing') return;
    const c = this.chests.find((c) => c.id === chestId); if (!c) return;
    if (c.state !== 'closed' || c.busyBy || dist(p.x, p.y, c.x, c.y) > CHEST_RANGE) return;
    const q = maths.generate(this.tierFor(c.rarity), p.name, p.lastTopic);
    p.lastTopic = q.topic;
    c.busyBy = p.id;
    p.question = { kind: 'chest', chestId: c.id, q, deadline: now() + QUESTION_MS };
    send(p.ws, { t: 'question', kind: 'chest', chestId: c.id, rarity: c.rarity, topic: q.topic, text: q.text, hint: q.hint, timeLimit: QUESTION_MS });
  }
  askRespawn(p) {
    const q = maths.generate(this.settings.difficulty === 'hard' ? 2 : 1, p.name, p.lastTopic);
    p.lastTopic = q.topic;
    p.question = { kind: 'respawn', q, deadline: now() + QUESTION_MS * 2 };
    send(p.ws, { t: 'question', kind: 'respawn', rarity: 'common', topic: q.topic, text: q.text, hint: q.hint, timeLimit: QUESTION_MS * 2 });
  }
  recordAnswer(p, q, correct) {
    if (correct) p.correct++; else p.wrong++;
    const t = (p.byTopic[q.topic] ||= { right: 0, wrong: 0 }); if (correct) t.right++; else t.wrong++;
  }
  answer(p, raw) {
    const qs = p.question; if (!qs) return;
    const correct = maths.check(qs.q, raw);
    this.recordAnswer(p, qs.q, correct);
    this.pushEvent({ k: 'answer', name: p.name, color: p.color, correct, topic: qs.q.topic });
    if (qs.kind === 'chest') {
      const c = this.chests.find((c) => c.id === qs.chestId);
      let loot = [];
      if (c) {
        c.busyBy = null;
        if (correct) {
          c.state = 'open'; c.respawnAt = now() + CHEST_RESPAWN_MS;
          loot = makeLoot(c.rarity);
          for (const it of loot) if (!this.giveItem(p, it)) this.spawnDrop(c.x, c.y, it);
        } else { c.lockedUntil = now() + 4000; }
      }
      p.question = null;
      send(p.ws, { t: 'result', kind: 'chest', correct, answer: qs.q.display, loot: loot.map(itemName), topic: qs.q.topic });
    } else {
      send(p.ws, { t: 'result', kind: 'respawn', correct, answer: qs.q.display, topic: qs.q.topic });
      p.question = null;
      if (correct) { this.spawn(p); this.pushEvent({ k: 'info', msg: `${p.name} is back in the game!` }); }
      else setTimeout(() => { if (this.phase === 'playing' && !p.alive && !p.question && this.players.has(p.id)) this.askRespawn(p); }, 2500);
    }
  }
  cancelQuestion(p) {
    const qs = p.question; if (!qs || qs.kind !== 'chest') return;
    const c = this.chests.find((c) => c.id === qs.chestId); if (c) c.busyBy = null;
    p.question = null;
  }

  // ---------- combat ----------
  reload(p) {
    const w = p.inv[p.slot]; if (!p.alive || !w || w.type !== 'weapon' || p.reloadEnd > now() || w.ammo >= WEAPONS[w.key].mag) return;
    p.reloadEnd = now() + WEAPONS[w.key].reload;
  }
  useConsumable(p) {
    const it = p.inv[p.slot]; if (!p.alive || !it || it.type !== 'consumable' || p.useItem || p.question) return;
    const def = CONSUMABLES[it.key];
    if (def.heal && p.hp >= def.maxTo) return; if (def.shield && p.shield >= def.maxTo) return;
    p.useItem = { slot: p.slot, key: it.key }; p.useEnd = now() + def.time;
  }
  shoot(p, t) {
    const w = p.inv[p.slot]; if (!w || w.type !== 'weapon') return;
    const def = WEAPONS[w.key];
    if (t < p.lastShot + def.rate || p.reloadEnd > t) return;
    if (w.ammo <= 0) { this.reload(p); return; }
    w.ammo--; p.lastShot = t;
    this.pushEvent({ k: 'shot', id: p.id, w: w.key });
    for (let i = 0; i < def.pellets; i++) {
      const a = p.angle + (Math.random() - 0.5) * 2 * def.spread;
      this.bullets.push({ x: p.x + Math.cos(p.angle) * (PLAYER_R + 6), y: p.y + Math.sin(p.angle) * (PLAYER_R + 6), vx: Math.cos(a) * def.speed, vy: Math.sin(a) * def.speed, owner: p.id, dmg: Math.round(def.dmg * RARITY_INFO[w.rarity].mult), left: def.range, key: w.key });
    }
    if (w.ammo === 0) this.reload(p);
  }
  damage(victim, amount, attacker, weaponKey) {
    if (!victim.alive || victim.protectUntil > now()) return;
    if (victim.question) amount = Math.ceil(amount / 2); // thinking about a sum? take half damage
    if (victim.shield > 0) { const s = Math.min(victim.shield, amount); victim.shield -= s; amount -= s; }
    victim.hp -= amount;
    if (victim.hp <= 0) this.kill(victim, attacker, weaponKey);
  }
  kill(victim, attacker, weaponKey) {
    victim.hp = 0; victim.alive = false; victim.deaths++; victim.diedAt = now(); victim.useItem = null;
    if (victim.question && victim.question.chestId) { const c = this.chests.find((c) => c.id === victim.question.chestId); if (c) c.busyBy = null; }
    victim.question = null;
    this.botReleaseChest(victim);
    this.dropAll(victim);
    if (attacker && attacker !== victim) attacker.kills++;
    this.pushEvent({ k: 'kill', x: Math.round(victim.x), y: Math.round(victim.y), killer: attacker ? attacker.name : null, killerColor: attacker ? attacker.color : null, victim: victim.name, victimColor: victim.color, weapon: weaponKey ? WEAPONS[weaponKey].name : 'the storm' });
    if (this.settings.mode === 'dm') {
      if (victim.isBot) setTimeout(() => { if (this.phase === 'playing' && this.players.has(victim.id) && !victim.alive) this.spawn(victim); }, 4000);
      else setTimeout(() => { if (this.phase === 'playing' && this.players.has(victim.id) && !victim.alive && !victim.question) this.askRespawn(victim); }, 2000);
    } else {
      victim.spectating = true;
      const alive = [...this.players.values()].filter((p) => p.alive);
      if (alive.length <= 1) setTimeout(() => { if (this.phase === 'playing') this.endGame(alive[0] || null); }, 1500);
    }
  }

  // ---------- bots ----------
  botReleaseChest(b) {
    if (!b.bot || !b.bot.chest) return;
    const c = this.chests.find((c) => c.id === b.bot.chest); if (c && c.busyBy === b.id) c.busyBy = null;
    b.bot.chest = null; b.bot.openUntil = 0;
  }
  botThink(b, t, dt) {
    const st = b.bot; const inp = { u: 0, d: 0, l: 0, r: 0, a: b.angle, s: 0 };
    const weapon = b.inv.find((it) => it && it.type === 'weapon');
    if (weapon && b.inv[b.slot] !== weapon) b.slot = b.inv.indexOf(weapon);
    // heal if hurt and safe-ish
    if (!b.useItem && b.hp < 55) { const idx = b.inv.findIndex((it) => it && it.type === 'consumable' && CONSUMABLES[it.key].heal); if (idx >= 0) { b.slot = idx; this.useConsumable(b); if (b.useItem) return inp; b.slot = b.inv.indexOf(weapon); } }
    if (b.useItem) return inp;
    // storm avoidance
    if (this.storm && dist(b.x, b.y, this.storm.tx, this.storm.ty) > this.storm.tr * 0.85) { st.target = { x: this.storm.tx + (Math.random() - 0.5) * this.storm.tr * 0.6, y: this.storm.ty + (Math.random() - 0.5) * this.storm.tr * 0.6 }; st.retarget = t + 3000; this.botReleaseChest(b); }
    // chest opening (bots "answer" with a delay and 70% success)
    if (st.chest) {
      const c = this.chests.find((c) => c.id === st.chest);
      if (!c || c.state !== 'closed' || (c.busyBy && c.busyBy !== b.id)) { st.chest = null; st.openUntil = 0; }
      else if (dist(b.x, b.y, c.x, c.y) < CHEST_RANGE - 20) {
        if (!st.openUntil) { st.openUntil = t + rand(3500, 6000); c.busyBy = b.id; }
        else if (t >= st.openUntil) {
          c.busyBy = null; st.openUntil = 0; st.chest = null;
          if (Math.random() < 0.7) { c.state = 'open'; c.respawnAt = t + CHEST_RESPAWN_MS; for (const it of makeLoot(c.rarity)) if (!this.giveItem(b, it)) this.spawnDrop(c.x, c.y, it); }
          else c.lockedUntil = t + 4000;
        }
        return inp;
      } else st.target = { x: c.x, y: c.y };
    }
    // find enemy
    let enemy = null, ed = 650;
    for (const o of this.players.values()) if (o !== b && o.alive && o.protectUntil < t) { const d = dist(b.x, b.y, o.x, o.y); if (d < ed && !lineBlocked(b.x, b.y, o.x, o.y, this.obstacles)) { ed = d; enemy = o; } }
    if (enemy && weapon) {
      const aim = Math.atan2(enemy.y - b.y, enemy.x - b.x) + (Math.random() - 0.5) * 0.18;
      inp.a = aim; inp.s = 1;
      const range = WEAPONS[weapon.key].range * 0.6;
      if (st.retarget < t) { st.strafe = Math.random() < 0.5 ? 1 : -1; st.retarget = t + 1200; }
      const side = aim + (Math.PI / 2) * st.strafe;
      let mx = Math.cos(side), my = Math.sin(side);
      if (ed > range) { mx += Math.cos(aim) * 1.5; my += Math.sin(aim) * 1.5; } else if (ed < 160) { mx -= Math.cos(aim) * 1.5; my -= Math.sin(aim) * 1.5; }
      inp.l = +(mx < -0.3); inp.r = +(mx > 0.3); inp.u = +(my < -0.3); inp.d = +(my > 0.3);
      return inp;
    }
    if (!weapon || (b.inv.filter(Boolean).length < 3 && Math.random() < 0.01)) {
      if (!st.chest) { let best = null, bd = 900; for (const c of this.chests) if (c.state === 'closed' && !c.busyBy) { const d = dist(b.x, b.y, c.x, c.y); if (d < bd) { bd = d; best = c; } } if (best) { st.chest = best.id; st.target = { x: best.x, y: best.y }; } }
    }
    if (!st.target || st.retarget < t || dist(b.x, b.y, st.target.x, st.target.y) < 40) {
      if (!st.chest) { const s = this.freeSpot(40); st.target = s; st.retarget = t + rand(3000, 7000); }
    }
    // stuck detection
    if (dist(b.x, b.y, st.lastX, st.lastY) < 2) st.stuck += dt; else st.stuck = 0;
    st.lastX = b.x; st.lastY = b.y;
    if (st.stuck > 0.8) { st.target = this.freeSpot(40); st.retarget = t + 3000; st.stuck = 0; this.botReleaseChest(b); }
    if (st.target) {
      const dx = st.target.x - b.x, dy = st.target.y - b.y;
      inp.l = +(dx < -10); inp.r = +(dx > 10); inp.u = +(dy < -10); inp.d = +(dy > 10);
      inp.a = Math.atan2(dy, dx);
    }
    return inp;
  }

  // ---------- main loop ----------
  pushEvent(e) { e.at = now(); this.events.push(e); }
  tick() {
    const t = now(); const dt = Math.min(0.1, (t - this.last) / 1000); this.last = t;
    if (this.phase !== 'playing') {
      if (this.phase === 'ended' && t - this.endedAt > 45000) this.toLobby();
      return;
    }
    // storm
    const s = this.storm;
    if (s) {
      if (s.shrinkEnd && t < s.shrinkEnd) { const f = clamp((t - s.shrinkStart) / (s.shrinkEnd - s.shrinkStart), 0, 1); s.x = s.fromX + (s.tx - s.fromX) * f; s.y = s.fromY + (s.ty - s.fromY) * f; s.r = s.fromR + (s.tr - s.fromR) * f; }
      else if (s.shrinkEnd && t >= s.shrinkEnd) { s.x = s.tx; s.y = s.ty; s.r = s.tr; s.shrinkEnd = 0; s.nextAt = t + 35000; }
      else if (t >= s.nextAt && s.r > 160) {
        s.phase++; s.fromX = s.x; s.fromY = s.y; s.fromR = s.r; s.tr = Math.max(150, s.r * 0.58);
        const a = Math.random() * Math.PI * 2, d = Math.random() * (s.r - s.tr) * 0.8; s.tx = clamp(s.x + Math.cos(a) * d, 200, WORLD - 200); s.ty = clamp(s.y + Math.sin(a) * d, 200, WORLD - 200);
        s.shrinkStart = t; s.shrinkEnd = t + 22000;
        this.pushEvent({ k: 'info', msg: 'The storm is closing in!' });
      }
    }
    // players
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      if (p.isBot) p.input = this.botThink(p, t, dt);
      const inp = p.input;
      p.angle = inp.a;
      // using consumable
      if (p.useItem) {
        if (t >= p.useEnd) {
          const it = p.inv[p.useItem.slot]; const def = CONSUMABLES[p.useItem.key];
          if (it && it.type === 'consumable' && it.key === p.useItem.key) {
            if (def.heal) p.hp = Math.min(def.maxTo, p.hp + def.heal); if (def.shield) p.shield = Math.min(def.maxTo, p.shield + def.shield);
            it.count--; if (it.count <= 0) p.inv[p.useItem.slot] = null;
          }
          p.useItem = null;
        }
      }
      // movement
      const frozen = !!p.question;
      let mx = inp.r - inp.l, my = inp.d - inp.u;
      if (inp.mx || inp.my) { mx = inp.mx; my = inp.my; }
      if (!frozen && (mx || my)) {
        const len = Math.max(1, Math.hypot(mx, my)); const sp = SPEED * (p.useItem ? 0.45 : 1);
        p.x += (mx / len) * sp * dt; p.y += (my / len) * sp * dt;
        resolveCircle(p, PLAYER_R, this.obstacles);
      }
      // player vs player soft push
      for (const o of this.players.values()) if (o !== p && o.alive) { const d = dist(p.x, p.y, o.x, o.y); if (d < PLAYER_R * 2 && d > 0.01) { const push = (PLAYER_R * 2 - d) / 2; p.x += ((p.x - o.x) / d) * push; p.y += ((p.y - o.y) / d) * push; } }
      // shooting / using
      if (inp.s && !frozen && !p.useItem) { const it = p.inv[p.slot]; if (it && it.type === 'weapon') this.shoot(p, t); else if (it && it.type === 'consumable' && !p.isBot) this.useConsumable(p); }
      // question timeout
      if (p.question && t > p.question.deadline) {
        const qs = p.question; this.recordAnswer(p, qs.q, false);
        if (qs.kind === 'chest') { const c = this.chests.find((c) => c.id === qs.chestId); if (c) { c.busyBy = null; c.lockedUntil = t + 4000; } p.question = null; send(p.ws, { t: 'result', kind: 'chest', correct: false, answer: qs.q.display, loot: [], timeout: true, topic: qs.q.topic }); }
        else { p.question = null; send(p.ws, { t: 'result', kind: 'respawn', correct: false, answer: qs.q.display, timeout: true, topic: qs.q.topic }); setTimeout(() => { if (this.phase === 'playing' && !p.alive && !p.question && this.players.has(p.id)) this.askRespawn(p); }, 2500); }
      }
      // pickups
      for (let i = this.drops.length - 1; i >= 0; i--) {
        const d = this.drops[i]; if (t - d.at < 700) continue;
        if (dist(p.x, p.y, d.x, d.y) < PICKUP_RANGE) { if (this.giveItem(p, d.item)) this.drops.splice(i, 1); }
      }
      // storm damage
      if (s && dist(p.x, p.y, s.x, s.y) > s.r) { p.stormDamageAcc += (1.5 + s.phase * 1.2) * dt; if (p.stormDamageAcc >= 1) { const d = Math.floor(p.stormDamageAcc); p.stormDamageAcc -= d; p.protectUntil = 0; this.damage(p, d, null, null); } }
    }
    // bullets
    const SUB = 3;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i]; let dead = false;
      for (let st = 0; st < SUB && !dead; st++) {
        const sx = b.vx * dt / SUB, sy = b.vy * dt / SUB; b.x += sx; b.y += sy; b.left -= Math.hypot(sx, sy);
        if (b.left <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD || b.y > WORLD || pointInObstacle(b.x, b.y, this.obstacles)) { dead = true; break; }
        for (const p of this.players.values()) {
          if (!p.alive || p.id === b.owner) continue;
          if (dist(b.x, b.y, p.x, p.y) < PLAYER_R + 3) { this.damage(p, b.dmg, this.players.get(b.owner) || null, b.key); this.pushEvent({ k: 'hit', x: b.x, y: b.y, who: b.owner, victim: p.id, dmg: b.dmg }); dead = true; break; }
        }
      }
      if (dead) this.bullets.splice(i, 1);
    }
    // chests respawn
    for (const c of this.chests) if (c.state === 'open' && t >= c.respawnAt) { c.state = 'closed'; c.rarity = rollRarity(); const sp = this.freeSpot(60); c.x = sp.x; c.y = sp.y; c.moved = true; }
    // end of DM timer
    if (this.settings.mode === 'dm' && t >= this.endsAt) { const best = [...this.players.values()].sort((a, b) => (b.kills - a.kills) || (b.correct - a.correct))[0]; this.endGame(best || null); return; }
    this.broadcastState(t);
  }
  broadcastState(t) {
    const players = [...this.players.values()].map((p) => {
      const w = p.inv[p.slot];
      return { id: p.id, n: p.name, c: p.color, h: p.hat, x: Math.round(p.x), y: Math.round(p.y), a: +p.angle.toFixed(2), hp: Math.round(p.hp), sh: Math.round(p.shield), al: p.alive ? 1 : 0, w: w ? w.key : null, wr: w && w.type === 'weapon' ? w.rarity : null, q: p.question ? 1 : 0, u: p.useItem ? 1 : 0, k: p.kills, pr: p.protectUntil > t ? 1 : 0, bot: p.isBot ? 1 : 0, ok: p.correct };
    });
    const chests = this.chests.map((c) => { const row = [c.id, RARITIES.indexOf(c.rarity), c.state === 'open' ? 1 : (c.busyBy ? 2 : ((c.lockedUntil || 0) > t ? 3 : 0))]; if (c.moved) row.push(Math.round(c.x), Math.round(c.y)); return row; });
    const bullets = this.bullets.map((b) => [Math.round(b.x), Math.round(b.y), +Math.atan2(b.vy, b.vx).toFixed(2)]);
    const drops = this.drops.map((d) => ({ id: d.id, x: Math.round(d.x), y: Math.round(d.y), type: d.item.type, key: d.item.key, rarity: d.item.rarity, count: d.item.count }));
    const storm = this.storm ? { x: Math.round(this.storm.x), y: Math.round(this.storm.y), r: Math.round(this.storm.r), tx: Math.round(this.storm.tx), ty: Math.round(this.storm.ty), tr: Math.round(this.storm.tr), shrinking: !!this.storm.shrinkEnd, nextIn: this.storm.shrinkEnd ? 0 : Math.max(0, this.storm.nextAt - t) } : null;
    const alive = [...this.players.values()].filter((p) => p.alive).length;
    const events = this.events; this.events = [];
    const base = { t: 'state', now: t, players, chests, bullets, drops, storm, alive, timeLeft: this.endsAt ? Math.max(0, this.endsAt - t) : null, events };
    for (const p of this.humans()) {
      base.me = { inv: p.inv, slot: p.slot, reloadEnd: p.reloadEnd, useEnd: p.useEnd, useStart: p.useItem ? p.useEnd - CONSUMABLES[p.useItem.key].time : 0, spectating: p.spectating };
      send(p.ws, base);
    }
    for (const c of this.chests) c.moved = false;
  }
}

function send(ws, obj) { if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (e) { /* ignore */ } } }

module.exports = { Game, WORLD, PLAYER_R, send };
