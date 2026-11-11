import { config } from '../config.js';
import { askJSON, AIError } from './ai.js';
import { MODES, paraphrasePrompt, grammarPrompt, summaryPrompt } from './prompts.js';
import { demoRewriteSentence, demoGrammar, demoSummary } from './demo.js';
import { countWords, toSentenceList, chunkByWords, splitParagraphs, splitSentences, clampText } from '../utils/text.js';

const TEMPERATURE = { fluency: 0.3, formal: 0.5, academic: 0.5, simple: 0.5, shorten: 0.5, creative: 0.95, natural: 0.85 };

function checkLength(text, limit) {
  const words = countWords(text);
  if (!words) throw new AIError('Please enter some text first.', 400);
  if (words > limit) throw new AIError(`That's ${words} words. The limit here is ${limit} words per run.`, 413);
  return words;
}

export function cleanOptions(body = {}) {
  const mode = MODES[body.mode] ? body.mode : 'standard';
  const synonymLevel = [1, 2, 3].includes(Number(body.synonymLevel)) ? Number(body.synonymLevel) : 2;
  const freezeWords = Array.isArray(body.freezeWords)
    ? [...new Set(body.freezeWords.map((w) => String(w).trim()).filter(Boolean))].slice(0, 30).map((w) => w.slice(0, 60))
    : [];
  return {
    mode,
    synonymLevel,
    freezeWords,
    customInstruction: clampText(body.customInstruction, 300),
    voiceSample: clampText(body.voiceSample, 2000),
  };
}

const containsWord = (haystack, word) => haystack.toLowerCase().includes(word.toLowerCase());

export async function paraphrase(text, opts) {
  const words = checkLength(text, config.limits.textWords);
  const list = toSentenceList(text);
  const chunks = chunkByWords(list.map((s, i) => ({ ...s, id: i })), (s) => s.text, 600);

  const results = [];
  for (const chunk of chunks) {
    const sentences = chunk.map((s) => s.text);
    const { system, prompt } = paraphrasePrompt({ sentences, ...opts });
    const data = await askJSON({
      system,
      prompt,
      temperature: TEMPERATURE[opts.mode] ?? 0.7,
      demo: () => ({ items: sentences.map((s, i) => ({ id: i + 1, ...demoRewriteSentence(s, opts) })) }),
    });
    const byId = new Map((data.items || []).map((it) => [Number(it.id), it]));
    chunk.forEach((s, i) => {
      // Fall back to position if the model dropped ids.
      const item = byId.get(i + 1) || (data.items || [])[i];
      let rewritten = typeof item?.rewritten === 'string' && item.rewritten.trim() ? item.rewritten.trim() : s.text;
      let reason = item?.reason ? String(item.reason).slice(0, 140) : 'Kept as it was';
      const broken = opts.freezeWords.find((w) => containsWord(s.text, w) && !containsWord(rewritten, w));
      if (broken) {
        rewritten = s.text;
        reason = `Kept original to protect "${broken}"`;
      }
      results.push({ id: s.id, p: s.p, original: s.text, rewritten, reason, changed: rewritten !== s.text });
    });
  }

  return {
    sentences: results,
    stats: { words, sentences: results.length, changed: results.filter((r) => r.changed).length },
  };
}

export async function compareModes(text, opts, modes) {
  const picked = [...new Set((modes || []).filter((m) => MODES[m] && m !== 'custom'))].slice(0, 3);
  if (picked.length < 2) throw new AIError('Pick two or three modes to compare.', 400);
  checkLength(text, Math.round(config.limits.textWords / 3));
  const runs = await Promise.all(picked.map((mode) => paraphrase(text, { ...opts, mode })));
  return { results: picked.map((mode, i) => ({ mode, label: MODES[mode].label, ...runs[i] })) };
}

export async function checkGrammar(text) {
  const words = checkLength(text, config.limits.textWords);
  const { system, prompt } = grammarPrompt(text);
  const data = await askJSON({ system, prompt, temperature: 0.1, demo: () => demoGrammar(text) });
  const seen = new Set();
  const issues = (data.issues || [])
    .filter((i) => i && typeof i.original === 'string' && typeof i.suggestion === 'string')
    .filter((i) => i.original !== i.suggestion && text.includes(i.original))
    .filter((i) => !seen.has(i.original) && seen.add(i.original))
    .map((i, idx) => ({
      id: idx,
      original: i.original,
      suggestion: i.suggestion,
      type: ['grammar', 'spelling', 'punctuation', 'clarity'].includes(i.type) ? i.type : 'grammar',
      explanation: String(i.explanation || '').slice(0, 200),
    }));
  return { issues, stats: { words, issues: issues.length } };
}

export async function summarize(text, { format, length }) {
  const words = checkLength(text, config.limits.summaryWords);
  const fmt = format === 'bullets' ? 'bullets' : 'paragraph';
  const len = ['short', 'medium', 'long'].includes(length) ? length : 'medium';
  const { system, prompt } = summaryPrompt(text, { format: fmt, length: len });
  const data = await askJSON({
    system,
    prompt,
    temperature: 0.3,
    demo: () => demoSummary(splitParagraphs(text).flatMap(splitSentences), { format: fmt, length: len }),
  });
  const keyPoints = Array.isArray(data.keyPoints) ? data.keyPoints.map(String).filter(Boolean) : [];
  const summary = typeof data.summary === 'string' ? data.summary.trim() : '';
  return {
    title: String(data.title || '').slice(0, 80),
    format: fmt,
    summary: fmt === 'paragraph' ? summary || keyPoints.join(' ') : '',
    keyPoints: fmt === 'bullets' ? (keyPoints.length ? keyPoints : splitSentences(summary)) : [],
    stats: { words, summaryWords: countWords(summary || keyPoints.join(' ')) },
  };
}
