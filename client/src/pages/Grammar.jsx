import { useEffect, useState } from 'react';
import { Check, CheckCheck, Copy, PartyPopper } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, countWords, load, save } from '../lib/api.js';
import { Spinner, ErrorNote, copyText } from '../components/ui.jsx';

const SAMPLE = `Their are alot of reasons why students chose online courses. Most of them want flexibility, but some just dont have time to travel to a college every day. i think this is a important trend that universitys should take seriously.`;

/** Show a little of the surrounding text so the writer can find the mistake. */
function context(text, snippet) {
  const at = text.indexOf(snippet);
  if (at < 0) return null;
  const start = Math.max(0, text.lastIndexOf(' ', Math.max(0, at - 28)));
  const end = Math.min(text.length, text.indexOf(' ', at + snippet.length + 28) === -1 ? text.length : text.indexOf(' ', at + snippet.length + 28));
  return { before: (start > 0 ? '…' : '') + text.slice(start, at).trimStart(), after: text.slice(at + snippet.length, end) + (end < text.length ? '…' : '') };
}

export default function Grammar() {
  const { meta, toast } = useApp();
  const [text, setText] = useState(() => load('grammarDraft', ''));
  const [issues, setIssues] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => save('grammarDraft', text), [text]);

  const words = countWords(text);
  const limit = meta.limits.textWords;
  // Hide issues whose text the writer has already edited away.
  const open = (issues || []).filter((i) => !i.fixed && text.includes(i.original));

  const check = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.grammar(text);
      setIssues(data.issues);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const fix = (issue) => {
    setText((t) => t.replace(issue.original, issue.suggestion));
    setIssues((list) => list.map((i) => (i.id === issue.id ? { ...i, fixed: true } : i)));
  };

  const fixAll = () => {
    let t = text;
    for (const i of open) t = t.replace(i.original, i.suggestion);
    setText(t);
    setIssues((list) => list.map((i) => ({ ...i, fixed: true })));
    toast(`Fixed ${open.length} ${open.length === 1 ? 'issue' : 'issues'}`);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Grammar check</h1>
          <p>Finds spelling, grammar and punctuation mistakes and explains each one in plain words. It won't rewrite your style.</p>
        </div>
      </div>

      <div className="desk">
        <section className="sheet" aria-labelledby="g-in">
          <div className="sheet-head">
            <h2 id="g-in">Your text</h2>
            <div className="row">
              {!text && (
                <button type="button" className="btn ghost" onClick={() => setText(SAMPLE)}>
                  Try a sample
                </button>
              )}
              {text && (
                <button type="button" className="btn ghost" onClick={async () => toast((await copyText(text)) ? 'Copied' : 'Could not copy')}>
                  <Copy size={15} aria-hidden="true" />
                  Copy
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
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && words && words <= limit) check();
              }}
              placeholder="Paste text to check."
              aria-label="Text to check"
              spellCheck={false}
            />
          </div>
          <div className="sheet-foot">
            <span className={`counter ${words > limit ? 'over' : ''}`}>
              {words} / {limit} words
            </span>
            <button type="button" className="btn primary" onClick={check} disabled={!words || words > limit || loading}>
              {loading && <Spinner />}
              {loading ? 'Checking' : 'Check grammar'}
            </button>
          </div>
        </section>

        <section className="sheet" aria-labelledby="g-out">
          <div className="sheet-head">
            <h2 id="g-out">Suggestions{issues ? ` (${open.length})` : ''}</h2>
            {open.length > 1 && (
              <button type="button" className="btn" onClick={fixAll}>
                <CheckCheck size={16} aria-hidden="true" />
                Fix all
              </button>
            )}
          </div>
          <div className="sheet-body">
            {error && <div style={{ padding: 16 }}><ErrorNote>{error}</ErrorNote></div>}
            {!issues && !error && (
              <div className="empty">
                <strong>Suggestions show up here</strong>
                <span>Each one shows the mistake, the fix and a short reason. Apply them one at a time or all at once.</span>
              </div>
            )}
            {issues && open.length === 0 && (
              <div className="all-clear">
                <PartyPopper size={20} aria-hidden="true" />
                {issues.length ? 'All suggestions applied.' : 'No mistakes found.'}
              </div>
            )}
            {open.length > 0 && (
              <ul className="issue-list">
                {open.map((issue) => {
                  const ctx = context(text, issue.original);
                  return (
                    <li className="issue" key={issue.id}>
                      <div className="issue-meta">
                        <span className="issue-type">{issue.type}</span>
                        <button type="button" className="btn" onClick={() => fix(issue)}>
                          <Check size={15} aria-hidden="true" />
                          Fix
                        </button>
                      </div>
                      <div className="issue-fix">
                        {ctx?.before}
                        <del>{issue.original}</del>
                        <ins>{issue.suggestion}</ins>
                        {ctx?.after}
                      </div>
                      {issue.explanation && <p className="issue-why">{issue.explanation}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
