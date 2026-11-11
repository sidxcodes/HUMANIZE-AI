const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });

export const countWords = (text = '') => (text.trim().match(/\S+/g) || []).length;

/** Normalise line endings and trim each paragraph; keeps paragraph order. */
export function splitParagraphs(text = '') {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Split one paragraph into sentences. */
export function splitSentences(paragraph = '') {
  const out = [];
  for (const { segment } of segmenter.segment(paragraph)) {
    const s = segment.trim();
    if (!s) continue;
    // Intl splits after abbreviations like "e.g." or "Dr." - glue very short fragments back on.
    if (out.length && /^(?:[a-z]|\(|\d)/.test(s) && /\b(?:e\.g|i\.e|etc|vs|Dr|Mr|Mrs|Ms|Prof|al|Fig|No)\.$/i.test(out[out.length - 1])) {
      out[out.length - 1] += ` ${s}`;
    } else {
      out.push(s);
    }
  }
  return out;
}

/** Text -> [{ p: paragraphIndex, text }] */
export function toSentenceList(text) {
  const list = [];
  splitParagraphs(text).forEach((para, p) => {
    for (const s of splitSentences(para)) list.push({ p, text: s });
  });
  return list;
}

/** Group items into chunks whose combined word count stays under `maxWords`. */
export function chunkByWords(items, getText, maxWords) {
  const chunks = [];
  let current = [];
  let words = 0;
  for (const item of items) {
    const w = countWords(getText(item));
    if (current.length && words + w > maxWords) {
      chunks.push(current);
      current = [];
      words = 0;
    }
    current.push(item);
    words += w;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

export const clampText = (s, max) => (typeof s === 'string' ? s.slice(0, max) : '');
