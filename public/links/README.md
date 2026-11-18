# Connecting a game to the parent dashboard

The dashboard lives at https://maths-royale.onrender.com/dashboard (PIN-protected). Games send answers to
`https://maths-royale.onrender.com/api/track`. The server stores only children named **Charlie** or **Leo** and drops everyone else.

Every game needs two things:

1. **`edu-tracker.js`** (in `public/` of this repo, also at https://maths-royale.onrender.com/edu-tracker.js). It counts active time
   (page visible and a touch in the last 2 minutes), sends each answer at once, keeps unsent answers on the device
   (`localStorage` key `edutrack:queue`) and flushes with `sendBeacon` when the page is hidden or closed.
2. **A few lines that hand it each answer.** For games that already keep their own record, a small link file does this without touching the game's logic.

**Always ship the tracker inside the game** (a local file or part of the bundle). Never load it from the server at run time: the
free server can be asleep and must never hold up a game.

Rules for every link: a grown-up's test play is never sent; made-up answers are never sent to the real dashboard as a child
(if real test answers go through, tell the owner so they can delete that session on the dashboard).

---

## Charlie's Quest

Link file: `charlie-quest.js` (this folder).

1. Copy `edu-tracker.js` and `charlie-quest.js` into the game folder next to `stats.js`; save the second as `charlie-quest-link.js`.
2. In **both** `index.html` and `balloons.html`, straight after the `<script src="stats.js?v=...">` line and before the inline
   script that calls `CQSTATS.install`, add (with the usual `?v=` cache-buster):

   ```html
   <script src="edu-tracker.js" data-game="Charlie's Quest" data-endpoint="https://maths-royale.onrender.com/api/track"></script>
   <script src="charlie-quest-link.js"></script>
   ```

   No `data-child`: the link starts the tracker itself, only when `CQSTATS.install` is called with `on: true`.

How it works: the link wraps `CQSTATS.install / begin / answer`, forwards the same records, then calls the originals unchanged.
Daddy play follows the same `on: !DADDY` switch, so it sends nothing. Second tries (`n2`) are listed on the dashboard but not scored.

Check before publishing: normal play makes a POST to `/api/track` that returns `{"ok":true,"saved":1}` (the first can take up to a
minute if the server was asleep; the tracker retries by itself); Daddy play makes no request; the game still works with the network blocked.

Tested against a copy of the live files of 18 Nov 2026: Test mode answers arrived with question, answer given, right answer, topic and
time; Daddy play sent nothing; Balloon Rescue records arrived. Not tested on a real iPad or iPhone.

---

## Dreamlands (Leo)

Link file: `dreamlands.js` (this folder). It is a draft written from reading `v2/src/engine/learn.js`; whoever maintains Dreamlands
should treat it as theirs to correct.

1. Add `edu-tracker.js` and then `dreamlands.js` to the v2 build so they ship inside the game, after `engine/learn.js` and `engine/players.js`.
2. Review the mapping against what the log really holds. The link listens to `LV2.on('learn:answer')` and sends, per record: subject
   (Maths / Reading), topic (from `r.k`, plus `r.mt` for maths), question (a short label + `r.w` or `r.i`), right or wrong, `r.ms`,
   land + activity, and an `uncounted` reason for `r.wu` (starting check), `r.g` (quick guess) and `r.tr === 2` (after help). The
   dashboard lists uncounted answers but leaves them out of the score. The record id is `'d' + r.t`, so a record announced twice is
   stored once. Improve any wording that would read badly to a parent.
3. It runs only when `!LV2.debugOn && !LV2.players.noReport()` and the page is `dreamlands-world.netlify.app` or
   `leopokemon3d.netlify.app`. Decide whether `LV2.learningHub?.enabled()` should also switch it off, as `parent_reporting.js` does.
4. Because the tracker is bundled it has no `data-*` attributes; the link calls `EduTracker.init({ child, game, subject, endpoint })` itself.
5. Test on a local build with `?dashboardEndpoint=http://localhost:PORT/api/track` (accepted on localhost only), run the usual tests, publish.
6. `engine/learn.js` says "Nothing here is ever sent anywhere": update that note and `LEARNING_CONSTITUTION.md` to say what is now sent and where.

The existing family-learning-progress connector is not affected.

Tested against a stand-in for `LV2` (same `on` / `emit` / `players` shape): records arrived correctly, the double announcement was
stored once, Daddy and a non-live copy sent nothing. Not run inside the real Dreamlands build or on a real iPad.

---

## Any other game

```html
<script src="edu-tracker.js" data-child="Leo" data-game="Name of the game" data-subject="Maths" data-endpoint="https://maths-royale.onrender.com/api/track"></script>
```

```js
EduTracker.shown(); // optional: when the question appears, so the time taken is exact
EduTracker.answer({ topic: 'Times tables', question: '7 × 8 = ?', given: '54', answer: '56', ok: false });
```

Optional fields on `answer`: `subject`, `level`, `ms`, `id` (re-sending the same id replaces the earlier copy), `retry: true`
(a second go: listed, not scored), `uncounted: 'reason'` (listed, not scored), `timeout`, `skipped`.
If the game asks who is playing, leave out `data-child` and call `EduTracker.init({ child: name })` once the name is known.
