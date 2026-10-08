'use strict';
// English question generator + answer checker (Year 5/6, autumn term).
// Same shape as maths.js so the game can use either: generate(tier, ...) and check(q, input).
// Tiers: 1 = easy (common chests) ... 4 = hardest (legendary chests).
// Most questions are multiple choice (q.choices); a few are typed (q.accept lists every right answer).

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const shuffle = (arr) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sample = (arr, n) => shuffle(arr).slice(0, n);
// Multiple choice: the right answer plus three wrong ones, shuffled.
const mc = (text, answer, wrong, extra = {}) => ({ text, kind: 'choice', answer, display: answer, choices: shuffle([answer, ...sample(wrong.filter((w) => w !== answer), 3)]), ...extra });
// Typed answer: any word in `accept` is right.
const typed = (text, accept, extra = {}) => ({ text, kind: 'typed', answer: accept, display: accept.join(' or '), ...extra });

const TOPICS = { 1: [], 2: [], 3: [], 4: [] };
const def = (tier, topic, fn, extraSeconds = 0) => TOPICS[tier].push({ topic, fn, extraSeconds });

// ---------------- word banks ----------------
// Each sentence has one clear noun, verb, adjective and adverb.
const SENTENCES = [
  { s: 'The ancient castle loomed silently over the valley.', noun: 'castle', verb: 'loomed', adjective: 'ancient', adverb: 'silently' },
  { s: 'A hungry fox crept cautiously through the hedge.', noun: 'fox', verb: 'crept', adjective: 'hungry', adverb: 'cautiously' },
  { s: 'The icy wind howled angrily around the cottage.', noun: 'cottage', verb: 'howled', adjective: 'icy', adverb: 'angrily' },
  { s: 'Golden sunlight danced gently on the lake.', noun: 'lake', verb: 'danced', adjective: 'Golden', adverb: 'gently' },
  { s: 'The nervous explorer stepped slowly into the cave.', noun: 'cave', verb: 'stepped', adjective: 'nervous', adverb: 'slowly' },
  { s: 'Huge waves crashed violently against the rocks.', noun: 'rocks', verb: 'crashed', adjective: 'Huge', adverb: 'violently' },
  { s: 'The tiny robin sang cheerfully from the branch.', noun: 'robin', verb: 'sang', adjective: 'tiny', adverb: 'cheerfully' },
  { s: 'A mysterious figure waited patiently by the gate.', noun: 'gate', verb: 'waited', adjective: 'mysterious', adverb: 'patiently' },
  { s: 'The exhausted runner collapsed suddenly on the grass.', noun: 'grass', verb: 'collapsed', adjective: 'exhausted', adverb: 'suddenly' },
  { s: 'Thick fog drifted lazily across the moor.', noun: 'moor', verb: 'drifted', adjective: 'Thick', adverb: 'lazily' },
  { s: 'The brave knight rode proudly into the village.', noun: 'village', verb: 'rode', adjective: 'brave', adverb: 'proudly' },
  { s: 'A gloomy forest stretched endlessly towards the mountains.', noun: 'mountains', verb: 'stretched', adjective: 'gloomy', adverb: 'endlessly' },
  { s: 'The curious kitten pounced playfully on the string.', noun: 'string', verb: 'pounced', adjective: 'curious', adverb: 'playfully' },
  { s: 'Crisp leaves swirled wildly in the playground.', noun: 'playground', verb: 'swirled', adjective: 'Crisp', adverb: 'wildly' },
  { s: 'The old door creaked loudly in the darkness.', noun: 'darkness', verb: 'creaked', adjective: 'old', adverb: 'loudly' },
  { s: 'A shimmering river flowed quietly past the mill.', noun: 'mill', verb: 'flowed', adjective: 'shimmering', adverb: 'quietly' },
  { s: 'The furious giant stamped heavily across the bridge.', noun: 'bridge', verb: 'stamped', adjective: 'furious', adverb: 'heavily' },
  { s: 'Bright stars twinkled faintly above the desert.', noun: 'desert', verb: 'twinkled', adjective: 'Bright', adverb: 'faintly' },
];
const CLASSES = ['noun', 'verb', 'adjective', 'adverb'];

// Word families: adverb, adjective, noun.
const FAMILIES = [
  ['bravely', 'brave', 'bravery'], ['happily', 'happy', 'happiness'], ['angrily', 'angry', 'anger'],
  ['silently', 'silent', 'silence'], ['proudly', 'proud', 'pride'], ['curiously', 'curious', 'curiosity'],
  ['beautifully', 'beautiful', 'beauty'], ['dangerously', 'dangerous', 'danger'], ['mysteriously', 'mysterious', 'mystery'],
  ['nervously', 'nervous', 'nerves'], ['gracefully', 'graceful', 'grace'], ['powerfully', 'powerful', 'power'],
];
const PLAIN_VERBS = ['whisper', 'gallop', 'shiver', 'explore', 'tumble', 'scramble', 'wander', 'giggle'];

// Verb -> adjectives made from it, with a sentence that needs the adjective.
const VERB_ADJ = [
  { verb: 'sparkle', adj: ['sparkling'], s: 'The ___ sea stretched out to the horizon.' },
  { verb: 'crumble', adj: ['crumbling', 'crumbled'], s: 'Ivy covered the ___ walls of the old tower.' },
  { verb: 'freeze', adj: ['frozen', 'freezing'], s: 'We skated across the ___ pond.' },
  { verb: 'break', adj: ['broken'], s: 'The wind whistled through the ___ window.' },
  { verb: 'twist', adj: ['twisted', 'twisting'], s: 'The ___ branches clawed at the sky.' },
  { verb: 'abandon', adj: ['abandoned'], s: 'Nobody had lived in the ___ house for years.' },
  { verb: 'tower', adj: ['towering'], s: 'The ___ cliffs cast long shadows over the beach.' },
  { verb: 'flicker', adj: ['flickering', 'flickered'], s: 'The ___ candle lit up the cellar.' },
  { verb: 'haunt', adj: ['haunted', 'haunting'], s: 'Everyone said the ___ mansion was full of ghosts.' },
  { verb: 'scorch', adj: ['scorched', 'scorching'], s: 'Nothing grew on the ___ earth of the desert.' },
  { verb: 'gleam', adj: ['gleaming'], s: 'A ___ sword lay on the stone table.' },
  { verb: 'rot', adj: ['rotten', 'rotting'], s: 'The ___ planks of the bridge snapped under his feet.' },
  { verb: 'enchant', adj: ['enchanted', 'enchanting'], s: 'Deep in the ___ forest, the trees could talk.' },
  { verb: 'shimmer', adj: ['shimmering'], s: 'A ___ mist hung over the lake.' },
  { verb: 'howl', adj: ['howling'], s: 'The ___ wind rattled the shutters.' },
  { verb: 'shatter', adj: ['shattered'], s: 'Pieces of ___ glass glittered on the floor.' },
  { verb: 'sway', adj: ['swaying'], s: 'The ___ palm trees bent in the breeze.' },
  { verb: 'terrify', adj: ['terrified', 'terrifying'], s: 'The ___ villagers hid inside their homes.' },
];
// Sentences where a verb has been turned into an adjective (word = the adjective).
const VERB_ADJ_SPOT = [
  { s: 'The crumbling bridge wobbled as we crossed.', w: 'crumbling', others: ['bridge', 'wobbled', 'crossed'] },
  { s: 'A howling wolf woke the sleeping campers.', w: 'howling', others: ['wolf', 'woke', 'campers'] },
  { s: 'Broken branches blocked the narrow path.', w: 'Broken', others: ['branches', 'blocked', 'path'] },
  { s: 'The twinkling lights filled the hall with colour.', w: 'twinkling', others: ['lights', 'filled', 'colour'] },
  { s: 'Frozen puddles cracked under our boots.', w: 'Frozen', others: ['puddles', 'cracked', 'boots'] },
  { s: 'The abandoned ship drifted towards the shore.', w: 'abandoned', others: ['ship', 'drifted', 'shore'] },
];

const POSSIBILITY_LOW = ['perhaps', 'possibly', 'maybe'];
const POSSIBILITY_HIGH = ['definitely', 'certainly', 'clearly', 'obviously'];
const POSSIBILITY_ALL = [...POSSIBILITY_LOW, ...POSSIBILITY_HIGH, 'probably', 'surely'];
const NOT_POSSIBILITY = ['quickly', 'yesterday', 'loudly', 'carefully', 'outside', 'soon', 'gently', 'everywhere'];

// Expanded noun phrases: phrase + head noun + other words in it.
const ENP = [
  { p: 'the gnarled old oak tree', head: 'tree', others: ['gnarled', 'old', 'the'] },
  { p: 'a crumbling stone wall covered in ivy', head: 'wall', others: ['crumbling', 'covered', 'ivy'] },
  { p: 'the silver dragon with emerald eyes', head: 'dragon', others: ['silver', 'emerald', 'eyes'] },
  { p: 'a tiny wooden boat bobbing on the waves', head: 'boat', others: ['tiny', 'wooden', 'waves'] },
  { p: 'the dark, damp cave beneath the mountain', head: 'cave', others: ['dark', 'damp', 'mountain'] },
  { p: 'an enormous spider with hairy legs', head: 'spider', others: ['enormous', 'hairy', 'legs'] },
  { p: 'the bustling market in the town square', head: 'market', others: ['bustling', 'town', 'square'] },
  { p: 'a rusty iron key under the doormat', head: 'key', others: ['rusty', 'iron', 'doormat'] },
];
const NOT_ENP = ['the tree', 'a dragon', 'ran very fast', 'under the bridge', 'quickly and quietly', 'was jumping', 'a cave', 'after lunch', 'shouted loudly'];

// Verbs for tense questions.
const VERBS = [
  { base: 'climb', s: 'climbs', past: 'climbed', ing: 'climbing', pp: 'climbed', obj: 'the mountain' },
  { base: 'write', s: 'writes', past: 'wrote', ing: 'writing', pp: 'written', obj: 'a letter' },
  { base: 'eat', s: 'eats', past: 'ate', ing: 'eating', pp: 'eaten', obj: 'the sandwich' },
  { base: 'find', s: 'finds', past: 'found', ing: 'finding', pp: 'found', obj: 'the treasure' },
  { base: 'build', s: 'builds', past: 'built', ing: 'building', pp: 'built', obj: 'a den' },
  { base: 'explore', s: 'explores', past: 'explored', ing: 'exploring', pp: 'explored', obj: 'the cave' },
  { base: 'paint', s: 'paints', past: 'painted', ing: 'painting', pp: 'painted', obj: 'a picture' },
  { base: 'sing', s: 'sings', past: 'sang', ing: 'singing', pp: 'sung', obj: 'a song' },
  { base: 'draw', s: 'draws', past: 'drew', ing: 'drawing', pp: 'drawn', obj: 'a map' },
  { base: 'catch', s: 'catches', past: 'caught', ing: 'catching', pp: 'caught', obj: 'the ball' },
  { base: 'throw', s: 'throws', past: 'threw', ing: 'throwing', pp: 'thrown', obj: 'the frisbee' },
  { base: 'read', s: 'reads', past: 'read', ing: 'reading', pp: 'read', obj: 'a comic' },
];
const SUBJECTS = ['The explorer', 'My sister', 'The fox', 'Our teacher', 'The pirate', 'Grandad'];
const TENSES = {
  'simple present': (v) => v.s,
  'simple past': (v) => v.past,
  'future': (v) => `will ${v.base}`,
  'present progressive': (v) => `is ${v.ing}`,
  'past progressive': (v) => `was ${v.ing}`,
  'present perfect': (v) => `has ${v.pp}`,
  'past perfect': (v) => `had ${v.pp}`,
};

// Powerful vocabulary: plain word -> ambitious synonyms. Groups do not overlap in meaning.
const SYNONYMS = [
  ['big', ['enormous', 'colossal', 'immense', 'gigantic']], ['small', ['tiny', 'minuscule', 'miniature']],
  ['scared', ['terrified', 'petrified', 'horrified']], ['happy', ['delighted', 'elated', 'overjoyed', 'jubilant']],
  ['sad', ['miserable', 'heartbroken', 'sorrowful']], ['angry', ['furious', 'livid', 'enraged']],
  ['cold', ['freezing', 'icy', 'frosty', 'bitter']], ['dark', ['gloomy', 'murky', 'shadowy', 'pitch-black']],
  ['old', ['ancient', 'antique', 'crumbling']], ['shiny', ['gleaming', 'glistening', 'dazzling']],
  ['loud', ['deafening', 'thunderous', 'ear-splitting']], ['tired', ['exhausted', 'weary', 'drained']],
  ['hot', ['scorching', 'sweltering', 'blazing']], ['quiet', ['silent', 'hushed', 'peaceful']],
  ['fast', ['swift', 'rapid', 'speedy']], ['brave', ['courageous', 'fearless', 'heroic']],
  ['strange', ['peculiar', 'bizarre', 'odd']], ['wet', ['soaked', 'drenched', 'sodden']],
];
const SAID = [['said quietly', ['whispered', 'murmured', 'muttered']], ['said loudly', ['bellowed', 'roared', 'yelled']], ['said sadly', ['sobbed', 'wept', 'wailed']], ['said happily', ['giggled', 'chuckled', 'beamed']]];
const WALKED = [['walked slowly', ['trudged', 'plodded', 'dawdled']], ['walked quietly', ['crept', 'tiptoed', 'sneaked']], ['walked quickly', ['dashed', 'hurried', 'raced']], ['walked proudly', ['strutted', 'marched', 'paraded']]];

const TECHNIQUES = {
  simile: ['The snow was as white as a sheet.', 'He ran like a cheetah chasing its dinner.', 'Her eyes sparkled like diamonds.', 'The classroom was as noisy as a zoo.', 'The clouds drifted like cotton wool across the sky.'],
  metaphor: ['The moon was a silver coin in the sky.', 'My brother is a couch potato.', 'The classroom was a zoo.', 'The stars were diamonds scattered on black velvet.', 'Time is a thief.'],
  personification: ['The wind whispered secrets through the trees.', 'The old house groaned in the storm.', 'The sun smiled down on the beach.', 'The flames danced in the fireplace.', 'The angry sea swallowed the little boat.'],
  alliteration: ['Seven slippery snakes slid silently south.', 'The big brown bear bounced on the bed.', 'Dark, dangerous dungeons lay deep below.', 'Freezing fog filled the forest.', 'Peter picked a perfect pumpkin.'],
  onomatopoeia: ['Crash! The plates smashed onto the floor.', 'The bees buzzed around the flowers.', 'Splash! Charlie jumped into the pool.', 'The door creaked and the floorboards thudded.', 'Bang! The firework exploded.'],
  hyperbole: ['I have told you a million times!', 'This bag weighs a tonne.', 'I am so hungry I could eat a horse.', 'I waited forever for the bus.', 'My teacher is older than the dinosaurs.'],
};

// Vocabulary in context.
const CONTEXT = [
  { s: 'After walking all day without food, the knight was famished.', w: 'famished', a: 'very hungry', x: ['very tired', 'very angry', 'very lost'] },
  { s: 'The cave was so dark and murky that we could barely see.', w: 'murky', a: 'dark and hard to see through', x: ['very wet', 'very small', 'bright and sunny'] },
  { s: 'The children were elated when they won the competition.', w: 'elated', a: 'extremely happy', x: ['very confused', 'a little bored', 'very nervous'] },
  { s: 'The explorer peered cautiously around the corner.', w: 'cautiously', a: 'carefully, watching for danger', x: ['very quickly', 'noisily', 'angrily'] },
  { s: 'Rain fell incessantly for three whole weeks.', w: 'incessantly', a: 'without stopping', x: ['very lightly', 'only at night', 'sideways'] },
  { s: 'The ruined castle was desolate; not a single person lived there.', w: 'desolate', a: 'empty and lonely', x: ['busy and crowded', 'brand new', 'brightly painted'] },
  { s: 'She was reluctant to jump into the freezing water.', w: 'reluctant', a: 'not wanting to do something', x: ['very excited', 'unable to swim', 'in a hurry'] },
  { s: 'The thief vanished into the crowd before anyone could catch him.', w: 'vanished', a: 'disappeared', x: ['shouted', 'fell over', 'stood still'] },
  { s: 'The meadow was tranquil, with only the hum of bees to be heard.', w: 'tranquil', a: 'calm and peaceful', x: ['noisy and busy', 'dangerous', 'muddy'] },
  { s: 'Charlie was baffled by the riddle and could not work it out.', w: 'baffled', a: 'confused', x: ['amused', 'bored', 'frightened'] },
  { s: 'The giant\'s footsteps were so colossal they shook the houses.', w: 'colossal', a: 'extremely large', x: ['very quiet', 'very quick', 'very gentle'] },
  { s: 'The soldiers were weary after marching through the night.', w: 'weary', a: 'very tired', x: ['very brave', 'very hungry', 'very cheerful'] },
  { s: 'The ancient map was so fragile that it tore when touched.', w: 'fragile', a: 'easily broken or damaged', x: ['very valuable', 'very large', 'easy to read'] },
  { s: 'The crowd was jubilant as the team lifted the trophy.', w: 'jubilant', a: 'full of joy and celebration', x: ['silent and sad', 'worried', 'sleepy'] },
];

// Short biographies for Black History Month (facts in order).
const BIOS = [
  { name: 'Mary Seacole', events: [['1805', 'was born in Kingston, Jamaica'], ['1854', 'travelled to London and offered to help nurse soldiers in the Crimean War'], ['1855', 'opened the British Hotel near the battlefield to care for sick and injured soldiers'], ['1857', 'published her life story, called Wonderful Adventures of Mrs Seacole in Many Lands']] },
  { name: 'Walter Tull', events: [['1888', 'was born in Folkestone, Kent'], ['1909', 'signed for Tottenham Hotspur, becoming one of the first Black professional footballers in England'], ['1917', 'became one of the first Black officers in the British Army'], ['1918', 'was killed in battle in France during the First World War']] },
  { name: 'Rosa Parks', events: [['1913', 'was born in Alabama, USA'], ['1955', 'refused to give up her seat on a bus in Montgomery, Alabama'], ['1956', 'saw the courts rule that bus segregation was against the law'], ['1999', 'was awarded the Congressional Gold Medal']] },
  { name: 'Nelson Mandela', events: [['1918', 'was born in South Africa'], ['1964', 'was sent to prison for fighting against apartheid'], ['1990', 'was released after 27 years in prison'], ['1994', 'became the first Black president of South Africa']] },
  { name: 'Katherine Johnson', events: [['1918', 'was born in West Virginia, USA'], ['1953', 'started working as a mathematician for the organisation that later became NASA'], ['1962', 'checked the calculations for John Glenn\'s flight around the Earth'], ['2015', 'was awarded the Presidential Medal of Freedom']] },
  { name: 'Martin Luther King Jr', events: [['1929', 'was born in Atlanta, USA'], ['1955', 'helped lead the Montgomery bus boycott'], ['1963', 'gave his famous "I Have a Dream" speech in Washington'], ['1964', 'was awarded the Nobel Peace Prize']] },
];
const pronoun = (b) => (['Mary Seacole', 'Rosa Parks', 'Katherine Johnson'].includes(b.name) ? 'she' : 'he');
function bioPassage(b, events = b.events) {
  return events.map(([y, e], i) => `In ${y}, ${i === 0 ? b.name : pronoun(b)} ${e}.`).join(' ');
}

const TIME_CONNECTIVES = ['Later', 'Afterwards', 'Eventually', 'Meanwhile', 'Finally', 'Soon after', 'Following this', 'Initially'];
const OTHER_CONNECTIVES = ['Because', 'Although', 'However', 'Therefore', 'Despite this', 'Unless', 'Instead'];

// ---------------- TIER 1: warm-ups ----------------
def(1, 'Word classes', () => {
  const x = pick(SENTENCES); const cls = pick(CLASSES);
  return mc(`Which word is the ${cls.toUpperCase()} in this sentence?\n"${x.s}"`, x[cls], CLASSES.filter((c) => c !== cls).map((c) => x[c]));
});
def(1, 'Name the word class', () => {
  const x = pick(SENTENCES); const cls = pick(CLASSES);
  return mc(`"${x.s}"\nWhat word class is "${x[cls]}"?`, cls, CLASSES.filter((c) => c !== cls), { hint: cls === 'adverb' ? 'Does it tell you HOW something was done?' : null });
});
def(1, 'Spot the adverb', () => {
  const f = pick(FAMILIES);
  return mc('Which of these words is an ADVERB?', f[0], [f[1], f[2], pick(PLAIN_VERBS)], { hint: 'Adverbs often end in -ly and tell you how something is done.' });
});
def(1, 'Spot the adjective', () => {
  const f = pick(FAMILIES);
  return mc('Which of these words is an ADJECTIVE?', f[1], [f[0], f[2], pick(PLAIN_VERBS)], { hint: 'An adjective describes a noun.' });
});
def(1, 'Powerful vocabulary', () => {
  const [plain, syns] = pick(SYNONYMS);
  const wrong = SYNONYMS.filter(([p]) => p !== plain).map(([, s]) => pick(s));
  return mc(`Which word is a more powerful way to say "${plain}"?`, pick(syns), wrong);
});
def(1, 'Past, present or future', () => {
  const v = pick(VERBS); const subj = pick(SUBJECTS); const t = pick(['simple present', 'simple past', 'future']);
  const label = { 'simple present': 'present', 'simple past': 'past', future: 'future' };
  return mc(`What tense is this sentence?\n"${subj} ${TENSES[t](v)} ${v.obj}."`, label[t], ['past', 'present', 'future'].filter((l) => l !== label[t]).concat(['none of these']));
});

// ---------------- TIER 2: Year 5 core ----------------
def(2, 'Verbs into adjectives', () => {
  const x = pick(VERB_ADJ);
  return typed(`Turn the verb "${x.verb}" into an adjective to fill the gap:\n${x.s}`, x.adj, { hint: 'Try adding -ing or -ed.' });
}, 10);
def(2, 'Adverbs of possibility', () => {
  const r = Math.random();
  if (r < 0.34) return mc('Which word is an adverb of POSSIBILITY?', pick(POSSIBILITY_ALL), NOT_POSSIBILITY, { hint: 'It tells you how likely something is.' });
  if (r < 0.67) return mc('Which adverb shows the writer is MOST sure?', pick(['definitely', 'certainly']), POSSIBILITY_LOW);
  return mc('Which adverb shows the writer is LEAST sure?', pick(POSSIBILITY_LOW), POSSIBILITY_HIGH);
});
def(2, 'Adverbs of possibility in a sentence', (name) => {
  const s = pick([
    [`___ it will snow tomorrow, but the forecast isn't sure.`, 'low'],
    [`${name} will ___ win the race; nobody else is even close!`, 'high'],
    [`___ the treasure is buried under the old tree. Let's check!`, 'low'],
    [`The sun will ___ rise tomorrow morning.`, 'high'],
    [`___ the dog ate my homework, or ___ I left it at school.`, 'low2'],
  ]);
  if (s[1] === 'low2') return mc(`Which word fits BOTH gaps?\n${s[0]}`, pick(['Perhaps', 'Maybe']), ['Definitely', 'Certainly', 'Obviously']);
  if (s[1] === 'low') return mc(`Which word best fills the gap?\n${s[0]}`, pick(['Perhaps', 'Possibly', 'Maybe']), ['Definitely', 'Certainly', 'Obviously']);
  return mc(`Which word best fills the gap?\n${s[0]}`, pick(['definitely', 'certainly']), ['perhaps', 'possibly', 'maybe']);
});
def(2, 'Expanded noun phrases', () => {
  const x = pick(ENP);
  return mc('Which of these is an EXPANDED NOUN PHRASE?', x.p, NOT_ENP, { hint: 'A noun with extra describing words added around it.' });
});
def(2, 'Choosing the tense', (name) => {
  const v = pick(VERBS);
  const opts = [['Yesterday', 'simple past'], ['Tomorrow', 'future'], ['Every Saturday', 'simple present'], ['Right now', 'present progressive']];
  const [when, t] = pick(opts);
  return mc(`Which verb fits?\n${when}, ${name} ___ ${v.obj}.`, TENSES[t](v), opts.filter(([, o]) => o !== t).map(([, o]) => TENSES[o](v)).filter((f) => f !== TENSES[t](v)));
});
def(2, 'Time connectives', () => mc('Which of these is a TIME connective (useful for putting events in order)?', pick(TIME_CONNECTIVES), OTHER_CONNECTIVES));
def(2, 'Biography features', () => pick([
  () => mc('Biographies are usually written in which person?', 'third person (he / she / they)', ['first person (I / we)', 'second person (you)', 'it changes every sentence']),
  () => mc('Biographies are usually written in which tense?', 'past tense', ['future tense', 'present progressive', 'it does not matter']),
  () => mc('In what order should the events in a biography usually go?', 'chronological order (the order they happened)', ['alphabetical order', 'most exciting first', 'random order']),
  () => mc('What is a biography?', 'the story of a real person\'s life, written by someone else', ['a made-up story about a hero', 'the story of your own life, written by you', 'a set of instructions']),
  () => mc('Which of these would you NOT usually find in a biography?', 'a recipe for pancakes', ['dates of key events', 'where the person was born', 'what the person achieved']),
  () => mc('Biographies are usually written in which style?', 'formal', ['chatty and informal', 'text-message style', 'as a poem']),
])());

// ---------------- TIER 3: Year 5/6 ----------------
def(3, 'Literary techniques', () => {
  const tech = pick(Object.keys(TECHNIQUES));
  return mc(`Which technique is used here?\n"${pick(TECHNIQUES[tech])}"`, tech, Object.keys(TECHNIQUES).filter((t) => t !== tech));
});
def(3, 'Vocabulary in context', () => {
  const x = pick(CONTEXT);
  return mc(`"${x.s}"\nWhat does "${x.w}" mean?`, x.a, x.x);
}, 5);
def(3, 'Verb tenses', () => {
  const v = pick(VERBS); const subj = pick(SUBJECTS);
  const t = pick(['present progressive', 'past progressive', 'present perfect', 'past perfect', 'simple past', 'future']);
  return mc(`What tense is the verb in this sentence?\n"${subj} ${TENSES[t](v)} ${v.obj}."`, t, Object.keys(TENSES).filter((o) => o !== t));
});
def(3, 'Noun phrases: find the noun', () => {
  const x = pick(ENP);
  return mc(`In the expanded noun phrase "${x.p}", which word is the MAIN noun that the phrase is about?`, x.head, x.others);
});
def(3, 'Verbs as adjectives', () => {
  const x = pick(VERB_ADJ_SPOT);
  return mc(`In this sentence, a verb has been turned into an adjective. Which word is it?\n"${x.s}"`, x.w, x.others);
});
def(3, 'Powerful verbs', () => {
  const [plain, syns] = pick(Math.random() < 0.5 ? SAID : WALKED);
  const group = SAID.some(([p]) => p === plain) ? SAID : WALKED;
  return mc(`Which verb is the best replacement for "${plain}"?`, pick(syns), group.filter(([p]) => p !== plain).map(([, s]) => pick(s)));
});
def(3, 'Formal writing', () => {
  const b = pick(BIOS); const [y, e] = b.events[0];
  return mc(`Which sentence is written in a FORMAL style, suitable for a biography of ${b.name}?`, `${b.name} ${e} in ${y}.`,
    [`So, like, ${b.name} was born ages ago!`, `${b.name} is literally the best person ever!!!`, `I reckon ${b.name} was pretty cool tbh.`, `Guess what? ${b.name} did loads of amazing stuff!`]);
});
def(3, 'Biography: find the fact', () => {
  const b = pick(BIOS); const i = Math.floor(Math.random() * b.events.length); const [y, e] = b.events[i];
  return mc(`Read this:\n${bioPassage(b)}\n\nIn what year ${pronoun(b) === 'she' ? 'did this happen to her' : 'did this happen to him'}: "${b.name} ${e}"?`, y, b.events.filter((_, j) => j !== i).map(([yy]) => yy).concat([String(+y + 10)]));
}, 15);

// ---------------- TIER 4: Year 6 stretch ----------------
const INFERENCE = [
  { p: 'Mia stared at the floor. Her hands twisted the hem of her jumper as the teacher read out the test results.', q: 'How is Mia most likely feeling?', a: 'nervous', x: ['excited', 'bored', 'angry'] },
  { p: 'Jake flung his bag across the room, stomped up the stairs and slammed his bedroom door.', q: 'How is Jake most likely feeling?', a: 'furious', x: ['sleepy', 'proud', 'calm'] },
  { p: 'Grandma\'s eyes filled with tears as she hugged the old photograph to her chest and smiled.', q: 'Which best describes how Grandma feels?', a: 'happy memories mixed with sadness', x: ['angry at the photograph', 'scared of the photograph', 'bored and tired'] },
  { p: 'Leo hid the broken vase behind the sofa and whistled loudly when his mum walked in.', q: 'Why did Leo whistle loudly?', a: 'to look innocent so Mum would not suspect him', x: ['because he was practising music', 'because he was calling the dog', 'because he was very tired'] },
  { p: 'Amara checked the clock for the tenth time, tapping her foot. The bus was already twenty minutes late.', q: 'Which word best describes Amara?', a: 'impatient', x: ['relaxed', 'sleepy', 'joyful'] },
  { p: 'Sam shared his last biscuit with the new boy, who had sat alone all lunchtime.', q: 'What does this tell us about Sam?', a: 'he is kind and thoughtful', x: ['he does not like biscuits', 'he is very greedy', 'he wants to be left alone'] },
  { p: '"Oh, brilliant," muttered Priya, as the rain began to pour on her brand-new trainers.', q: 'What does Priya really mean when she says "brilliant"?', a: 'she is annoyed (she is being sarcastic)', x: ['she thinks the rain is brilliant', 'she loves her wet trainers', 'she wants it to rain more'] },
  { p: 'The two friends hadn\'t spoken for a week. When Ellie walked into the room, Zara turned away and picked up a book.', q: 'What can you infer about Ellie and Zara?', a: 'they have fallen out', x: ['they are best friends today', 'they have never met', 'they are both very sleepy'] },
  { p: 'Ben\'s legs shook as he climbed the ladder to the top diving board. He gripped the rail so tightly his knuckles went white.', q: 'Which evidence BEST shows Ben is scared?', a: 'he gripped the rail so tightly his knuckles went white', x: ['he climbed the ladder', 'it was the top diving board', 'he was at the swimming pool'] },
  { p: 'Without a word, Dad placed a steaming mug of hot chocolate beside Tom, who was still shivering after the long walk home in the snow.', q: 'Why did Dad bring the hot chocolate?', a: 'to warm Tom up and look after him', x: ['because Dad was thirsty', 'to punish Tom', 'because it was Tom\'s birthday'] },
];
def(4, 'Inference', () => { const x = pick(INFERENCE); return mc(`${x.p}\n\n${x.q}`, x.a, x.x); }, 15);
const EFFECTS = [
  { s: 'The wind howled through the trees.', w: 'howled', a: 'It makes the wind sound wild, like an animal, creating a scary mood.', x: ['It tells us the time of day.', 'It shows the trees were small.', 'It makes the scene feel calm and safe.'] },
  { s: 'The children crept along the corridor.', w: 'crept', a: 'It shows they were moving slowly and quietly so they would not be noticed.', x: ['It shows they were running as fast as they could.', 'It shows they were singing.', 'It tells us the corridor was long.'] },
  { s: 'The lion devoured its meal.', w: 'devoured', a: 'It shows the lion ate hungrily and greedily.', x: ['It shows the lion ate politely.', 'It shows the lion was not hungry.', 'It tells us what the meal was.'] },
  { s: 'Rain hammered on the roof all night.', w: 'hammered', a: 'It shows the rain was heavy and loud.', x: ['It shows someone was building the roof.', 'It shows the rain was light and gentle.', 'It shows the roof was made of metal.'] },
  { s: 'The old man shuffled to the door.', w: 'shuffled', a: 'It shows he walked slowly, dragging his feet, maybe because he was old or tired.', x: ['It shows he sprinted to the door.', 'It shows he was playing cards.', 'It shows he was excited.'] },
  { s: 'Her voice was a whisper, barely there.', w: 'whisper', a: 'It shows she was speaking very quietly, perhaps because she was scared or weak.', x: ['It shows she was shouting angrily.', 'It shows she was singing loudly.', 'It shows she was laughing.'] },
  { s: 'The castle loomed over the village.', w: 'loomed', a: 'It makes the castle seem huge and threatening.', x: ['It makes the castle seem small and friendly.', 'It shows the castle was falling down.', 'It shows the castle was far away and hard to see.'] },
  { s: 'Charlie snatched the last slice of pizza.', w: 'snatched', a: 'It shows he grabbed it quickly and greedily.', x: ['It shows he offered it to a friend.', 'It shows he took it slowly and politely.', 'It shows he did not like pizza.'] },
];
def(4, 'Author\'s word choice', () => { const x = pick(EFFECTS); return mc(`"${x.s}"\nWhy did the author choose the word "${x.w}"?`, x.a, x.x); }, 15);
def(4, 'Perfect tenses', (name) => {
  const v = pick(VERBS);
  return pick([
    () => mc(`Which verb fits?\nBy the time the bell rang, ${name} ___ ${v.obj}.`, `had ${v.pp}`, [`has ${v.base}`, `will ${v.base}`, `is ${v.ing}`, `${v.s}`]),
    () => mc(`Which verb fits?\nLook! ${name} ___ ${v.obj} already!`, `has ${v.pp}`, [`have ${v.past}`, `will ${v.past}`, `is ${v.pp}`]),
    () => mc(`Which verb fits?\nWhile ${name} ___ ${v.obj}, the phone rang.`, `was ${v.ing}`, [`is ${v.base}`, `will ${v.ing}`, `has ${v.ing}`]),
  ])();
});
def(4, 'Biography: chronological order', () => {
  const b = pick(BIOS); const which = pick(['FIRST', 'LAST']);
  const events = shuffle(b.events);
  const ans = which === 'FIRST' ? b.events[0] : b.events[b.events.length - 1];
  return mc(`Read these notes about ${b.name} (they are in the wrong order):\n${events.map(([y, e]) => `• ${y}: ${e}`).join('\n')}\n\nWhich event happened ${which}?`, ans[1], b.events.filter((ev) => ev !== ans).map(([, e]) => e));
}, 15);
def(4, 'Modal verbs of possibility', () => pick([
  () => mc('Which modal verb shows something is CERTAIN to happen?', 'will', ['might', 'could', 'may']),
  () => mc('Which modal verb shows something is only POSSIBLE?', pick(['might', 'could', 'may']), ['will', 'must', "won't"]),
  () => mc('Which sentence sounds the MOST certain?', 'The match will definitely start at three.', ['The match might start at three.', 'Perhaps the match could start at three.', 'The match may possibly start at three.']),
  () => mc('Which sentence sounds the LEAST certain?', 'Perhaps the shop might open later.', ['The shop will open later.', 'The shop will certainly open later.', 'The shop must open later.']),
])());
def(4, 'Formal or informal', () => pick([
  () => mc('Which is the most FORMAL way to start a letter to a head teacher?', 'Dear Mrs Patel,', ['Hiya Mrs P!', 'Yo, Mrs Patel!', 'Alright?']),
  () => mc('Which sentence is the most FORMAL?', 'The children were extremely excited about the trip.', ['The kids were well excited about the trip.', 'The kids were, like, super hyped!', 'Everyone was buzzing for the trip lol.']),
  () => mc('Which is the formal way to write "kids"?', 'children', ['kiddos', 'mates', 'littl\'uns']),
  () => mc('Which is the formal way to write "lots of"?', 'many', ['loads of', 'tons of', 'heaps of']),
  () => mc('Which is the formal way to write "find out"?', 'discover', ['suss out', 'work it', 'get it']),
])());

// ---------------- public API ----------------
function generate(tier, name = 'Charlie', avoidTopic = null, preferTopics = []) {
  tier = Math.min(4, Math.max(1, tier));
  let list = TOPICS[tier];
  if (avoidTopic && list.length > 1) list = list.filter((t) => t.topic !== avoidTopic);
  const weak = list.filter((t) => preferTopics.includes(t.topic));
  const t = weak.length && Math.random() < 0.4 ? pick(weak) : pick(list);
  const q = t.fn(name);
  return { topic: t.topic, tier, text: q.text, kind: q.kind, answer: q.answer, display: q.display, hint: q.hint || null, choices: q.choices || null, extraMs: t.extraSeconds * 1000, subject: 'english' };
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
function check(q, input) {
  if (input == null) return false;
  const s = norm(input);
  if (!s) return false;
  if (q.kind === 'choice') return s === norm(q.answer);
  if (q.kind === 'typed') return q.answer.some((a) => norm(a) === s);
  return false;
}

const allTopics = () => Object.values(TOPICS).flat().map((t) => t.topic);
module.exports = { generate, check, allTopics, TOPICS };
