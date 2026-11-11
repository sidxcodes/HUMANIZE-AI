import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { askJSON, AIError } from './ai.js';
import { docRewritePrompt, docRevisionPrompt } from './prompts.js';
import { demoRewriteSentence } from './demo.js';
import { countWords, chunkByWords, splitSentences } from '../utils/text.js';

const DOC_PATH = 'word/document.xml';

// Things inside a paragraph that we must not flatten, or the document breaks.
const UNSAFE_TAGS = [
  'w:hyperlink', 'w:fldSimple', 'w:fldChar', 'w:instrText', 'w:footnoteReference', 'w:endnoteReference',
  'w:drawing', 'w:pict', 'w:object', 'm:oMath', 'm:oMathPara', 'w:ins', 'w:del', 'w:moveFrom', 'w:moveTo',
  'w:commentReference', 'w:sym', 'w:br', 'w:cr',
];
const SKIP_CONTAINERS = new Set(['w:tbl', 'w:txbxContent', 'w:footnote', 'w:endnote']);
const HEADING_STYLE = /^(heading|title|subtitle|toc|caption|quote|intensequote|tableoffigures|bibliography)/i;
const REFERENCES_HEADING = /^(\d+[.)]?\s*)?(references|reference list|bibliography|works cited|literature cited|sources)\b/i;
const MIN_WORDS = 8;

const children = (node, tag) => Array.from(node.childNodes || []).filter((c) => c.nodeName === tag);
const firstChild = (node, tag) => children(node, tag)[0] || null;

function insideSkippedContainer(node) {
  for (let n = node.parentNode; n; n = n.parentNode) if (SKIP_CONTAINERS.has(n.nodeName)) return true;
  return false;
}

function paragraphStyle(p) {
  const pPr = firstChild(p, 'w:pPr');
  if (!pPr) return { style: '', outline: false };
  const style = firstChild(pPr, 'w:pStyle')?.getAttribute('w:val') || '';
  return { style, outline: !!firstChild(pPr, 'w:outlineLvl') };
}

function paragraphText(p) {
  let text = '';
  const walk = (node) => {
    for (const c of Array.from(node.childNodes || [])) {
      if (c.nodeName === 'w:t') text += c.textContent;
      else if (c.nodeName === 'w:tab') text += '\t';
      else if (c.nodeName === 'w:pPr' || c.nodeName === 'w:rPr') continue;
      else if (c.childNodes) walk(c);
    }
  };
  walk(p);
  return text;
}

function allRunsBold(p) {
  const runs = children(p, 'w:r').filter((r) => r.getElementsByTagName('w:t').length);
  return runs.length > 0 && runs.every((r) => {
    const b = r.getElementsByTagName('w:b')[0];
    return b && !['0', 'false'].includes(b.getAttribute('w:val'));
  });
}

/** Read a .docx and classify every body paragraph. */
export async function analyzeDocx(buffer) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new AIError('That file is not a valid .docx document.', 400);
  }
  const file = zip.file(DOC_PATH);
  if (!file) throw new AIError('That file is not a valid .docx document.', 400);
  const xml = await file.async('string');
  const dom = new DOMParser().parseFromString(xml, 'text/xml');

  const paragraphs = [];
  let section = '';
  let inReferences = false;
  for (const p of Array.from(dom.getElementsByTagName('w:p'))) {
    if (insideSkippedContainer(p)) continue;
    const text = paragraphText(p);
    const trimmed = text.trim();
    if (!trimmed) continue;
    const { style, outline } = paragraphStyle(p);
    const words = countWords(trimmed);
    const heading = HEADING_STYLE.test(style) || outline || (words <= 12 && allRunsBold(p) && !/[.!?]$/.test(trimmed));
    if (heading) {
      section = trimmed.slice(0, 80);
      inReferences = REFERENCES_HEADING.test(trimmed);
    }
    const unsafe = UNSAFE_TAGS.some((t) => p.getElementsByTagName(t).length > 0);
    const eligible = !heading && !inReferences && !unsafe && words >= MIN_WORDS && !text.includes('\t');
    paragraphs.push({ node: p, text: trimmed, heading, section, eligible, words });
  }
  return { zip, dom, paragraphs, words: paragraphs.reduce((n, p) => n + p.words, 0) };
}

/** Replace a paragraph's text, keeping its paragraph style and the formatting of its first run. */
function setParagraphText(dom, p, text) {
  const runs = children(p, 'w:r').filter((r) => r.getElementsByTagName('w:t').length);
  if (!runs.length) return;
  const [keep, ...rest] = runs;
  const ts = Array.from(keep.getElementsByTagName('w:t'));
  const t = ts[0];
  while (t.firstChild) t.removeChild(t.firstChild);
  t.appendChild(dom.createTextNode(text));
  t.setAttribute('xml:space', 'preserve');
  for (const extra of ts.slice(1)) extra.parentNode.removeChild(extra);
  for (const tab of Array.from(keep.getElementsByTagName('w:tab'))) tab.parentNode.removeChild(tab);
  for (const r of rest) p.removeChild(r);
  for (const pe of children(p, 'w:proofErr')) p.removeChild(pe);
}

async function save(analysis) {
  const xml = new XMLSerializer().serializeToString(analysis.dom);
  analysis.zip.file(DOC_PATH, xml);
  return analysis.zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

export const preview = (analysis) =>
  analysis.paragraphs.map((p) => ({ text: p.text, heading: p.heading, editable: p.eligible }));

async function runInBatches(chunks, worker, concurrency = 2) {
  const out = new Array(chunks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, chunks.length) }, async () => {
      while (next < chunks.length) {
        const i = next++;
        out[i] = await worker(chunks[i], i);
      }
    }),
  );
  return out;
}

const keepsFrozen = (before, after, freezeWords) =>
  !freezeWords.some((w) => before.toLowerCase().includes(w.toLowerCase()) && !after.toLowerCase().includes(w.toLowerCase()));

/** Rewrite every eligible paragraph of a .docx in the chosen mode. */
export async function rewriteDocx(buffer, opts, onProgress = () => {}) {
  const analysis = await analyzeDocx(buffer);
  const targets = analysis.paragraphs.filter((p) => p.eligible);
  if (!targets.length) throw new AIError('No body paragraphs long enough to rewrite were found in this document.', 422);

  const chunks = chunkByWords(targets, (p) => p.text, 1200);
  let done = 0;
  let changed = 0;
  await runInBatches(chunks, async (chunk) => {
    const { system, prompt } = docRewritePrompt({ paragraphs: chunk, ...opts });
    const data = await askJSON({
      system,
      prompt,
      temperature: 0.7,
      demo: () => ({
        items: chunk.map((p, i) => ({
          id: i + 1,
          text: splitSentences(p.text).map((s) => demoRewriteSentence(s, opts).rewritten).join(' '),
        })),
      }),
    });
    const byId = new Map((data.items || []).map((it) => [Number(it.id), it]));
    chunk.forEach((p, i) => {
      const next = String((byId.get(i + 1) || data.items?.[i])?.text || '').trim();
      if (next && next !== p.text && keepsFrozen(p.text, next, opts.freezeWords)) {
        setParagraphText(analysis.dom, p.node, next);
        p.text = next;
        p.changed = true;
        changed++;
      }
    });
    done += chunk.length;
    onProgress(Math.round((done / targets.length) * 100));
  });

  return {
    buffer: await save(analysis),
    preview: analysis.paragraphs.map((p) => ({ text: p.text, heading: p.heading, editable: p.eligible, changed: !!p.changed })),
    changed,
    total: targets.length,
  };
}

const INSTRUCTION_MODE = [
  [/formal|professional/i, 'formal'], [/academic|scholarly/i, 'academic'], [/simple|easier|plain/i, 'simple'],
  [/short|concise|cut|trim/i, 'shorten'], [/expand|longer|detail/i, 'expand'], [/natural|human|flow/i, 'natural'],
];

/** Apply a free-text change request ("make the methods section more formal") to an existing version. */
export async function reviseDocx(buffer, instruction, onProgress = () => {}) {
  const analysis = await analyzeDocx(buffer);
  const targets = analysis.paragraphs.filter((p) => p.eligible);
  if (!targets.length) throw new AIError('No editable paragraphs were found in this version.', 422);

  const chunks = chunkByWords(targets, (p) => p.text, 1200);
  let done = 0;
  let changed = 0;
  await runInBatches(chunks, async (chunk) => {
    const { system, prompt } = docRevisionPrompt({ paragraphs: chunk, instruction });
    const data = await askJSON({
      system,
      prompt,
      temperature: 0.5,
      demo: () => {
        const mode = INSTRUCTION_MODE.find(([re]) => re.test(instruction))?.[1] || 'standard';
        const ask = instruction.toLowerCase();
        const sectionName = (p) => p.section.replace(/^\d+[.)]?\s*/, '').toLowerCase();
        const named = chunk.some((p) => p.section && ask.includes(sectionName(p)));
        return {
          items: chunk.map((p, i) => {
            const applies = !named || (p.section && ask.includes(sectionName(p)));
            return {
              id: i + 1,
              changed: applies,
              text: applies ? splitSentences(p.text).map((s) => demoRewriteSentence(s, { mode }).rewritten).join(' ') : p.text,
            };
          }),
        };
      },
    });
    const byId = new Map((data.items || []).map((it) => [Number(it.id), it]));
    chunk.forEach((p, i) => {
      const next = String((byId.get(i + 1) || data.items?.[i])?.text || '').trim();
      if (next && next !== p.text) {
        setParagraphText(analysis.dom, p.node, next);
        p.text = next;
        p.changed = true;
        changed++;
      }
    });
    done += chunk.length;
    onProgress(Math.round((done / targets.length) * 100));
  });

  return {
    buffer: await save(analysis),
    preview: analysis.paragraphs.map((p) => ({ text: p.text, heading: p.heading, editable: p.eligible, changed: !!p.changed })),
    changed,
    total: targets.length,
  };
}
