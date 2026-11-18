/* Turns the raw list of sessions and answers into what the dashboard shows.
 * Runs in the browser (window.EduStats) and in the tests (require). Days are in the viewer's own time zone. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EduStats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DAY = 86400000;
  var WEAK_BELOW = 0.7;   // under 70% right on a topic = needs practice
  var STRONG_FROM = 0.9;  // 90% or more = going well
  var MIN_TRIES = 3;      // need a few tries before judging a topic

  function dayStart(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function addDays(t, n) { var d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }
  function weekStart(t) { var d = new Date(dayStart(t)); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); } // Monday
  function dayKey(t) { var d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function sessionMs(s) { return Math.max(0, s.activeMs != null ? s.activeMs : s.end - s.start); }
  // Only first tries are scored. Walking away from a sum, or a second go at the same question, is listed but not counted.
  function counts(a) { return !a.skipped && !a.retry; }

  // range: 'today' | '7' | '30' | 'all'
  function summarise(data, opts) {
    opts = opts || {};
    var now = opts.now || Date.now();
    var range = opts.range || '7';
    var game = opts.game || '';
    var today = dayStart(now);
    var allGames = {}; data.sessions.forEach(function (s) { allGames[s.game] = 1; }); data.answers.forEach(function (a) { allGames[a.game] = 1; });

    var firstAt = now;
    data.sessions.forEach(function (s) { if (s.start < firstAt) firstAt = s.start; });
    data.answers.forEach(function (a) { if (a.at < firstAt) firstAt = a.at; });
    var from = range === 'today' ? today : range === 'all' ? dayStart(firstAt) : addDays(today, -(+range - 1));
    var to = addDays(today, 1);

    var inRange = function (t) { return t >= from && t < to; };
    var answers = data.answers.filter(function (a) { return inRange(a.at) && (!game || a.game === game); });
    var bySession = {};
    answers.forEach(function (a) { (bySession[a.sid] = bySession[a.sid] || []).push(a); });

    // ---- sessions (newest first); empty visits of under a minute are noise, not practice ----
    var sessions = data.sessions.filter(function (s) { return inRange(s.start) && (!game || s.game === game); }).map(function (s) {
      var list = (bySession[s.id] || []).slice().sort(function (x, y) { return x.at - y.at; });
      var marked = list.filter(counts);
      var right = marked.filter(function (a) { return a.ok; }).length;
      return {
        id: s.id, game: s.game, device: s.device || '', start: s.start, end: s.end, ms: sessionMs(s),
        live: !!s.open && now - s.end < 90000,
        answered: marked.length, right: right, wrong: marked.length - right, skipped: list.length - marked.length,
        acc: marked.length ? right / marked.length : null, answers: list,
      };
    }).filter(function (s) { return s.answers.length || s.ms >= 60000 || s.live; })
      .sort(function (x, y) { return y.start - x.start; });

    // ---- totals ----
    var marked = answers.filter(counts);
    var right = marked.filter(function (a) { return a.ok; }).length;
    var timed = marked.filter(function (a) { return a.ms != null && a.ms > 0; });
    var activeMs = sessions.reduce(function (n, s) { return n + s.ms; }, 0);
    var dayset = {};
    sessions.forEach(function (s) { dayset[dayKey(s.start)] = 1; });
    answers.forEach(function (a) { dayset[dayKey(a.at)] = 1; });
    var lastAt = 0;
    data.sessions.forEach(function (s) { if (s.end > lastAt) lastAt = s.end; });
    var spanDays = Math.max(1, Math.round((to - from) / DAY));
    var totals = {
      activeMs: activeMs, answered: marked.length, right: right, wrong: marked.length - right,
      skipped: answers.length - marked.length, acc: marked.length ? right / marked.length : null,
      daysPractised: Object.keys(dayset).length, spanDays: spanDays, sessions: sessions.length, lastAt: lastAt,
      avgMs: timed.length ? timed.reduce(function (n, a) { return n + a.ms; }, 0) / timed.length : null,
    };

    // ---- activity over time: one column per day, or per week when the range is long ----
    var weekly = spanDays > 45;
    var buckets = [], index = {};
    for (var t = weekly ? weekStart(from) : from; t < to; t = addDays(t, weekly ? 7 : 1)) {
      var b = { start: t, end: addDays(t, weekly ? 7 : 1), weekly: weekly, ms: 0, right: 0, wrong: 0 };
      index[t] = b; buckets.push(b);
    }
    var bucketOf = function (time) { return index[weekly ? weekStart(time) : dayStart(time)]; };
    sessions.forEach(function (s) { var bk = bucketOf(s.start); if (bk) bk.ms += s.ms; });
    marked.forEach(function (a) { var bk = bucketOf(a.at); if (bk) { if (a.ok) bk.right++; else bk.wrong++; } });

    // ---- topics ----
    var tmap = {};
    marked.forEach(function (a) {
      var k = a.subject + '|' + a.topic;
      var tp = tmap[k] || (tmap[k] = { key: k, topic: a.topic, subject: a.subject, n: 0, right: 0, wrong: 0, msSum: 0, msN: 0, lastAt: 0, items: [] });
      tp.n++; if (a.ok) tp.right++; else tp.wrong++;
      if (a.ms != null && a.ms > 0) { tp.msSum += a.ms; tp.msN++; }
      if (a.at > tp.lastAt) tp.lastAt = a.at;
      tp.items.push(a);
    });
    var topics = Object.keys(tmap).map(function (k) {
      var tp = tmap[k];
      tp.items.sort(function (x, y) { return y.at - x.at; });
      tp.acc = tp.right / tp.n;
      tp.avgMs = tp.msN ? tp.msSum / tp.msN : null;
      tp.recent = tp.items.slice(0, 5).map(function (a) { return a.ok; }).reverse(); // oldest to newest
      tp.status = (tp.n >= MIN_TRIES && tp.acc < WEAK_BELOW) || (tp.right === 0 && tp.wrong >= 2) ? 'weak'
        : tp.n >= MIN_TRIES && tp.acc >= STRONG_FROM ? 'strong' : tp.n < MIN_TRIES ? 'new' : 'ok';
      delete tp.msSum; delete tp.msN;
      return tp;
    });
    // weakest first; among equals the one with more wrong answers matters more. Topics barely tried go last: one slip is not a weakness.
    var rank = function (tp) { return tp.status === 'new' ? 1 : 0; };
    topics.sort(function (x, y) { return (rank(x) - rank(y)) || (x.acc - y.acc) || (y.wrong - x.wrong) || (y.n - x.n) || x.topic.localeCompare(y.topic); });
    var weak = topics.filter(function (tp) { return tp.status === 'weak'; });
    var strong = topics.filter(function (tp) { return tp.status === 'strong'; }).sort(function (x, y) { return (y.acc - x.acc) || (y.n - x.n); });

    var mistakes = marked.filter(function (a) { return !a.ok; }).sort(function (x, y) { return y.at - x.at; });

    return {
      from: from, to: to, range: range, game: game, games: Object.keys(allGames).sort(),
      totals: totals, buckets: buckets, weekly: weekly, topics: topics, weak: weak, strong: strong,
      sessions: sessions, mistakes: mistakes, hasAnyData: data.sessions.length > 0 || data.answers.length > 0,
    };
  }

  // ---- wording helpers ----
  function duration(ms) {
    if (ms == null) return '–';
    var s = Math.round(ms / 1000);
    if (s < 60) return s + ' sec';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    return h + ' h' + (r ? ' ' + r + ' min' : '');
  }
  function seconds(ms) { if (ms == null) return '–'; var s = ms / 1000; return s < 10 ? (Math.round(s * 10) / 10) + ' s' : s < 90 ? Math.round(s) + ' s' : duration(ms); }
  function percent(x) { return x == null ? '–' : Math.round(x * 100) + '%'; }
  function clock(t) { return new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
  function when(t, now) {
    var d0 = dayStart(now || Date.now()), d = dayStart(t);
    if (d === d0) return 'Today ' + clock(t);
    if (d === addDays(d0, -1)) return 'Yesterday ' + clock(t);
    var o = { weekday: 'short', day: 'numeric', month: 'short' };
    if (new Date(t).getFullYear() !== new Date(d0).getFullYear()) o.year = 'numeric';
    return new Date(t).toLocaleDateString('en-GB', o) + ', ' + clock(t);
  }
  function dayLabel(t) { return new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }

  return { summarise: summarise, duration: duration, seconds: seconds, percent: percent, when: when, clock: clock, dayLabel: dayLabel, dayStart: dayStart, addDays: addDays, sessionMs: sessionMs };
});
