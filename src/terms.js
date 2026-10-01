/* Clefwork Terms — musical terms as multiple-choice questions, read and heard. Five kinds, each a tab
   in the builder with its own counter:
   - Dynamics: ppp to fff, sfz, fp, cresc., decresc., dim. and the hairpins — a marking's meaning, the
     marking for a meaning, its Italian name, or which of several is the loudest or softest.
   - Tempo: Grave to Prestissimo, and accel., rit., rall., a tempo and rubato — a term's meaning, the
     term for a meaning, which of several is the fastest or slowest, or about how many beats a minute.
   - Instruments: which family an instrument belongs to (woodwind, brass, string, percussion,
     keyboard), which of several belongs to a family, or which one doesn't.
   - Hearing dynamics: a melody made by Clefwork Melody's generator, played twice — louder, softer or
     the same the second time, or which marking fits the second time when the first is mf — or played
     once, growing louder, softer, staying the same or changing suddenly.
   - Hearing tempo: a melody at a tempo to name (Largo to Presto); played twice, faster or slower the
     second time; or played once, speeding up, slowing down, keeping steady, or slowing then a tempo.
   Every question is multiple choice, so it is graded and carried in report codes as one choice; the
   listening questions also count their plays. Loudness can only be judged against something, so the
   dynamics are always heard against another playing, or changing within one. cfg.terms holds the
   settings; cfg.counts.tmdyn, .tmtempo, .tminst, .tmhdyn and .tmhtempo say how many of each. */
(function (root) {
  'use strict';
  const MQ = (root.MQ = root.MQ || {});
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const TERM_COUNTS = ['tmdyn', 'tmtempo', 'tminst', 'tmhdyn', 'tmhtempo', 'tmvocab'];
  const MAX = 30, HEAR_MAX = 20;                  // questions of each kind (the melody maker's limit is 20)
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  // ---------- the terms ----------
  // Each list keeps its order, since a quiz code has a bit for every entry. Dynamics: level is how loud
  // (ppp 0 … fff 7); markings in the same group mean the same thing, so they never share a question.
  const DYNAMICS = [
    { id: 'ppp', sign: 'ppp', name: 'pianississimo', means: 'as soft as possible', level: 0 },
    { id: 'pp', sign: 'pp', name: 'pianissimo', means: 'very soft', level: 1 },
    { id: 'p', sign: 'p', name: 'piano', means: 'soft', level: 2 },
    { id: 'mp', sign: 'mp', name: 'mezzo piano', means: 'moderately soft', level: 3 },
    { id: 'mf', sign: 'mf', name: 'mezzo forte', means: 'moderately loud', level: 4 },
    { id: 'f', sign: 'f', name: 'forte', means: 'loud', level: 5 },
    { id: 'ff', sign: 'ff', name: 'fortissimo', means: 'very loud', level: 6 },
    { id: 'fff', sign: 'fff', name: 'fortississimo', means: 'as loud as possible', level: 7 },
    { id: 'sfz', sign: 'sfz', name: 'sforzando', means: 'a sudden, strong accent' },
    { id: 'fp', sign: 'fp', name: 'fortepiano', means: 'loud, then suddenly soft' },
    { id: 'cresc', sign: 'cresc.', short: 1, name: 'crescendo', means: 'gradually louder', group: 'louder' },
    { id: 'decresc', sign: 'decresc.', short: 1, name: 'decrescendo', means: 'gradually softer', group: 'softer' },
    { id: 'dim', sign: 'dim.', short: 1, name: 'diminuendo', means: 'gradually softer', group: 'softer' },
    { id: 'hcresc', sign: '<', hairpin: 1, name: 'crescendo', means: 'gradually louder', group: 'louder' },
    { id: 'hdecresc', sign: '>', hairpin: -1, name: 'decrescendo', means: 'gradually softer', group: 'softer' },
  ];
  // Tempo: rank orders the tempos from slowest to fastest; bpm is the usual metronome range (0 for no
  // top). Tempos within one rank of each other are too close to set against each other (Largo and
  // Lento, Moderato and Allegretto), so they never share a question.
  const TEMPOS = [
    { id: 'grave', term: 'Grave', means: 'very slow and serious', bpm: [25, 45], rank: 0 },
    { id: 'largo', term: 'Largo', means: 'very slow and broad', bpm: [40, 60], rank: 1 },
    { id: 'lento', term: 'Lento', means: 'slow', bpm: [45, 60], rank: 2 },
    { id: 'adagio', term: 'Adagio', means: 'slow and at ease', bpm: [66, 76], rank: 3 },
    { id: 'andante', term: 'Andante', means: 'at a walking pace', bpm: [76, 108], rank: 4 },
    { id: 'moderato', term: 'Moderato', means: 'at a moderate speed', bpm: [108, 120], rank: 5 },
    { id: 'allegretto', term: 'Allegretto', means: 'moderately fast', bpm: [112, 120], rank: 6 },
    { id: 'allegro', term: 'Allegro', means: 'fast and lively', bpm: [120, 156], rank: 7 },
    { id: 'vivace', term: 'Vivace', means: 'lively and quick', bpm: [156, 176], rank: 8 },
    { id: 'presto', term: 'Presto', means: 'very fast', bpm: [168, 200], rank: 9 },
    { id: 'prestissimo', term: 'Prestissimo', means: 'as fast as possible', bpm: [200, 0], rank: 10 },
    { id: 'accel', term: 'accelerando', abbr: 'accel.', means: 'gradually faster', group: 'faster' },
    { id: 'rit', term: 'ritardando', abbr: 'rit.', means: 'gradually slower', group: 'slower' },
    { id: 'rall', term: 'rallentando', abbr: 'rall.', means: 'gradually slower', group: 'slower' },
    { id: 'atempo', term: 'a tempo', means: 'back to the original tempo', group: 'atempo' },
    { id: 'rubato', term: 'rubato', means: 'with a flexible tempo, pushing ahead and holding back', group: 'rubato' },
  ];
  const bpmText = (t) => (t.bpm[1] ? `${t.bpm[0]}–${t.bpm[1]}` : `${t.bpm[0]} or more`);
  // Instruments by family. why: said with the answer, for the ones that often catch students out.
  const FAMILIES = [
    { id: 'woodwind', label: 'Woodwind', a: 'a woodwind', list: [
      { name: 'piccolo', why: 'The piccolo is usually made of metal, but it’s a woodwind: like the flute, it sounds when air is blown across a hole.' },
      { name: 'flute', why: 'Most flutes are made of metal, but the flute is a woodwind: it sounds when air is blown across a hole.' },
      { name: 'oboe' },
      { name: 'English horn', why: 'Despite its name, the English horn is a woodwind — a larger oboe, played with a double reed.' },
      { name: 'clarinet' }, { name: 'bass clarinet' }, { name: 'bassoon' }, { name: 'contrabassoon' },
      { name: 'saxophone', why: 'The saxophone is made of brass, but it’s a woodwind: its sound comes from a reed.' },
      { name: 'recorder' }] },
    { id: 'brass', label: 'Brass', a: 'a brass', list: [
      { name: 'trumpet' }, { name: 'cornet' }, { name: 'flugelhorn' },
      { name: 'French horn', why: 'The French horn often plays in woodwind quintets, but it’s brass: the player buzzes their lips into a mouthpiece.' },
      { name: 'trombone' }, { name: 'euphonium' }, { name: 'baritone horn' }, { name: 'tuba' },
      { name: 'sousaphone', why: 'The sousaphone is a tuba built to wrap around a marching player.' }, { name: 'bugle' }] },
    { id: 'string', label: 'String', a: 'a string', list: [
      { name: 'violin' }, { name: 'viola' }, { name: 'cello' }, { name: 'double bass' },
      { name: 'harp', why: 'The harp is a string instrument: its strings are plucked with the fingers.' },
      { name: 'guitar' }, { name: 'bass guitar' }, { name: 'banjo' }, { name: 'mandolin' }, { name: 'ukulele' }] },
    { id: 'percussion', label: 'Percussion', a: 'a percussion', list: [
      { name: 'snare drum' }, { name: 'bass drum' },
      { name: 'timpani', plural: 1, why: 'Timpani play definite pitches, but they’re struck, so they’re percussion.' },
      { name: 'cymbals', plural: 1 }, { name: 'triangle' }, { name: 'tambourine' }, { name: 'drum set' },
      { name: 'xylophone', why: 'The xylophone plays melodies, but its bars are struck with mallets, so it’s percussion.' },
      { name: 'marimba', why: 'The marimba plays melodies, but its bars are struck with mallets, so it’s percussion.' },
      { name: 'glockenspiel', why: 'The glockenspiel plays melodies, but its metal bars are struck with mallets, so it’s percussion.' },
      { name: 'vibraphone', why: 'The vibraphone plays melodies, but its metal bars are struck with mallets, so it’s percussion.' },
      { name: 'chimes', plural: 1 }, { name: 'gong' }, { name: 'castanets', plural: 1 }, { name: 'maracas', plural: 1 }, { name: 'congas', plural: 1 }] },
    { id: 'keyboard', label: 'Keyboard', a: 'a keyboard', list: [
      { name: 'piano', why: 'The piano’s strings are struck by hammers, but it’s played from a keyboard, so it belongs with the keyboards.' },
      { name: 'organ' }, { name: 'harpsichord' }, { name: 'celesta' }, { name: 'synthesizer' }] },
  ];
  // What a quiz code of generator version 1 writes for each list: one bit per entry.
  const TERM_BITS = { dyn: DYNAMICS.length, tempo: TEMPOS.length, inst: FAMILIES.map((f) => f.list.length) };

  // ---------- hearing ----------
  // The dynamics a melody is played at: pp to ff, in steps of 5.5 dB below ff (the widest range that
  // stays clear on a laptop's speakers). dyn: the marking's place in DYNAMICS.
  const HEAR_LEVELS = [{ dyn: 1, db: -27.5 }, { dyn: 2, db: -22 }, { dyn: 3, db: -16.5 }, { dyn: 4, db: -11 }, { dyn: 5, db: -5.5 }, { dyn: 6, db: 0 }];
  const MF = 3;
  const DYN_CHANGES = [
    { id: 'cresc', label: 'Crescendo — it gets gradually louder' },
    { id: 'decresc', label: 'Decrescendo — it gets gradually softer' },
    { id: 'steady', label: 'It stays at the same dynamic' },
    { id: 'subito', label: 'It changes suddenly (subito)' },
  ];
  // The tempos a melody is played at: the middle of each marking's range. tempo: its place in TEMPOS.
  const HEAR_TEMPOS = [{ tempo: 1, bpm: 50 }, { tempo: 3, bpm: 70 }, { tempo: 4, bpm: 92 }, { tempo: 5, bpm: 114 }, { tempo: 7, bpm: 138 }, { tempo: 9, bpm: 184 }];
  const TEMPO_CHANGES = [
    { id: 'accel', label: 'Accelerando — it gets gradually faster' },
    { id: 'rit', label: 'Ritardando — it gets gradually slower' },
    { id: 'steady', label: 'It keeps a steady tempo' },
    { id: 'atempo', label: 'It slows down, then goes back a tempo' },
  ];
  const SAME = ['Louder', 'Softer', 'About the same'], SAME_T = ['Faster', 'Slower', 'About the same'];

  // ---------- settings ----------
  // choices: how many answers to choose from (3–6; a family question lists every family in the quiz).
  // dyn / tempo: terms (a bit per entry of DYNAMICS / TEMPOS) and ask (bit 0 the meaning of a term,
  // 1 the term for a meaning, 2 which is the loudest or softest / fastest or slowest, 3 — dynamics — the
  // Italian name, or — tempo — about how many beats a minute). inst: pick (a mask of instruments for each
  // family; an empty one leaves the family out) and ask (bit 0 an instrument's family, 1 which of several
  // is in a family, 2 which isn't). hdyn: tasks (bit 0 louder or softer, 1 name the second dynamic,
  // 2 how it changes), levels (bits for pp … ff), changes (DYN_CHANGES), spread (1: the other choices are
  // at least two steps from the answer), plays (0 unlimited, or 1–10 per question). htempo: the same with
  // tempos (HEAR_TEMPOS) and TEMPO_CHANGES, and beat (1: a click on every beat under the melody).
  // Both listening kinds also have lib: 0 for melodies Clefwork makes, or the kinds of library piece to
  // play (bit 0 solo melodies, 1 piano, 2 several instruments), and libv: the library's version, so a
  // quiz code keeps its pieces as the library grows.
  // vocab: cats (a bit per category of MQ.TERM_VOCAB_CATS), book (1: only the textbook's terms), ask
  // (bit 0 the definition of a term, 1 the term for a definition).
  // gen: the question maker's version, so a quiz code keeps its questions.
  const bitsOf = (ids, list) => ids.reduce((m, id) => m | (1 << list.findIndex((t) => t.id === id)), 0);
  const DYN_DEFAULT = bitsOf(['pp', 'p', 'mp', 'mf', 'f', 'ff', 'cresc', 'decresc', 'hcresc', 'hdecresc'], DYNAMICS);
  const TEMPO_DEFAULT = bitsOf(['largo', 'adagio', 'andante', 'moderato', 'allegro', 'presto', 'accel', 'rit', 'atempo'], TEMPOS);
  const instBits = (fi, names) => names.reduce((m, n) => m | (1 << FAMILIES[fi].list.findIndex((x) => x.name === n)), 0);
  const INST_DEFAULT = [
    instBits(0, ['piccolo', 'flute', 'oboe', 'clarinet', 'bassoon', 'saxophone']),
    instBits(1, ['trumpet', 'French horn', 'trombone', 'euphonium', 'tuba']),
    instBits(2, ['violin', 'viola', 'cello', 'double bass', 'harp', 'guitar']),
    instBits(3, ['snare drum', 'bass drum', 'timpani', 'cymbals', 'triangle', 'tambourine', 'xylophone', 'glockenspiel']),
    0,
  ];
  const bit01 = (v, d) => (v == null ? d : v ? 1 : 0);
  const maskIn = (v, n, d) => ((v == null ? d : v) & ((1 << n) - 1)) || d;
  function termSettings(t) {
    const s = t || {};
    s.gen = clamp(s.gen | 0 || 1, 1, 7);
    s.choices = clamp(s.choices | 0 || 4, 3, 6);
    const d = s.dyn = s.dyn || {};
    d.terms = maskIn(d.terms, TERM_BITS.dyn, DYN_DEFAULT);
    d.ask = maskIn(d.ask, 4, 15);
    const tp = s.tempo = s.tempo || {};
    tp.terms = maskIn(tp.terms, TERM_BITS.tempo, TEMPO_DEFAULT);
    tp.ask = maskIn(tp.ask, 4, 7);
    const ins = s.inst = s.inst || {};
    const had = Array.isArray(ins.pick) ? ins.pick : null;
    ins.pick = FAMILIES.map((f, i) => (had ? (had[i] | 0) & ((1 << f.list.length) - 1) : INST_DEFAULT[i]));
    if (!ins.pick.some(Boolean)) ins.pick = INST_DEFAULT.slice();
    ins.ask = maskIn(ins.ask, 3, 3);
    const hd = s.hdyn = s.hdyn || {};
    hd.tasks = maskIn(hd.tasks, 3, 7);
    hd.levels = maskIn(hd.levels, 6, 63);
    hd.changes = maskIn(hd.changes, 4, 7);
    hd.spread = bit01(hd.spread, 1);
    hd.plays = clamp(hd.plays | 0, 0, 10);
    hd.lib = clamp(hd.lib | 0, 0, 7);
    hd.libv = clamp(hd.libv | 0 || MQ.LIBRARY_VERSION || 1, 1, 15);
    const ht = s.htempo = s.htempo || {};
    ht.tasks = maskIn(ht.tasks, 3, 7);
    ht.tempos = maskIn(ht.tempos, 6, 63);
    ht.changes = maskIn(ht.changes, 4, 7);
    ht.spread = bit01(ht.spread, 1);
    ht.beat = bit01(ht.beat, 1);
    ht.plays = clamp(ht.plays | 0, 0, 10);
    ht.lib = clamp(ht.lib | 0, 0, 7);
    ht.libv = clamp(ht.libv | 0 || MQ.LIBRARY_VERSION || 1, 1, 15);
    const vc = s.vocab = s.vocab || {};
    vc.cats = maskIn(vc.cats, 10, 63);
    vc.book = bit01(vc.book, 0);
    vc.ask = maskIn(vc.ask, 2, 3);
    return s;
  }
  const listOf = (mask, list) => list.filter((_, i) => mask & (1 << i));
  const termCount = (cfg) => TERM_COUNTS.reduce((n, k) => n + clamp(((cfg.counts && cfg.counts[k]) | 0), 0, k === 'tmhdyn' || k === 'tmhtempo' ? HEAR_MAX : MAX), 0);

  // ---------- dealing ----------
  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  const pickOne = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  // Hands out items in a shuffled order, and again when they run out — never the same one twice running.
  function dealer(items, rng) {
    let pack = [], last = null;
    return () => {
      if (!pack.length) {
        pack = shuffle(items.slice(), rng);
        if (pack.length > 1 && pack[pack.length - 1] === last) [pack[0], pack[pack.length - 1]] = [pack[pack.length - 1], pack[0]];
      }
      return (last = pack.pop());
    };
  }
  // The answer and up to k − 1 others, taken from each list of candidates in turn (the quiz's own terms
  // first, then the rest), leaving out any that clash with one already chosen or would read the same.
  // Returns the chosen items, the answer first.
  function gather(ans, lists, k, rng, clash, text) {
    const got = [ans];
    lists.forEach((list) => shuffle(list.slice(), rng).forEach((x) => {
      if (got.length < k && !got.some((g) => g === x || text(g) === text(x) || clash(g, x))) got.push(x);
    }));
    return got;
  }
  // A question's choices as text, shuffled (or in the order `sort` gives), and where the answer went.
  function asChoices(got, rng, text, sort) {
    const ans = got[0], list = sort ? got.slice().sort(sort) : shuffle(got.slice(), rng);
    return { choices: list.map(text), answer: list.indexOf(ans) };
  }
  // noStaff: nothing to print but the words — except a marking or term, which prints as in the music.
  const question = (cat, i, o) => Object.assign({
    type: 'term', clef: 'treble', noStaff: !(o.tm.show && (o.tm.show.sign || o.tm.show.term)), hint: 'Choose one answer.', sig: `tm${cat}${i}`, tags: [],
  }, o.tm.hear ? { printHint: 'Listen as your teacher plays the melody, then circle one answer.' } : null, o, { tm: Object.assign({ cat }, o.tm) });

  // ---------- dynamics ----------
  const dynClash = (a, b) => !!a.group && a.group === b.group;
  const dynSays = (t) => (t.hairpin ? `the hairpin ${t.sign}` : t.sign);
  const dynFull = (t) => (t.hairpin ? `a ${t.name} hairpin` : `${t.sign} (${t.name})`);
  function dynamicsQuestions(cfg, s, n) {
    const rng = MQ.mulberry32(((cfg.seed >>> 0) ^ 0x7e2d1a55) >>> 0);
    const mine = listOf(s.dyn.terms, DYNAMICS), levels = mine.filter((t) => t.level != null);
    const asks = ['means', 'sign', 'order', 'name'].filter((a, b) => s.dyn.ask & (1 << b)).filter((a) => a !== 'order' || levels.length >= 2);
    const nextAsk = dealer(asks.length ? asks : ['means'], rng), nextTerm = dealer(mine, rng);
    const k = s.choices, out = [];
    for (let i = 0; i < n; i++) {
      const ask = nextAsk();
      if (ask === 'order') {
        // Which of these is the loudest (or softest)? Levels from the quiz's list, then any others.
        const loud = rng() < 0.5;
        const first = pickOne(rng, levels);
        const got = gather(first, [levels, DYNAMICS.filter((t) => t.level != null)], k, rng, () => false, (t) => t.sign);
        const best = got.reduce((a, b) => ((loud ? b.level > a.level : b.level < a.level) ? b : a));
        const c = asChoices([best].concat(got.filter((t) => t !== best)), rng, (t) => t.sign);
        const order = got.slice().sort((a, b) => a.level - b.level).map((t) => t.sign).join(' ');
        out.push(question('tmdyn', i, {
          text: `Which of these is the ${loud ? 'loudest' : 'softest'}?`, ...c,
          tm: { ask, choiceKind: 'dyn', more: `from softest to loudest: ${order}` },
        }));
        continue;
      }
      const t = nextTerm();
      const lists = [mine, DYNAMICS];
      if (ask === 'sign') {
        const got = gather(t, lists, k, rng, dynClash, (x) => x.sign);
        out.push(question('tmdyn', i, {
          text: `Which marking means “${t.means}”?`, ...asChoices(got, rng, (x) => x.sign),
          tm: { ask, choiceKind: 'dyn', more: t.hairpin ? `a ${t.name} hairpin` : t.name },
        }));
      } else if (ask === 'name') {
        const got = gather(t, lists, k, rng, dynClash, (x) => x.name);
        const text = t.hairpin ? `What is the hairpin ${t.sign} called?` : t.short ? `What is ${t.sign} short for?` : `What is the Italian name for ${t.sign}?`;
        out.push(question('tmdyn', i, {
          text, ...asChoices(got, rng, (x) => x.name),
          tm: { ask, show: t, more: t.means, parts: t.hairpin ? ['What is this hairpin called?'] : t.short ? ['What is ', { sign: t }, ' short for?'] : ['What is the Italian name for ', { sign: t }, '?'] },
        }));
      } else {
        const got = gather(t, lists, k, rng, dynClash, (x) => x.means);
        out.push(question('tmdyn', i, {
          text: `What does ${dynSays(t)} mean?`, ...asChoices(got, rng, (x) => cap(x.means)),
          tm: { ask, show: t, more: dynFull(t), parts: t.hairpin ? ['What does this hairpin mean?'] : ['What does ', { sign: t }, ' mean?'] },
        }));
      }
    }
    return out;
  }

  // ---------- tempo ----------
  const plain = (t) => t.rank != null;
  const tempoClash = (a, b) => (!!a.group && a.group === b.group) || (plain(a) && plain(b) && Math.abs(a.rank - b.rank) < 2);
  const tempoSays = (t) => (t.abbr ? `${t.term} (${t.abbr})` : t.term);
  function tempoQuestions(cfg, s, n) {
    const rng = MQ.mulberry32(((cfg.seed >>> 0) ^ 0x3b9ac9ff) >>> 0);
    const mine = listOf(s.tempo.terms, TEMPOS), mineP = mine.filter(plain), allP = TEMPOS.filter(plain);
    const asks = ['means', 'term', 'order', 'bpm'].filter((a, b) => s.tempo.ask & (1 << b)).filter((a) => (a !== 'order' && a !== 'bpm') || mineP.length >= (a === 'order' ? 2 : 1));
    const nextAsk = dealer(asks.length ? asks : ['means'], rng), nextTerm = dealer(mine, rng), nextPlain = mineP.length ? dealer(mineP, rng) : null;
    const k = s.choices, out = [];
    // Candidates of the same kind first (tempos for a tempo, changes for a change), then the others.
    const listsFor = (t) => {
      const same = (x) => plain(x) === plain(t);
      return [mine.filter(same), TEMPOS.filter(same), mine, TEMPOS];
    };
    for (let i = 0; i < n; i++) {
      const ask = nextAsk();
      if (ask === 'order') {
        const fast = rng() < 0.5;
        const got = gather(pickOne(rng, mineP), [mineP, allP], k, rng, tempoClash, (t) => t.term);
        const best = got.reduce((a, b) => ((fast ? b.rank > a.rank : b.rank < a.rank) ? b : a));
        const c = asChoices([best].concat(got.filter((t) => t !== best)), rng, (t) => t.term);
        out.push(question('tmtempo', i, {
          text: `Which of these is the ${fast ? 'fastest' : 'slowest'}?`, ...c,
          tm: { ask, choiceKind: 'tempo', more: `from slowest to fastest: ${got.slice().sort((a, b) => a.rank - b.rank).map((t) => t.term).join(', ')}` },
        }));
        continue;
      }
      if (ask === 'bpm') {
        const t = nextPlain();
        const got = gather(t, [mineP, allP], k, rng, tempoClash, bpmText);
        out.push(question('tmtempo', i, {
          text: `About how many beats a minute is ${t.term}?`, ...asChoices(got, rng, bpmText, (a, b) => a.rank - b.rank),
          tm: { ask, show: t, more: `${t.term} is ${t.means}`, parts: ['About how many beats a minute is ', { term: t }, '?'] },
        }));
        continue;
      }
      const t = nextTerm();
      if (ask === 'term') {
        const got = gather(t, listsFor(t), k, rng, tempoClash, (x) => x.term);
        out.push(question('tmtempo', i, {
          text: `Which term means “${t.means}”?`, ...asChoices(got, rng, (x) => x.term),
          tm: { ask, choiceKind: 'tempo', more: plain(t) ? `about ${bpmText(t)} beats a minute` : t.abbr ? `written ${t.abbr}` : '' },
        }));
      } else {
        const got = gather(t, listsFor(t), k, rng, tempoClash, (x) => x.means);
        out.push(question('tmtempo', i, {
          text: `What does ${tempoSays(t)} mean?`, ...asChoices(got, rng, (x) => cap(x.means)),
          tm: { ask, show: t, more: plain(t) ? `about ${bpmText(t)} beats a minute` : '', parts: ['What does ', { term: t }, ' mean?'] },
        }));
      }
    }
    return out;
  }

  // ---------- instruments ----------
  function instrumentQuestions(cfg, s, n) {
    const rng = MQ.mulberry32(((cfg.seed >>> 0) ^ 0x51f15e5d) >>> 0);
    const pick = s.inst.pick, k = s.choices;
    const all = [], mine = [];
    FAMILIES.forEach((f, fi) => f.list.forEach((it, j) => {
      const x = Object.assign({ fam: fi }, it);
      all.push(x);
      if (pick[fi] & (1 << j)) mine.push(x);
    }));
    // The families in the quiz; with only one, every family is a choice.
    let fams = FAMILIES.map((_, fi) => fi).filter((fi) => pick[fi]);
    if (fams.length < 2) fams = FAMILIES.map((_, fi) => fi).filter((fi) => fi < 4 || pick[fi]);
    const inFam = (fi, list) => list.filter((x) => x.fam === fi);
    const others = (fi, list) => list.filter((x) => x.fam !== fi && fams.includes(x.fam));
    const asks = ['family', 'pick', 'odd'].filter((a, b) => s.inst.ask & (1 << b));
    const nextAsk = dealer(asks.length ? asks : ['family'], rng), nextInst = dealer(mine, rng);
    const nextFam = dealer(fams.filter((fi) => inFam(fi, mine).length), rng);
    const name = (x) => cap(x.name);
    // "the tuba is a brass instrument", "the cymbals are percussion instruments"
    const isA = (x, fi) => (x.plural ? `the ${x.name} are ${FAMILIES[fi].label.toLowerCase()} instruments` : `the ${x.name} is ${FAMILIES[fi].a} instrument`);
    const out = [];
    for (let i = 0; i < n; i++) {
      const ask = nextAsk();
      if (ask === 'family') {
        const x = nextInst();
        const list = fams.includes(x.fam) ? fams : fams.concat(x.fam).sort((a, b) => a - b);
        out.push(question('tminst', i, {
          text: `Which instrument family ${x.plural ? 'are' : 'is'} the ${x.name} in?`,
          choices: list.map((fi) => FAMILIES[fi].label), answer: list.indexOf(x.fam),
          tm: { ask, show: { inst: x }, why: x.why || '', more: '' },
        }));
      } else if (ask === 'pick') {
        const fi = nextFam(), F = FAMILIES[fi];
        const x = pickOne(rng, inFam(fi, mine));
        const got = gather(x, [others(fi, mine), others(fi, all), all.filter((y) => y.fam !== fi)], k, rng, () => false, name);
        out.push(question('tminst', i, {
          text: `Which of these is ${F.a} instrument?`, ...asChoices(got, rng, name),
          tm: { ask, why: x.why || '', more: `${isA(x, fi)}` },
        }));
      } else {
        // Which one isn't? k − 1 from one family (the quiz's own, then the rest of the family), one from another.
        const fi = nextFam(), F = FAMILIES[fi];
        const odd = pickOne(rng, others(fi, mine).length ? others(fi, mine) : others(fi, all));
        const got = gather(odd, [inFam(fi, mine), inFam(fi, all)], k, rng, () => false, name);
        out.push(question('tminst', i, {
          text: `Which of these is not ${F.a} instrument?`, ...asChoices(got, rng, name),
          tm: { ask, why: odd.why || '', more: `${isA(odd, odd.fam)}; the others are ${F.label.toLowerCase()}` },
        }));
      }
    }
    return out;
  }

  // ---------- hearing ----------
  // The melodies: Clefwork Melody's easy level, in a major or minor key with up to three sharps or
  // flats. A question asks for a short one (two measures) or a long one (four): changes need room to
  // grow, and a fast tempo gets through two measures too quickly. Each length has its own seed, and
  // neither is a dictation block's seed, so these aren't the melodies of a dictation on the same quiz.
  function melodies(seed, count, measures) {
    if (!count || !MQ.generateMelodies) return [];
    return MQ.generateMelodies(seed >>> 0, { on: true, count, measures, level: 2, tempo: 96, keyMode: 3, keyMax: 3, chromatic: 0, clefs: 1 })
      .map((raw) => { const ex = MQ.melodyExample(raw); return { meter: Object.assign({}, ex.meter), measures: ex.measures, key: Object.assign({}, ex.key), layers: [ex.layers[0].slice(0, ex.measures).map((m) => m.map(MQ.rhythmEvent))] }; });
  }
  // Gives each question (made with a `long` flag on its hearing) its melody — Clefwork's own, or the
  // opening of a phrase of a library piece: two measures, or four when long.
  function addMelodies(cfg, salt, qs, H0) {
    if (H0 && H0.lib && MQ.libraryIndexList) {
      // Chosen from the bundled index, so the questions are the same before the pieces have loaded.
      const kinds = MQ.LIBRARY_KINDS.filter((_, i) => H0.lib & (1 << i)).map((k) => k.id);
      const pool = MQ.libraryIndexList({ kind: kinds, heard: true, v: H0.libv }).filter((p) => p.bars >= 2);
      if (pool.length) {
        const rng = MQ.mulberry32(((cfg.seed >>> 0) ^ salt ^ 0x1b1b1b1b) >>> 0), next = dealer(pool, rng);
        qs.forEach((q) => {
          const H = q.tm.hear, P = next(), count = Math.min(P.bars, H.long ? 4 : 2), starts = [0];
          for (let b = 4; b + count <= P.bars; b += 4) starts.push(b);
          H.lib = { id: P.id, from: pickOne(rng, starts), count };
          q.tm.piece = P.id;
          delete H.long;
        });
        return qs;
      }
    }
    const long = qs.filter((q) => q.tm.hear.long).length;
    const two = melodies(((cfg.seed >>> 0) ^ salt ^ 0x2222) >>> 0, qs.length - long, 2);
    const four = melodies(((cfg.seed >>> 0) ^ salt ^ 0x4444) >>> 0, long, 4);
    qs.forEach((q) => { const H = q.tm.hear; H.mel = H.long ? four.shift() : two.shift(); delete H.long; });
    return qs;
  }
  // Levels (or tempos) the teacher chose, and at least two to work with.
  const chosen = (mask, n) => { const out = []; for (let i = 0; i < n; i++) if (mask & (1 << i)) out.push(i); return out.length >= 2 ? out : Array.from({ length: n }, (_, i) => i); };
  const dynName = (li) => DYNAMICS[HEAR_LEVELS[li].dyn];
  function hearDynamicsQuestions(cfg, s, n) {
    const H = s.hdyn, salt = 0x6d796e21;
    const rng = MQ.mulberry32(((cfg.seed >>> 0) ^ salt) >>> 0);
    const tasks = ['compare', 'name', 'change'].filter((_, b) => H.tasks & (1 << b));
    const nextTask = dealer(tasks.length ? tasks : ['compare'], rng);
    const levels = chosen(H.levels, HEAR_LEVELS.length), gap = H.spread ? 2 : 1;
    const changes = DYN_CHANGES.filter((_, b) => H.changes & (1 << b));
    const opts = changes.length >= 2 ? changes : DYN_CHANGES.slice(0, 3);
    const nextChange = dealer(opts, rng);
    const qs = [];
    for (let i = 0; i < n; i++) {
      const task = nextTask(), bpm = 88 + Math.floor(rng() * 25);          // a comfortable speed, 88–112
      if (task === 'change') {
        const c = nextChange();
        const lo = pickOne(rng, [0, 1]), hi = pickOne(rng, [4, 5]);
        const up = rng() < 0.5;
        const take = c.id === 'cresc' ? { db: lo, dbTo: hi, dyn: 'ramp' } : c.id === 'decresc' ? { db: hi, dbTo: lo, dyn: 'ramp' }
          : c.id === 'subito' ? (up ? { db: lo, dbTo: hi, dyn: 'subito' } : { db: hi, dbTo: lo, dyn: 'subito' }) : { db: pickOne(rng, [1, 3, 4]), dyn: 'steady' };
        const more = c.id === 'steady' ? `${dynName(take.db).sign} all the way through` : c.id === 'subito' ? `${dynName(take.db).sign}, then suddenly ${dynName(take.dbTo).sign}` : `from ${dynName(take.db).sign} to ${dynName(take.dbTo).sign}`;
        qs.push(question('tmhdyn', i, {
          text: 'Listen to the melody. What happens to its dynamics?', hint: 'Play the melody, then choose one answer.',
          choices: opts.map((o) => o.label), answer: opts.indexOf(c),
          tm: { ask: task, hear: { task, kind: 'dyn', long: true, takes: [Object.assign({ bpm }, take)] }, more },
        }));
      } else if (task === 'name') {
        // The first time is mf; the second is one of the levels, and the choices are levels too.
        const b = pickOne(rng, levels);
        const far = (list) => list.filter((x) => x === b || Math.abs(x - b) >= gap);
        const got = gather(b, [far(levels), far(HEAR_LEVELS.map((_, x) => x))], s.choices, rng, () => false, (x) => dynName(x).sign);
        const t = dynName(b);
        qs.push(question('tmhdyn', i, {
          text: 'You’ll hear a melody twice. The first time is mf. Which marking fits the second time?', hint: 'Play the melody, then choose one answer.',
          ...asChoices(got, rng, (x) => dynName(x).sign, (x, y) => x - y),
          tm: { ask: task, choiceKind: 'dyn', hear: { task, kind: 'dyn', takes: [{ bpm, db: MF }, { bpm, db: b }] }, more: `${t.name}, ${t.means}`,
            parts: ['You’ll hear a melody twice. The first time is ', { sign: DYNAMICS[4] }, '. Which marking fits the second time?'] },
        }));
      } else {
        // Louder, softer or the same: two levels at least `gap` apart, or (a quarter of the time) one.
        const a = pickOne(rng, levels);
        const apart = levels.filter((x) => Math.abs(x - a) >= gap);
        const b = rng() < 0.25 || !apart.length ? a : pickOne(rng, apart);
        qs.push(question('tmhdyn', i, {
          text: 'You’ll hear a melody twice. Was it louder or softer the second time?', hint: 'Play the melody, then choose one answer.',
          choices: SAME.slice(), answer: b > a ? 0 : b < a ? 1 : 2,
          tm: { ask: task, hear: { task, kind: 'dyn', takes: [{ bpm, db: a }, { bpm, db: b }] }, more: `the first time ${dynName(a).sign}, the second time ${dynName(b).sign}` },
        }));
      }
    }
    return addMelodies(cfg, salt, qs, H);
  }
  function hearTempoQuestions(cfg, s, n) {
    const H = s.htempo, salt = 0x7e3b0a11;
    const rng = MQ.mulberry32(((cfg.seed >>> 0) ^ salt) >>> 0);
    const tasks = ['compare', 'name', 'change'].filter((_, b) => H.tasks & (1 << b));
    const nextTask = dealer(tasks.length ? tasks : ['name'], rng);
    const tempos = chosen(H.tempos, HEAR_TEMPOS.length), gap = H.spread ? 2 : 1;
    const changes = TEMPO_CHANGES.filter((_, b) => H.changes & (1 << b));
    const opts = changes.length >= 2 ? changes : TEMPO_CHANGES.slice(0, 3);
    const nextChange = dealer(opts, rng), nextTempo = dealer(tempos, rng);
    const beat = H.beat;
    const termOf = (x) => TEMPOS[HEAR_TEMPOS[x].tempo];
    const qs = [];
    for (let i = 0; i < n; i++) {
      const task = nextTask();
      if (task === 'change') {
        const c = nextChange(), bpm = 84 + Math.floor(rng() * 21);
        const to = c.id === 'accel' ? Math.round(bpm * 1.65) : c.id === 'steady' ? bpm : Math.round(bpm * 0.58);
        const more = c.id === 'accel' ? `${bpm} speeding up to ${to} beats a minute` : c.id === 'rit' ? `${bpm} slowing to ${to} beats a minute`
          : c.id === 'atempo' ? `${bpm} beats a minute, slowing to ${to}, then back to ${bpm}` : `${bpm} beats a minute all the way through`;
        qs.push(question('tmhtempo', i, {
          text: 'Listen to the melody. What happens to its tempo?', hint: 'Play the melody, then choose one answer.',
          choices: opts.map((o) => o.label), answer: opts.indexOf(c),
          tm: { ask: task, hear: { task, kind: 'tempo', beat, long: true, takes: [{ bpm, bpmTo: to, tempo: c.id, db: MF }] }, more },
        }));
      } else if (task === 'name') {
        const x = nextTempo(), bpm = HEAR_TEMPOS[x].bpm + Math.floor(rng() * 7) - 3;
        const far = (list) => list.filter((y) => y === x || Math.abs(y - x) >= gap);
        const got = gather(x, [far(tempos), far(HEAR_TEMPOS.map((_, y) => y))], s.choices, rng, () => false, (y) => termOf(y).term);
        const t = termOf(x);
        qs.push(question('tmhtempo', i, {
          text: 'Listen to the melody. Which tempo marking fits it best?', hint: 'Play the melody, then choose one answer.',
          ...asChoices(got, rng, (y) => termOf(y).term, (a, b) => a - b),
          tm: { ask: task, choiceKind: 'tempo', hear: { task, kind: 'tempo', beat, long: bpm >= 100, takes: [{ bpm, db: MF }] }, more: `${bpm} beats a minute — ${t.term} is ${t.means}, about ${bpmText(t)}` },
        }));
      } else {
        // Faster, slower or the same: a ratio of 1.4–1.6 (1.18–1.28 when the choices are close together).
        const a = 72 + Math.floor(rng() * 49);
        const r = H.spread ? 1.4 + rng() * 0.2 : 1.18 + rng() * 0.1;
        const same = rng() < 0.25, up = rng() < 0.5;
        const b = same ? a : Math.round(up ? a * r : a / r);
        qs.push(question('tmhtempo', i, {
          text: 'You’ll hear a melody twice. Was it faster or slower the second time?', hint: 'Play the melody, then choose one answer.',
          choices: SAME_T.slice(), answer: same ? 2 : up ? 0 : 1,
          tm: { ask: task, hear: { task, kind: 'tempo', beat, long: Math.max(a, b) >= 130, takes: [{ bpm: a, db: MF }, { bpm: b, db: MF }] }, more: `${a}, then ${b} beats a minute` },
        }));
      }
    }
    return addMelodies(cfg, salt, qs, H);
  }

  // ---------- vocabulary ----------
  // A term and its definition, either way round. The other choices come from the same category first,
  // since those are the ones worth telling apart, then from the quiz's other terms.
  const vocabClash = (a, b) => a.tags.some((t) => b.tags.includes(t));
  function vocabQuestions(cfg, s, n) {
    if (!n || !MQ.TERM_VOCAB) return [];
    const rng = MQ.mulberry32(((cfg.seed >>> 0) ^ 0x0c4b1a2d) >>> 0);
    const V = s.vocab, pool = MQ.TERM_VOCAB.filter((t) => t.since <= s.gen);
    const inCats = (t) => !!(V.cats & (1 << t.cat)), ok = (t) => !V.book || t.pg > 0;
    // Only the book's terms, in categories that have none, falls back to those categories' terms.
    let mine = pool.filter((t) => inCats(t) && ok(t));
    if (!mine.length) mine = pool.filter(inCats);
    const asks = ['means', 'term'].filter((_, b) => V.ask & (1 << b));
    const nextAsk = dealer(asks.length ? asks : ['means'], rng), nextTerm = dealer(mine, rng);
    const where = (t) => (t.pg ? `textbook p. ${t.pg}` : '');
    const out = [];
    for (let i = 0; i < n; i++) {
      const ask = nextAsk(), t = nextTerm();
      const same = (x) => x.cat === t.cat;
      const lists = [mine.filter(same), mine, pool.filter((x) => same(x) && ok(x)), pool.filter(ok)];
      if (ask === 'term') {
        const got = gather(t, lists, s.choices, rng, vocabClash, (x) => x.term);
        out.push(question('tmvocab', i, {
          text: `Which term means “${t.means}”?`, ...asChoices(got, rng, (x) => x.term),
          tm: { ask, choiceKind: 'tempo', more: where(t), vcat: t.cat },
        }));
      } else {
        const got = gather(t, lists, s.choices, rng, vocabClash, (x) => x.means);
        out.push(question('tmvocab', i, {
          text: `Which definition fits “${t.term}”?`, ...asChoices(got, rng, (x) => x.means),
          tm: { ask, show: { vocab: t }, more: [t.term, where(t)].filter(Boolean).join(', '), vcat: t.cat, parts: ['Which definition fits ', { term: t }, '?'] },
        }));
      }
    }
    return out;
  }

  // ---------- the questions ----------
  function termQuestions(cfg) {
    const c = cfg.counts || {};
    if (!TERM_COUNTS.some((k) => c[k] > 0)) return [];
    const s = termSettings(cfg.terms);
    const n = (k, max) => clamp(c[k] | 0, 0, max);
    return [].concat(
      dynamicsQuestions(cfg, s, n('tmdyn', MAX)),
      tempoQuestions(cfg, s, n('tmtempo', MAX)),
      instrumentQuestions(cfg, s, n('tminst', MAX)),
      vocabQuestions(cfg, s, n('tmvocab', MAX)),
      hearDynamicsQuestions(cfg, s, n('tmhdyn', HEAR_MAX)),
      hearTempoQuestions(cfg, s, n('tmhtempo', HEAR_MAX)));
  }
  // The answer key: the right choice, and what goes with it.
  function describeTerm(q) {
    const a = q.choices[q.answer], more = q.tm.more || q.tm.why;
    return !more ? a : a.includes(' — ') ? `${a} (${more})` : `${a} — ${more}`;
  }
  const TERM_TABS = [
    { id: 'tmdyn', label: 'Dynamics', max: MAX, blurb: 'Dynamic markings from ppp to fff, sfz and fp, crescendo, decrescendo and diminuendo, and the hairpins: what a marking means, the marking for a meaning, its Italian name, or which of several is the loudest or softest.' },
    { id: 'tmtempo', label: 'Tempo', max: MAX, blurb: 'Tempo markings from Grave to Prestissimo, and accelerando, ritardando, rallentando, a tempo and rubato: what a term means, the term for a meaning, which is the fastest or slowest, or about how many beats a minute.' },
    { id: 'tminst', label: 'Instruments', max: MAX, blurb: 'Instrument families — woodwind, brass, string, percussion and keyboard: which family an instrument is in, which of several belongs to a family, or which one doesn’t.' },
    { id: 'tmvocab', label: 'Vocabulary', max: MAX, blurb: 'The bold-face terms of the course textbook, with the page each is on, and other common musical terms, in categories you choose: the definition of a term, or the term for a definition.' },
    { id: 'tmhdyn', label: 'Hear Dynamics', max: HEAR_MAX, blurb: 'A melody played twice — louder or softer the second time, or which marking fits it when the first time is mf — or played once, getting louder, getting softer, staying the same or changing suddenly.' },
    { id: 'tmhtempo', label: 'Hear Tempo', max: HEAR_MAX, blurb: 'A melody played at a tempo to name, from Largo to Presto; played twice, faster or slower the second time; or played once, speeding up, slowing down or keeping steady.' },
  ];
  const termCat = (q) => (TERM_TABS.find((t) => t.id === q.tm.cat) || TERM_TABS[0]).label;

  // ---------- playing a listening question ----------
  // Each take is one playing of the melody: its tempo (bpm; with tempo 'accel' or 'rit' it moves to
  // bpmTo from the second measure on, and with 'atempo' slows through the third measure and is back for
  // the fourth) and its dynamic (db, an index into HEAR_LEVELS; with dyn 'ramp' it moves to dbTo note
  // by note, and with 'subito' jumps there halfway). Takes follow each other with a short gap. Notes go
  // to the 'dyn' bus, which skips the compressor so loud stays loud, and louder notes are brighter, as a
  // piano's are. Returns {events, marks (the start of each take), total} for MQ.Audio.sequence.
  const GAP = 1.4;
  const gainOf = (li) => 0.42 * Math.pow(10, HEAR_LEVELS[clamp(Math.round(li), 0, 5)].db / 20);
  const gainAt = (db) => 0.42 * Math.pow(10, db / 20);
  const brightAt = (db) => 0.55 + (0.85 * (db + 27.5)) / 27.5;
  function timeline(tk, beats, bar) {
    const bpmAt = (b) => {
      if (tk.tempo === 'accel' || tk.tempo === 'rit') return b < bar ? tk.bpm : tk.bpm + ((tk.bpmTo - tk.bpm) * (b - bar)) / Math.max(1e-6, beats - bar);
      if (tk.tempo === 'atempo') {
        const from = beats / 2, to = (beats * 3) / 4;
        return b < from || b >= to ? tk.bpm : tk.bpm + ((tk.bpmTo - tk.bpm) * (b - from)) / (to - from);
      }
      return tk.bpm;
    };
    // Seconds at every 1/48 of a beat, added up; the time of a beat is read between them.
    const step = 1 / 48, n = Math.ceil(beats / step) + 1, at = [0];
    for (let i = 1; i <= n; i++) at.push(at[i - 1] + (60 / bpmAt((i - 0.5) * step)) * step);
    return (b) => { const x = clamp(b / step, 0, n), i = Math.floor(x); return i >= n ? at[n] : at[i] + (at[i + 1] - at[i]) * (x - i); };
  }
  // A melody too short to judge is played more than once, as one longer melody: a change gets at
  // least 12 beats, and a take at least 4 seconds at its fastest (6 to name a tempo) — up to 4 times.
  // The notes of a listening question's melody — Clefwork's, or a library piece's measures (with its
  // chords) — as {u, d, m, midi[]}, with the meter and how many measures.
  function hearNotes(H) {
    if (H.lib) {
      const P = MQ.libraryPiece && MQ.libraryPiece(H.lib.id);
      if (!P) return null;
      return { meter: P.meter, measures: H.lib.count, notes: MQ.libraryNotes(P, { from: H.lib.from, to: H.lib.from + H.lib.count - 1 }) };
    }
    const M = H.mel, info = MQ.rhythmMeter(M.meter), notes = [];
    for (let m = 0; m < M.measures; m++) {
      let at = m * info.len;
      (M.layers[0][m] || []).forEach((e) => { const d = MQ.rhythmDur(e); if (!e.r && e.p) notes.push({ u: at, d, m, midi: [MQ.midi(e.p)] }); at += d; });
    }
    return { meter: M.meter, measures: M.measures, notes };
  }
  // A melody too short to judge is played more than once, as one longer melody: a change gets at
  // least 12 beats, and a take at least 4 seconds at its fastest (6 to name a tempo) — up to 4 times.
  function termPlayEvents(q) {
    const H = q.tm.hear, got = hearNotes(H);
    if (!got) return { events: [], marks: [], total: 0 };
    const info = MQ.rhythmMeter(got.meter), upb = MQ.RHYTHM_TEMPO_UNITS[info.tempo];
    const once = (got.measures * info.len) / upb;
    const fastest = Math.max(...H.takes.map((tk) => Math.max(tk.bpm, tk.bpmTo || 0)));
    const reps = clamp(H.task === 'change' ? Math.ceil(12 / once) : Math.ceil((H.kind === 'tempo' && H.task === 'name' ? 6 : 4) / ((once * 60) / fastest)), 1, 4);
    const bars = got.measures * reps, notes = [];
    for (let r = 0; r < reps; r++) got.notes.forEach((n) => notes.push({ u: n.u + r * got.measures * info.len, d: n.d, m: n.m + r * got.measures, midi: n.midi }));
    const beats = once * reps, bar = info.len / upb;
    const lastU = notes.length ? Math.max(...notes.map((n) => n.u)) : 1;
    const events = [], marks = [];
    let t0 = 0;
    H.takes.forEach((tk, j) => {
      const time = timeline(tk, beats, bar);
      marks.push({ at: t0, take: j });
      notes.forEach((nt) => {
        const from = HEAR_LEVELS[tk.db].db, to = tk.dbTo != null ? HEAR_LEVELS[tk.dbTo].db : from;
        const db = tk.dyn === 'ramp' ? from + ((to - from) * nt.u) / Math.max(1, lastU) : tk.dyn === 'subito' && nt.m >= bars / 2 ? to : from;
        const at = time(nt.u / upb), end = time((nt.u + nt.d) / upb), k = Math.sqrt(nt.midi.length);
        nt.midi.forEach((midi) => events.push({ at: t0 + at, dur: Math.max(0.08, end - at), voice: 'piano', midi, vel: gainAt(db) / k, bright: brightAt(db), bus: 'dyn' }));
      });
      if (H.beat) for (let m = 0; m < bars; m++) info.beats.forEach((bt, k) => events.push({ at: t0 + time((m * info.len + bt.at) / upb), voice: 'click', accent: k === 0 }));
      t0 += time(beats) + (j < H.takes.length - 1 ? GAP : 0);
    });
    return { events, marks, total: t0 };
  }
  // A sound check at mf: a broken C major chord, so students can set their volume before they listen.
  function termSoundCheck() {
    const events = [60, 64, 67, 72].map((m, i) => ({ at: i * 0.32, dur: i === 3 ? 1.1 : 0.32, voice: 'piano', midi: m, vel: gainOf(MF), bright: brightAt(HEAR_LEVELS[MF].db), bus: 'dyn' }));
    return { events, marks: [], total: 2.2 };
  }

  Object.assign(MQ, {
    TERM_COUNTS, TERMS_MAX: MAX, TERMS_HEAR_MAX: HEAR_MAX, TERM_TABS, TERM_BITS, TERM_DYNAMICS: DYNAMICS, TERM_TEMPOS: TEMPOS, TERM_FAMILIES: FAMILIES,
    TERM_HEAR_LEVELS: HEAR_LEVELS, TERM_HEAR_TEMPOS: HEAR_TEMPOS, TERM_DYN_CHANGES: DYN_CHANGES, TERM_TEMPO_CHANGES: TEMPO_CHANGES,
    termSettings, termCount, termQuestions, describeTerm, termCat, termPlayEvents, termSoundCheck, termBpmText: bpmText,
  });
})(typeof window !== 'undefined' ? window : globalThis);
