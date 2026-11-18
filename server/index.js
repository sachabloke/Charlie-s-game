'use strict';
// HTTP + WebSocket server. Serves the game, manages rooms, and collects learning results for the parent dashboard.
const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { Game } = require('./game');
const { createStore } = require('./store');
const { Tracker, routes } = require('./track');

const PORT = process.env.PORT || 3000;
const GAME_NAME = 'Maths Royale';
const TIER_NAMES = { 1: 'Warm-up', 2: 'Year 5', 3: 'Year 5/6', 4: 'Year 6 challenge' };
const IDLE_MS = 2 * 60 * 1000; // no moving, aiming or answering for this long = not playing (tab left open)

// "How long they played" only counts time the child was actually doing something.
function credit(ws) {
  const t = Date.now();
  if (t - ws.lastActive < IDLE_MS) ws.activeMs += t - ws.lastBeat;
  ws.lastBeat = t;
}

const tracker = new Tracker(createStore());
const app = express();
app.set('trust proxy', 1); // the host's front door passes on the visitor's address
app.use('/api', routes(tracker));
app.use(express.static(path.join(__dirname, '..', 'public'), { etag: true, lastModified: true, setHeaders: (res, filePath) => { res.setHeader('Cache-Control', /vendor/.test(filePath) ? 'public, max-age=86400' : 'no-cache'); } }));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const rooms = new Map();

function makeCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do { code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join(''); } while (rooms.has(code));
  return code;
}
function getRoom(code) {
  if (!code) code = makeCode();
  if (!rooms.has(code)) {
    const game = new Game(code, (c) => rooms.delete(c));
    // Every sum a child finishes goes straight to the dashboard (players who are not our children have no eduSid).
    game.onAnswer = (p, a) => { if (p.eduSid) tracker.gameAnswer(p.eduSid, { ...a, subject: 'Maths', level: TIER_NAMES[a.tier] || '' }); };
    rooms.set(code, game);
  }
  return rooms.get(code);
}

wss.on('connection', (ws) => {
  let room = null, player = null;
  ws.isAlive = true; ws.lastActive = ws.lastBeat = Date.now(); ws.activeMs = 0; ws.lastSig = '';
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    let m; try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== 'object') return;
    // The game sends the controls many times a second even when nobody is touching them, so only a change counts as activity.
    if (m.t === 'input' && m.i) { const sig = [m.i.mx, m.i.my, m.i.a, m.i.s].join(); if (sig !== ws.lastSig) { ws.lastSig = sig; ws.lastActive = Date.now(); } }
    else if (m.t !== 'ping') ws.lastActive = Date.now();
    if (m.t === 'join') {
      if (player) return;
      const code = String(m.room || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      if (code && !rooms.has(code)) { ws.send(JSON.stringify({ t: 'error', msg: `No game found with code ${code}. Check the code or start a new game.` })); return; }
      room = getRoom(code);
      player = room.addHuman(ws, String(m.name || 'Player').replace(/[^\w \-!?']/g, '').trim() || 'Player');
      if (!player) room = null;
      else { player.eduSid = tracker.gameSession(player.name, GAME_NAME); ws.eduSid = player.eduSid; ws.lastBeat = Date.now(); ws.activeMs = 0; }
      return;
    }
    if (room && player) room.handle(player, m);
  });
  // The moment a child closes the game, their session is closed off and saved.
  ws.on('close', () => {
    if (!room || !player) return;
    room.removePlayer(player.id);
    if (player.eduSid) { credit(ws); tracker.touch(player.eduSid, undefined, ws.activeMs); tracker.endSession(player.eduSid); }
  });
  ws.on('error', () => {});
});

// Drop dead connections, and keep "how long they played" up to date for everyone still connected.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
    if (ws.eduSid) { credit(ws); tracker.touch(ws.eduSid, undefined, ws.activeMs); }
  }
  tracker.sweep();
}, 15000);

// When the host stops the server (new version, or going to sleep), write everything down first.
let stopping = false;
async function stop() {
  if (stopping) return; stopping = true;
  try { await tracker.shutdown(); } catch (e) { console.error('Could not save on shutdown:', e.message); }
  process.exit(0);
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

tracker.init()
  .catch((e) => { console.error('Could not load saved results (the game still works; new results are saved once the database answers):', e.message); tracker.loadFailed = true; })
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Maths Royale running on http://localhost:${PORT}`);
      console.log(`Parent dashboard: http://localhost:${PORT}/dashboard  (results kept in: ${tracker.store.kind}${tracker.store.durable ? '' : ', NOT permanent'})`);
    });
  });
