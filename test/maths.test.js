'use strict';
const test = require('node:test');
const assert = require('node:assert');
const maths = require('../server/maths');

test('every generated question accepts its own displayed answer and rejects a wrong one', () => {
  for (let tier = 1; tier <= 4; tier++) {
    for (let i = 0; i < 1500; i++) {
      const q = maths.generate(tier, 'Charlie');
      assert.ok(q.text && q.text.length > 3, `empty text for ${q.topic}`);
      assert.ok(!/NaN|undefined/.test(q.text + q.display), `bad text/answer in ${q.topic}: ${q.text} => ${q.display}`);
      assert.ok(maths.check(q, q.display), `self-check failed for ${q.topic}: ${q.text} => ${q.display}`);
      assert.ok(!maths.check(q, 'banana'), `accepted nonsense for ${q.topic}`);
      assert.ok(!maths.check(q, ''), `accepted empty for ${q.topic}`);
    }
  }
});

test('answers are forgiving about format', () => {
  const q = { kind: 'number', answer: 0.75 };
  for (const a of ['0.75', '3/4', ' .75 ', '75%', '6/8', '0,75'.replace(',', '.')]) assert.ok(maths.check(q, a), a);
  assert.ok(maths.check({ kind: 'number', answer: 1.75 }, '1 3/4'));
  assert.ok(maths.check({ kind: 'number', answer: -10 }, '-10°C'));
  assert.ok(maths.check({ kind: 'number', answer: 12.5 }, '£12.50'));
  assert.ok(maths.check({ kind: 'number', answer: 28 }, '28 cm'));
  assert.ok(maths.check({ kind: 'number', answer: 36 }, '36cm²'));
  assert.ok(maths.check({ kind: 'remainder', answer: { q: 12, r: 3 } }, '12 R 3'));
  assert.ok(maths.check({ kind: 'remainder', answer: { q: 12, r: 3 } }, '12 remainder 3'));
  assert.ok(!maths.check({ kind: 'remainder', answer: { q: 12, r: 3 } }, '12 r 4'));
  assert.ok(maths.check({ kind: 'fraction-simplest', answer: '3/4' }, '3/4'));
  assert.ok(!maths.check({ kind: 'fraction-simplest', answer: '3/4' }, '6/8'), 'must be simplest form');
  assert.ok(maths.check({ kind: 'mixed', answer: { whole: 1, n: 3, d: 4 } }, '1 3/4'));
  assert.ok(!maths.check({ kind: 'mixed', answer: { whole: 1, n: 3, d: 4 } }, '7/4'));
  assert.ok(maths.check({ kind: 'exact', answer: 'XIX' }, 'xix'));
  assert.ok(maths.check({ kind: 'exact', answer: 'yes' }, 'Yes '));
});

test('all four tiers have a good spread of topics', () => {
  for (let t = 1; t <= 4; t++) assert.ok(maths.TOPICS[t].length >= 8, `tier ${t} only has ${maths.TOPICS[t].length} topics`);
});
