'use strict';
// Maths Royale client: networking, input, rendering and HUD.
(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('game'); let ctx = canvas.getContext('2d');
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
      case 'joined': myId = m.id; room = m.room; $('roomCode').textContent = room; sendSkin(); break;
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
      if (e.k === 'hit') { spawnSparks(e.x, e.y, 6, '#ffb347'); if (e.who === myId) { sfx('hit'); spawnText(e.x, e.y - 20, String(e.dmg), '#ffd34d'); } else if (e.victim === myId) spawnText(e.x, e.y - 20, '-' + e.dmg, '#ff6b6b'); }
      else if (e.k === 'shot') { flashes.set(e.id, performance.now()); if (e.id !== myId) { /* distant shots are quieter */ } else sfx('shoot'); }
      else if (e.k === 'kill') { const vp = m.players.find((p) => p.n === e.victim); spawnBoom(e.x, e.y, (vp && vp.c) || '#fff'); addFeed(`<span style="color:${e.killerColor || '#aaa'}">${e.killer || 'The storm'}</span> eliminated <span style="color:${e.victimColor}">${e.victim}</span> ${e.killer ? 'with a ' + e.weapon : ''}`); if (e.victim === myName()) toast(`Eliminated by ${e.killer || 'the storm'}!`, 2500); if (e.killer === myName()) toast(`You eliminated ${e.victim}!`, 2000); }
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
  const SKIN_COLORS = ['#3b9dff', '#ff5e7e', '#ffd32a', '#2ed573', '#ff9f43', '#c56cf0', '#18dcff', '#f368e0', '#ff4757', '#7bed9f', '#ffffff', '#2f3542'];
  let mySkin = { hat: localStorage.getItem('mr_hat') || 'cap', color: localStorage.getItem('mr_color') || '#3b9dff' };
  if (!SKIN_COLORS.includes(mySkin.color)) mySkin.color = '#3b9dff';
  function sendSkin() { localStorage.setItem('mr_hat', mySkin.hat); localStorage.setItem('mr_color', mySkin.color); send({ t: 'skin', hat: mySkin.hat, color: mySkin.color }); renderSkinPicker(); }
  function renderSkinPicker() {
    $('hatRow').innerHTML = HATS.map((h) => `<button class="pick${h === mySkin.hat ? ' on' : ''}" data-hat="${h}">${HAT_NAMES[h]}</button>`).join('');
    $('colorRow').innerHTML = SKIN_COLORS.map((c) => `<button class="swatch${c === mySkin.color ? ' on' : ''}" data-color="${c}" style="background:${c}"></button>`).join('');
    const pc = $('preview'); const g = pc.getContext('2d'); g.clearRect(0, 0, pc.width, pc.height);
    const saved = ctx; ctx = g; ctx.save(); ctx.translate(pc.width / 2, pc.height / 2 + 6); ctx.scale(2.2, 2.2);
    drawPlayer({ id: myId || 'me', n: '', c: mySkin.color, h: mySkin.hat, x: 0, y: 0, a: -Math.PI / 2, hp: 100, sh: 0, al: 1, w: 'rifle', wr: 'legendary', q: 0, u: 0, pr: 0 }, { x: 0, y: 0, a: -Math.PI / 2 }, performance.now());
    ctx.restore(); ctx = saved;
  }
  $('hatRow').addEventListener('click', (e) => { const b = e.target.closest('[data-hat]'); if (b) { mySkin.hat = b.dataset.hat; sfx('pickup'); sendSkin(); } });
  $('colorRow').addEventListener('click', (e) => { const b = e.target.closest('[data-color]'); if (b) { mySkin.color = b.dataset.color; sfx('pickup'); sendSkin(); } });
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
      else if (it.type === 'weapon') html += `<div class="slot${active ? ' active' : ''}" style="border-color:${active ? '#ffd34d' : RCOLOR[it.rarity]}"><span class="num">${i + 1}</span><img class="gicon" src="${GUN_ICON[it.key]}" alt=""><span class="name" style="color:${RCOLOR[it.rarity]}">${WNAME[it.key]}</span><span class="ammo">${S.me.reloadEnd > S.now && active ? '…' : it.ammo}/${WMAG[it.key]}</span></div>`;
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
    let tu = false, td = false, tl = false, tr = false;
    if (touch.enabled) {
      if (touch.aim) { if (av.len > 0.12) touch.aimAngle = av.a; a = touch.aimAngle; shoot = true; }
      else if (touch.move && mv.len > 0.12) { a = mv.a; touch.aimAngle = a; }
      else if (touch.aimAngle !== undefined) a = touch.aimAngle;
      if (touch.move && mv.len > 0.12) { const cx = Math.cos(mv.a), cy = Math.sin(mv.a); tl = cx < -0.38; tr = cx > 0.38; tu = cy < -0.38; td = cy > 0.38; }
    }
    send({ t: 'input', i: { u: keys.w || keys.arrowup || tu, d: keys.s || keys.arrowdown || td, l: keys.a || keys.arrowleft || tl, r: keys.d || keys.arrowright || tr, a, s: shoot && !inQuestion(), rl: reloadPulse } });
    reloadPulse = false;
  }, 50);

  // ---------- touch controls (phones / tablets) ----------
  const touch = { enabled: false, move: null, aim: null, aimAngle: 0 };
  function enableTouch() { if (touch.enabled) return; touch.enabled = true; document.body.classList.add('touch'); }
  window.addEventListener('touchstart', enableTouch, { passive: true, once: true });
  const STICK_R = 42;
  const stickVec = (st) => { if (!st) return { x: 0, y: 0, len: 0, a: 0 }; const dx = st.x - st.sx, dy = st.y - st.sy; const len = Math.min(1, Math.hypot(dx, dy) / STICK_R); const a = Math.atan2(dy, dx); return { x: Math.cos(a) * len, y: Math.sin(a) * len, len, a }; };
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
    if (touch.aim) { const v = stickVec(touch.aim); if (v.len > 0.12) touch.aimAngle = v.a; }
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
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; zoom = Math.max(0.8, Math.min(1.45, Math.min(canvas.width / 1150, canvas.height / 650))); }
  window.addEventListener('resize', resize); resize();

  const hash = (x, y) => { let h = (Math.round(x) * 374761393 + Math.round(y) * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  function shade(hex, amt) { const n = parseInt(hex.slice(1), 16); let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt; r = Math.max(0, Math.min(255, r)); g = Math.max(0, Math.min(255, g)); b = Math.max(0, Math.min(255, b)); return `rgb(${r},${g},${b})`; }
  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

  // grass texture tile
  let grassPattern = null;
  function makeGrass() {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#5c9e4f'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 36; i++) {
      const x = Math.random() * 256, y = Math.random() * 256, rx = 12 + Math.random() * 34, ry = 8 + Math.random() * 20, rot = Math.random() * Math.PI;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(70,140,60,0.45)' : 'rgba(120,180,80,0.35)';
      for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, rot, 0, Math.PI * 2); g.fill(); }
    }
    g.lineWidth = 1.5; g.lineCap = 'round';
    for (let i = 0; i < 420; i++) { const x = Math.random() * 256, y = Math.random() * 256; g.strokeStyle = Math.random() < 0.5 ? 'rgba(35,95,45,0.55)' : 'rgba(180,235,130,0.4)'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 4, y - 3 - Math.random() * 5); g.stroke(); }
    for (let i = 0; i < 14; i++) { g.fillStyle = ['#f4d35e', '#ffffff', '#ff8fa3'][i % 3]; const x = Math.random() * 256, y = Math.random() * 256; g.beginPath(); g.arc(x, y, 1.8, 0, Math.PI * 2); g.fill(); }
    grassPattern = ctx.createPattern(c, 'repeat');
  }
  makeGrass();

  // ----- guns (drawn pointing right, origin at the shooter's hand) -----
  function drawGun(key, rarity, flash) {
    const acc = RCOLOR[rarity] || '#999';
    ctx.lineJoin = 'round';
    const metal = '#2f3640', dark = '#1e272e', wood = '#8d5524';
    if (key === 'pistol') {
      ctx.fillStyle = metal; roundRect(8, -4, 18, 7, 2); ctx.fill(); ctx.fillStyle = dark; roundRect(10, 2, 6, 8, 2); ctx.fill(); ctx.fillStyle = acc; ctx.fillRect(14, -3, 8, 2);
    } else if (key === 'smg') {
      ctx.fillStyle = dark; roundRect(2, -3, 10, 7, 2); ctx.fill(); ctx.fillStyle = metal; roundRect(8, -5, 26, 9, 2); ctx.fill(); ctx.fillStyle = dark; roundRect(16, 3, 6, 11, 2); ctx.fill(); ctx.fillStyle = metal; ctx.fillRect(34, -2, 8, 3); ctx.fillStyle = acc; ctx.fillRect(12, -4, 14, 2);
    } else if (key === 'shotgun') {
      ctx.fillStyle = wood; roundRect(0, -4, 14, 9, 3); ctx.fill(); ctx.fillStyle = metal; roundRect(12, -4, 34, 7, 2); ctx.fill(); ctx.fillStyle = wood; roundRect(22, 1, 12, 5, 2); ctx.fill(); ctx.fillStyle = dark; ctx.fillRect(40, -3, 8, 5); ctx.fillStyle = acc; ctx.fillRect(14, -3, 10, 2);
    } else if (key === 'rifle') {
      ctx.fillStyle = dark; roundRect(-2, -3, 12, 8, 2); ctx.fill(); ctx.fillStyle = metal; roundRect(8, -5, 22, 10, 2); ctx.fill(); ctx.fillStyle = dark; roundRect(14, 4, 7, 12, 2); ctx.fill(); ctx.fillStyle = metal; ctx.fillRect(28, -2, 16, 4); ctx.fillStyle = dark; ctx.fillRect(10, -7, 12, 3); ctx.fillStyle = acc; ctx.fillRect(12, -4, 14, 2);
    } else if (key === 'sniper') {
      ctx.fillStyle = wood; roundRect(-4, -3, 16, 8, 3); ctx.fill(); ctx.fillStyle = metal; roundRect(10, -4, 22, 8, 2); ctx.fill(); ctx.fillRect(30, -2, 28, 4); ctx.fillStyle = dark; roundRect(14, -9, 14, 5, 2); ctx.fill(); ctx.fillStyle = '#74b9ff'; ctx.fillRect(26, -8, 2, 3); ctx.fillStyle = acc; ctx.fillRect(14, -3, 12, 2); ctx.fillStyle = dark; ctx.fillRect(46, 2, 2, 7); ctx.fillRect(52, 2, 2, 7);
    }
    if (flash) {
      const tip = { pistol: 26, smg: 42, shotgun: 48, rifle: 44, sniper: 58 }[key] || 30;
      ctx.save(); ctx.translate(tip, -1); ctx.fillStyle = 'rgba(255,230,120,0.95)'; ctx.beginPath();
      for (let i = 0; i < 8; i++) { const r = i % 2 ? 6 : 16; const a = (i / 8) * Math.PI * 2; ctx.lineTo(Math.cos(a) * r * (i % 2 ? 1 : 1.3), Math.sin(a) * r); }
      ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; circle(0, 0, 5); ctx.restore();
    }
  }
  // gun icons for the HUD
  const GUN_ICON = {};
  const GUN_SPAN = { pistol: [8, 26], smg: [2, 42], shotgun: [0, 48], rifle: [-2, 44], sniper: [-4, 58] };
  for (const key of Object.keys(WNAME)) {
    const c = document.createElement('canvas'); c.width = 120; c.height = 60; const g = c.getContext('2d');
    const [a, b] = GUN_SPAN[key]; const sc = Math.min(4, 110 / (b - a));
    const saved = ctx; ctx = g; ctx.translate(60 - ((a + b) / 2) * sc, 30); ctx.scale(sc, sc); drawGun(key, 'common', false); ctx = saved;
    GUN_ICON[key] = c.toDataURL();
  }

  // ----- world props -----
  function drawBuilding(o) {
    const base = o.c || '#8d6e63';
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(o.x + 10, o.y + 12, o.w, o.h);
    ctx.fillStyle = shade(base, -50); ctx.fillRect(o.x - 4, o.y - 4, o.w + 8, o.h + 8); // walls / overhang
    const horiz = o.w >= o.h;
    ctx.fillStyle = shade(base, 10);
    if (horiz) { ctx.fillRect(o.x, o.y, o.w, o.h / 2); ctx.fillStyle = shade(base, -25); ctx.fillRect(o.x, o.y + o.h / 2, o.w, o.h / 2); }
    else { ctx.fillRect(o.x, o.y, o.w / 2, o.h); ctx.fillStyle = shade(base, -25); ctx.fillRect(o.x + o.w / 2, o.y, o.w / 2, o.h); }
    // tiles
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 2; ctx.beginPath();
    if (horiz) for (let x = o.x + 24; x < o.x + o.w; x += 24) { ctx.moveTo(x, o.y); ctx.lineTo(x, o.y + o.h); } else for (let y = o.y + 24; y < o.y + o.h; y += 24) { ctx.moveTo(o.x, y); ctx.lineTo(o.x + o.w, y); }
    ctx.stroke();
    // ridge
    ctx.strokeStyle = shade(base, 45); ctx.lineWidth = 5; ctx.beginPath();
    if (horiz) { ctx.moveTo(o.x + 6, o.y + o.h / 2); ctx.lineTo(o.x + o.w - 6, o.y + o.h / 2); } else { ctx.moveTo(o.x + o.w / 2, o.y + 6); ctx.lineTo(o.x + o.w / 2, o.y + o.h - 6); }
    ctx.stroke();
    // chimney
    const cx = o.x + 20 + hash(o.x, o.y) * (o.w - 40), cy = o.y + 20 + hash(o.y, o.x) * (o.h - 40);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(cx + 3, cy + 4, 18, 18); ctx.fillStyle = '#6d4c41'; ctx.fillRect(cx, cy, 18, 18); ctx.fillStyle = '#3e2723'; ctx.fillRect(cx + 4, cy + 4, 10, 10);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3; ctx.strokeRect(o.x - 4, o.y - 4, o.w + 8, o.h + 8);
  }
  function drawTree(o, now) {
    // Roblox-style blocky tree: square canopy layers on a square trunk
    const h1 = hash(o.x, o.y), h2 = hash(o.y, o.x); const r = o.r; const sway = Math.sin(now / 900 + h1 * 6) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(o.x - r * 0.8 + 10, o.y - r * 0.8 + 12, r * 1.6, r * 1.6);
    ctx.fillStyle = '#6d4c41'; ctx.fillRect(o.x - r * 0.25, o.y - r * 0.25, r * 0.5, r * 0.5);
    const pal = h2 < 0.5 ? ['#2e7d32', '#43a047', '#7cb342'] : ['#1b5e20', '#2e7d32', '#558b2f'];
    ctx.save(); ctx.translate(o.x + sway, o.y); ctx.rotate(h1 * 0.6 - 0.3);
    ctx.fillStyle = pal[0]; ctx.fillRect(-r * 0.95, -r * 0.95, r * 1.9, r * 1.9);
    ctx.fillStyle = pal[1]; ctx.fillRect(-r * 0.7, -r * 0.7, r * 1.4, r * 1.4);
    ctx.fillStyle = pal[2]; ctx.fillRect(-r * 0.4, -r * 0.4, r * 0.8, r * 0.8);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(-r * 0.4, -r * 0.4, r * 0.3, r * 0.3);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3; ctx.strokeRect(-r * 0.95, -r * 0.95, r * 1.9, r * 1.9);
    ctx.restore();
  }
  function drawRock(o) {
    // blocky boulder: a tilted cube seen from above
    const r = o.r, a = hash(o.x, o.y) * 0.8 - 0.4;
    ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(-r * 0.85 + 8, -r * 0.75 + 10, r * 1.7, r * 1.5);
    ctx.fillStyle = '#6b7b80'; ctx.fillRect(-r * 0.85, -r * 0.75, r * 1.7, r * 1.5);
    ctx.fillStyle = '#8fa0a6'; ctx.fillRect(-r * 0.65, -r * 0.6, r * 1.3, r * 1.1);
    ctx.fillStyle = '#b4c2c7'; ctx.fillRect(-r * 0.55, -r * 0.5, r * 0.5, r * 0.4);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3; ctx.strokeRect(-r * 0.85, -r * 0.75, r * 1.7, r * 1.5);
    ctx.restore();
  }
  function drawChest(pos, rar, state, now) {
    const col = RCOLOR[rar], open = state === 1, tier = RARITY.indexOf(rar);
    ctx.save(); ctx.translate(pos.x, pos.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(4, 8, 30, 20, 0, 0, Math.PI * 2); ctx.fill();
    if (!open) { ctx.shadowColor = col; ctx.shadowBlur = 16 + Math.sin(now / 280) * 6; }
    ctx.fillStyle = open ? '#4e342e' : '#8d5a2b'; roundRect(-26, -18, 52, 36, 6); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2; ctx.beginPath(); for (const y of [-6, 6]) { ctx.moveTo(-26, y); ctx.lineTo(26, y); } ctx.stroke();
    if (open) { ctx.fillStyle = '#1b0f08'; roundRect(-22, -12, 44, 24, 4); ctx.fill(); ctx.fillStyle = '#3e2723'; roundRect(-26, -34, 52, 16, 5); ctx.fill(); }
    else { ctx.fillStyle = '#6d4320'; roundRect(-26, -18, 52, 14, 5); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(-24, -16, 48, 5, 3); ctx.fill(); }
    ctx.fillStyle = open ? '#555' : col; for (const x of [-16, 12]) ctx.fillRect(x, -18, 5, 36);
    ctx.fillStyle = open ? '#777' : '#ffd34d'; roundRect(-5, -8, 10, 12, 2); ctx.fill(); ctx.fillStyle = open ? '#333' : '#7a5100'; ctx.fillRect(-1.5, -3, 3, 4);
    ctx.strokeStyle = open ? '#2d1a10' : shade('#8d5a2b', -60); ctx.lineWidth = 2.5; roundRect(-26, -18, 52, 36, 6); ctx.stroke();
    if (!open && tier >= 3) for (let i = 0; i < 3; i++) { const t = (now / 600 + i * 1.1) % 2; const a = i * 2.1 + now / 1500; const sx = Math.cos(a) * 34, sy = Math.sin(a) * 24 - 6; const sz = Math.max(0, Math.sin(t * Math.PI)) * 5; ctx.fillStyle = tier === 4 ? '#fff3b0' : '#e6ccff'; ctx.beginPath(); ctx.moveTo(sx, sy - sz); ctx.lineTo(sx + sz * 0.35, sy); ctx.lineTo(sx, sy + sz); ctx.lineTo(sx - sz * 0.35, sy); ctx.closePath(); ctx.fill(); }
    if (state === 2) { ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 4; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'center'; ctx.strokeText('?', 0, -28); ctx.fillText('?', 0, -28); }
    if (state === 3) { ctx.font = '20px serif'; ctx.textAlign = 'center'; ctx.fillText('🔒', 0, -26); }
    ctx.restore();
  }
  const HATS = ['cap', 'tophat', 'headband', 'helmet', 'bandana', 'crown', 'none', 'bucket', 'cat', 'viking'];
  const HAT_NAMES = { cap: 'Cap', tophat: 'Top hat', headband: 'Headband', helmet: 'Helmet', bandana: 'Bandana', crown: 'Crown', none: 'Hair', bucket: 'Bucket', cat: 'Cat ears', viking: 'Viking' };
  const hatOf = (p) => p.h || p.hat || 'cap';
  function drawPlayer(p, v, now) {
    // Roblox-style blocky avatar seen from above: square head, block torso, block arms
    ctx.save(); ctx.translate(v.x, v.y);
    const moving = Math.hypot(p.x - v.x, p.y - v.y) > 1.5; const swing = moving ? Math.sin(now / 110) * 5 : 0;
    if (p.pr) { ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; ctx.setLineDash([7, 7]); ctx.beginPath(); ctx.arc(0, 0, PLAYER_R + 10, now / 250, now / 250 + Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(-PLAYER_R + 6, -PLAYER_R + 8, PLAYER_R * 2, PLAYER_R * 2, 5); ctx.fill();
    ctx.rotate(v.a);
    const skin = '#f5c86a', col = p.c, dark = shade(col, -60), outline = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2.5; ctx.strokeStyle = outline;
    // backpack
    ctx.fillStyle = dark; roundRect(-27, -10, 10, 20, 3); ctx.fill(); ctx.stroke();
    // torso block
    const grd = ctx.createLinearGradient(-16, -18, 16, 18); grd.addColorStop(0, shade(col, 35)); grd.addColorStop(1, col);
    ctx.fillStyle = grd; roundRect(-16, -18, 32, 36, 4); ctx.fill(); ctx.strokeStyle = p.id === myId ? '#fff' : outline; ctx.lineWidth = p.id === myId ? 3 : 2.5; ctx.stroke(); ctx.strokeStyle = outline; ctx.lineWidth = 2.5;
    // arms (blocks) swinging, holding the gun forward
    ctx.fillStyle = skin; roundRect(-4 + swing * 0.3, -27, 20, 9, 3); ctx.fill(); ctx.stroke(); roundRect(-4 - swing * 0.3, 18, 20, 9, 3); ctx.fill(); ctx.stroke();
    // gun
    if (p.w && WNAME[p.w]) drawGun(p.w, p.wr || 'common', (flashes.get(p.id) || 0) > now - 70);
    else if (p.w) { ctx.font = '18px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(CICON[p.w] || '', 24, 0); ctx.textBaseline = 'alphabetic'; }
    // head block with a face on the front edge
    ctx.fillStyle = skin; roundRect(-11, -11, 22, 22, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#222'; ctx.fillRect(6, -7, 3, 4); ctx.fillRect(6, 3, 3, 4); ctx.fillStyle = '#c0392b'; ctx.fillRect(9, -2, 2, 4);
    const hat = hatOf(p);
    if (hat === 'cap') { ctx.fillStyle = dark; roundRect(-11, -11, 18, 22, 4); ctx.fill(); ctx.fillRect(-11, -8, 14, 16); ctx.fillStyle = shade(col, -20); roundRect(-18, -8, 8, 16, 2); ctx.fill(); }
    else if (hat === 'tophat') { ctx.fillStyle = '#111'; roundRect(-13, -13, 20, 26, 3); ctx.fill(); ctx.fillStyle = '#c0392b'; ctx.fillRect(-13, -4, 20, 8); }
    else if (hat === 'headband') { ctx.fillStyle = col; ctx.fillRect(-11, -4, 16, 8); ctx.fillStyle = '#fff'; ctx.fillRect(-11, -1, 16, 2); }
    else if (hat === 'helmet') { ctx.fillStyle = '#2d3436'; roundRect(-12, -12, 20, 24, 5); ctx.fill(); ctx.fillStyle = '#74b9ff'; ctx.fillRect(4, -9, 5, 18); }
    else if (hat === 'bandana') { ctx.fillStyle = '#6c5ce7'; ctx.fillRect(-11, -11, 16, 22); ctx.fillStyle = '#a29bfe'; ctx.fillRect(-19, -3, 9, 5); }
    else if (hat === 'crown') { ctx.fillStyle = '#ffd34d'; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; const r = i % 2 ? 7 : 13; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#e84393'; ctx.fillRect(-2, -2, 4, 4); }
    else if (hat === 'bucket') { ctx.fillStyle = '#b2bec3'; roundRect(-14, -14, 26, 28, 6); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#636e72'; roundRect(-9, -9, 16, 18, 3); ctx.fill(); }
    else if (hat === 'cat') { ctx.fillStyle = '#ff9f43'; roundRect(-11, -11, 18, 22, 4); ctx.fill(); for (const sy of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-10, sy * 10); ctx.lineTo(-4, sy * 20); ctx.lineTo(2, sy * 10); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ffc9a3'; ctx.beginPath(); ctx.moveTo(-8, sy * 11); ctx.lineTo(-4, sy * 17); ctx.lineTo(0, sy * 11); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ff9f43'; } }
    else if (hat === 'viking') { ctx.fillStyle = '#95a5a6'; roundRect(-12, -12, 20, 24, 5); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ecf0f1'; for (const sy of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-6, sy * 11); ctx.quadraticCurveTo(-6, sy * 24, 4, sy * 22); ctx.quadraticCurveTo(-1, sy * 18, 0, sy * 11); ctx.closePath(); ctx.fill(); ctx.stroke(); } ctx.fillStyle = '#7f8c8d'; ctx.fillRect(-12, -2, 20, 4); }
    else { ctx.fillStyle = '#4e342e'; roundRect(-12, -12, 14, 24, 4); ctx.fill(); }
    ctx.rotate(-v.a);
    // name tag + bars
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    if (!p.n) { ctx.restore(); return; }
    const tw = ctx.measureText(p.n).width + 14; ctx.fillStyle = 'rgba(0,0,0,0.55)'; roundRect(-tw / 2, -54, tw, 18, 6); ctx.fill(); ctx.fillStyle = p.id === myId ? '#ffd34d' : '#fff'; ctx.fillText(p.n, 0, -41);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(-27, -35, 54, 8, 3); ctx.fill(); ctx.fillStyle = p.hp > 35 ? '#2ed573' : '#ff6b6b'; roundRect(-26, -34, 52 * p.hp / 100, 6, 2); ctx.fill();
    if (p.sh > 0) { ctx.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(-27, -29, 54, 5, 2); ctx.fill(); ctx.fillStyle = '#3b9dff'; roundRect(-26, -28, 52 * p.sh / 100, 3, 1); ctx.fill(); }
    if (p.q) { ctx.font = '22px serif'; ctx.fillText('🤔', 0, -60); }
    if (p.u) { ctx.font = '16px serif'; ctx.fillText('💊', 28, -26); }
    ctx.restore();
  }

  // ----- particles -----
  const flashes = new Map();
  function spawnSparks(x, y, n, color, speed = 160) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, sp = speed * (0.3 + Math.random()); particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.35 + Math.random() * 0.3, max: 0.6, color, size: 2 + Math.random() * 3 }); } }
  function spawnText(x, y, text, color, size = 18) { particles.push({ kind: 'text', x, y, vx: (Math.random() - 0.5) * 30, vy: -60, life: 1, max: 1, text, color, size }); }
  function spawnBoom(x, y, color) { spawnSparks(x, y, 26, color, 320); spawnSparks(x, y, 14, '#fff', 200); particles.push({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0.5, max: 0.5, color }); spawnText(x, y - 30, 'ELIMINATED', '#ff6b6b', 24); }
  function updateParticles(dt) {
    particles = particles.filter((p) => (p.life -= dt) > 0);
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.kind === 'spark') { p.vx *= 0.9; p.vy *= 0.9; } }
  }
  function drawParticles() {
    for (const p of particles) {
      const f = p.life / p.max;
      if (p.kind === 'spark') { ctx.fillStyle = p.color; ctx.globalAlpha = f; circle(p.x, p.y, p.size * (0.5 + f)); ctx.globalAlpha = 1; }
      else if (p.kind === 'ring') { ctx.strokeStyle = p.color; ctx.globalAlpha = f; ctx.lineWidth = 6 * f + 1; ctx.beginPath(); ctx.arc(p.x, p.y, (1 - f) * 90 + 10, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
      else if (p.kind === 'text') { ctx.font = `bold ${p.size}px sans-serif`; ctx.textAlign = 'center'; ctx.globalAlpha = Math.min(1, f * 2); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(p.text, p.x, p.y); ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y); ctx.globalAlpha = 1; }
    }
  }
  const clouds = Array.from({ length: 6 }, (_, i) => ({ x: Math.random() * 3200, y: Math.random() * 3200, r: 220 + Math.random() * 200, s: 8 + i * 3 }));

  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - lastFrame) / 1000); lastFrame = now;
    if (phase === 'playing' || phase === 'ended') draw(dt, now); else drawIdle(now);
    $('focusHint').classList.toggle('hidden', !(phase === 'playing' && !touch.enabled && !inQuestion() && !document.hasFocus()));
    if (question && qTimerLen) { const f = Math.max(0, 1 - (performance.now() - qTimerStart) / qTimerLen); $('qTimer').style.width = f * 100 + '%'; $('qTimer').style.background = f < 0.3 ? '#ff6b6b' : '#3b9dff'; }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  const idleScene = { trees: Array.from({ length: 14 }, (_, i) => ({ t: 'c', k: 'tree', x: 150 + (i * 263) % 1700, y: 120 + (i * 431) % 900, r: 30 + (i * 7) % 20 })) };
  function drawIdle(now) {
    const W = canvas.width, H = canvas.height;
    ctx.save(); ctx.translate(-((now / 40) % 256), -((now / 60) % 256)); ctx.fillStyle = grassPattern; ctx.fillRect(0, 0, W + 512, H + 512); ctx.restore();
    ctx.save(); ctx.translate(-((now / 40) % 1700), -((now / 60) % 900));
    for (const dx of [0, 1700]) for (const dy of [0, 900]) { ctx.save(); ctx.translate(dx, dy); for (const t of idleScene.trees) drawTree(t, now); ctx.restore(); }
    ctx.restore();
  }

  function draw(dt, now) {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#1b2838'; ctx.fillRect(0, 0, W, H);
    if (!S || !world) return;
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
    const vis = (x, y, m) => x > left - m && x < right + m && y > top - m && y < bottom + m;
    // ground
    ctx.fillStyle = grassPattern; ctx.fillRect(Math.max(0, left), Math.max(0, top), Math.min(world.size, right) - Math.max(0, left), Math.min(world.size, bottom) - Math.max(0, top));
    // cloud shadows
    for (const c of clouds) { const cx = (c.x + now / 1000 * c.s) % (world.size + 600) - 300, cy = c.y; if (!vis(cx, cy, c.r)) continue; ctx.fillStyle = 'rgba(0,0,0,0.09)'; ctx.beginPath(); ctx.ellipse(cx, cy, c.r, c.r * 0.6, 0.3, 0, Math.PI * 2); ctx.fill(); }
    // drops
    for (const d of S.drops) {
      if (!vis(d.x, d.y, 50)) continue;
      const bob = Math.sin(now / 250 + d.x) * 3;
      ctx.save(); ctx.translate(d.x, d.y + bob);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(0, 10 - bob, 18, 8, 0, 0, Math.PI * 2); ctx.fill();
      if (d.type === 'weapon') { ctx.shadowColor = RCOLOR[d.rarity]; ctx.shadowBlur = 16; ctx.rotate(-0.5); ctx.translate(-22, 0); drawGun(d.key, d.rarity, false); }
      else { ctx.shadowColor = '#fff'; ctx.shadowBlur = 10; ctx.font = '24px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(CICON[d.key], 0, 0); ctx.textBaseline = 'alphabetic'; if (d.count > 1) { ctx.shadowBlur = 0; ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('×' + d.count, 14, 12); } }
      ctx.restore();
    }
    // chests
    for (const c of S.chests) { const pos = world.chests.get(c[0]); if (!pos || !vis(pos.x, pos.y, 70)) continue; drawChest(pos, RARITY[c[1]], c[2], now); }
    // obstacles
    for (const o of world.obstacles) {
      if (o.t === 'r') { if (o.x + o.w < left - 20 || o.x > right + 20 || o.y + o.h < top - 20 || o.y > bottom + 20) continue; drawBuilding(o); }
      else { if (!vis(o.x, o.y, o.r + 20)) continue; if (o.k === 'tree') drawTree(o, now); else drawRock(o); }
    }
    // players
    for (const p of S.players) { if (!p.al) continue; const v = view.get(p.id); if (!v || !vis(v.x, v.y, 70)) continue; drawPlayer(p, v, now); }
    // bullets
    ctx.lineCap = 'round';
    for (const b of S.bullets) {
      const tx = b[0] - Math.cos(b[2]) * 22, ty = b[1] - Math.sin(b[2]) * 22;
      const g = ctx.createLinearGradient(tx, ty, b[0], b[1]); g.addColorStop(0, 'rgba(255,200,80,0)'); g.addColorStop(1, '#fff3a0');
      ctx.strokeStyle = g; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.fillStyle = '#fff'; circle(b[0], b[1], 2.2);
    }
    updateParticles(dt); drawParticles();
    // storm
    if (S.storm) {
      const s = S.storm;
      ctx.fillStyle = 'rgba(110, 30, 190, 0.4)'; ctx.beginPath(); ctx.rect(left - 50, top - 50, right - left + 100, bottom - top + 100); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2, true); ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(220,150,255,0.9)'; ctx.lineWidth = 6; ctx.shadowColor = '#c56cf0'; ctx.shadowBlur = 25; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([14, 18]); ctx.lineDashOffset = -now / 20; ctx.beginPath(); ctx.arc(s.x, s.y, s.r - 8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      if (s.tr < s.r) { ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3; ctx.setLineDash([12, 10]); ctx.beginPath(); ctx.arc(s.tx, s.ty, s.tr, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    }
    // world border
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 12; ctx.strokeRect(0, 0, world.size, world.size);
    ctx.restore();
    if (me && me.al && me.hp < 35) { ctx.fillStyle = `rgba(255,0,0,${(35 - me.hp) / 35 * 0.25 * (0.6 + 0.4 * Math.sin(now / 200))})`; ctx.fillRect(0, 0, W, H); }
    if (me && me.al && !touch.enabled) { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mouse.x, mouse.y, 9, 0, Math.PI * 2); ctx.moveTo(mouse.x - 14, mouse.y); ctx.lineTo(mouse.x - 5, mouse.y); ctx.moveTo(mouse.x + 5, mouse.y); ctx.lineTo(mouse.x + 14, mouse.y); ctx.moveTo(mouse.x, mouse.y - 14); ctx.lineTo(mouse.x, mouse.y - 5); ctx.moveTo(mouse.x, mouse.y + 5); ctx.lineTo(mouse.x, mouse.y + 14); ctx.stroke(); }
    if (touch.enabled) for (const st of [touch.move, touch.aim]) if (st) { ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(st.sx, st.sy, STICK_R, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = 'rgba(255,255,255,0.6)'; const v = stickVec(st); ctx.beginPath(); ctx.arc(st.sx + v.x * STICK_R, st.sy + v.y * STICK_R, 20, 0, Math.PI * 2); ctx.fill(); }
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
})();
