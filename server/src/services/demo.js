// Offline stand-ins used when no API key is set, so the whole app can be clicked through.
// These are simple rule-based rewrites, clearly labelled "demo" in the UI. They are not AI.

const SWAPS = [
  ['utilize', 'use'], ['utilise', 'use'], ['in order to', 'to'], ['a large number of', 'many'],
  ['due to the fact that', 'because'], ['at this point in time', 'now'], ['in today\'s world', 'today'],
  ['it is important to note that', ''], ['moreover', 'also'], ['furthermore', 'also'],
  ['additionally', 'also'], ['delve into', 'look at'], ['plays a crucial role in', 'matters for'],
  ['significant', 'major'], ['numerous', 'many'], ['demonstrate', 'show'], ['facilitate', 'help'],
  ['commence', 'start'], ['approximately', 'about'], ['subsequently', 'later'], ['obtain', 'get'],
  ['however,', 'but'], ['therefore,', 'so'], ['important', 'key'], ['help', 'support'],
  ['shows', 'reveals'], ['big', 'large'], ['quick', 'fast'], ['very', 'really'],
];

const CONTRACTIONS = [
  ["don't", 'do not'], ["doesn't", 'does not'], ["can't", 'cannot'], ["won't", 'will not'],
  ["it's", 'it is'], ["isn't", 'is not'], ["aren't", 'are not'], ["we're", 'we are'], ["they're", 'they are'],
];

const FILLER = /\b(really|very|basically|actually|just|quite|simply|in fact|of course)\b\s*/gi;

function matchCase(source, replacement) {
  if (!replacement) return replacement;
  return source[0] === source[0].toUpperCase() ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
}

function protect(sentence, freezeWords) {
  const kept = [];
  let out = sentence;
  for (const w of freezeWords || []) {
    if (!w) continue;
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    out = out.replace(re, (m) => {
      kept.push(m);
      return `\u0000${kept.length - 1}\u0000`;
    });
  }
  return { out, restore: (s) => s.replace(/\u0000(\d+)\u0000/g, (_, i) => kept[+i]) };
}

function swapWords(s, limit) {
  let changed = 0;
  for (const [from, to] of SWAPS) {
    if (changed >= limit) break;
    const re = new RegExp(`\\b${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(s)) {
      s = s.replace(re, (m) => matchCase(m, to));
      changed++;
    }
  }
  return { s: s.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:])/g, '$1').trim(), changed };
}

export function demoRewriteSentence(sentence, { mode = 'standard', synonymLevel = 2, freezeWords = [] } = {}) {
  const { out, restore } = protect(sentence, freezeWords);
  let s = out;
  let reason = 'Demo mode: swapped a few words';

  switch (mode) {
    case 'fluency':
      s = s.replace(/\s{2,}/g, ' ');
      reason = 'Demo mode: light clean-up only';
      ({ s } = swapWords(s, 1));
      break;
    case 'formal':
    case 'academic':
      for (const [c, full] of CONTRACTIONS) s = s.replace(new RegExp(`\\b${c}\\b`, 'gi'), (m) => matchCase(m, full));
      ({ s } = swapWords(s, synonymLevel));
      reason = 'Demo mode: removed contractions, firmer wording';
      break;
    case 'shorten':
      s = s.replace(FILLER, '');
      ({ s } = swapWords(s, 3));
      reason = 'Demo mode: cut filler words';
      break;
    case 'simple':
      ({ s } = swapWords(s, 4));
      reason = 'Demo mode: swapped long words for plain ones';
      break;
    case 'expand':
      ({ s } = swapWords(s, synonymLevel));
      s = s.replace(/\.$/, ', which is worth keeping in mind.');
      reason = 'Demo mode: added a linking phrase';
      break;
    case 'natural':
      ({ s } = swapWords(s, synonymLevel + 1));
      s = s.replace(FILLER, '');
      reason = 'Demo mode: cut stock phrases and filler';
      break;
    default:
      ({ s } = swapWords(s, synonymLevel));
  }

  s = restore(s.trim());
  if (s && !/[.!?]["')\]]?$/.test(s) && /[.!?]["')\]]?$/.test(sentence)) s += '.';
  if (s) s = s[0].toUpperCase() + s.slice(1);
  if (s === sentence) reason = 'Demo mode: no change needed';
  return { rewritten: s || sentence, reason };
}

const MISSPELLINGS = {
  teh: 'the', recieve: 'receive', alot: 'a lot', definately: 'definitely', seperate: 'separate',
  occured: 'occurred', untill: 'until', wich: 'which', thier: 'their', becuase: 'because',
  accomodate: 'accommodate', goverment: 'government', enviroment: 'environment', beleive: 'believe',
};

export function demoGrammar(text) {
  const issues = [];
  const seen = new Set();
  const add = (original, suggestion, type, explanation) => {
    if (!original || seen.has(original) || !text.includes(original)) return;
    seen.add(original);
    issues.push({ original, suggestion, type, explanation });
  };
  for (const [bad, good] of Object.entries(MISSPELLINGS)) {
    const m = text.match(new RegExp(`\\b${bad}\\b`, 'i'));
    if (m) add(m[0], matchCase(m[0], good), 'spelling', `"${m[0]}" is spelled "${good}".`);
  }
  for (const m of text.matchAll(/\b(a) ([aeiou]\w+)/gi)) {
    if (/^(an|a|one|use|user|usual|university|unique|european|eu)/i.test(m[2])) continue;
    add(m[0], `${matchCase(m[1], 'an')} ${m[2]}`, 'grammar', 'Use "an" before a vowel sound.');
  }
  for (const m of text.matchAll(/\b(an?) (an?)\b/gi)) add(m[0], m[2], 'grammar', 'Two articles in a row; keep one.');
  if (/ i /.test(text)) add(' i ', ' I ', 'grammar', '"I" is always a capital letter.');
  for (const m of text.matchAll(/\b(\w+) \1\b/gi)) add(m[0], m[1], 'grammar', 'The same word appears twice in a row.');
  for (const m of text.matchAll(/[^\s] {2,}[^\s]/g)) add(m[0], m[0].replace(/ {2,}/, ' '), 'punctuation', 'Remove the extra space.');
  for (const m of text.matchAll(/([.!?]) ([a-z])(\w*)/g)) {
    if (/\b(e\.g|i\.e|etc|vs|al)$/i.test(text.slice(Math.max(0, m.index - 4), m.index))) continue;
    add(m[0], `${m[1]} ${m[2].toUpperCase()}${m[3]}`, 'grammar', 'Start a new sentence with a capital letter.');
  }
  return { issues: issues.slice(0, 25) };
}

export function demoSummary(sentences, { format, length }) {
  const n = { short: 2, medium: 4, long: 7 }[length] || 4;
  // Keep the longest sentences, in their original order: a crude stand-in for "most informative".
  const picked = sentences
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.length - a.s.length)
    .slice(0, n)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.s);
  return {
    title: 'Demo summary',
    summary: format === 'bullets' ? '' : picked.join(' '),
    keyPoints: format === 'bullets' ? picked : [],
  };
}
