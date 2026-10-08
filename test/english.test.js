'use strict';
const test = require('node:test');
const assert = require('node:assert');
const english = require('../server/english');
const { Game } = require('../server/game');

const rightAnswer = (q) => (q.kind === 'typed' ? q.answer[0] : q.answer);

test('every English question accepts its own answer and rejects wrong ones', () => {
  for (let tier = 1; tier <= 4; tier++) {
    for (let i = 0; i < 1500; i++) {
      const q = english.generate(tier, 'Charlie');
      assert.ok(q.text && q.text.length > 3, `empty text for ${q.topic}`);
      assert.ok(!/NaN|undefined|null/.test(q.text + q.display + (q.choices || []).join()), `bad text in ${q.topic}: ${q.text}`);
      assert.ok(english.check(q, rightAnswer(q)), `self-check failed for ${q.topic}: ${q.text}`);
      assert.ok(!english.check(q, 'banana'), `accepted nonsense for ${q.topic}`);
      assert.ok(!english.check(q, ''), `accepted empty for ${q.topic}`);
      if (q.choices) {
        assert.strictEqual(q.choices.length, 4, `${q.topic} should have 4 choices: ${q.text}`);
        assert.strictEqual(new Set(q.choices.map((c) => c.toLowerCase())).size, 4, `duplicate choices in ${q.topic}: ${q.choices}`);
        assert.strictEqual(q.choices.filter((c) => english.check(q, c)).length, 1, `${q.topic} must have exactly one right choice: ${q.choices}`);
      }
    }
  }
});

test('typed answers allow every correct form and ignore capitals', () => {
  const q = { kind: 'typed', answer: ['frozen', 'freezing'] };
  assert.ok(english.check(q, 'Frozen')); assert.ok(english.check(q, ' freezing ')); assert.ok(!english.check(q, 'freeze'));
});

test('each tier has a good spread of topics', () => {
  for (let t = 1; t <= 4; t++) assert.ok(english.TOPICS[t].length >= 6, `tier ${t} only has ${english.TOPICS[t].length} topics`);
});

test('English and mix subjects send English questions with choices in the game', () => {
  const g = new Game('ENGL', () => {}); clearInterval(g.timer);
  const ws = { readyState: 1, sent: [] }; ws.send = (s) => ws.sent.push(JSON.parse(s));
  const last = (t) => [...ws.sent].reverse().find((m) => m.t === t);
  const p = g.addHuman(ws, 'Charlie');
  g.handle(p, { t: 'settings', mode: 'dm', bots: 0, difficulty: 'normal', subject: 'english' });
  assert.strictEqual(g.settings.subject, 'english');
  g.handle(p, { t: 'start' });
  const chest = g.chests[0]; p.x = chest.x + 30; p.y = chest.y;
  g.handle(p, { t: 'open', id: chest.id });
  assert.strictEqual(last('question').subject, 'english');
  assert.ok(!('answer' in last('question')), 'answer must not be sent to the browser');
  g.handle(p, { t: 'answer', a: rightAnswer(p.question.q) });
  assert.strictEqual(last('result').correct, true);
  assert.strictEqual(chest.state, 'open');

  g.toLobby(); g.handle(p, { t: 'settings', subject: 'mix' }); g.handle(p, { t: 'start' });
  const seen = new Set();
  for (const c of g.chests.slice(0, 4)) { p.x = c.x + 30; p.y = c.y; p.question = null; g.handle(p, { t: 'open', id: c.id }); seen.add(last('question').subject); g.handle(p, { t: 'cancel' }); }
  assert.deepStrictEqual([...seen].sort(), ['english', 'maths']);
});
