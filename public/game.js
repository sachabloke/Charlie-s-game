'use strict';
// Maths Royale client: networking, input, rendering and HUD.
(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game'); const ctx = canvas.getContext('2d');
  const mini = $('minimap'); const mctx = mini.getContext('2d');
  const RARITY = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  const RCOLOR = { common: '#b8bcc4', uncommon: '#4cd137', rare: '#3b9dff', epic: '#b15cff', legendary: '#ffb400' };
  const RLABEL = { common: 'COMMON', uncommon: 'UNCOMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY' };
  const WNAME = { pistol: 'Pistol', smg: 'SMG', shotgun: 'Shotgun', rifle: 'Assault Rifle', sniper: 'Sniper' };
  const WMAG = { pistol: 12, smg: 30, shotgun: 5, rifle: 25, sniper: 3 };
  const CNAME = { bandage: 'Bandage', medkit: 'Medkit', minishield: 'Mini Shield', shieldpotion: 'Shield Potion' };
  const CICON = { bandage: '🩹', medkit: '🧰', minishield: '🧪', shieldpotion: '🛡️' };
  const WICON = { pistol: '🔫', smg: '🔫', shotgun: '🔫', rifle: '🔫', sniper: '🎯' };
  const PLAYER_R = 20, CHEST_RANGE = 85;

  // ---------- state ----------
  let ws = null, myId = null, room = null, hostId = null, phase = 'join';
  let world = null; // {size, obstacles, chests: Map}
  let S = null; // latest server state
  const view = new Map(); // smoothed positions
  let mouse = { x: 0, y: 0 }, keys = {}, shooting = false, reloadPulse = false;
  let question = null, qTimerStart = 0, qTimerLen = 0, resultTimeout = null;
  let particles = [], feedItems = [], shake = 0, myHpLast = 100, lastSlot = -1;
  let cam = { x: 1600, y: 1600 }, zoom = 1;

  // ---------- sound ----------
  let actx = null;
  function sfx(type) {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      const t = actx.currentTime; const g = actx.createGain(); g.connect(actx.destination);
      const tone = (f, dur, delay = 0, kind = 'square', vol = 0.08) => { const o = actx.createOscillator(); o.type = kind; o.frequency.setValueAtTime(f, t + delay); o.connect(g); o.start(t + delay); o.stop(t + delay + dur); };
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
    ws.onclose = () => { if (phase !== 'join') { showScreen('join'); $('joinErr').textContent = 'Disconnected from the server. Press PLAY to rejoin.'; phase = 'join'; } $('joinBtn').disabled = false; };
    ws.onerror = () => { $('joinErr').textContent = 'Could not reach the server.'; $('joinBtn').disabled = false; };
  }
  const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };

  function handle(m) {
    switch (m.t) {
      case 'error': $('joinErr').textContent = m.msg; $('joinBtn').disabled = false; if (phase === 'join') { try { ws.close(); } catch (e) {} } break;
      case 'joined': myId = m.id; room = m.room; $('roomCode').textContent = room; break;
      case 'lobby': hostId = m.hostId; renderLobby(m); if (m.phase === 'lobby') { phase = 'lobby'; showScreen('lobby'); hideQuestion(); $('gameover').classList.add('hidden'); } break;
      case 'world': world = { size: m.size, obstacles: m.obstacles, chests: new Map(m.chests.map((c) => [c.id, { x: c.x, y: c.y }])), mode: m.mode }; view.clear(); particles = []; feedItems = []; phase = 'playing'; showScreen('game'); hideQuestion(); $('gameover').classList.add('hidden'); if (document.activeElement) document.activeElement.blur(); canvas.focus(); window.focus(); toast(m.mode === 'br' ? 'Find a chest and answer the sum to get a gun!' : 'Fight! Open chests for better guns.', 3500); break;
      case 'state': onState(m); break;
      case 'question': showQuestion(m); break;
      case 'result': onResult(m); break;
      case 'gameover': phase = 'ended'; showGameOver(m); break;
    }
  }

  function onState(m) {
    S = m;
    for (const p of m.players) {
      let v = view.get(p.id);
      if (!v) { v = { x: p.x, y: p.y, a: p.a }; view.set(p.id, v); }
      if (Math.hypot(v.x - p.x, v.y - p.y) > 300) { v.x = p.x; v.y = p.y; }
    }
    for (const c of m.chests) if (c.length > 4 && world) world.chests.set(c[0], { x: c[3], y: c[4] });
    const me = m.players.find((p) => p.id === myId);
    if (me) {
      if (me.hp < myHpLast && me.al) { shake = Math.min(14, shake + (myHpLast - me.hp) * 0.5); sfx('hurt'); }
      myHpLast = me.hp;
      if (m.me && m.me.slot !== lastSlot) lastSlot = m.me.slot;
    }
    for (const e of m.events) {
      if (e.k === 'hit') { particles.push({ x: e.x, y: e.y, life: 0.25, kind: 'hit' }); if (e.who === myId) sfx('hit'); }
      else if (e.k === 'kill') { addFeed(`<span style="color:${e.killerColor || '#aaa'}">${e.killer || 'The storm'}</span> eliminated <span style="color:${e.victimColor}">${e.victim}</span> ${e.killer ? 'with a ' + e.weapon : ''}`); if (e.victim === myName()) toast(`Eliminated by ${e.killer || 'the storm'}!`, 2500); if (e.killer === myName()) toast(`You eliminated ${e.victim}!`, 2000); }
      else if (e.k === 'answer') addFeed(`<span style="color:${e.color}">${e.name}</span> ${e.correct ? '✅ got a <b>' + e.topic + '</b> sum right' : '❌ missed a <b>' + e.topic + '</b> sum'}`);
      else if (e.k === 'info') { addFeed(e.msg); if (/storm/i.test(e.msg)) toast(e.msg, 2500); }
    }
    updateHud();
  }
  const myName = () => { const p = S && S.players.find((p) => p.id === myId); return p ? p.n : ''; };

  // ---------- screens ----------
  function showScreen(name) {
    $('join').classList.toggle('hidden', name !== 'join');
    $('lobby').classList.toggle('hidden', name !== 'lobby');
    $('hud').classList.toggle('hidden', name !== 'game');
  }
  function renderLobby(m) {
    const list = $('playerList'); list.innerHTML = '';
    for (const p of m.players) { const li = document.createElement('li'); li.innerHTML = `<span class="dot" style="background:${p.color}"></span>${esc(p.name)}${p.id === myId ? ' (you)' : ''}${p.id === m.hostId ? '<span class="tag">HOST</span>' : ''}${p.isBot ? '<span class="tag">BOT</span>' : ''}`; list.appendChild(li); }
    const isHost = m.hostId === myId;
    $('hostControls').classList.toggle('hidden', !isHost); $('waitMsg').classList.toggle('hidden', isHost);
    $('mode').value = m.settings.mode; $('difficulty').value = m.settings.difficulty; $('bots').value = String(m.settings.bots);
    $('lobbyBtn').classList.toggle('hidden', !isHost); $('goWait').classList.toggle('hidden', isHost);
  }
  function showGameOver(m) {
    hideQuestion();
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
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- question UI ----------
  function showQuestion(m) {
    question = m; clearTimeout(resultTimeout);
    const col = RCOLOR[m.rarity] || '#fff';
    $('qHeader').textContent = m.kind === 'respawn' ? 'SOLVE THIS TO RESPAWN' : `${RLABEL[m.rarity]} CHEST`;
    $('qHeader').style.background = col + '33'; $('qHeader').style.color = col; $('qHeader').style.border = `2px solid ${col}`;
    $('qTopic').textContent = m.topic; $('qText').textContent = m.text; $('qHint').textContent = m.hint ? 'Hint: ' + m.hint : '';
    $('qInput').value = ''; $('qInput').disabled = false; $('qForm').classList.remove('hidden'); $('qResult').classList.add('hidden');
    $('qCancel').classList.toggle('hidden', m.kind === 'respawn');
    qTimerStart = performance.now(); qTimerLen = m.timeLimit;
    $('question').classList.remove('hidden'); setTimeout(() => $('qInput').focus(), 30);
    keys = {}; shooting = false;
  }
  function hideQuestion() { question = null; $('question').classList.add('hidden'); }
  function onResult(m) {
    const box = $('qResult'); box.classList.remove('hidden'); $('qForm').classList.add('hidden'); $('qCancel').classList.add('hidden');
    if (m.correct) { box.className = 'good'; box.innerHTML = `✅ Correct!${m.loot && m.loot.length ? `<small>You got: ${m.loot.map(esc).join(', ')}</small>` : (m.kind === 'respawn' ? '<small>Respawning…</small>' : '')}`; sfx('correct'); if (m.kind === 'chest') sfx('chest'); }
    else { box.className = 'bad'; box.innerHTML = `${m.timeout ? '⏰ Out of time!' : '❌ Not quite.'}<small>The answer was <b>${esc(m.answer)}</b>${m.kind === 'respawn' ? '. Another sum is coming…' : '. The chest stays locked.'}</small>`; sfx('wrong'); }
    question = null;
    resultTimeout = setTimeout(hideQuestion, m.correct ? 2200 : 3200);
  }
  $('qForm').addEventListener('submit', (e) => { e.preventDefault(); if (!question) return; const a = $('qInput').value.trim(); if (!a) return; $('qInput').disabled = true; send({ t: 'answer', a }); });
  $('qCancel').addEventListener('click', () => { if (question && question.kind === 'chest') { send({ t: 'cancel' }); hideQuestion(); } });

  // ---------- HUD ----------
  function addFeed(html) { feedItems.push({ html, at: performance.now() }); if (feedItems.length > 6) feedItems.shift(); renderFeed(); }
  function renderFeed() { const now = performance.now(); feedItems = feedItems.filter((f) => now - f.at < 7000); $('feed').innerHTML = feedItems.map((f) => `<div>${f.html}</div>`).join(''); }
  let toastTimer = null;
  function toast(msg, ms = 2000) { $('toast').textContent = msg; $('toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.add('hidden'), ms); }
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
      else if (it.type === 'weapon') html += `<div class="slot${active ? ' active' : ''}" style="border-color:${active ? '#ffd34d' : RCOLOR[it.rarity]}"><span class="num">${i + 1}</span><span class="icon">${WICON[it.key]}</span><span class="name" style="color:${RCOLOR[it.rarity]}">${WNAME[it.key]}</span><span class="ammo">${S.me.reloadEnd > S.now && active ? '…' : it.ammo}/${WMAG[it.key]}</span></div>`;
      else html += `<div class="slot${active ? ' active' : ''}"><span class="num">${i + 1}</span><span class="icon">${CICON[it.key]}</span><span class="name">${CNAME[it.key]}</span><span class="ammo">×${it.count}</span></div>`;
    }
    $('slots').innerHTML = html;
    // prompt
    const pr = $('prompt'); let text = '';
    if (me && me.al) {
      const c = nearestChest(me);
      if (c) text = c.state === 0 ? 'Press <b>E</b> to open the chest' : c.state === 2 ? 'Someone is opening this chest…' : c.state === 3 ? 'Locked for a moment…' : '';
      if (S.me && S.me.useEnd > S.now) text = `Using… ${Math.ceil((S.me.useEnd - S.now) / 1000)}s`;
      else if (S.me && S.me.reloadEnd > S.now) text = 'Reloading…';
      else if (S.me && inv[S.me.slot] && inv[S.me.slot].type === 'consumable') text = text || 'Click to use ' + CNAME[inv[S.me.slot].key];
    } else if (me && !me.al && S.me && S.me.spectating) text = 'You are out. Watching the others…';
    pr.innerHTML = text; pr.classList.toggle('hidden', !text);
    if (touch.enabled) { const c = me && me.al && nearestChest(me); $('btnOpen').classList.toggle('hidden', !(c && c.state === 0)); const cur = S.me && inv[S.me.slot]; $('btnUse').classList.toggle('hidden', !(cur && cur.type === 'consumable')); $('btnReload').classList.toggle('hidden', !(cur && cur.type === 'weapon')); }
    renderFeed();
  }
  function nearestChest(me) {
    if (!world || !S) return null; let best = null, bd = CHEST_RANGE;
    for (const c of S.chests) { const pos = world.chests.get(c[0]); if (!pos || c[2] === 1) continue; const d = Math.hypot(pos.x - me.x, pos.y - me.y); if (d < bd) { bd = d; best = { id: c[0], state: c[2], rarity: c[1] }; } }
    return best;
  }

  // ---------- input ----------
  const inQuestion = () => !$('question').classList.contains('hidden');
  const CODE_KEYS = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', ArrowUp: 'arrowup', ArrowDown: 'arrowdown', ArrowLeft: 'arrowleft', ArrowRight: 'arrowright', KeyE: 'e', KeyR: 'r', KeyQ: 'q', Digit1: '1', Digit2: '2', Digit3: '3', Digit4: '4', Digit5: '5' };
  const keyOf = (e) => CODE_KEYS[e.code] || e.key.toLowerCase();
  window.addEventListener('keydown', (e) => {
    if (inQuestion()) { if (e.key === 'Escape') $('qCancel').click(); return; }
    if (phase !== 'playing' || (e.target.tagName === 'INPUT' && e.target.offsetParent !== null)) return;
    const k = keyOf(e); keys[k] = true;
    if (k >= '1' && k <= '5') send({ t: 'slot', i: +k - 1 });
    if (k === 'r') reloadPulse = true;
    if (k === 'q') send({ t: 'drop' });
    if (k === 'e') { const me = S && S.players.find((p) => p.id === myId); const c = me && nearestChest(me); if (c && c.state === 0) send({ t: 'open', id: c.id }); }
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[keyOf(e)] = false; });
  window.addEventListener('blur', () => { keys = {}; shooting = false; });
  canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { shooting = true; if (!actx) sfx('pickup'); } });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) shooting = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  setInterval(() => {
    if (phase !== 'playing' || !S) return;
    const me = S.players.find((p) => p.id === myId); if (!me || !me.al) return;
    const v = view.get(myId) || me;
    let a = Math.atan2(mouse.y - canvas.height / 2, mouse.x - canvas.width / 2);
    const mv = stickVec(touch.move), av = stickVec(touch.aim);
    let shoot = shooting;
    if (touch.enabled) { if (touch.aim || touch.move) { a = touch.aim && av.len > 0.25 ? touch.aimAngle : (touch.aim ? touch.aimAngle : (mv.len > 0.2 ? mv.a : touch.aimAngle)); touch.lastAngle = a; } else if (touch.lastAngle !== undefined) a = touch.lastAngle; shoot = shoot || (!!touch.aim && av.len > 0.25); }
    send({ t: 'input', i: { u: keys.w || keys.arrowup || mv.y < -0.3, d: keys.s || keys.arrowdown || mv.y > 0.3, l: keys.a || keys.arrowleft || mv.x < -0.3, r: keys.d || keys.arrowright || mv.x > 0.3, a, s: shoot && !inQuestion(), rl: reloadPulse } });
    reloadPulse = false;
  }, 50);

  // ---------- touch controls (phones / tablets) ----------
  const touch = { enabled: false, move: null, aim: null, aimAngle: 0 };
  function enableTouch() { if (touch.enabled) return; touch.enabled = true; document.body.classList.add('touch'); }
  window.addEventListener('touchstart', enableTouch, { passive: true, once: true });
  const stickVec = (st) => { if (!st) return { x: 0, y: 0, len: 0 }; const dx = st.x - st.sx, dy = st.y - st.sy; const len = Math.min(1, Math.hypot(dx, dy) / 60); const a = Math.atan2(dy, dx); return { x: Math.cos(a) * len, y: Math.sin(a) * len, len, a }; };
  canvas.addEventListener('touchstart', (e) => {
    enableTouch(); if (!actx) sfx('pickup');
    for (const t of e.changedTouches) {
      const st = { id: t.identifier, sx: t.clientX, sy: t.clientY, x: t.clientX, y: t.clientY };
      if (t.clientX < canvas.width / 2) { if (!touch.move) touch.move = st; } else if (!touch.aim) touch.aim = st;
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) for (const st of [touch.move, touch.aim]) if (st && st.id === t.identifier) { st.x = t.clientX; st.y = t.clientY; }
    if (touch.aim) { const v = stickVec(touch.aim); if (v.len > 0.25) touch.aimAngle = v.a; }
    e.preventDefault();
  }, { passive: false });
  const touchEnd = (e) => { for (const t of e.changedTouches) { if (touch.move && touch.move.id === t.identifier) touch.move = null; if (touch.aim && touch.aim.id === t.identifier) touch.aim = null; } };
  canvas.addEventListener('touchend', touchEnd); canvas.addEventListener('touchcancel', touchEnd);
  $('btnOpen').addEventListener('click', () => { const me = S && S.players.find((p) => p.id === myId); const c = me && nearestChest(me); if (c && c.state === 0) send({ t: 'open', id: c.id }); });
  $('btnReload').addEventListener('click', () => { reloadPulse = true; });
  $('btnUse').addEventListener('click', () => send({ t: 'use' }));
  $('slots').addEventListener('click', (e) => { const slot = e.target.closest('.slot'); if (!slot) return; const i = [...$('slots').children].indexOf(slot); if (i >= 0) send({ t: 'slot', i }); });

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

  // ---------- rendering ----------
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; zoom = Math.max(0.65, Math.min(1.1, Math.min(canvas.width / 1500, canvas.height / 850))); }
  window.addEventListener('resize', resize); resize();
  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
    if (phase === 'playing' || phase === 'ended') draw(dt, now);
    $('focusHint').classList.toggle('hidden', !(phase === 'playing' && !touch.enabled && !inQuestion() && !document.hasFocus()));
    if (question && qTimerLen) { const f = Math.max(0, 1 - (performance.now() - qTimerStart) / qTimerLen); $('qTimer').style.width = f * 100 + '%'; $('qTimer').style.background = f < 0.3 ? '#ff6b6b' : '#3b9dff'; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  function draw(dt, now) {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#1b2838'; ctx.fillRect(0, 0, W, H);
    if (!S || !world) return;
    // smooth positions
    const k = 1 - Math.pow(0.001, dt);
    for (const p of S.players) { const v = view.get(p.id); if (!v) continue; v.x += (p.x - v.x) * k; v.y += (p.y - v.y) * k; let da = p.a - v.a; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; v.a += da * Math.min(1, dt * 18); }
    const me = S.players.find((p) => p.id === myId);
    let focus = me && view.get(myId);
    if (me && !me.al) { const other = S.players.find((p) => p.al); focus = other ? view.get(other.id) : focus; }
    if (focus) { cam.x += (focus.x - cam.x) * Math.min(1, dt * 8); cam.y += (focus.y - cam.y) * Math.min(1, dt * 8); }
    shake = Math.max(0, shake - dt * 40);
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
    ctx.save(); ctx.translate(W / 2 + sx, H / 2 + sy); ctx.scale(zoom, zoom); ctx.translate(-cam.x, -cam.y);
    const left = cam.x - W / 2 / zoom, top = cam.y - H / 2 / zoom, right = cam.x + W / 2 / zoom, bottom = cam.y + H / 2 / zoom;
    // ground
    ctx.fillStyle = '#5fa052'; ctx.fillRect(0, 0, world.size, world.size);
    ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = Math.floor(left / 100) * 100; x < right; x += 100) { ctx.moveTo(x, Math.max(0, top)); ctx.lineTo(x, Math.min(world.size, bottom)); }
    for (let y = Math.floor(top / 100) * 100; y < bottom; y += 100) { ctx.moveTo(Math.max(0, left), y); ctx.lineTo(Math.min(world.size, right), y); }
    ctx.stroke();
    // drops
    for (const d of S.drops) {
      if (d.x < left - 40 || d.x > right + 40 || d.y < top - 40 || d.y > bottom + 40) continue;
      const bob = Math.sin(now / 250 + d.x) * 3;
      ctx.save(); ctx.translate(d.x, d.y + bob);
      if (d.type === 'weapon') { ctx.fillStyle = RCOLOR[d.rarity]; ctx.shadowColor = RCOLOR[d.rarity]; ctx.shadowBlur = 12; ctx.rotate(-0.4); ctx.fillRect(-14, -4, 28, 8); ctx.fillStyle = '#333'; ctx.fillRect(-8, 2, 6, 8); }
      else { ctx.shadowColor = '#fff'; ctx.shadowBlur = 8; ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(CICON[d.key], 0, 0); }
      ctx.restore();
    }
    // chests
    for (const c of S.chests) {
      const pos = world.chests.get(c[0]); if (!pos) continue;
      if (pos.x < left - 60 || pos.x > right + 60 || pos.y < top - 60 || pos.y > bottom + 60) continue;
      const rar = RARITY[c[1]], col = RCOLOR[rar], open = c[2] === 1;
      ctx.save(); ctx.translate(pos.x, pos.y);
      if (!open) { ctx.shadowColor = col; ctx.shadowBlur = 14 + Math.sin(now / 300) * 5; }
      ctx.fillStyle = open ? '#4a3a28' : '#8a5a2b'; ctx.strokeStyle = open ? '#666' : col; ctx.lineWidth = 3;
      roundRect(-24, -16, 48, 32, 6); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = open ? '#2a2015' : '#6b4320'; roundRect(-24, -16, 48, 12, 4); ctx.fill();
      ctx.fillStyle = open ? '#555' : '#ffd34d'; ctx.fillRect(-4, -6, 8, 10);
      if (c[2] === 2) { ctx.fillStyle = '#fff'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('?', 0, -24); }
      if (c[2] === 3) { ctx.font = '18px serif'; ctx.textAlign = 'center'; ctx.fillText('🔒', 0, -22); }
      ctx.restore();
    }
    // obstacles
    for (const o of world.obstacles) {
      if (o.t === 'r') {
        if (o.x + o.w < left || o.x > right || o.y + o.h < top || o.y > bottom) continue;
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(o.x + 8, o.y + 8, o.w, o.h);
        ctx.fillStyle = o.c; ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 4; ctx.strokeRect(o.x, o.y, o.w, o.h);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2; ctx.strokeRect(o.x + 14, o.y + 14, o.w - 28, o.h - 28);
      } else {
        if (o.x + o.r < left || o.x - o.r > right || o.y + o.r < top || o.y - o.r > bottom) continue;
        if (o.k === 'tree') { ctx.fillStyle = 'rgba(0,0,0,0.25)'; circle(o.x + 6, o.y + 6, o.r); ctx.fillStyle = '#2e7d32'; circle(o.x, o.y, o.r); ctx.fillStyle = '#43a047'; circle(o.x - o.r * 0.25, o.y - o.r * 0.25, o.r * 0.55); }
        else { ctx.fillStyle = 'rgba(0,0,0,0.25)'; circle(o.x + 6, o.y + 6, o.r); ctx.fillStyle = '#7f8c8d'; circle(o.x, o.y, o.r); ctx.fillStyle = '#95a5a6'; circle(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.45); }
      }
    }
    // players
    for (const p of S.players) {
      if (!p.al) continue; const v = view.get(p.id); if (!v) continue;
      if (v.x < left - 60 || v.x > right + 60 || v.y < top - 60 || v.y > bottom + 60) continue;
      ctx.save(); ctx.translate(v.x, v.y);
      if (p.pr) { ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(0, 0, PLAYER_R + 8, now / 200, now / 200 + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; circle(4, 6, PLAYER_R);
      ctx.rotate(v.a);
      // gun
      if (p.w && WNAME[p.w]) { ctx.fillStyle = '#2d3436'; const len = p.w === 'sniper' ? 42 : p.w === 'pistol' ? 24 : 34; ctx.fillRect(8, -4, len, 8); ctx.fillStyle = '#636e72'; ctx.fillRect(10, -2, len - 6, 4); }
      else if (p.w) { ctx.font = '18px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(CICON[p.w] || '', 24, 0); }
      ctx.fillStyle = p.c; circle(0, 0, PLAYER_R); ctx.strokeStyle = p.id === myId ? '#fff' : 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; circle(10, -7, 4); circle(10, 7, 4);
      ctx.rotate(-v.a);
      // name + bars
      ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(p.n, 0, -34); ctx.fillStyle = '#fff'; ctx.fillText(p.n, 0, -34);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-26, -30, 52, 6); ctx.fillStyle = '#2ed573'; ctx.fillRect(-26, -30, 52 * p.hp / 100, 6);
      if (p.sh > 0) { ctx.fillStyle = '#3b9dff'; ctx.fillRect(-26, -26, 52 * p.sh / 100, 3); }
      if (p.q) { ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#ffd34d'; ctx.strokeText('🤔', 0, -44); ctx.fillText('🤔', 0, -44); }
      if (p.u) { ctx.font = '16px serif'; ctx.fillText('💊', 24, -24); }
      ctx.restore();
    }
    // bullets
    ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (const b of S.bullets) { ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(b[0] - Math.cos(b[2]) * 16, b[1] - Math.sin(b[2]) * 16); ctx.stroke(); }
    // particles
    particles = particles.filter((p) => (p.life -= dt) > 0);
    for (const p of particles) { ctx.fillStyle = `rgba(255,80,60,${p.life * 3})`; circle(p.x, p.y, 10 * (0.3 - p.life) * 4 + 4); }
    // storm
    if (S.storm) {
      const s = S.storm;
      ctx.fillStyle = 'rgba(120, 40, 200, 0.38)'; ctx.beginPath(); ctx.rect(left - 50, top - 50, right - left + 100, bottom - top + 100); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2, true); ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(200,120,255,0.9)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke();
      if (s.tr < s.r) { ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3; ctx.setLineDash([12, 10]); ctx.beginPath(); ctx.arc(s.tx, s.ty, s.tr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    }
    // world border
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 10; ctx.strokeRect(0, 0, world.size, world.size);
    ctx.restore();
    // vignette when hurt
    if (me && me.al && me.hp < 35) { ctx.fillStyle = `rgba(255,0,0,${(35 - me.hp) / 35 * 0.25 * (0.6 + 0.4 * Math.sin(now / 200))})`; ctx.fillRect(0, 0, W, H); }
    // crosshair
    if (me && me.al && !touch.enabled) { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 9, 0, Math.PI * 2); ctx.moveTo(mouse.x - 14, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y); ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + 14, mouse.y); ctx.moveTo(mouse.x, mouse.y - 14); ctx.lineTo(mouse.x, mouse.y - 5); ctx.moveTo(mouse.x, mouse.y + 5); ctx.lineTo(mouse.x, mouse.y + 14); ctx.stroke(); }
    // touch sticks
    if (touch.enabled) for (const st of [touch.move, touch.aim]) if (st) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(st.sx, st.sy, 60, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.6)'; const v = stickVec(st); ctx.beginPath(); ctx.arc(st.sx + v.x * 60, st.sy + v.y * 60, 26, 0, Math.PI * 2); ctx.fill(); }
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
    if (me && me.al) { const v = view.get(myId) || me; mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(v.x * sc, v.y * sc, 4, 0, Math.PI * 2); mctx.fill(); mctx.strokeStyle = '#fff'; mctx.beginPath(); mctx.moveTo(v.x * sc, v.y * sc); mctx.lineTo(v.x * sc + Math.cos(v.a) * 9, v.y * sc + Math.sin(v.a) * 9); mctx.stroke(); }
  }
  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
})();
