// Every mode the paraphraser offers. All modes are free.
export const MODES = {
  standard: {
    label: 'Standard',
    hint: 'Balanced rewrite',
    rule: 'Rewrite each sentence with fresh wording and structure while keeping the exact meaning.',
  },
  fluency: {
    label: 'Fluency',
    hint: 'Fix awkward bits only',
    rule: 'Make only the changes needed to sound fluent and correct. Leave sentences that already read well almost untouched.',
  },
  natural: {
    label: 'Natural',
    hint: 'Sounds like a person wrote it',
    rule: 'Make the writing sound like a thoughtful person wrote it: mix short and long sentences, prefer plain concrete words, cut filler and stock phrases such as "delve", "moreover", "it is important to note", "in today\'s world", "plays a crucial role". Do not add slang, typos or fake mistakes.',
  },
  formal: {
    label: 'Formal',
    hint: 'Professional tone',
    rule: 'Use a formal, professional tone. No contractions, no slang, precise vocabulary.',
  },
  academic: {
    label: 'Academic',
    hint: 'For papers and reports',
    rule: 'Use a clear academic register suitable for a research paper: precise terms, measured claims, no contractions, no first-person unless the original uses it.',
  },
  simple: {
    label: 'Simple',
    hint: 'Plain, easy English',
    rule: 'Use plain English a 14-year-old could follow. Short sentences, common words, explain jargon in simple words when it appears.',
  },
  creative: {
    label: 'Creative',
    hint: 'More vivid',
    rule: 'Rewrite more boldly with vivid, varied wording and fresh sentence structures, while keeping every fact the same.',
  },
  shorten: {
    label: 'Shorten',
    hint: 'Same point, fewer words',
    rule: 'Make each sentence noticeably shorter (aim for 30-50% fewer words) without losing any fact. Remove repetition and filler.',
  },
  expand: {
    label: 'Expand',
    hint: 'Add clarity',
    rule: 'Expand each sentence slightly with clarifying wording and smoother links between ideas. Never invent facts, numbers, examples or citations.',
  },
  custom: {
    label: 'Custom',
    hint: 'Your own instruction',
    rule: '', // filled from the user's instruction
  },
};

const SYNONYM_LEVEL = {
  1: 'Change words lightly; keep most of the original vocabulary.',
  2: 'Change words moderately.',
  3: 'Change words heavily; use different vocabulary wherever it stays natural.',
};

const BASE_RULES = `Hard rules:
- Keep the original meaning, facts, numbers, names, dates and technical terms.
- Keep citations exactly as written, e.g. (Smith, 2020), [12], Smith et al. (2019).
- Keep text inside quotation marks exactly as written.
- Never add new facts, statistics, examples or sources.
- Reply in the same language as the input.
- Reply with JSON only, no markdown.`;

export function modeRule(mode, customInstruction) {
  if (mode === 'custom') {
    const instr = (customInstruction || '').trim();
    return instr ? `Follow this instruction from the writer: "${instr}"` : MODES.standard.rule;
  }
  return (MODES[mode] || MODES.standard).rule;
}

function voiceBlock(voiceSample) {
  if (!voiceSample?.trim()) return '';
  return `\nMatch the writer's own style. Here is a sample of how they write (copy their rhythm, word choice and sentence length, not the content):\n"""\n${voiceSample.trim()}\n"""\n`;
}

export function paraphrasePrompt({ sentences, mode, customInstruction, synonymLevel, freezeWords, voiceSample }) {
  const system = `You are a careful writing assistant that rewrites text sentence by sentence.\n${BASE_RULES}`;
  const freeze = freezeWords?.length
    ? `\nThese words or phrases must appear unchanged in the rewrite wherever they appear in the original: ${freezeWords.map((w) => `"${w}"`).join(', ')}.`
    : '';
  const prompt = `Style: ${modeRule(mode, customInstruction)}
Word change level: ${SYNONYM_LEVEL[synonymLevel] || SYNONYM_LEVEL[2]}${freeze}
${voiceBlock(voiceSample)}
Rewrite each numbered sentence below. Return exactly ${sentences.length} items, in the same order, as:
{"items":[{"id":<number>,"rewritten":"<new sentence>","reason":"<under 12 words: what you changed and why>"}]}

Sentences:
${sentences.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
  return { system, prompt };
}

export function grammarPrompt(text) {
  const system = `You are a careful grammar checker. Find real grammar, spelling, punctuation and clarity problems. Do not rewrite for style. Do not flag correct text.\nReply with JSON only, no markdown.`;
  const prompt = `Check this text. For each problem give the exact original snippet (copied character for character from the text, short as possible but unique), the fix, its type, and a one-line explanation in simple English.
Return: {"issues":[{"original":"...","suggestion":"...","type":"grammar|spelling|punctuation|clarity","explanation":"..."}]}
If there are no problems return {"issues":[]}.

Text:
"""
${text}
"""`;
  return { system, prompt };
}

export function summaryPrompt(text, { format, length }) {
  const size = { short: '2-3 sentences or 3 points', medium: '4-6 sentences or 5 points', long: '8-10 sentences or 8 points' }[length] || '4-6 sentences or 5 points';
  const system = `You are a careful summarizer. Summaries are accurate, neutral and only use facts from the text.\nReply with JSON only, no markdown.`;
  const prompt = `Summarize the text below. Length: ${size}. Format: ${format === 'bullets' ? 'key points' : 'one paragraph'}.
Return: {"summary":"<paragraph, empty if bullets>","keyPoints":["..."],"title":"<a 3-7 word title>"}

Text:
"""
${text}
"""`;
  return { system, prompt };
}

export function docRewritePrompt({ paragraphs, mode, customInstruction, synonymLevel, freezeWords, voiceSample }) {
  const system = `You are a careful writing assistant rewriting paragraphs from a document.\n${BASE_RULES}`;
  const freeze = freezeWords?.length ? `\nKeep these words unchanged: ${freezeWords.map((w) => `"${w}"`).join(', ')}.` : '';
  const prompt = `Style: ${modeRule(mode, customInstruction)}
Word change level: ${SYNONYM_LEVEL[synonymLevel] || SYNONYM_LEVEL[2]}${freeze}
${voiceBlock(voiceSample)}
Rewrite each paragraph. Keep each paragraph as one paragraph. Return exactly ${paragraphs.length} items in the same order:
{"items":[{"id":<number>,"text":"<rewritten paragraph>"}]}

Paragraphs:
${paragraphs.map((p, i) => `[${i + 1}] ${p.text}`).join('\n\n')}`;
  return { system, prompt };
}

export function docRevisionPrompt({ paragraphs, instruction }) {
  const system = `You are a careful writing assistant revising a document the writer already rewrote. Apply the writer's change request only where it applies.\n${BASE_RULES}`;
  const prompt = `The writer's change request: "${instruction}"

Each paragraph below shows the section heading it sits under. Apply the request only to the paragraphs it is about. Return every other paragraph exactly as given.
Return exactly ${paragraphs.length} items in the same order:
{"items":[{"id":<number>,"text":"<paragraph>","changed":true|false}]}

Paragraphs:
${paragraphs.map((p, i) => `[${i + 1}] (section: ${p.section || 'none'}) ${p.text}`).join('\n\n')}`;
  return { system, prompt };
}
