/* Parent dashboard: PIN screen, then one child's results at a time. All numbers come from stats.js. */
(function () {
  'use strict';
  var S = window.EduStats;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var RANGES = [['today', 'Today'], ['7', '7 days'], ['30', '30 days'], ['all', 'All time']];
  var LIST_STEP = 15;

  var pick = function (k, d) { try { return localStorage.getItem('dash:' + k) || d; } catch (e) { return d; } };
  var keep = function (k, v) { try { localStorage.setItem('dash:' + k, v); } catch (e) { /* fine */ } };
  var state = {
    child: pick('child', ''), range: pick('range', '7'), game: '',
    data: null, children: [], storage: null, stamp: '', fetchedAt: 0,
    openTopics: {}, openSessions: {}, showSessions: LIST_STEP, showMistakes: 10, showAllTopics: false,
  };

  function api(path, body) {
    var o = body === undefined ? { credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body) };
    return fetch('/api/dashboard/' + path, o).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { j.status = r.status; return j; }); });
  }

  // ---------- PIN screen ----------
  function gate(st, message) {
    $('app').hidden = true; var g = $('gate'); g.hidden = false;
    var setup = !st.pinSet;
    g.innerHTML = '<form id="pinform" autocomplete="off">' +
      '<h1>Learning dashboard</h1>' +
      '<p class="muted">' + (setup ? 'First visit: choose a PIN so only you can see the children\'s results. Use at least ' + st.minPin + ' digits or letters.' : 'Enter your PIN to see the children\'s results.') + '</p>' +
      '<label class="sr" for="pin">PIN</label><input id="pin" type="password" inputmode="text" autocomplete="' + (setup ? 'new-password' : 'current-password') + '" placeholder="PIN" minlength="' + (setup ? st.minPin : 1) + '" maxlength="64" required>' +
      (setup ? '<label class="sr" for="pin2">PIN again</label><input id="pin2" type="password" autocomplete="new-password" placeholder="PIN again" maxlength="64" required>' : '') +
      '<p class="err" id="pinerr" role="alert">' + esc(message || '') + '</p>' +
      '<button class="btn" type="submit">' + (setup ? 'Save PIN and open' : 'Open dashboard') + '</button></form>';
    $('pin').focus();
    $('pinform').addEventListener('submit', function (e) {
      e.preventDefault();
      var pin = $('pin').value;
      if (setup && pin !== $('pin2').value) { $('pinerr').textContent = 'The two PINs do not match.'; return; }
      api(setup ? 'setup' : 'login', { pin: pin }).then(function (r) {
        if (r.ok) boot(); else if (r.status === 409) boot(); else $('pinerr').textContent = r.error || 'Something went wrong. Try again.';
      }).catch(function () { $('pinerr').textContent = 'Could not reach the server. Try again.'; });
    });
  }

  // ---------- loading ----------
  function boot() {
    api('status').then(function (st) {
      if (!st.authed) return gate(st);
      $('gate').hidden = true; $('app').hidden = false;
      state.children = st.children || [];
      if (!state.children.some(function (c) { return c.name === state.child; })) state.child = state.children.length ? state.children[0].name : '';
      renderChrome();
      load(true);
    }).catch(function () { $('gate').hidden = false; $('gate').innerHTML = '<p class="muted">Could not reach the server. Reload the page to try again.</p>'; });
  }
  var loading = false;
  function load(force) {
    if (loading || !state.child) return; loading = true;
    api('data?child=' + encodeURIComponent(state.child)).then(function (d) {
      loading = false;
      if (d.status === 401) return boot();
      if (!d.ok) return;
      state.fetchedAt = Date.now();
      state.children = d.children || state.children; state.storage = d.storage;
      var last = d.answers.length ? d.answers[d.answers.length - 1] : null;
      var stamp = [d.child, d.sessions.length, d.answers.length, last ? last.id + last.at : '', d.sessions.reduce(function (n, s) { return Math.max(n, s.end); }, 0), d.sessions.filter(function (s) { return s.open; }).length].join('|');
      var changed = stamp !== state.stamp; state.stamp = stamp; state.data = d;
      renderChrome();
      if (changed || force) render();
    }).catch(function () { loading = false; $('updated').textContent = 'Could not refresh just now. Will try again shortly.'; });
  }

  // ---------- top bar and filters ----------
  function renderChrome() {
    $('kids').innerHTML = state.children.map(function (c) {
      return '<button type="button" data-child="' + esc(c.name) + '" aria-pressed="' + (c.name === state.child) + '">' + (c.live ? '<span class="dot" title="Playing now"></span>' : '') + esc(c.name) + '</button>';
    }).join('');
    $('ranges').innerHTML = RANGES.map(function (r) { return '<button type="button" data-range="' + r[0] + '" aria-pressed="' + (r[0] === state.range) + '">' + r[1] + '</button>'; }).join('');
    var games = state.data ? S.summarise(state.data, { range: 'all' }).games : [];
    if (state.game && games.indexOf(state.game) < 0) state.game = '';
    var sel = $('game');
    sel.innerHTML = '<option value="">All games</option>' + games.map(function (g) { return '<option value="' + esc(g) + '"' + (g === state.game ? ' selected' : '') + '>' + esc(g) + '</option>'; }).join('');
    sel.hidden = games.length < 2;
    var me = state.children.filter(function (c) { return c.name === state.child; })[0];
    $('live').hidden = !(me && me.live); $('liveText').textContent = state.child + ' is playing now';
    if (state.fetchedAt) $('updated').textContent = 'Updated ' + S.clock(state.fetchedAt) + (me && me.last ? ' · ' + state.child + ' last practised ' + S.when(me.last).replace(/^T/, 't').replace(/^Y/, 'y') : '');
    var n = $('notice');
    if (state.storage && !state.storage.durable) {
      n.hidden = false;
      n.innerHTML = '<b>Results are not being kept permanently yet.</b> They are collected and shown here, but they are wiped whenever the game server restarts. Add a free database to keep them for good (see “Keeping results for good” in the README).';
    } else n.hidden = true;
  }

  // ---------- pieces ----------
  function meter(acc) { return '<div class="meter"><i style="width:' + Math.round((acc || 0) * 100) + '%"></i></div>'; }
  function form(recent) {
    var right = recent.filter(Boolean).length;
    return '<span class="form" role="img" aria-label="Last ' + recent.length + ': ' + right + ' right">' + recent.map(function (ok) { return '<i' + (ok ? '' : ' class="x"') + '></i>'; }).join('') + '</span>';
  }
  function answerRow(a, opts) {
    opts = opts || {};
    var cls = a.skipped || a.uncounted ? 'skip' : a.ok ? 'ok' : 'no';
    var mark = a.skipped ? '–' : a.ok ? '✓' : '✗';
    var said = a.skipped ? 'Walked away without answering'
      : a.timeout ? 'Ran out of time'
      : a.given === '' ? 'Left blank'
      : a.ok ? 'Answered <b>' + esc(a.given) + '</b>'
      : 'Answered <b class="said">' + esc(a.given) + '</b>';
    var bits = [said];
    if (!a.ok && a.answer) bits.push('Correct answer <b>' + esc(a.answer) + '</b>');
    if (a.ms != null && a.ms > 0 && !a.skipped) bits.push(S.seconds(a.ms));
    if (opts.topic) bits.push(esc(a.topic));
    if (a.level && opts.level) bits.push(esc(a.level));
    if (opts.when) bits.push(S.when(a.at));
    if (opts.game) bits.push(esc(a.game));
    if (a.partial) bits.push('test not finished');
    if (a.retry) bits.push('second try, not counted');
    if (a.uncounted) bits.push(esc(a.uncounted) + ', not counted');
    return '<div class="ans ' + cls + '"><span class="mark" aria-hidden="true">' + mark + '</span><span class="q"><span class="sr">' + (a.skipped ? 'Skipped: ' : a.ok ? 'Right: ' : 'Wrong: ') + '</span>' + esc(a.q || '(question not recorded)') + '</span><span class="a">' + bits.join(' · ') + '</span></div>';
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    var steps = [1, 2, 4, 5, 10, 20, 30, 40, 50, 60, 80, 100, 120, 150, 200, 300, 400, 500, 1000, 2000, 5000];
    for (var i = 0; i < steps.length; i++) if (steps[i] >= v) return steps[i];
    return Math.ceil(v / 1000) * 1000;
  }
  function bucketName(b) {
    if (b.weekly) return 'Week of ' + new Date(b.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return S.dayLabel(b.start);
  }
  function xLabels(buckets) {
    var n = buckets.length, every = n <= 8 ? 1 : n <= 16 ? 3 : n <= 31 ? 7 : Math.ceil(n / 5);
    return buckets.map(function (b, i) {
      var show = n <= 8 || ((n - 1 - i) % every === 0);
      var d = new Date(b.start);
      var text = !show ? '' : n <= 8 && !b.weekly ? d.toLocaleDateString('en-GB', { weekday: 'short' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      return '<span>' + text + '</span>';
    }).join('');
  }
  // values: per bucket, an array of { v, cls } drawn bottom-to-top in the order given
  function chart(buckets, parts, max, tickFmt, tips) {
    var top = niceMax(max), lines = '';
    [1, 0.5, 0].forEach(function (f) { lines += '<div class="gridline' + (f === 0 ? ' base' : '') + '" style="bottom:' + f * 100 + '%"><span>' + tickFmt(top * f) + '</span></div>'; });
    var cols = buckets.map(function (b, i) {
      var segs = parts(b).filter(function (p) { return p.v > 0; }).reverse().map(function (p) { return '<i class="' + p.cls + '" style="height:' + (p.v / top) * 100 + '%"></i>'; }).join('');
      return '<div class="col" tabindex="0" data-tip="' + esc(tips(b)) + '" aria-label="' + esc(tips(b).replace(/\n/g, ', ')) + '">' + segs + '</div>';
    }).join('');
    return '<div class="chart"><div class="plot">' + lines + '<div class="cols">' + cols + '</div></div><div class="xaxis' + (buckets.length > 8 ? ' many' : '') + '">' + xLabels(buckets) + '</div></div>';
  }

  // ---------- the page ----------
  function render() {
    var d = state.data; if (!d) return;
    var sum = S.summarise(d, { range: state.range, game: state.game });
    var t = sum.totals, name = esc(d.child), html = '';
    var period = { today: 'today', 7: 'in the last 7 days', 30: 'in the last 30 days', all: 'so far' }[state.range];

    if (!sum.hasAnyData) {
      $('view').innerHTML = '<section class="card"><h2>Nothing from ' + name + ' yet</h2><p class="hint" style="margin:6px 0 0">Results appear here the moment ' + name + ' answers a question in a connected game. In Maths Royale, ' + name + ' needs to type the name “' + name + '” on the start screen.</p></section>';
      return;
    }

    // headline numbers
    var perDay = t.daysPractised ? t.activeMs / t.daysPractised : 0;
    html += '<section class="kpis" aria-label="Summary">' +
      kpi('Time practised', S.duration(t.activeMs), t.sessions ? t.sessions + (t.sessions === 1 ? ' session' : ' sessions') + (state.range !== 'today' && t.daysPractised > 1 ? ' · about ' + S.duration(perDay) + ' a day' : '') : 'No practice ' + period) +
      kpi('Questions answered', String(t.answered), t.answered ? t.right + ' right · ' + t.wrong + ' wrong' + (t.skipped ? ' · ' + t.skipped + ' not counted' : '') : '–') +
      kpi('Right first time', S.percent(t.acc), t.avgMs != null ? 'About ' + S.seconds(t.avgMs) + ' per question' : '–') +
      (state.range === 'today' ? kpi('Topics covered', String(sum.topics.length), sum.weak.length ? sum.weak.length + ' need practice' : 'None flagged')
        : kpi('Days practised', state.range === 'all' ? String(t.daysPractised) : t.daysPractised + ' of ' + t.spanDays, sum.weak.length ? sum.weak.length + (sum.weak.length === 1 ? ' topic needs practice' : ' topics need practice') : 'No weak topics flagged')) +
      '</section>';

    // weaknesses and strengths
    html += '<div class="grid2">' +
      '<section class="card"><h2>Needs practice</h2><p class="hint">Topics with under 70% right after 3 or more tries, weakest first.</p>' +
      (sum.weak.length ? '<div class="tlist">' + sum.weak.slice(0, 6).map(function (tp) {
        var miss = tp.items.filter(function (a) { return !a.ok; })[0];
        return '<div class="titem"><div class="row"><span class="name">' + esc(tp.topic) + '</span><span class="fig">' + tp.right + ' of ' + tp.n + ' right · ' + S.percent(tp.acc) + '</span></div>' + meter(tp.acc) +
          (miss ? '<p class="eg">Latest miss: ' + esc(miss.q) + ' ' + (miss.timeout ? 'Ran out of time.' : miss.given === '' ? 'Left blank.' : 'Answered ' + esc(miss.given) + '.') + (miss.answer ? ' Correct: ' + esc(miss.answer) + '.' : '') + '</p>' : '') + '</div>';
      }).join('') + '</div>' + (sum.weak.length > 6 ? '<p class="empty">and ' + (sum.weak.length - 6) + ' more in the table below.</p>' : '')
        : '<p class="empty">' + (t.answered ? 'Nothing flagged ' + period + '.' : 'No answers ' + period + '.') + '</p>') +
      '</section>' +
      '<section class="card"><h2>Going well</h2><p class="hint">Topics with 90% or more right after 3 or more tries.</p>' +
      (sum.strong.length ? '<div class="tlist">' + sum.strong.slice(0, 6).map(function (tp) {
        return '<div class="titem"><div class="row"><span class="name">' + esc(tp.topic) + '</span><span class="fig">' + tp.right + ' of ' + tp.n + ' right · ' + S.percent(tp.acc) + '</span></div>' + meter(tp.acc) + '</div>';
      }).join('') + '</div>' : '<p class="empty">' + (t.answered ? 'No topic has reached 90% ' + period + ' yet.' : 'No answers ' + period + '.') + '</p>') +
      '</section></div>';

    // activity charts (one day is a single figure, not a chart)
    if (sum.buckets.length > 1) {
      var maxMin = Math.max.apply(null, sum.buckets.map(function (b) { return b.ms / 60000; }));
      var maxAns = Math.max.apply(null, sum.buckets.map(function (b) { return b.right + b.wrong; }));
      var per = sum.weekly ? 'each week' : 'each day';
      html += '<div class="grid2">' +
        '<section class="card"><h2>Time practised ' + per + '</h2><p class="hint">Minutes</p>' +
        chart(sum.buckets, function (b) { return [{ v: b.ms / 60000, cls: '' }]; }, maxMin, function (v) { return String(Math.round(v)); }, function (b) { return bucketName(b) + '\n' + (b.ms ? S.duration(b.ms) + ' practised' : 'No practice'); }) + '</section>' +
        '<section class="card"><h2>Answers ' + per + '</h2><div class="legend"><span><i class="sw" style="background:var(--right)"></i>Right</span><span><i class="sw" style="background:var(--wrong)"></i>Wrong</span></div>' +
        chart(sum.buckets, function (b) { return [{ v: b.right, cls: '' }, { v: b.wrong, cls: 'w' }]; }, maxAns, function (v) { return String(Math.round(v)); }, function (b) { return bucketName(b) + '\n' + (b.right + b.wrong ? b.right + ' right · ' + b.wrong + ' wrong' : 'No answers'); }) + '</section>' +
        '</div>';
    }

    // every topic
    var topics = state.showAllTopics ? sum.topics : sum.topics.slice(0, 12);
    html += '<section class="card"><h2>Every topic</h2><p class="hint">Weakest first; topics tried fewer than 3 times are at the end. Tap a topic to see the questions and what ' + name + ' answered.</p>' +
      (sum.topics.length ? '<div class="tablewrap"><table><thead><tr><th>Topic</th><th class="num">Right</th><th>Score</th><th class="hide-s">Last 5</th><th class="num hide-s">Time each</th><th class="hide-s">Last tried</th></tr></thead>' +
        topics.map(function (tp) {
          var open = !!state.openTopics[tp.key];
          var tag = tp.status === 'weak' ? '<span class="tag weak">Needs practice</span>' : tp.status === 'strong' ? '<span class="tag strong">Going well</span>' : tp.status === 'new' ? '<span class="tag plain">Too few to tell</span>' : '';
          return '<tbody><tr class="main" data-topic="' + esc(tp.key) + '"><td><button class="rowbtn" type="button" aria-expanded="' + open + '"><span class="chev">▶</span><span>' + esc(tp.topic) + '<span class="sub">' + esc(tp.subject) + (tag ? ' ' + tag : '') + '</span></span></button></td>' +
            '<td class="num">' + tp.right + ' of ' + tp.n + '</td><td><div class="acc">' + meter(tp.acc) + '<b>' + S.percent(tp.acc) + '</b></div></td><td class="hide-s">' + form(tp.recent) + '</td>' +
            '<td class="num hide-s">' + S.seconds(tp.avgMs) + '</td><td class="hide-s">' + S.when(tp.lastAt) + '</td></tr>' +
            (open ? '<tr class="detail"><td colspan="6"><div class="answers">' + tp.items.slice(0, 30).map(function (a) { return answerRow(a, { when: true, game: sum.games.length > 1, level: true }); }).join('') + '</div>' + (tp.items.length > 30 ? '<p class="empty">Showing the latest 30 of ' + tp.items.length + '.</p>' : '') + '</td></tr>' : '') + '</tbody>';
        }).join('') + '</table></div>' +
        (sum.topics.length > 12 ? '<div class="more"><button class="btn quiet" type="button" data-act="topics">' + (state.showAllTopics ? 'Show fewer topics' : 'Show all ' + sum.topics.length + ' topics') + '</button></div>' : '')
        : '<p class="empty">No answers ' + period + '.</p>') + '</section>';

    // sessions
    html += '<section class="card"><h2>Sessions</h2><p class="hint">When ' + name + ' played and for how long. Tap one to see every answer.</p>' +
      (sum.sessions.length ? '<div class="tablewrap"><table><thead><tr><th>When</th><th class="num">How long</th><th class="num">Answered</th><th class="num">Right</th><th class="hide-s">Score</th></tr></thead>' +
        sum.sessions.slice(0, state.showSessions).map(function (s) {
          var open = !!state.openSessions[s.id];
          return '<tbody><tr class="main" data-session="' + esc(s.id) + '"><td><button class="rowbtn" type="button" aria-expanded="' + open + '"><span class="chev">▶</span><span>' + S.when(s.start) + (s.live ? ' <span class="tag strong">Playing now</span>' : '') + '<span class="sub">' + esc(s.game) + (s.device ? ' · ' + esc(s.device) : '') + '</span></span></button></td>' +
            '<td class="num">' + S.duration(s.ms) + '</td><td class="num">' + s.answered + '</td><td class="num">' + (s.answered ? s.right : '–') + '</td>' +
            '<td class="hide-s">' + (s.answered ? '<div class="acc">' + meter(s.acc) + '<b>' + S.percent(s.acc) + '</b></div>' : '<span class="muted">No answers</span>') + '</td></tr>' +
            (open ? '<tr class="detail"><td colspan="5">' + (s.answers.length ? '<div class="answers">' + s.answers.map(function (a) { return answerRow(a, { topic: true }); }).join('') + '</div>' : '<p class="empty">No questions answered in this session.</p>') +
              '<p style="margin-top:12px"><button class="linkbtn" type="button" data-del="' + esc(s.id) + '">Delete this session</button></p></td></tr>' : '') + '</tbody>';
        }).join('') + '</table></div>' +
        (sum.sessions.length > state.showSessions ? '<div class="more"><button class="btn quiet" type="button" data-act="sessions">Show more sessions</button></div>' : '')
        : '<p class="empty">No sessions ' + period + '.</p>') + '</section>';

    // recent mistakes
    html += '<section class="card"><h2>Recent mistakes</h2><p class="hint">The latest questions ' + name + ' got wrong, newest first.</p>' +
      (sum.mistakes.length ? '<div class="answers">' + sum.mistakes.slice(0, state.showMistakes).map(function (a) { return answerRow(a, { topic: true, when: true }); }).join('') + '</div>' +
        (sum.mistakes.length > state.showMistakes ? '<div class="more"><button class="btn quiet" type="button" data-act="mistakes">Show more mistakes</button></div>' : '')
        : '<p class="empty">' + (t.answered ? 'No mistakes ' + period + '.' : 'No answers ' + period + '.') + '</p>') + '</section>';

    $('view').innerHTML = html;
  }
  function kpi(label, value, note) { return '<div class="kpi"><div class="label">' + label + '</div><div class="value">' + esc(value) + '</div><div class="note">' + esc(note) + '</div></div>'; }

  // ---------- interaction ----------
  $('kids').addEventListener('click', function (e) {
    var b = e.target.closest('[data-child]'); if (!b || b.dataset.child === state.child) return;
    state.child = b.dataset.child; keep('child', state.child); state.game = ''; state.data = null; state.stamp = '';
    state.openTopics = {}; state.openSessions = {}; state.showSessions = LIST_STEP; state.showMistakes = 10; state.showAllTopics = false;
    renderChrome(); $('view').innerHTML = ''; load(true);
  });
  $('ranges').addEventListener('click', function (e) {
    var b = e.target.closest('[data-range]'); if (!b) return;
    state.range = b.dataset.range; keep('range', state.range); renderChrome(); render();
  });
  $('game').addEventListener('change', function () { state.game = $('game').value; render(); });
  $('lock').addEventListener('click', function () { api('logout', {}).then(boot, boot); });
  $('view').addEventListener('click', function (e) {
    var del = e.target.closest('[data-del]');
    if (del) {
      if (window.confirm('Delete this session and its answers for good?')) api('delete-session', { id: del.dataset.del }).then(function () { state.stamp = ''; load(true); });
      return;
    }
    var act = e.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'topics') state.showAllTopics = !state.showAllTopics;
      if (act.dataset.act === 'sessions') state.showSessions += LIST_STEP;
      if (act.dataset.act === 'mistakes') state.showMistakes += 20;
      return render();
    }
    var row = e.target.closest('tr.main'); if (!row) return;
    if (row.dataset.topic) state.openTopics[row.dataset.topic] = !state.openTopics[row.dataset.topic];
    if (row.dataset.session) state.openSessions[row.dataset.session] = !state.openSessions[row.dataset.session];
    render();
  });

  // chart tooltips (hover, keyboard focus, or tap)
  var tip = $('tip');
  function showTip(el) {
    tip.textContent = el.dataset.tip; tip.hidden = false;
    var r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + 'px';
    tip.style.top = Math.max(8, r.top - h - 8) + 'px';
  }
  document.addEventListener('pointerover', function (e) { var c = e.target.closest && e.target.closest('[data-tip]'); if (c) showTip(c); else tip.hidden = true; });
  document.addEventListener('focusin', function (e) { var c = e.target.closest && e.target.closest('[data-tip]'); if (c) showTip(c); else tip.hidden = true; });
  document.addEventListener('focusout', function () { tip.hidden = true; });
  window.addEventListener('scroll', function () { tip.hidden = true; }, { passive: true });

  // keep it fresh while it is on screen
  setInterval(function () { if (document.visibilityState === 'visible' && !$('app').hidden) load(false); }, 20000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && !$('app').hidden) load(false); });

  boot();
})();
