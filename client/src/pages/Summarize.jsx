import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, countWords, load, save } from '../lib/api.js';
import { Segmented, Spinner, ErrorNote, copyText } from '../components/ui.jsx';

const FORMATS = [
  { value: 'paragraph', label: 'Paragraph' },
  { value: 'bullets', label: 'Key points' },
];
const LENGTHS = [
  { value: 'short', label: 'Short' },
  { value: 'medium', label: 'Medium' },
  { value: 'long', label: 'Long' },
];

export default function Summarize() {
  const { meta, toast } = useApp();
  const [text, setText] = useState(() => load('summaryDraft', ''));
  const [format, setFormat] = useState(() => load('summaryFormat', 'bullets'));
  const [length, setLength] = useState(() => load('summaryLength', 'medium'));
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => save('summaryDraft', text), [text]);
  useEffect(() => save('summaryFormat', format), [format]);
  useEffect(() => save('summaryLength', length), [length]);

  const words = countWords(text);
  const limit = meta.limits.summaryWords;

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      setResult(await api.summarize({ text, format, length }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const asText = result ? (result.format === 'bullets' ? result.keyPoints.map((p) => `- ${p}`).join('\n') : result.summary) : '';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Summarizer</h1>
          <p>Turn a long article, chapter or paper into a short summary or a list of key points. Up to {limit.toLocaleString()} words at once.</p>
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-group">
          <span className="field-label">Format</span>
          <Segmented label="Summary format" value={format} options={FORMATS} onChange={setFormat} />
        </div>
        <div className="toolbar-group">
          <span className="field-label">Length</span>
          <Segmented label="Summary length" value={length} options={LENGTHS} onChange={setLength} />
        </div>
      </div>

      <div className="desk">
        <section className="sheet" aria-labelledby="s-in">
          <div className="sheet-head">
            <h2 id="s-in">Text to summarize</h2>
            {text && (
              <button type="button" className="btn ghost" onClick={() => setText('')}>
                Clear
              </button>
            )}
          </div>
          <div className="sheet-body">
            <textarea
              className="prose-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && words && words <= limit) run();
              }}
              placeholder="Paste an article, a chapter or your notes."
              aria-label="Text to summarize"
            />
          </div>
          <div className="sheet-foot">
            <span className={`counter ${words > limit ? 'over' : ''}`}>
              {words.toLocaleString()} / {limit.toLocaleString()} words
            </span>
            <button type="button" className="btn primary" onClick={run} disabled={!words || words > limit || loading}>
              {loading && <Spinner />}
              {loading ? 'Summarizing' : 'Summarize'}
            </button>
          </div>
        </section>

        <section className="sheet" aria-labelledby="s-out">
          <div className="sheet-head">
            <h2 id="s-out">Summary</h2>
            {result && (
              <button type="button" className="btn" onClick={async () => toast((await copyText(asText)) ? 'Copied' : 'Could not copy')}>
                <Copy size={16} aria-hidden="true" />
                Copy
              </button>
            )}
          </div>
          <div className="sheet-body">
            {error && <div style={{ padding: 16 }}><ErrorNote>{error}</ErrorNote></div>}
            {!result && !error && (
              <div className="empty">
                <strong>Your summary shows up here</strong>
                <span>It only uses facts from your text. Check names and numbers before you rely on it.</span>
              </div>
            )}
            {result && (
              <div className="prose" style={{ opacity: loading ? 0.5 : 1 }}>
                {result.title && <h3 className="summary-title">{result.title}</h3>}
                {result.format === 'bullets' ? (
                  <ul className="points">
                    {result.keyPoints.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                ) : (
                  <p>{result.summary}</p>
                )}
              </div>
            )}
          </div>
          {result && (
            <div className="sheet-foot">
              <span className="counter">
                {result.stats.words.toLocaleString()} words down to {result.stats.summaryWords.toLocaleString()}
              </span>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
