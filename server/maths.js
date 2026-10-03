'use strict';
// Maths question generator + answer checker.
// Tiers: 1 = easy (common chests) ... 4 = hardest (legendary chests).
// Everything here is server-side so answers cannot be found in the browser.

const rand = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const simp = (n, d) => { const g = gcd(n, d) || 1; return [n / g, d / g]; };
const fracStr = (n, d) => { const [a, b] = simp(n, d); return b === 1 ? `${a}` : `${a}/${b}`; };
const round = (x, dp = 3) => Math.round(x * 10 ** dp) / 10 ** dp;

function toRoman(n) {
  const map = [[100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of map) while (n >= v) { s += r; n -= v; }
  return s;
}
const ordinal = (k) => k + (k % 10 === 1 && k !== 11 ? 'st' : k % 10 === 2 && k !== 12 ? 'nd' : k % 10 === 3 && k !== 13 ? 'rd' : 'th');
const isPrime = (n) => { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; };

// Answer kinds:
//  number            -> any numerically equal answer (3/4, 0.75, 75% all accepted when equal)
//  fraction-simplest -> must be a fraction in lowest terms
//  mixed             -> must be a mixed number like "1 3/4"
//  remainder         -> must be like "12 r 3"
//  exact             -> text match ignoring spaces/case (roman numerals, yes/no, "2/3")
const TOPICS = { 1: [], 2: [], 3: [], 4: [] };
const def = (tier, topic, fn) => TOPICS[tier].push({ topic, fn });
const num = (text, answer, extra = {}) => ({ text, kind: 'number', answer, display: String(answer), ...extra });

// ---------------- TIER 1: warm-ups ----------------
def(1, 'Times tables', () => { const a = rand(2, 12), b = rand(2, 12); return num(`${a} × ${b} = ?`, a * b); });
def(1, 'Division facts', () => { const a = rand(2, 12), b = rand(2, 12); return num(`${a * b} ÷ ${a} = ?`, b); });
def(1, 'Adding', () => { const a = rand(25, 999), b = rand(25, 999); return num(`${a} + ${b} = ?`, a + b); });
def(1, 'Taking away', () => { const a = rand(100, 999), b = rand(10, a - 10); return num(`${a} − ${b} = ?`, a - b); });
def(1, 'Rounding', () => {
  const to = pick([10, 100, 1000]); const n = rand(to === 1000 ? 1001 : 101, 9999);
  return num(`Round ${n} to the nearest ${to}.`, Math.round(n / to) * to);
});
def(1, 'Doubling and halving', () => {
  if (Math.random() < 0.5) { const n = rand(13, 99); return num(`What is double ${n}?`, n * 2); }
  const n = rand(10, 100) * 2; return num(`What is half of ${n}?`, n / 2);
});
def(1, 'Number bonds', () => {
  const total = pick([100, 100, 1000]); const a = total === 100 ? rand(1, 99) : rand(50, 950);
  return num(`${a} + ? = ${total}`, total - a);
});
def(1, 'Place value', () => {
  const digits = rand(4, 5); let n; let pos; let digit;
  do { n = rand(10 ** (digits - 1), 10 ** digits - 1); pos = rand(0, digits - 1); digit = Math.floor(n / 10 ** pos) % 10; } while (digit === 0 || String(n).split('').filter((c) => c === String(digit)).length > 1);
  return num(`What is the value of the digit ${digit} in ${n.toLocaleString('en-GB')}?`, digit * 10 ** pos, { hint: 'Think about which column the digit is in.' });
});
def(1, 'Counting in steps', () => {
  const step = pick([2, 5, 10, 25, 50, 100]); const start = step * rand(1, 8);
  const terms = [0, 1, 2, 3].map((i) => start + step * i);
  return num(`What comes next? ${terms.join(', ')}, ?`, start + step * 4);
});

// ---------------- TIER 2: Year 5 core ----------------
def(2, 'Equivalent fractions', () => {
  const d = rand(2, 6), n = rand(1, d - 1), k = rand(2, 6);
  return num(`${n}/${d} = ?/${d * k}   (what is the missing top number?)`, n * k);
});
def(2, 'Fraction of an amount', () => {
  const d = pick([2, 3, 4, 5, 6, 8, 10]); const n = rand(1, d - 1); const amount = d * rand(2, 12);
  return num(`What is ${n}/${d} of ${amount}?`, (n * amount) / d, { hint: `Divide by ${d}, then multiply by ${n}.` });
});
def(2, 'Simplifying fractions', () => {
  let n, d; do { d = rand(2, 9); n = rand(1, d - 1); } while (gcd(n, d) !== 1);
  const k = rand(2, 5);
  return { text: `Write ${n * k}/${d * k} in its simplest form.`, kind: 'fraction-simplest', answer: `${n}/${d}`, display: `${n}/${d}`, hint: 'Divide the top and bottom by the same number.' };
});
def(2, 'Adding fractions', () => {
  const d = rand(3, 12); const a = rand(1, d - 2); const b = rand(1, d - 1 - a);
  return num(`${a}/${d} + ${b}/${d} = ?   (answer as a fraction, e.g. 3/4)`, round((a + b) / d, 6), { display: fracStr(a + b, d) });
});
def(2, 'Subtracting fractions', () => {
  const d = rand(3, 12); const a = rand(2, d - 1); const b = rand(1, a - 1);
  return num(`${a}/${d} − ${b}/${d} = ?   (answer as a fraction, e.g. 3/4)`, round((a - b) / d, 6), { display: fracStr(a - b, d) });
});
const FD = [[1, 2, 0.5], [1, 4, 0.25], [3, 4, 0.75], [1, 5, 0.2], [2, 5, 0.4], [3, 5, 0.6], [4, 5, 0.8], [1, 10, 0.1], [3, 10, 0.3], [7, 10, 0.7], [9, 10, 0.9], [1, 8, 0.125], [1, 100, 0.01], [1, 20, 0.05]];
def(2, 'Fractions and decimals', () => {
  const [n, d, dec] = pick(FD);
  if (Math.random() < 0.5) return { text: `Write ${n}/${d} as a decimal.`, kind: 'decimal', answer: dec, display: String(dec) };
  return { text: `Write ${dec} as a fraction.`, kind: 'fraction', answer: dec, display: `${n}/${d}` };
});
def(2, 'Fractions and percentages', () => {
  const [n, d, dec] = pick(FD);
  if (Math.random() < 0.5) return { text: `Write ${n}/${d} as a percentage.`, kind: 'percent', answer: round(dec * 100), display: `${round(dec * 100)}%` };
  return { text: `Write ${round(dec * 100)}% as a fraction.`, kind: 'fraction', answer: dec, display: `${n}/${d}` };
});
def(2, 'Negative numbers', () => {
  const r = Math.random();
  if (r < 0.4) { const t = -rand(1, 9), drop = rand(2, 9); return num(`The temperature is ${t}°C. It drops by ${drop}°C. What is the new temperature?`, t - drop, { display: `${t - drop}°C` }); }
  if (r < 0.7) { const t = -rand(2, 12), rise = rand(3, 20); return num(`The temperature is ${t}°C. It rises by ${rise}°C. What is it now?`, t + rise, { display: `${t + rise}°C` }); }
  const a = rand(1, 9), b = rand(a + 1, 19); return num(`${a} − ${b} = ?`, a - b);
});
def(2, 'Roman numerals', () => {
  const n = rand(4, 99);
  if (Math.random() < 0.5) return num(`What number is ${toRoman(n)} in Roman numerals?`, n);
  return { text: `Write ${n} in Roman numerals.`, kind: 'exact', answer: toRoman(n), display: toRoman(n) };
});
def(2, 'Measures', () => {
  const r = rand(1, 5);
  if (r === 1) { const cm = rand(2, 9) * 100 + pick([0, 50, 25, 75]); return num(`How many metres is ${cm} cm?`, cm / 100, { display: `${cm / 100} m` }); }
  if (r === 2) { const kg = rand(1, 9) + pick([0, 0.5, 0.25]); return num(`How many grams are in ${kg} kg?`, kg * 1000, { display: `${kg * 1000} g` }); }
  if (r === 3) { const h = rand(2, 6); return num(`How many minutes are in ${h} hours?`, h * 60); }
  if (r === 4) { const m = rand(1, 9) + pick([0.2, 0.5, 0.75]); return num(`How many centimetres is ${m} m?`, round(m * 100), { display: `${round(m * 100)} cm` }); }
  const l = rand(1, 5) + pick([0.5, 0.25, 0]); return num(`How many millilitres are in ${l} litres?`, l * 1000, { display: `${l * 1000} ml` });
});
def(2, 'Multiplying and dividing by 10, 100, 1000', () => {
  const by = pick([10, 100, 1000]);
  if (Math.random() < 0.5) { const n = rand(2, 99) + pick([0, 0, 0.5, 0.2, 0.7]); return num(`${n} × ${by} = ?`, round(n * by)); }
  const n = rand(2, 99) * pick([1, 10, 100]); return num(`${n} ÷ ${by} = ?`, round(n / by, 4));
});
def(2, 'Perimeter', () => {
  const w = rand(3, 20), h = rand(2, 15);
  return num(`A rectangle is ${w} cm long and ${h} cm wide. What is its perimeter in cm?`, 2 * (w + h), { hint: 'Add all four sides.' });
});
def(2, 'Big adding and subtracting', () => {
  const a = rand(1000, 9999), b = rand(1000, 9999);
  if (Math.random() < 0.5) return num(`${a} + ${b} = ?`, a + b);
  const [big, small] = a > b ? [a, b] : [b, a]; return num(`${big} − ${small} = ?`, big - small);
});
def(2, 'Decimals', () => {
  const a = rand(10, 99) / 10, b = rand(10, 99) / 10;
  if (Math.random() < 0.5) return num(`${a} + ${b} = ?`, round(a + b));
  const [big, small] = a > b ? [a, b] : [b, a]; return num(`${big} − ${small} = ?`, round(big - small));
});

// ---------------- TIER 3: Year 5/6 ----------------
def(3, 'Percentages of amounts', () => {
  const [p, mult] = pick([[10, 10], [20, 5], [25, 4], [50, 2], [75, 4], [5, 20]]);
  const amount = mult * rand(2, 15);
  return num(`What is ${p}% of ${amount}?`, (p * amount) / 100, { hint: '10% means divide by 10.' });
});
def(3, 'Area', () => {
  if (Math.random() < 0.6) { const w = rand(3, 15), h = rand(2, 12); return num(`A rectangle is ${w} cm long and ${h} cm wide. What is its area in cm²?`, w * h); }
  const b = rand(2, 12) * 2, h = rand(2, 12); return num(`A triangle has a base of ${b} cm and a height of ${h} cm. What is its area in cm²?`, (b * h) / 2, { hint: 'Area of a triangle = base × height ÷ 2.' });
});
def(3, 'Angles', () => {
  const r = rand(1, 4);
  if (r === 1) { const a = rand(20, 160); return num(`Two angles make a straight line. One is ${a}°. What is the other?`, 180 - a); }
  if (r === 2) { const a = rand(20, 100), b = rand(20, 150 - a); return num(`A triangle has angles of ${a}° and ${b}°. What is the third angle?`, 180 - a - b, { hint: 'Angles in a triangle add up to 180°.' }); }
  if (r === 3) { const a = rand(40, 200), b = rand(40, 300 - a); return num(`Three angles meet at a point. Two of them are ${a}° and ${b}°. What is the third?`, 360 - a - b, { hint: 'Angles around a point add up to 360°.' }); }
  const a = rand(10, 80); return num(`A right angle is split into two. One part is ${a}°. What is the other part?`, 90 - a);
});
def(3, 'Division with remainders', () => {
  const a = rand(3, 9), q = rand(10, 99), r = rand(1, a - 1);
  return { text: `${a * q + r} ÷ ${a} = ?   (write it like 12 r 3)`, kind: 'remainder', answer: { q, r }, display: `${q} r ${r}` };
});
def(3, 'Mixed numbers', () => {
  const d = rand(2, 6); const whole = rand(1, 4); let part; do { part = rand(1, d - 1); } while (gcd(part, d) !== 1);
  const n = whole * d + part;
  if (Math.random() < 0.5) return { text: `Write ${n}/${d} as a mixed number (like 1 3/4).`, kind: 'mixed', answer: { whole, n: part, d }, display: `${whole} ${part}/${d}` };
  return { text: `Write ${whole} ${part}/${d} as an improper fraction (top-heavy).`, kind: 'fraction-simplest', answer: `${n}/${d}`, display: `${n}/${d}` };
});
def(3, 'Adding fractions (different bottoms)', () => {
  const d1 = pick([2, 3, 4, 5, 6]); const k = d1 <= 4 ? rand(2, 3) : 2; const d2 = d1 * k;
  const a = rand(1, d1 - 1), b = rand(1, d2 - 1);
  const n = a * k + b;
  return num(`${a}/${d1} + ${b}/${d2} = ?   (answer as a fraction)`, round(n / d2, 6), { display: fracStr(n, d2), hint: `Change ${a}/${d1} into ${k * a}/${d2} first.` });
});
def(3, 'Multiplying bigger numbers', () => {
  if (Math.random() < 0.5) { const a = rand(12, 99), b = rand(3, 9); return num(`${a} × ${b} = ?`, a * b); }
  const a = rand(100, 999), b = rand(3, 9); return num(`${a} × ${b} = ?`, a * b);
});
def(3, 'Comparing fractions', () => {
  let a, b, c, d; do { b = rand(2, 9); a = rand(1, b - 1); d = rand(2, 9); c = rand(1, d - 1); } while (a * d === c * b || b === d);
  const bigger = a / b > c / d ? `${a}/${b}` : `${c}/${d}`;
  return { text: `Which fraction is bigger: ${a}/${b} or ${c}/${d}?`, kind: 'exact', answer: bigger, display: bigger, hint: 'Try giving them the same bottom number.' };
});
def(3, 'Square numbers', () => {
  const n = rand(2, 12);
  if (Math.random() < 0.5) return num(`What is ${n} squared (${n}²)?`, n * n);
  return num(`Which number multiplied by itself makes ${n * n}?`, n);
});
def(3, 'Primes, factors and multiples', () => {
  const r = rand(1, 4);
  if (r === 1) { const n = rand(2, 50); return { text: `Is ${n} a prime number? (yes or no)`, kind: 'exact', answer: isPrime(n) ? 'yes' : 'no', display: isPrime(n) ? 'yes' : 'no' }; }
  if (r === 2) { const n = rand(3, 12), k = rand(3, 9); return num(`What is the ${ordinal(k)} multiple of ${n}?`, n * k); }
  if (r === 3) { const g = pick([2, 3, 4, 5, 6]); const a = g * rand(2, 5); let b; do { b = g * rand(2, 6); } while (b === a); return num(`What is the highest common factor of ${a} and ${b}?`, gcd(a, b)); }
  const a = pick([2, 3, 4, 5, 6]); let b; do { b = pick([3, 4, 5, 6, 8]); } while (b === a); return num(`What is the lowest common multiple of ${a} and ${b}?`, (a * b) / gcd(a, b));
});
def(3, 'Number sequences', () => {
  const step = pick([3, 4, 6, 7, 8, 9, 11, 12, -3, -5, -7]); const start = step > 0 ? rand(1, 30) : rand(20, 50);
  const terms = [0, 1, 2, 3].map((i) => start + step * i);
  return num(`What comes next? ${terms.join(', ')}, ?`, start + step * 4);
});
def(3, 'Time', () => {
  const h1 = rand(1, 10), m1 = pick([0, 15, 30, 45]); const mins = rand(2, 9) * 15;
  const total = h1 * 60 + m1 + mins; const h2 = Math.floor(total / 60), m2 = total % 60;
  return num(`A film starts at ${h1}:${String(m1).padStart(2, '0')} and finishes at ${h2}:${String(m2).padStart(2, '0')}. How many minutes long is it?`, mins);
});
def(3, 'Rounding decimals', () => {
  const n = rand(100, 999) / 100;
  if (Math.random() < 0.5) return num(`Round ${n} to the nearest whole number.`, Math.round(n));
  return num(`Round ${n} to one decimal place.`, Math.round(n * 10) / 10);
});

// ---------------- TIER 4: Year 6 challenge ----------------
def(4, 'Long multiplication', () => { const a = rand(12, 99), b = rand(12, 99); return num(`${a} × ${b} = ?`, a * b); });
def(4, 'Long division', () => {
  const b = rand(11, 25), q = rand(12, 60);
  if (Math.random() < 0.6) return num(`${b * q} ÷ ${b} = ?`, q);
  const r = rand(1, b - 1); return { text: `${b * q + r} ÷ ${b} = ?   (write it like 12 r 3)`, kind: 'remainder', answer: { q, r }, display: `${q} r ${r}` };
});
def(4, 'Order of operations (BIDMAS)', () => {
  const a = rand(2, 9), b = rand(2, 9), c = rand(2, 9);
  const t = rand(1, 6);
  if (t === 1) return num(`${a} + ${b} × ${c} = ?`, a + b * c, { hint: 'Multiply before you add.' });
  if (t === 2) return num(`(${a} + ${b}) × ${c} = ?`, (a + b) * c, { hint: 'Brackets first.' });
  if (t === 3) { const cc = Math.min(c, a * b - 1); return num(`${a} × ${b} − ${cc} = ?`, a * b - cc); }
  if (t === 4) return num(`${a * b} ÷ ${a} + ${c} = ?`, b + c, { hint: 'Divide before you add.' });
  if (t === 5) return num(`${a}² + ${b} = ?`, a * a + b);
  const big = b * c + rand(2, 20); return num(`${big} − ${b} × ${c} = ?`, big - b * c, { hint: 'Multiply before you subtract.' });
});
def(4, 'Multiplying fractions', () => {
  const r = rand(1, 3);
  if (r === 1) { const d = rand(2, 6), n = rand(1, d - 1), w = d * rand(2, 6); return num(`${n}/${d} × ${w} = ?`, (n * w) / d); }
  if (r === 2) { const d1 = rand(2, 5), n1 = rand(1, d1 - 1), d2 = rand(2, 5), n2 = rand(1, d2 - 1); return num(`${n1}/${d1} × ${n2}/${d2} = ?   (answer as a fraction)`, round((n1 * n2) / (d1 * d2), 6), { display: fracStr(n1 * n2, d1 * d2), hint: 'Multiply the tops, multiply the bottoms.' }); }
  const d = rand(2, 5), w = rand(2, 5); return num(`1/${d} ÷ ${w} = ?   (answer as a fraction)`, round(1 / (d * w), 6), { display: `1/${d * w}` });
});
def(4, 'Trickier percentages', () => {
  const p = pick([15, 30, 35, 40, 45, 60, 70, 80, 90]); const amount = 20 * rand(2, 20);
  return num(`What is ${p}% of ${amount}?`, (p * amount) / 100, { hint: 'Find 10% first, then build it up.' });
});
def(4, 'Ratio', () => {
  let a, b; do { a = rand(1, 5); b = rand(1, 6); } while (a === b);
  const k = rand(2, 8); const total = (a + b) * k;
  return num(`Sweets are shared in the ratio ${a}:${b}. There are ${total} sweets altogether. How many does the first person get?`, a * k, { hint: `There are ${a + b} parts in total.` });
});
def(4, 'Algebra', () => {
  const m = rand(2, 6), n = rand(2, 12), c = rand(1, 15);
  if (Math.random() < 0.5) return num(`${m}n + ${c} = ${m * n + c}.   What is n?`, n);
  return num(`${m}y − ${c} = ${m * n - c}.   What is y?`, n);
});
def(4, 'Mean (average)', () => {
  const mean = rand(4, 20); const count = rand(3, 5);
  let nums, last;
  do { nums = []; let sum = 0; for (let i = 0; i < count - 1; i++) { const v = rand(Math.max(1, mean - 5), mean + 5); nums.push(v); sum += v; } last = mean * count - sum; } while (last < 1 || last > mean + 8);
  nums.push(last);
  return num(`What is the mean of ${nums.join(', ')}?`, mean, { hint: 'Add them up, then divide by how many there are.' });
});
def(4, 'Decimal multiplying and dividing', () => {
  if (Math.random() < 0.5) { const a = rand(2, 19) / 10, b = rand(2, 9); return num(`${a} × ${b} = ?`, round(a * b)); }
  const b = rand(2, 9), q = rand(2, 19) / 10; return num(`${round(q * b)} ÷ ${b} = ?`, q);
});
def(4, 'Angles in shapes', () => {
  if (Math.random() < 0.5) { const a = rand(50, 120), b = rand(50, 120), c = rand(40, 300 - a - b); return num(`A four-sided shape has angles of ${a}°, ${b}° and ${c}°. What is the fourth angle?`, 360 - a - b - c, { hint: 'Angles in a quadrilateral add up to 360°.' }); }
  const top = rand(10, 80) * 2; return num(`An isosceles triangle has a top angle of ${top}°. What size is each of the other two (equal) angles?`, (180 - top) / 2);
});
def(4, 'Shape puzzles', () => {
  if (Math.random() < 0.5) { const s = rand(3, 12); return num(`A square has a perimeter of ${s * 4} cm. What is its area in cm²?`, s * s); }
  const b = rand(3, 12), h = rand(2, 10); return num(`A parallelogram has a base of ${b} cm and a height of ${h} cm. What is its area in cm²?`, b * h);
});
def(4, 'Money problems', (name) => {
  const price = rand(1, 5) + pick([0.5, 0.25, 0.75, 0.99]); const qty = rand(2, 4); const pay = pick([10, 20, 20, 50]);
  const cost = round(price * qty, 2); if (cost > pay) return num(`${name} buys ${qty} comics at £${price.toFixed(2)} each. How much do they cost altogether?`, cost, { display: `£${cost.toFixed(2)}` });
  return num(`${name} has £${pay} and buys ${qty} comics at £${price.toFixed(2)} each. How much change is there?`, round(pay - cost, 2), { display: `£${(pay - cost).toFixed(2)}` });
});

// ---------------- public API ----------------
function generate(tier, name = 'Charlie', avoidTopic = null) {
  tier = Math.min(4, Math.max(1, tier));
  let list = TOPICS[tier];
  if (avoidTopic && list.length > 1) list = list.filter((t) => t.topic !== avoidTopic);
  const t = pick(list);
  const q = t.fn(name);
  return { topic: t.topic, tier, text: q.text, kind: q.kind, answer: q.answer, display: q.display, hint: q.hint || null };
}

function parseNumeric(input) {
  let s = String(input).trim().toLowerCase().replace(/−/g, '-').replace(/,/g, '');
  s = s.replace(/£|\$|%|°c|°|degrees|cm²|cm2|cm|mm|km|kg|ml|mins?|minutes|hours?|litres?|grams?|metres?|\bm\b|\bg\b|\bl\b|\bp\b/g, '').trim();
  let m = s.match(/^(-?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (m) { const sign = m[1] ? -1 : 1; const d = +m[4]; if (!d) return null; return sign * (+m[2] + +m[3] / d); }
  m = s.match(/^(-?\d+)\s*\/\s*(-?\d+)$/);
  if (m) { const d = +m[2]; if (!d) return null; return +m[1] / d; }
  if (/^-?\d*\.?\d+$/.test(s)) return parseFloat(s);
  return null;
}
const norm = (s) => { s = String(s).toLowerCase().replace(/[\s!.]+/g, ''); if (s === 'y') return 'yes'; if (s === 'n') return 'no'; return s; };
const close = (v, ans) => Math.abs(v - ans) <= Math.min(0.0011, Math.max(1e-9, Math.abs(ans) * 0.002));

function check(q, input) {
  if (input == null) return false;
  const s = String(input).trim();
  if (!s) return false;
  switch (q.kind) {
    case 'number': {
      const v = parseNumeric(s); if (v === null) return false;
      if (close(v, q.answer)) return true;
      return s.includes('%') && close(v / 100, q.answer); // "75%" for 0.75
    }
    case 'decimal': { // must be written as a decimal like 0.75
      if (!/^-?\d*\.\d+$/.test(s.replace(/\s+/g, '')) && !/^-?\d+$/.test(s.trim())) return false;
      const v = parseNumeric(s); return v !== null && close(v, q.answer);
    }
    case 'fraction': { // must be written as a fraction like 3/4 (any equivalent fraction is fine)
      const m = s.replace(/\s+/g, '').match(/^(-?\d+)\/(\d+)$/); if (!m || !+m[2]) return false;
      return close(+m[1] / +m[2], q.answer);
    }
    case 'percent': { // a number, optionally with %
      if (s.includes('/')) return false; const v = parseNumeric(s); return v !== null && close(v, q.answer);
    }
    case 'fraction-simplest': {
      const m = s.replace(/\s+/g, '').match(/^(-?\d+)\/(\d+)$/);
      const [an, ad] = q.answer.split('/').map(Number);
      if (!m) { const v = parseNumeric(s); return ad === 1 && v !== null && v === an; }
      const n = +m[1], d = +m[2]; if (!d) return false;
      return gcd(n, d) === 1 && n * ad === an * d;
    }
    case 'mixed': {
      const m = s.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
      if (!m) return false;
      const whole = +m[1], n = +m[2], d = +m[3]; if (!d) return false;
      return whole === q.answer.whole && n * q.answer.d === q.answer.n * d && gcd(n, d) === 1;
    }
    case 'remainder': {
      const m = s.toLowerCase().match(/^(\d+)\s*(?:r|rem|remainder)\.?\s*(\d+)$/);
      return !!m && +m[1] === q.answer.q && +m[2] === q.answer.r;
    }
    case 'exact': return norm(s) === norm(q.answer);
    default: return false;
  }
}

const allTopics = () => Object.values(TOPICS).flat().map((t) => t.topic);
module.exports = { generate, check, parseNumeric, allTopics, TOPICS };
