'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const { Tracker, routes } = require('../server/track');
const { createStore } = require('../server/store');
const { Game } = require('../server/game');
const stats = require('../public/dashboard/stats.js');

const mem = (opts = {}) => new Tracker(createStore({ memory: true }), { children: 'Charlie,Leo', pin: '', ...opts }).init();
const answer = (id, ok, extra = {}) => ({ t: 'answer', id, at: Date.now(), topic: 'Times tables', question: '7 × 8 = ?', given: ok ? '56' : '54', answer: '56', ok, ms: 4000, ...extra });
const batch = (events, extra = {}) => ({ child: 'Charlie', game: 'Test game', sid: 'session-1', sent: Date.now(), events, ...extra });

test('only our children are recorded, however they type their name', async () => {
  const t = await mem();
  assert.equal(t.childFor('charlie'), 'Charlie');
  assert.equal(t.childFor('  LEO!! '), 'Leo');
  assert.equal(t.childFor('Charlie2015'), 'Charlie');
  assert.equal(t.childFor('Bot Alex'), null);
  assert.equal(t.childFor(''), null);
  const out = t.ingest(batch([answer('a', true)], { child: 'Someone Else' }), 'ip');
  assert.deepEqual(out, { ok: true, ignored: true });
  assert.equal(t.answers.size, 0);
  assert.equal(t.sessions.size, 0);
});

test('answers from a browser game are stored once, even when sent twice', async () => {
  const t = await mem();
  const events = [{ t: 'start', at: Date.now() - 60000 }, answer('a', true), answer('b', false)];
  assert.equal(t.ingest(batch(events, { activeMs: 50000 }), 'ip').saved, 2);
  t.ingest(batch([...events, { t: 'end', at: Date.now() }], { activeMs: 55000 }), 'ip'); // the page re-sends on close
  const d = t.dataFor('Charlie');
  assert.equal(d.answers.length, 2);
  assert.equal(d.sessions.length, 1);
  assert.equal(d.sessions[0].open, false);
  assert.equal(d.sessions[0].activeMs, 55000);
  assert.equal(d.answers[1].given, '54');
  assert.equal(t.dataFor('Leo').answers.length, 0);
});

test('a re-sent answer with the same id replaces the earlier copy (half-finished test, then finished)', async () => {
  const t = await mem();
  t.ingest(batch([answer('q1', false, { given: '5', partial: true })]), 'ip');
  t.ingest(batch([answer('q1', true, { given: '56' })]), 'ip');
  const d = t.dataFor('Charlie');
  assert.equal(d.answers.length, 1);
  assert.equal(d.answers[0].ok, true);
  assert.equal(d.answers[0].partial, undefined);
});

test('bad or oversized input is refused or trimmed', async () => {
  const t = await mem();
  assert.equal(t.ingest(null, 'ip').ok, false);
  assert.equal(t.ingest(batch([answer('a', true)], { sid: 'x' }), 'ip').ok, false);
  t.ingest(batch([answer('a', true, { question: 'q'.repeat(5000), given: '<script>alert(1)</script>'.repeat(20), ok: 'yes', ms: 1e12 })]), 'ip');
  const a = t.dataFor('Charlie').answers[0];
  assert.equal(a.q.length, 300);
  assert.equal(a.given.length, 80);
  assert.equal(a.ok, false); // only a real true counts as right
  assert.equal(a.ms, 30 * 60 * 1000);
  // another child cannot write into Charlie's session
  assert.equal(t.ingest(batch([answer('z', true)], { child: 'Leo' }), 'ip').ok, false);
  // one address cannot flood the store
  let refused = false;
  for (let i = 0; i < 20 && !refused; i++) refused = !t.ingest(batch(Array.from({ length: 200 }, (_, k) => answer(`f${i}-${k}`, true)), { sid: 'flood-' + i }), 'flooder').ok;
  assert.ok(refused);
});

test('a wrong clock on the child\'s device does not put answers in the future or far past', async () => {
  const t = await mem();
  const wrong = Date.now() + 5 * 3600 * 1000; // device is 5 hours fast
  t.ingest({ child: 'Leo', game: 'G', sid: 'clock-1', sent: wrong, events: [{ t: 'answer', id: 'a', at: wrong - 60000, topic: 'T', ok: true }] }, 'ip');
  const a = t.dataFor('Leo').answers[0];
  assert.ok(Math.abs(a.at - (Date.now() - 60000)) < 5000);
});

test('Maths Royale reports every finished sum for a child, and nothing for other players or bots', async () => {
  const t = await mem();
  const g = new Game('TEST', () => {});
  g.onAnswer = (p, a) => { if (p.eduSid) t.gameAnswer(p.eduSid, { ...a, subject: 'Maths' }); };
  const sock = () => ({ readyState: 1, send() {} });
  const charlie = g.addHuman(sock(), 'charlie'); charlie.eduSid = t.gameSession(charlie.name, 'Maths Royale');
  const friend = g.addHuman(sock(), 'Sam'); friend.eduSid = t.gameSession(friend.name, 'Maths Royale');
  assert.ok(charlie.eduSid); assert.equal(friend.eduSid, null);
  g.settings.bots = 1; g.startGame();
  for (const p of [charlie, friend]) {
    const c = g.chests.find((c) => c.state === 'closed' && !c.busyBy);
    p.x = c.x; p.y = c.y; g.tryOpenChest(p, c.id);
    assert.ok(p.question);
  }
  const q = charlie.question.q;
  g.answer(charlie, 'definitely wrong'); g.answer(friend, 'nope');
  // a second sum, this time walked away from
  const c2 = g.chests.find((c) => c.state === 'closed' && !c.busyBy && !(c.lockedUntil > Date.now()));
  charlie.x = c2.x; charlie.y = c2.y; g.tryOpenChest(charlie, c2.id); g.cancelQuestion(charlie);
  clearInterval(g.timer);
  const d = t.dataFor('Charlie');
  assert.equal(d.answers.length, 2);
  assert.equal(d.answers[0].topic, q.topic);
  assert.equal(d.answers[0].q, q.text);
  assert.equal(d.answers[0].given, 'definitely wrong');
  assert.equal(d.answers[0].answer, q.display);
  assert.equal(d.answers[0].ok, false);
  assert.equal(d.answers[1].skipped, true);
  t.endSession(charlie.eduSid);
  assert.equal(d.sessions.length, 1);
  assert.equal(t.sessions.get(charlie.eduSid).open, false);
  assert.equal(t.answers.size, 2); // nothing kept for Sam or the bot
});

test('results survive a restart when kept in a file', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edu-'));
  const a = await new Tracker(createStore({ dir, databaseUrl: '' }), { children: 'Charlie', pin: '' }).init();
  a.ingest(batch([answer('a', true), answer('b', false)]), 'ip');
  a.setPin('secret-pin');
  await a.store.close();
  const b = await new Tracker(createStore({ dir, databaseUrl: '' }), { children: 'Charlie', pin: '' }).init();
  assert.equal(b.dataFor('Charlie').answers.length, 2);
  assert.ok(b.checkPin('secret-pin'));
  assert.ok(b.validToken(a.makeToken())); // still logged in after a restart
  assert.ok(b.deleteSession('session-1'));
  await b.store.close();
  const c = await new Tracker(createStore({ dir, databaseUrl: '' }), { children: 'Charlie', pin: '' }).init();
  assert.equal(c.dataFor('Charlie').answers.length, 0);
  assert.equal(c.dataFor('Charlie').sessions.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------- over the web ----------
async function serve(tracker) {
  const app = express(); app.use('/api', routes(tracker));
  const server = http.createServer(app); await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/api`;
  const call = async (p, { body, cookie, method } = {}) => {
    const r = await fetch(base + p, { method: method || (body !== undefined ? 'POST' : 'GET'), headers: { 'Content-Type': 'text/plain', ...(cookie ? { Cookie: cookie } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined });
    return { status: r.status, json: await r.json().catch(() => null), cookie: (r.headers.get('set-cookie') || '').split(';')[0], headers: r.headers };
  };
  return { call, close: () => new Promise((r) => server.close(r)) };
}

test('the dashboard is locked until a PIN is chosen, and only the right PIN opens it', async () => {
  const t = await mem();
  const s = await serve(t);
  try {
    assert.equal((await s.call('/track', { body: batch([answer('a', true), answer('b', false)]) })).json.saved, 2);
    assert.equal((await s.call('/dashboard/data')).status, 401);
    const st = (await s.call('/dashboard/status')).json;
    assert.equal(st.pinSet, false); assert.equal(st.children, undefined);
    assert.equal((await s.call('/dashboard/setup', { body: { pin: '123' } })).status, 400); // too short
    const setup = await s.call('/dashboard/setup', { body: { pin: 'family-pin' } });
    assert.equal(setup.status, 200); assert.match(setup.cookie, /^edu_dash=/);
    assert.equal((await s.call('/dashboard/setup', { body: { pin: 'someone-else' } })).status, 409); // cannot be changed by a stranger
    const data = await s.call('/dashboard/data?child=Charlie', { cookie: setup.cookie });
    assert.equal(data.status, 200); assert.equal(data.json.answers.length, 2);
    assert.equal(data.headers.get('cache-control'), 'no-store');
    assert.equal((await s.call('/dashboard/data', { cookie: 'edu_dash=' + encodeURIComponent('99999999999999.forged') })).status, 401);
    assert.equal((await s.call('/dashboard/login', { body: { pin: 'wrong-pin' } })).status, 401);
    const login = await s.call('/dashboard/login', { body: { pin: 'family-pin' } });
    assert.equal(login.status, 200);
    assert.equal((await s.call('/dashboard/status', { cookie: login.cookie })).json.children.length, 2);
    // guessing is cut off
    let last; for (let i = 0; i < 9; i++) last = await s.call('/dashboard/login', { body: { pin: 'guess-' + i } });
    assert.equal(last.status, 429);
    assert.equal((await s.call('/dashboard/login', { body: { pin: 'family-pin' } })).status, 429);
  } finally { await s.close(); }
});

test('games on other websites are allowed to send answers', async () => {
  const t = await mem();
  const s = await serve(t);
  try {
    const pre = await s.call('/track', { method: 'OPTIONS' });
    assert.equal(pre.status, 204); assert.equal(pre.headers.get('access-control-allow-origin'), '*');
    const r = await s.call('/track', { body: batch([answer('a', true)], { child: 'leo', sid: 'leo-session' }) });
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    assert.equal(t.dataFor('Leo').answers.length, 1);
    assert.equal((await s.call('/track', { body: 'not json' })).status, 400);
  } finally { await s.close(); }
});

// ---------- the sums the dashboard does ----------
test('dashboard figures: time, accuracy, weak and strong topics, days', () => {
  const now = new Date(2026, 10, 18, 18, 0).getTime(), H = 3600000, D = 24 * H;
  const sessions = [
    { id: 's1', child: 'Charlie', game: 'A', start: now - 2 * H, end: now - 2 * H + 20 * 60000, activeMs: 15 * 60000, open: false },
    { id: 's2', child: 'Charlie', game: 'B', start: now - 3 * D, end: now - 3 * D + 10 * 60000, activeMs: null, open: false },
    { id: 's3', child: 'Charlie', game: 'A', start: now - 20 * D, end: now - 20 * D + 5 * 60000, activeMs: null, open: false },
    { id: 's4', child: 'Charlie', game: 'A', start: now - D, end: now - D + 20000, activeMs: 20000, open: false }, // opened and closed, no work
  ];
  let n = 0;
  const ans = (sid, game, at, topic, ok, extra = {}) => ({ id: 'a' + n++, sid, child: 'Charlie', game, at, subject: 'Maths', topic, q: 'q', given: 'g', answer: 'a', ok, ms: 10000, ...extra });
  const answers = [
    ...[true, true, true, true].map((ok, i) => ans('s1', 'A', now - 2 * H + i * 1000, 'Times tables', ok)),
    ...[false, false, true].map((ok, i) => ans('s1', 'A', now - 2 * H + 60000 + i * 1000, 'Ratio', ok)),
    ans('s1', 'A', now - 2 * H + 90000, 'Ratio', false, { skipped: true }),
    ans('s2', 'B', now - 3 * D + 1000, 'Ratio', false),
    ans('s2', 'B', now - 3 * D + 2000, 'Algebra', true),
    ans('s3', 'A', now - 20 * D + 1000, 'Algebra', false),
  ];
  const week = stats.summarise({ sessions, answers }, { range: '7', now });
  assert.equal(week.totals.activeMs, 25 * 60000); // 15 active + 10 by the clock; the empty visit is ignored
  assert.equal(week.totals.answered, 9); assert.equal(week.totals.right, 6); assert.equal(week.totals.skipped, 1);
  assert.equal(week.totals.daysPractised, 2); assert.equal(week.totals.spanDays, 7);
  assert.equal(week.sessions.length, 2); assert.equal(week.sessions[0].id, 's1');
  assert.deepEqual(week.weak.map((t) => t.topic), ['Ratio']);
  assert.equal(week.weak[0].n, 4); assert.equal(week.weak[0].right, 1);
  assert.deepEqual(week.strong.map((t) => t.topic), ['Times tables']);
  assert.equal(week.topics[week.topics.length - 1].topic, 'Algebra'); // one try only: listed last, not judged
  assert.equal(week.buckets.length, 7);
  assert.equal(week.buckets[6].right, 5); assert.equal(week.buckets[6].wrong, 2); assert.equal(Math.round(week.buckets[6].ms / 60000), 15);
  assert.equal(week.mistakes.length, 3);
  assert.deepEqual(week.games, ['A', 'B']);
  const onlyB = stats.summarise({ sessions, answers }, { range: '7', now, game: 'B' });
  assert.equal(onlyB.totals.answered, 2); assert.equal(onlyB.sessions.length, 1);
  const today = stats.summarise({ sessions, answers }, { range: 'today', now });
  assert.equal(today.totals.answered, 7); assert.equal(today.buckets.length, 1);
  const all = stats.summarise({ sessions, answers }, { range: 'all', now });
  assert.equal(all.totals.answered, 10); assert.equal(all.buckets.length, 21);
  assert.equal(stats.duration(25 * 60000), '25 min'); assert.equal(stats.duration(95 * 60000), '1 h 35 min'); assert.equal(stats.duration(40000), '40 sec');
});
