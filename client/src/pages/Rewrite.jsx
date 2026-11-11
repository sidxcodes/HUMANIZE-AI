import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Eye, EyeOff, Columns3, ChevronLeft, ChevronRight, RotateCcw, Check, Undo2, ArrowLeftToLine } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, countWords, load, save } from '../lib/api.js';
import { ModeChips, Segmented, FreezeWords, WordDiff, Spinner, ErrorNote, copyText } from '../components/ui.jsx';
import CompareDialog from '../components/CompareDialog.jsx';

export const SAMPLE_TEXT = `In today's fast-paced digital world, artificial intelligence plays a crucial role in transforming the landscape of education. Moreover, it is important to note that students are increasingly utilizing AI tools in order to enhance their learning outcomes.

Furthermore, these tools facilitate a significant improvement in productivity, allowing learners to delve into complex topics with greater ease. However, it is essential to strike a balance between leveraging technology and developing critical thinking skills.`;

const LEVELS = [
  { value: 1, label: 'Light' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Heavy' },
];

/** Build the final text from the sentences and the writer's accept/keep choices. */
export function assemble(sentences) {
  const paras = [];
  for (const s of sentences) {
    (paras[s.p] ||= []).push(s.keep ? s.original : s.rewritten);
  }
  return paras.filter(Boolean).map((p) => p.join(' ')).join('\n\n');
}

export default function Rewrite() {
  const { meta, voiceSample, toast } = useApp();
  const [text, setText] = useState(() => load('draft', ''));
  const [mode, setMode] = useState(() => load('mode', 'natural'));
  const [level, setLevel] = useState(() => load('level', 2));
  const [freezeWords, setFreezeWords] = useState(() => load('freeze', []));
  const [instruction, setInstruction] = useState(() => load('instruction', ''));
  const [result, setResult] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [showMarks, setShowMarks] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [compareOpen, setCompareOpen] = useState(false);
  const outputRef = useRef(null);

  useEffect(() => save('draft', text), [text]);
  useEffect(() => save('mode', mode), [mode]);
  useEffect(() => save('level', level), [level]);
  useEffect(() => save('freeze', freezeWords), [freezeWords]);
  useEffect(() => save('instruction', instruction), [instruction]);

  const words = countWords(text);
  const limit = meta.limits.textWords;
  const over = words > limit;

  const options = () => ({ mode, synonymLevel: level, freezeWords, customInstruction: instruction, voiceSample });

  const run = async () => {
    if (!words || over || loading) return;
    if (mode === 'custom' && !instruction.trim()) {
      setError('Write your custom instruction first, e.g. "make it sound confident".');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.paraphrase({ text, ...options() });
      setResult({ ...data, mode, sentences: data.sentences.map((s) => ({ ...s, keep: false })) });
      setActiveId(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const changedIds = useMemo(() => (result ? result.sentences.filter((s) => s.changed).map((s) => s.id) : []), [result]);
  const active = result?.sentences.find((s) => s.id === activeId);
  const activeIndex = changedIds.indexOf(activeId);
  const finalText = result ? assemble(result.sentences) : '';
  const keptCount = result ? result.sentences.filter((s) => s.changed && s.keep).length : 0;

  const setKeep = (id, keep) =>
    setResult((r) => ({ ...r, sentences: r.sentences.map((s) => (s.id === id ? { ...s, keep } : s)) }));
  const setAll = (keep) => setResult((r) => ({ ...r, sentences: r.sentences.map((s) => ({ ...s, keep })) }));
  const step = (dir) => {
    const next = changedIds[(activeIndex + dir + changedIds.length) % changedIds.length];
    setActiveId(next);
    outputRef.current?.querySelector(`[data-sid="${next}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const copy = async () => toast((await copyText(finalText)) ? 'Copied' : 'Could not copy. Select the text and copy it yourself.');

  const paragraphs = useMemo(() => {
    if (!result) return [];
    const out = [];
    for (const s of result.sentences) (out[s.p] ||= []).push(s);
    return out.filter(Boolean);
  }, [result]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Paraphraser</h1>
          <p>Paste a draft, pick a mode, then go through the changes sentence by sentence. Keep what you like, undo what you don't.</p>
        </div>
      </div>

      <div className="toolbar">
        <ModeChips modes={meta.modes} value={mode} onChange={setMode} />
        <div className="toolbar-group">
          <span className="field-label">Word changes</span>
          <Segmented label="How many words to change" value={level} options={LEVELS} onChange={setLevel} />
          <button type="button" className="btn" onClick={() => setCompareOpen(true)} disabled={!words || over}>
            <Columns3 size={16} aria-hidden="true" />
            Compare modes
          </button>
        </div>
        {mode === 'custom' && (
          <input
            className="input custom-instruction"
            value={instruction}
            maxLength={300}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder='Your instruction, e.g. "sound confident but not arrogant" or "write for a 10-year-old"'
            aria-label="Custom instruction"
          />
        )}
      </div>

      <div className="desk">
        <section className="sheet" aria-labelledby="in-title">
          <div className="sheet-head">
            <h2 id="in-title">Your text</h2>
            <div className="row">
              {!text && (
                <button type="button" className="btn ghost" onClick={() => setText(SAMPLE_TEXT)}>
                  Try a sample
                </button>
              )}
              {text && (
                <button type="button" className="btn ghost" onClick={() => setText('')}>
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="sheet-body">
            <textarea
              className="prose-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run();
              }}
              placeholder="Paste or type the text you want to rewrite."
              aria-label="Text to rewrite"
              spellCheck
            />
          </div>
          <div className="options">
            <FreezeWords words={freezeWords} onChange={setFreezeWords} />
          </div>
          <div className="sheet-foot">
            <span className={`counter ${over ? 'over' : ''}`}>
              {words} / {limit} words
            </span>
            <button type="button" className="btn primary" onClick={run} disabled={!words || over || loading}>
              {loading ? <Spinner /> : null}
              {loading ? 'Rewriting' : 'Rewrite'}
            </button>
          </div>
        </section>

        <section className="sheet" aria-labelledby="out-title">
          <div className="sheet-head">
            <h2 id="out-title">Rewritten</h2>
            {result && (
              <div className="row">
                <button type="button" className="btn ghost icon" onClick={() => setShowMarks((v) => !v)} aria-label={showMarks ? 'Hide change marks' : 'Show change marks'} title={showMarks ? 'Hide change marks' : 'Show change marks'}>
                  {showMarks ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
                <button type="button" className="btn ghost icon" onClick={() => { setText(finalText); setResult(null); }} aria-label="Edit this version" title="Move this version to the left to edit or rewrite again">
                  <ArrowLeftToLine size={17} />
                </button>
                <button type="button" className="btn" onClick={copy}>
                  <Copy size={16} aria-hidden="true" />
                  Copy
                </button>
              </div>
            )}
          </div>

          <div className="sheet-body">
            {error && <div style={{ padding: 16 }}><ErrorNote>{error}</ErrorNote></div>}
            {!result && !error && (
              <div className="empty">
                {loading ? (
                  <>
                    <Spinner size={22} />
                    <strong>Rewriting sentence by sentence</strong>
                  </>
                ) : (
                  <>
                    <strong>Your rewrite shows up here</strong>
                    <span>Changed sentences are underlined. Click one to see why it changed and to keep your original instead.</span>
                  </>
                )}
              </div>
            )}
            {result && (
              <div ref={outputRef} className={`prose ${showMarks ? '' : 'marks-off'}`} style={{ flex: 1, opacity: loading ? 0.5 : 1 }}>
                {paragraphs.map((para, pi) => (
                  <p key={pi}>
                    {para.map((s, si) => (
                      <span key={s.id}>
                        {si > 0 ? ' ' : ''}
                        {s.changed ? (
                          // A span, not a <button>: buttons can't wrap across lines like running text.
                          <span
                            role="button"
                            tabIndex={0}
                            data-sid={s.id}
                            className={`sent changed ${s.keep ? 'kept' : ''} ${activeId === s.id ? 'active' : ''}`}
                            onClick={() => setActiveId(activeId === s.id ? null : s.id)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setActiveId(activeId === s.id ? null : s.id);
                              }
                            }}
                            aria-expanded={activeId === s.id}
                          >
                            {s.keep ? s.original : showMarks ? <WordDiff before={s.original} after={s.rewritten} /> : s.rewritten}
                          </span>
                        ) : (
                          <span className="sent unchanged">{s.original}</span>
                        )}
                      </span>
                    ))}
                  </p>
                ))}
              </div>
            )}
          </div>

          {active && (
            <div className="slip" aria-live="polite">
              <div className="slip-reason">{active.reason}</div>
              <div className="slip-original">
                <span className="field-label">Your original: </span>
                {active.original}
              </div>
              <div className="slip-actions">
                <button type="button" className="btn use" aria-pressed={!active.keep} onClick={() => setKeep(active.id, false)}>
                  <Check size={16} aria-hidden="true" />
                  Use rewrite
                </button>
                <button type="button" className="btn keep" aria-pressed={active.keep} onClick={() => setKeep(active.id, true)}>
                  <Undo2 size={16} aria-hidden="true" />
                  Keep original
                </button>
                <div className="slip-nav">
                  <button type="button" className="btn ghost icon" onClick={() => step(-1)} aria-label="Previous change">
                    <ChevronLeft size={16} />
                  </button>
                  {activeIndex + 1} of {changedIds.length}
                  <button type="button" className="btn ghost icon" onClick={() => step(1)} aria-label="Next change">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="sheet-foot">
              <span className="counter">
                {result.stats.changed} of {result.stats.sentences} sentences changed
                {keptCount ? `, ${keptCount} kept as original` : ''}, {countWords(finalText)} words
              </span>
              <div className="row">
                {keptCount > 0 ? (
                  <button type="button" className="btn ghost" onClick={() => setAll(false)}>
                    <RotateCcw size={15} aria-hidden="true" />
                    Use all rewrites
                  </button>
                ) : (
                  <button type="button" className="btn ghost" onClick={() => setAll(true)} disabled={!changedIds.length}>
                    <Undo2 size={15} aria-hidden="true" />
                    Keep all originals
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      <CompareDialog
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        text={text}
        baseOptions={options()}
        modes={meta.modes}
        onPick={(run) => {
          setMode(run.mode);
          setResult({ ...run, sentences: run.sentences.map((s) => ({ ...s, keep: false })) });
          setActiveId(null);
          setError('');
          setCompareOpen(false);
        }}
      />
    </>
  );
}
