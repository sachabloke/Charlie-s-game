/* Learning tracker for any browser game.
 *
 * Put this in the game's page (use the full address of this file if the game lives on another site):
 *
 *   <script src="/edu-tracker.js" data-child="Charlie" data-game="Charlie's English" data-subject="English"></script>
 *
 * then, each time the child answers a question:
 *
 *   EduTracker.shown();     // optional: call when a question appears, so "time taken" is exact
 *   EduTracker.answer({ topic: 'Times tables', question: '7 × 8 = ?', given: '54', answer: '56', ok: false });
 *
 * Answers are sent straight away. Time spent is counted while the page is open and being used.
 * When the page is closed or hidden, anything left is sent immediately and the session is closed.
 * If the internet is down, answers wait on the device and are sent next time.
 */
(function () {
  'use strict';
  if (window.EduTracker) return;
  var script = document.currentScript;
  var ds = (script && script.dataset) || {};
  var cfg = {
    child: ds.child || '', game: ds.game || document.title || 'Game', subject: ds.subject || 'Maths',
    endpoint: ds.endpoint || (script && script.src ? new URL('/api/track', script.src).href : '/api/track'),
  };
  var QKEY = 'edutrack:queue', SKEY = 'edutrack:session';
  var IDLE_MS = 2 * 60 * 1000;       // no taps or typing for this long = not working
  var NEW_SESSION_MS = 10 * 60 * 1000; // away for longer than this = a new session
  var PING_MS = 20000, MAX_QUEUED = 2000, BATCH = 100;

  var now = function () { return Date.now(); };
  var rid = function () { var s = ''; while (s.length < 14) s += Math.random().toString(36).slice(2); return s.slice(0, 14); };
  var load = function (store, key, d) { try { var v = store.getItem(key); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  var save = function (store, key, v) { try { store.setItem(key, JSON.stringify(v)); } catch (e) { /* storage full or blocked: carry on in memory */ } };
  function device() {
    var u = navigator.userAgent || '';
    if (/iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1)) return 'iPad';
    if (/iPhone/.test(u)) return 'iPhone';
    if (/CrOS/.test(u)) return 'Chromebook';
    if (/Android/.test(u)) return /Mobile/.test(u) ? 'Android phone' : 'Android tablet';
    if (/Windows/.test(u)) return 'Windows PC';
    if (/Macintosh/.test(u)) return 'Mac';
    return 'Computer';
  }

  // queue: { sid: { child, game, device, events: [] } }, kept on the device until the server confirms it has them
  var queue = load(localStorage, QKEY, {});
  var sess = null;          // { sid, activeMs, lastSeen }
  var lastInput = now(), lastTick = now(), lastShown = 0, hiddenAt = 0, sending = false, retryTimer = null, started = false;

  function persist() {
    var total = 0, sid;
    for (sid in queue) total += queue[sid].events.length;
    if (total > MAX_QUEUED) for (sid in queue) { if (!sess || sid !== sess.sid) { delete queue[sid]; break; } }
    save(localStorage, QKEY, queue);
    if (sess) { sess.lastSeen = now(); save(sessionStorage, SKEY, sess); }
  }
  function push(ev) {
    if (!cfg.child || !sess) return;
    var b = queue[sess.sid] || (queue[sess.sid] = { child: cfg.child, game: cfg.game, device: device(), events: [] });
    b.events.push(ev); persist();
  }
  function begin(fresh) {
    var old = fresh ? null : load(sessionStorage, SKEY, null);
    // Reloading the page within a few minutes carries on the same session.
    if (old && old.sid && old.child === cfg.child && old.game === cfg.game && now() - old.lastSeen < NEW_SESSION_MS) sess = old;
    else { sess = { sid: rid(), activeMs: 0, lastSeen: now(), child: cfg.child, game: cfg.game }; push({ t: 'start', at: now() }); }
    lastTick = lastInput = now(); lastShown = now();
  }
  function tick() {
    var t = now(), dt = t - lastTick; lastTick = t;
    if (sess && document.visibilityState === 'visible' && t - lastInput < IDLE_MS && dt > 0 && dt < 60000) sess.activeMs += dt;
  }
  function body(sid, events) {
    var b = queue[sid];
    var o = { v: 1, child: b.child, game: b.game, device: b.device, sid: sid, sent: now(), events: events };
    if (sess && sid === sess.sid) o.activeMs = Math.round(sess.activeMs);
    return JSON.stringify(o);
  }
  function drop(sid, n) { var b = queue[sid]; if (!b) return; b.events.splice(0, n); if (!b.events.length && (!sess || sid !== sess.sid)) delete queue[sid]; persist(); }

  // Normal sending: one request at a time, waits for the server to say "got it".
  function flush() {
    if (sending || !cfg.child) return;
    var sid = null, k;
    for (k in queue) if (queue[k].events.length) { sid = k; break; }
    if (!sid) return;
    var events = queue[sid].events.slice(0, BATCH);
    sending = true;
    fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body(sid, events), keepalive: true, credentials: 'omit' })
      .then(function (r) {
        sending = false;
        if (r.ok || r.status === 400) { drop(sid, events.length); flush(); } // 400 = the server will never accept it, so stop trying
        else retry();
      })
      .catch(function () { sending = false; retry(); });
  }
  function retry() { if (!retryTimer) retryTimer = setTimeout(function () { retryTimer = null; flush(); }, 15000); }

  // Leaving: hand everything to the browser to deliver even though the page is going away.
  // It stays in the queue too and is re-sent next time; the server ignores repeats.
  function leave() {
    if (!sess || !cfg.child) return;
    tick(); hiddenAt = now();
    for (var i = 0; i < listeners.length; i++) { try { listeners[i](); } catch (e) { /* a game's own hook must not stop the send */ } }
    push({ t: 'end', at: now() });
    for (var sid in queue) {
      var ev = queue[sid].events; if (!ev.length) continue;
      var data = body(sid, ev.slice(0, BATCH * 2));
      var sent = false;
      try { sent = navigator.sendBeacon && navigator.sendBeacon(cfg.endpoint, new Blob([data], { type: 'text/plain' })); } catch (e) { sent = false; }
      if (!sent) { try { fetch(cfg.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: data, keepalive: true, credentials: 'omit' }).catch(function () {}); } catch (e) { /* nothing more we can do */ } }
    }
  }
  function back() {
    if (!sess || !cfg.child) return;
    if (hiddenAt && now() - hiddenAt > NEW_SESSION_MS) begin(true); else push({ t: 'ping', at: now() });
    hiddenAt = 0; lastTick = lastInput = now();
    flush();
  }
  var listeners = [];

  function start() {
    if (started || !cfg.child) return; started = true;
    begin(false); flush();
    setInterval(function () {
      tick();
      if (document.visibilityState === 'visible' && now() - lastInput < IDLE_MS) { push({ t: 'ping', at: now() }); flush(); }
    }, PING_MS);
    setInterval(tick, 5000);
    ['pointerdown', 'keydown', 'touchstart', 'input'].forEach(function (n) { window.addEventListener(n, function () { tick(); lastInput = now(); }, { passive: true, capture: true }); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') leave(); else back(); });
    window.addEventListener('pagehide', function () { if (!hiddenAt) leave(); });
    window.addEventListener('online', flush);
  }

  window.EduTracker = {
    // Change who is playing or which game it is (e.g. after the child picks their name).
    init: function (o) {
      o = o || {};
      var changed = (o.child && o.child !== cfg.child) || (o.game && o.game !== cfg.game);
      if (o.child) cfg.child = String(o.child); if (o.game) cfg.game = String(o.game);
      if (o.subject) cfg.subject = String(o.subject); if (o.endpoint) cfg.endpoint = String(o.endpoint);
      if (!started) start(); else if (changed) { push({ t: 'end', at: now() }); begin(true); flush(); }
    },
    // A question has just appeared on screen.
    shown: function () { lastShown = now(); },
    // The child has answered. Fields: topic, question, given, answer, ok, and optionally subject, level, ms, id, timeout, skipped, partial,
    // retry (a second go at the same question: shown on the dashboard but not counted in the score).
    answer: function (a) {
      if (!cfg.child) return;
      if (!started) start();
      a = a || {}; tick(); lastInput = now();
      var t = now();
      push({
        t: 'answer', id: a.id ? String(a.id) : rid(), at: a.at || t,
        subject: a.subject || cfg.subject, topic: a.topic || 'Other', level: a.level || '',
        question: String(a.question == null ? '' : a.question), given: String(a.given == null ? '' : a.given), answer: String(a.answer == null ? '' : a.answer),
        ok: a.ok === true, ms: typeof a.ms === 'number' ? a.ms : Math.min(t - (lastShown || t), 30 * 60 * 1000),
        timeout: a.timeout ? true : undefined, skipped: a.skipped ? true : undefined, partial: a.partial ? true : undefined, retry: a.retry ? true : undefined,
      });
      lastShown = t;
      flush();
    },
    // Run something just before the page's answers are sent on close (e.g. to add half-finished work).
    beforeLeave: function (fn) { if (typeof fn === 'function') listeners.push(fn); },
    flush: flush,
  };
  if (cfg.child) start();
})();
