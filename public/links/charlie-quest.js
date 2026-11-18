/* Links Charlie's Quest to the parent dashboard.
 *
 * Charlie's Quest already passes every answer through CQSTATS (its own on-device record). This file listens in on
 * that, and passes the same answers to the dashboard tracker. Nothing else in the game changes.
 * Daddy play is never sent: the game switches CQSTATS off for it, and this follows that switch.
 *
 * In index.html and balloons.html, straight after the stats.js line, add:
 *   <script src="edu-tracker.js" data-game="Charlie's Quest" data-endpoint="https://maths-royale.onrender.com/api/track"></script>
 *   <script src="charlie-quest-link.js"></script>
 */
(function () {
  'use strict';
  var S = window.CQSTATS, T = window.EduTracker;
  if (!S || !T || S.__dashboardLinked) return;
  S.__dashboardLinked = true;
  var CHILD = 'Charlie', GAME = "Charlie's Quest";
  var PARTS = { dungeon: 'Dungeon', quest: 'Quest', test: 'Test', balloon: 'Balloon Rescue' };
  var on = false, install = S.install, begin = S.begin, answer = S.answer;

  S.install = function (o) {
    on = !!(o && o.on);
    if (on) { try { T.init({ child: CHILD, game: GAME }); } catch (e) { /* the game must carry on regardless */ } }
    return install.apply(this, arguments);
  };
  S.begin = function () {
    if (on) { try { T.shown(); } catch (e) { /* ignore */ } }
    return begin.apply(this, arguments);
  };
  S.answer = function (r) {
    if (on && r) {
      try {
        var maths = r.k === 'maths', names = (window.MATHS && window.MATHS.NAMES) || {};
        var part = PARTS[r.g] || 'Quest';
        T.answer({
          subject: maths ? 'Maths' : 'English',
          topic: maths ? (names[r.t] || r.t || 'Maths') : r.k === 'spell' ? 'Spelling' : 'Word meanings',
          question: r.q, given: r.a, answer: r.c, ok: !!r.ok,
          level: part + (r.lv ? ' · level ' + r.lv : ''),
          retry: !!r.n2, // a second go at the same question: shown on the dashboard but not counted in the score
        });
      } catch (e) { /* ignore */ }
    }
    return answer.apply(this, arguments);
  };
})();
