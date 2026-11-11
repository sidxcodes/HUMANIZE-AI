import { useEffect, useRef, useState } from 'react';
import { diffWordsWithSpace } from 'diff';
import { LoaderCircle, X, CircleAlert } from 'lucide-react';

export const BRAND = 'Humanize AI';

export function BrandMark(props) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" {...props}>
      <rect width="64" height="64" rx="16" fill="var(--pencil)" />
      <path d="M18 46c6-1 10-6 13-14l4-11c1-3 4-4 6-2 2 1 2 4 0 6L29 41" fill="none" stroke="var(--pencil-ink)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M38 44c3 0 6-1 8-3" fill="none" stroke="var(--pencil-ink)" strokeOpacity=".55" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export const Spinner = ({ size = 16 }) => <LoaderCircle size={size} className="spin" aria-hidden="true" />;

export function ErrorNote({ children }) {
  if (!children) return null;
  return (
    <div className="error" role="alert">
      <CircleAlert size={16} aria-hidden="true" style={{ flex: 'none', marginTop: 2 }} />
      <span>{children}</span>
    </div>
  );
}

export function Segmented({ label, value, options, onChange }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ModeChips({ modes, value, onChange, exclude = [] }) {
  return (
    <div className="chips" role="group" aria-label="Rewrite mode">
      {modes
        .filter((m) => !exclude.includes(m.id))
        .map((m) => (
          <button key={m.id} type="button" className="chip" title={m.hint} aria-pressed={value === m.id} onClick={() => onChange(m.id)}>
            {m.label}
          </button>
        ))}
    </div>
  );
}

/** Words the rewriter must keep exactly: names, terms, keywords. */
export function FreezeWords({ words, onChange }) {
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft.split(',').map((w) => w.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...words, ...parts])].slice(0, 30));
    setDraft('');
  };
  return (
    <div className="freeze">
      <span className="field-label">Keep unchanged</span>
      {words.map((w) => (
        <span className="freeze-tag" key={w}>
          {w}
          <button type="button" aria-label={`Remove ${w}`} onClick={() => onChange(words.filter((x) => x !== w))}>
            <X size={13} />
          </button>
        </span>
      ))}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !draft && words.length) {
            onChange(words.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={words.length ? 'Add another' : 'Type a word and press Enter'}
        aria-label="Words to keep unchanged"
      />
    </div>
  );
}

/** Shows what changed between two strings: added words get a blue wash. */
export function WordDiff({ before, after, showCuts = false }) {
  const parts = diffWordsWithSpace(before, after);
  return parts.map((part, i) => {
    if (part.added) return <ins className="add" key={i}>{part.value}</ins>;
    if (part.removed) return showCuts ? <del className="cut" key={i}>{part.value}</del> : null;
    return <span key={i}>{part.value}</span>;
  });
}

export function Dialog({ open, onClose, title, children, actions }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose} aria-labelledby="dialog-title">
      {open && (
        <>
          <div className="dialog-head">
            <h2 id="dialog-title">{title}</h2>
            <div className="row">
              {actions}
              <button type="button" className="btn ghost icon" onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            </div>
          </div>
          <div className="dialog-body">{children}</div>
        </>
      )}
    </dialog>
  );
}

export function useToast() {
  const [msg, setMsg] = useState('');
  const timer = useRef(0);
  const show = (text) => {
    setMsg(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(''), 2200);
  };
  const node = msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
  return [node, show];
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
