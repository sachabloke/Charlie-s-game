/* Links Leo Dreamlands to the parent dashboard.
 *
 * Dreamlands already logs every answered challenge through LV2.learn and announces it with the "learn:answer" event.
 * This file listens to that event and passes the same record to the dashboard tracker (edu-tracker.js, which must be
 * loaded first). Nothing in the game, its log or its rules changes.
 *
 * Never sent: Daddy (the developer profile), the practice child, debug builds, and any copy of the game that is not
 * the live site. Only children the dashboard knows by first name (Charlie, Leo) are stored by the server.
 * For a local check, open the game on localhost with ?dashboardEndpoint=http://localhost:PORT/api/track
 */
(function () {
  'use strict';
  var LV2 = window.LV2, T = window.EduTracker;
  if (!LV2 || !T || LV2.dashboardLink) return;
  var GAME = 'Dreamlands', ENDPOINT = 'https://maths-royale.onrender.com/api/track';
  var LIVE = /^https:\/\/(dreamlands-world|leopokemon3d)\.netlify\.app$/;
  var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var testEndpoint = local ? new URLSearchParams(location.search).get('dashboardEndpoint') : null;
  var TOPIC = { snd: 'Hearing a sound', has: 'Which word has the sound', word: 'Reading a word', tricky: 'Tricky words', sentence: 'Reading a sentence', hunt: 'Sound hunt', maths: 'Maths' };
  var ASK = { snd: 'Find the sound: ', has: 'Which word has the sound: ', word: 'Read the word: ', tricky: 'Tricky word: ', sentence: 'Read: ', hunt: 'Find things with the sound: ', maths: '' };
  var started = false;

  function allowed() {
    try { return !LV2.debugOn && !LV2.players.noReport() && (LIVE.test(location.origin) || !!testEndpoint); } catch (e) { return false; }
  }
  function start() {
    if (started) return true;
    if (!allowed()) return false;
    try { T.init({ child: LV2.players.current().name, game: GAME, subject: 'Reading', endpoint: testEndpoint || ENDPOINT }); started = true; } catch (e) { /* the game carries on regardless */ }
    return started;
  }
  function send(r) {
    if (!r || !start()) return;
    try {
      var maths = r.k === 'maths', item = r.w || r.i || '';
      var place = [r.l, r.a].filter(Boolean).join(' · ');
      T.answer({
        id: 'd' + r.t,                      // the same record can be announced twice (once early, once completed): the later one replaces it
        at: r.t,
        subject: maths ? 'Maths' : 'Reading',
        topic: maths ? 'Maths' + (r.mt ? ': ' + r.mt : '') : (TOPIC[r.k] || r.k || 'Question'),
        question: (ASK[r.k] || '') + item,
        given: r.ok ? item : 'a wrong choice', // the log keeps right or wrong, not which wrong picture was tapped
        answer: item,
        ok: !!r.ok,
        ms: typeof r.ms === 'number' ? r.ms : undefined,
        level: place,
        // listed on the dashboard but left out of the score, following the game's own rules for what counts as evidence
        uncounted: r.wu ? 'starting check' : r.g ? 'quick guess' : r.tr === 2 ? 'after help' : undefined,
      });
    } catch (e) { /* ignore */ }
  }
  LV2.dashboardLink = { allowed: allowed, send: send };
  LV2.on('ready', start);
  LV2.on('learn:answer', send);
})();
