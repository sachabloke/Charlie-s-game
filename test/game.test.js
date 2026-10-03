'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Game } = require('../server/game');

function fakeWs() { const ws = { readyState: 1, sent: [] }; ws.send = (s) => ws.sent.push(JSON.parse(s)); ws.last = (t) => [...ws.sent].reverse().find((m) => m.t === t); return ws; }

test('a full match with bots runs without errors and chests give loot for correct sums', () => {
  const g = new Game('TEST', () => {});
  clearInterval(g.timer); // drive ticks by hand
  const ws1 = fakeWs(), ws2 = fakeWs();
  const p1 = g.addHuman(ws1, 'Charlie'); const p2 = g.addHuman(ws2, 'Friend');
  assert.strictEqual(g.hostId, p1.id);
  g.handle(p2, { t: 'start' }); assert.strictEqual(g.phase, 'lobby', 'only host can start');
  g.handle(p1, { t: 'settings', mode: 'dm', bots: 3, difficulty: 'normal' });
  g.handle(p1, { t: 'start' });
  assert.strictEqual(g.phase, 'playing');
  assert.strictEqual([...g.players.values()].filter((p) => p.isBot).length, 3);
  assert.ok(ws1.last('world').chests.length > 30);

  // Walk p1 onto a chest and open it
  const chest = g.chests[0]; p1.x = chest.x + 30; p1.y = chest.y;
  g.handle(p1, { t: 'open', id: chest.id });
  const qmsg = ws1.last('question'); assert.ok(qmsg, 'question was sent'); assert.strictEqual(qmsg.kind, 'chest');
  assert.strictEqual(chest.busyBy, p1.id);
  // p2 cannot open the same chest while busy
  p2.x = chest.x - 30; p2.y = chest.y; g.handle(p2, { t: 'open', id: chest.id }); assert.ok(!ws2.last('question'));
  // wrong answer locks it, right answer gives loot
  g.handle(p1, { t: 'answer', a: 'banana' });
  let res = ws1.last('result'); assert.strictEqual(res.correct, false); assert.ok(res.answer);
  assert.strictEqual(chest.state, 'closed'); assert.strictEqual(p1.wrong, 1);
  chest.lockedUntil = 0;
  g.handle(p1, { t: 'open', id: chest.id });
  g.handle(p1, { t: 'answer', a: p1.question.q.display });
  res = ws1.last('result'); assert.strictEqual(res.correct, true); assert.ok(res.loot.length >= 2);
  assert.strictEqual(chest.state, 'open'); assert.strictEqual(p1.correct, 1);
  assert.ok(p1.inv.filter(Boolean).length >= 2, 'items added to inventory');

  // Shooting: aim p1 at p2 point blank and fire
  p2.x = p1.x + 100; p2.y = p1.y; p2.protectUntil = 0; p1.protectUntil = 0;
  p1.slot = p1.inv.findIndex((it) => it && it.type === 'weapon');
  const hpBefore = p2.hp;
  for (let i = 0; i < 40; i++) { g.last = Date.now() - 50; p1.input = { u: 0, d: 0, l: 0, r: 0, a: 0, s: 1 }; g.tick(); }
  assert.ok(p2.hp < hpBefore || !p2.alive, 'p2 took damage');

  // Run the simulation for a while with bots fighting
  for (let i = 0; i < 1200; i++) { g.last = Date.now() - 50; g.tick(); }
  assert.strictEqual(g.phase, 'playing');
  assert.ok(ws1.last('state').players.length === 5);

  // Respawn flow when p2 dies
  if (p2.alive) g.kill(p2, p1, 'pistol');
  assert.strictEqual(p2.alive, false);
  g.askRespawn(p2);
  assert.strictEqual(ws2.last('question').kind, 'respawn');
  g.handle(p2, { t: 'answer', a: p2.question.q.display });
  assert.strictEqual(p2.alive, true, 'respawned after a correct sum');

  // Leaving
  g.removePlayer(p1.id); assert.strictEqual(g.hostId, p2.id);
  g.removePlayer(p2.id);
});

test('battle royale ends when one player is left and storm shrinks', () => {
  const g = new Game('BR', () => {}); clearInterval(g.timer);
  const ws1 = fakeWs(); const p1 = g.addHuman(ws1, 'Solo');
  g.handle(p1, { t: 'settings', mode: 'br', bots: 1 });
  g.handle(p1, { t: 'start' });
  assert.ok(g.storm); assert.strictEqual(p1.inv[0], null, 'no starting gun in battle royale');
  const bot = [...g.players.values()].find((p) => p.isBot);
  // fast-forward the storm
  g.storm.nextAt = Date.now() - 1; g.last = Date.now() - 50; g.tick();
  assert.ok(g.storm.shrinkEnd > 0, 'storm started shrinking');
  // kill the bot -> game ends
  g.kill(bot, p1, 'rifle');
  return new Promise((resolve) => setTimeout(() => { assert.strictEqual(g.phase, 'ended'); assert.strictEqual(ws1.last('gameover').winner.name, 'Solo'); resolve(); }, 1700));
});
