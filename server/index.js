'use strict';
// HTTP + WebSocket server. Serves the game and manages rooms.
const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { Game } = require('./game');

const PORT = process.env.PORT || 3000;
const app = express();
app.use(express.static(path.join(__dirname, '..', 'public')));
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
  if (!rooms.has(code)) rooms.set(code, new Game(code, (c) => rooms.delete(c)));
  return rooms.get(code);
}

wss.on('connection', (ws) => {
  let room = null, player = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (data) => {
    let m; try { m = JSON.parse(data); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join') {
      if (player) return;
      const code = String(m.room || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
      if (code && !rooms.has(code)) { ws.send(JSON.stringify({ t: 'error', msg: `No game found with code ${code}. Check the code or start a new game.` })); return; }
      room = getRoom(code);
      player = room.addHuman(ws, String(m.name || 'Player').replace(/[^\w \-!?']/g, '').trim() || 'Player');
      if (!player) room = null;
      return;
    }
    if (room && player) room.handle(player, m);
  });
  ws.on('close', () => { if (room && player) room.removePlayer(player.id); });
  ws.on('error', () => {});
});

// Drop dead connections
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
}, 15000);

server.listen(PORT, () => console.log(`Maths Royale running on http://localhost:${PORT}`));
