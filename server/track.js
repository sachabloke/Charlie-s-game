'use strict';
// Learning tracker: collects every answer the children give in any connected game,
// and serves it to the parent dashboard (behind a PIN).
//
// Two ways in:
//  - games that run on this server (Maths Royale) call tracker.gameSession / gameAnswer directly
//  - browser games (English, Maths Check, anything hosted elsewhere) post to /api/track
//    through public/edu-tracker.js
const crypto = require('crypto');
const express = require('express');

const DAY = 24 * 60 * 60 * 1000;
const MAX_ANSWERS = 200000;       // stop accepting new answers past this, so nobody can fill the database
const MAX_SESSIONS = 50000;
const MAX_EVENTS_PER_POST = 200;
const RATE_WINDOW = 10 * 60 * 1000;
const RATE_EVENTS = 1500;         // answers/pings one address may send per window
const LOGIN_WINDOW = 15 * 60 * 1000;
const LOGIN_TRIES = 8;            // wrong PINs per address per window
const LOGIN_TRIES_ALL = 40;       // wrong PINs from everyone per window
const TOKEN_DAYS = 30;
const MIN_PIN = 6;

const letters = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim().slice(0, max);
const newId = () => crypto.randomBytes(9).toString('base64url');

class Tracker {
  constructor(store, opts = {}) {
    this.store = store;
    this.now = opts.now || (() => Date.now());
    const names = (opts.children || process.env.CHILDREN || 'Charlie,Leo').split(',').map((s) => clean(s, 20)).filter((s) => letters(s));
    this.children = [...new Set(names)];
    this.envPin = opts.pin !== undefined ? opts.pin : (process.env.DASHBOARD_PIN || '');
    this.sessions = new Map(); this.answers = new Map(); this.settings = {};
    this.rate = new Map(); this.fails = new Map(); this.failsAll = [];
    this.secret = crypto.randomBytes(32).toString('hex');
    this.loadFailed = false;
  }
  async init() {
    const data = await this.store.load();
    for (const s of data.sessions) if (s && s.id) this.sessions.set(s.id, s);
    for (const a of data.answers) if (a && a.id) this.answers.set(a.id, a);
    this.settings = data.settings || {};
    if (this.settings.secret) this.secret = this.settings.secret; else this.setSetting('secret', this.secret);
    return this;
  }
  setSetting(k, v) { this.settings[k] = v; this.store.saveSetting(k, v); }

  // ---------- who is playing ----------
  // "charlie", "Charlie!", "CharlieTheGreat" all count as Charlie. Anyone else is not recorded at all.
  childFor(name) {
    const n = letters(name); if (!n) return null;
    const sorted = [...this.children].sort((a, b) => letters(b).length - letters(a).length);
    return sorted.find((c) => n === letters(c)) || sorted.find((c) => n.startsWith(letters(c))) || null;
  }

  // ---------- sessions ----------
  openSession({ id, child, game, at, device, source }) {
    if (this.sessions.size >= MAX_SESSIONS) return null;
    const t = at || this.now();
    const s = { id: id || newId(), child, game: clean(game, 40) || 'Game', start: t, end: t, activeMs: null, open: true, source: source || 'web' };
    if (device) s.device = clean(device, 30);
    this.sessions.set(s.id, s); this.store.saveSession(s);
    return s;
  }
  touch(sid, at, activeMs) {
    const s = this.sessions.get(sid); if (!s) return null;
    const t = at || this.now();
    if (t > s.end) s.end = t;
    if (Number.isFinite(activeMs)) s.activeMs = Math.max(s.activeMs || 0, Math.min(Math.round(activeMs), s.end - s.start + 60000));
    s.open = true;
    this.store.saveSession(s);
    return s;
  }
  endSession(sid, at) {
    const s = this.touch(sid, at); if (!s) return;
    s.open = false; this.store.saveSession(s);
  }
  saveAnswer(s, a) {
    if (!this.answers.has(a.id) && this.answers.size >= MAX_ANSWERS) return false;
    this.answers.set(a.id, a); this.store.saveAnswer(a);
    if (a.at > s.end) { s.end = a.at; this.store.saveSession(s); }
    return true;
  }

  // ---------- games that run on this server ----------
  gameSession(playerName, game) {
    const child = this.childFor(playerName); if (!child) return null;
    const s = this.openSession({ child, game, source: 'server' });
    return s ? s.id : null;
  }
  gameAnswer(sid, f) {
    const s = this.sessions.get(sid); if (!s) return;
    const at = this.now();
    this.saveAnswer(s, {
      id: newId(), sid, child: s.child, game: s.game, at,
      subject: clean(f.subject, 20) || 'Maths', topic: clean(f.topic, 60) || 'Other', level: clean(f.level, 20),
      q: clean(f.question, 300), given: clean(f.given, 80), answer: clean(f.answer, 120),
      ok: !!f.ok, ms: Number.isFinite(f.ms) ? Math.max(0, Math.round(f.ms)) : null,
      ...(f.timeout ? { timeout: true } : {}), ...(f.skipped ? { skipped: true } : {}), ...(f.retry ? { retry: true } : {}),
    });
    this.touch(sid, at);
  }

  // ---------- browser games ----------
  allow(ip, n) {
    const t = this.now(); let r = this.rate.get(ip);
    if (!r || t - r.t > RATE_WINDOW) { r = { t, n: 0 }; this.rate.set(ip, r); }
    if (r.n + n > RATE_EVENTS) return false;
    r.n += n; return true;
  }
  ingest(body, ip) {
    if (!body || typeof body !== 'object' || !Array.isArray(body.events)) return { ok: false, error: 'bad request' };
    const child = this.childFor(body.child);
    if (!child) return { ok: true, ignored: true }; // not one of our children: keep nothing
    const sid = String(body.sid || '');
    if (!/^[\w-]{6,40}$/.test(sid)) return { ok: false, error: 'bad session' };
    const events = body.events.slice(0, MAX_EVENTS_PER_POST);
    if (!this.allow(ip || '?', events.length + 1)) return { ok: false, error: 'slow down', retry: true };
    const now = this.now();
    // The child's device clock may be wrong: shift its times by the difference between its "now" and ours.
    const skew = Number.isFinite(body.sent) ? now - body.sent : 0;
    const fix = (t) => { const v = Number.isFinite(t) ? t + skew : now; return Math.min(now, Math.max(now - 60 * DAY, Math.round(v))); };

    let s = this.sessions.get(sid);
    if (s && s.child !== child) return { ok: false, error: 'bad session' };
    if (!s) {
      const first = events.reduce((m, e) => Math.min(m, fix(e && e.at)), now);
      s = this.openSession({ id: sid, child, game: body.game, at: first, device: body.device });
      if (!s) return { ok: false, error: 'full' };
    }
    let saved = 0, ended = false, last = s.end;
    for (const e of events) {
      if (!e || typeof e !== 'object') continue;
      const at = fix(e.at); if (at > last) last = at;
      if (e.t === 'end') ended = true;
      else if (e.t === 'answer') {
        ended = false;
        const key = /^[\w-]{1,60}$/.test(String(e.id || '')) ? String(e.id) : newId();
        const a = {
          id: sid + ':' + key, sid, child, game: s.game, at,
          subject: clean(e.subject, 20) || 'Maths', topic: clean(e.topic, 60) || 'Other', level: clean(e.level, 20),
          q: clean(e.question, 300), given: clean(e.given, 80), answer: clean(e.answer, 120),
          ok: e.ok === true, ms: Number.isFinite(e.ms) ? Math.min(30 * 60 * 1000, Math.max(0, Math.round(e.ms))) : null,
          ...(e.timeout ? { timeout: true } : {}), ...(e.skipped ? { skipped: true } : {}), ...(e.partial ? { partial: true } : {}), ...(e.retry ? { retry: true } : {}), ...(clean(e.uncounted, 30) ? { uncounted: clean(e.uncounted, 30) } : {}),
        };
        if (this.saveAnswer(s, a)) saved++;
      } else if (e.t === 'start' || e.t === 'ping') ended = false;
    }
    this.touch(sid, last, Number.isFinite(body.activeMs) ? body.activeMs : undefined);
    if (ended) { s.open = false; this.store.saveSession(s); }
    return { ok: true, saved };
  }

  // ---------- reading for the dashboard ----------
  dataFor(child) {
    const sessions = [...this.sessions.values()].filter((s) => s.child === child).sort((a, b) => a.start - b.start);
    const answers = [...this.answers.values()].filter((a) => a.child === child).sort((a, b) => a.at - b.at);
    return { child, now: this.now(), sessions, answers };
  }
  overview() {
    const now = this.now();
    return this.children.map((c) => {
      let last = 0, live = false;
      for (const s of this.sessions.values()) if (s.child === c) { if (s.end > last) last = s.end; if (s.open && now - s.end < 90000) live = true; }
      return { name: c, last, live };
    });
  }
  deleteSession(id) {
    const s = this.sessions.get(id); if (!s) return false;
    const ids = [...this.answers.values()].filter((a) => a.sid === id).map((a) => a.id);
    for (const a of ids) this.answers.delete(a);
    this.sessions.delete(id);
    this.store.deleteSession(id, ids);
    return true;
  }
  // Called when the server is told to stop: close anything still open and write everything down.
  async shutdown() {
    for (const s of this.sessions.values()) if (s.open && s.source === 'server') { s.open = false; this.store.saveSession(s); }
    await this.store.flush();
  }

  // ---------- the parent PIN ----------
  pinIsSet() { return !!this.envPin || !!this.settings.pin; }
  hashPin(pin, salt) { return crypto.scryptSync(String(pin), salt, 32).toString('hex'); }
  setPin(pin) {
    const salt = crypto.randomBytes(16).toString('hex');
    this.setSetting('pin', { salt, hash: this.hashPin(pin, salt) });
  }
  checkPin(pin) {
    pin = String(pin || '');
    const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
    if (this.envPin) return same(this.hashPin(pin, 'env'), this.hashPin(this.envPin, 'env'));
    const p = this.settings.pin; if (!p) return false;
    return same(this.hashPin(pin, p.salt), p.hash);
  }
  pinVersion() { return this.envPin ? crypto.createHash('sha256').update('env:' + this.envPin).digest('hex').slice(0, 12) : (this.settings.pin ? this.settings.pin.hash.slice(0, 12) : 'none'); }
  sign(exp) { return crypto.createHmac('sha256', this.secret).update(`dash.${exp}.${this.pinVersion()}`).digest('base64url'); }
  makeToken() { const exp = this.now() + TOKEN_DAYS * DAY; return `${exp}.${this.sign(exp)}`; }
  validToken(tok) {
    const m = /^(\d+)\.([\w-]+)$/.exec(String(tok || '')); if (!m || !this.pinIsSet()) return false;
    const exp = +m[1]; if (exp < this.now()) return false;
    const a = Buffer.from(m[2]), b = Buffer.from(this.sign(exp));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  loginBlocked(ip) {
    const t = this.now();
    this.failsAll = this.failsAll.filter((x) => t - x < LOGIN_WINDOW);
    const mine = (this.fails.get(ip) || []).filter((x) => t - x < LOGIN_WINDOW); this.fails.set(ip, mine);
    return mine.length >= LOGIN_TRIES || this.failsAll.length >= LOGIN_TRIES_ALL;
  }
  loginFailed(ip) { const t = this.now(); this.failsAll.push(t); this.fails.set(ip, [...(this.fails.get(ip) || []), t]); }
  // Forget old rate-limit entries now and then.
  sweep() {
    const t = this.now();
    for (const [k, r] of this.rate) if (t - r.t > RATE_WINDOW) this.rate.delete(k);
    for (const [k, v] of this.fails) if (!v.some((x) => t - x < LOGIN_WINDOW)) this.fails.delete(k);
  }
}

// ---------- web routes ----------
function parseBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try { return JSON.parse(String(req.body || '')); } catch (e) { return null; }
}
function cookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim()); }
  return '';
}

function routes(tracker) {
  const r = express.Router();
  const text = express.text({ type: () => true, limit: '256kb' });
  const COOKIE = 'edu_dash';
  const setCookie = (req, res, value, maxAgeSec) => {
    const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`);
  };
  const authed = (req) => tracker.validToken(cookie(req, COOKIE));
  const needAuth = (req, res, next) => { if (!authed(req)) return res.status(401).json({ ok: false, error: 'Please enter the PIN.' }); next(); };
  r.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  // Games send answers here. Open to any site so games hosted elsewhere can report too.
  r.options('/track', (req, res) => {
    res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' }).status(204).end();
  });
  r.post('/track', text, (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    const out = tracker.ingest(parseBody(req), req.ip);
    res.status(out.ok ? 200 : out.retry ? 429 : 400).json(out);
  });
  // Lets a game check that a name is one we record (so it can say "Hi Charlie, your grown-up can see your progress").
  r.get('/track/who', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.json({ child: tracker.childFor(req.query.name) });
  });

  r.get('/dashboard/status', (req, res) => {
    const ok = authed(req);
    res.json({
      pinSet: tracker.pinIsSet(), authed: ok, minPin: MIN_PIN,
      ...(ok ? { children: tracker.overview(), storage: { kind: tracker.store.kind, durable: tracker.store.durable } } : {}),
    });
  });
  r.post('/dashboard/setup', text, (req, res) => {
    if (tracker.pinIsSet()) return res.status(409).json({ ok: false, error: 'A PIN has already been set.' });
    // If saved settings could not be read at start-up, a PIN may already exist: do not let anyone set a new one.
    if (tracker.loadFailed) return res.status(503).json({ ok: false, error: 'The results database is not answering. Try again in a few minutes.' });
    const pin = String((parseBody(req) || {}).pin || '');
    if (pin.length < MIN_PIN || pin.length > 64) return res.status(400).json({ ok: false, error: `Choose a PIN of at least ${MIN_PIN} digits or letters.` });
    tracker.setPin(pin);
    setCookie(req, res, tracker.makeToken(), TOKEN_DAYS * 86400);
    res.json({ ok: true });
  });
  r.post('/dashboard/login', text, (req, res) => {
    if (tracker.loginBlocked(req.ip)) return res.status(429).json({ ok: false, error: 'Too many wrong tries. Wait 15 minutes and try again.' });
    if (!tracker.checkPin((parseBody(req) || {}).pin)) { tracker.loginFailed(req.ip); return res.status(401).json({ ok: false, error: 'That PIN is not right.' }); }
    setCookie(req, res, tracker.makeToken(), TOKEN_DAYS * 86400);
    res.json({ ok: true });
  });
  r.post('/dashboard/logout', (req, res) => { setCookie(req, res, '', 0); res.json({ ok: true }); });
  r.get('/dashboard/data', needAuth, (req, res) => {
    const child = tracker.children.find((c) => c === req.query.child) || tracker.children[0];
    res.json({ ok: true, ...tracker.dataFor(child), children: tracker.overview(), storage: { kind: tracker.store.kind, durable: tracker.store.durable } });
  });
  r.post('/dashboard/delete-session', needAuth, text, (req, res) => {
    res.json({ ok: tracker.deleteSession(String((parseBody(req) || {}).id || '')) });
  });
  return r;
}

module.exports = { Tracker, routes, MIN_PIN };
