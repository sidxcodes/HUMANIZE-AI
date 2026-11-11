import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, FileText, Download, Eye, Trash2, MessageSquarePlus, RefreshCw, CircleCheck, CircleX } from 'lucide-react';
import { useApp } from '../App.jsx';
import { api, load } from '../lib/api.js';
import { Segmented, Spinner, ErrorNote, Dialog } from '../components/ui.jsx';

const LEVELS = [
  { value: 1, label: 'Light' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Heavy' },
];

const timeAgo = (iso) => {
  const s = Math.round((Date.now() - new Date(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};

function Status({ status }) {
  if (status === 'processing')
    return (
      <span className="status processing">
        <Spinner size={13} /> Working
      </span>
    );
  if (status === 'failed')
    return (
      <span className="status failed">
        <CircleX size={14} aria-hidden="true" /> Failed
      </span>
    );
  return (
    <span className="status ready">
      <CircleCheck size={14} aria-hidden="true" /> Ready
    </span>
  );
}

function Uploader({ onUploaded }) {
  const { meta, voiceSample, toast } = useApp();
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState(() => load('mode', 'natural'));
  const [level, setLevel] = useState(() => load('level', 2));
  const [instruction, setInstruction] = useState('');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);

  const pick = (f) => {
    setError('');
    if (!f) return;
    if (!/\.docx$/i.test(f.name)) return setError('Only .docx files work. In Word use File > Save As > Word Document (.docx).');
    if (f.size > meta.limits.docMB * 1024 * 1024) return setError(`That file is over ${meta.limits.docMB} MB.`);
    setFile(f);
  };

  const submit = async () => {
    if (!file) return;
    if (mode === 'custom' && !instruction.trim()) return setError('Write your custom instruction first.');
    setBusy(true);
    setError('');
    const form = new FormData();
    form.append('file', file);
    form.append('mode', mode);
    form.append('synonymLevel', String(level));
    form.append('freezeWords', JSON.stringify(load('freeze', [])));
    form.append('customInstruction', instruction);
    form.append('voiceSample', voiceSample);
    try {
      const doc = await api.upload(form);
      setFile(null);
      if (input.current) input.current.value = '';
      toast('Uploaded. Rewriting now.');
      onUploaded(doc);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`drop ${over ? 'over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files?.[0]);
      }}
    >
      <div className="drop-cta">
        <button type="button" className="btn icon" onClick={() => input.current?.click()} aria-label="Choose a .docx file">
          <Upload size={20} />
        </button>
        <div style={{ minWidth: 0 }}>
          <strong>{file ? 'Ready to rewrite' : 'Upload a Word file'}</strong>
          <div className="drop-file">{file ? file.name : `Drop a .docx here or click to choose. Up to ${meta.limits.docWords.toLocaleString()} words.`}</div>
        </div>
        <input ref={input} type="file" accept=".docx" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      <div className="row">
        <label className="field-label" htmlFor="doc-mode">
          Mode
        </label>
        <select id="doc-mode" className="select" value={mode} onChange={(e) => setMode(e.target.value)}>
          {meta.modes.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}: {m.hint}
            </option>
          ))}
        </select>
      </div>
      {mode === 'custom' && (
        <input className="input" value={instruction} maxLength={300} onChange={(e) => setInstruction(e.target.value)} placeholder="Your instruction" aria-label="Custom instruction" />
      )}
      <div className="row">
        <span className="field-label">Word changes</span>
        <Segmented label="How many words to change" value={level} options={LEVELS} onChange={setLevel} />
      </div>
      <ErrorNote>{error}</ErrorNote>
      <button type="button" className="btn primary" onClick={submit} disabled={!file || busy}>
        {busy && <Spinner />}
        Upload and rewrite
      </button>
      <span className="muted" style={{ fontSize: 'var(--step--1)' }}>
        Headings, tables, references and short lines stay untouched. Your "Keep unchanged" words and My voice setting apply here too.
      </span>
    </div>
  );
}

function PreviewDialog({ target, onClose }) {
  const [paras, setParas] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!target) return;
    setParas(null);
    setError('');
    api.preview(target.doc.id, target.version.n).then((d) => setParas(d.paragraphs)).catch((e) => setError(e.message));
  }, [target]);

  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={target ? `${target.doc.name}: ${target.version.label}` : ''}
      actions={
        target && (
          <a className="btn" href={api.downloadUrl(target.doc.id, target.version.n)}>
            <Download size={16} aria-hidden="true" />
            Download
          </a>
        )
      }
    >
      {target && target.version.n > 0 && (
        <div className="legend">
          <span>
            <i className="swatch" style={{ background: 'var(--pencil)' }} /> Changed in this version
          </span>
          <span>
            <i className="swatch" style={{ background: 'var(--rule-strong)' }} /> Left untouched (headings, references, short lines)
          </span>
        </div>
      )}
      <ErrorNote>{error}</ErrorNote>
      {!paras && !error && <Spinner />}
      {paras && (
        <div className="prose preview-doc" style={{ padding: '0 0 0 14px' }}>
          {paras.map((p, i) =>
            p.heading ? (
              <h3 key={i}>{p.text}</h3>
            ) : (
              <p key={i} className={p.changed ? 'changed' : !p.editable && target.version.n > 0 ? 'locked' : ''}>
                {p.text}
              </p>
            ),
          )}
        </div>
      )}
    </Dialog>
  );
}

function DocDetail({ doc, onChanged, onDeleted }) {
  const { meta, voiceSample, toast } = useApp();
  const ready = doc.versions.filter((v) => v.status === 'ready');
  const [note, setNote] = useState('');
  const [from, setFrom] = useState(ready.at(-1)?.n ?? 0);
  const [mode, setMode] = useState('formal');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const working = doc.status === 'processing';

  // Default the "apply to" picker to the newest finished version.
  const newestReady = ready.at(-1)?.n ?? 0;
  useEffect(() => setFrom(newestReady), [doc.id, newestReady]);

  const act = async (kind, fn) => {
    setBusy(kind);
    setError('');
    try {
      onChanged(await fn());
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy('');
    }
  };

  const sendRequest = async () => {
    if (await act('request', () => api.requestChanges(doc.id, { note, from }))) {
      setNote('');
      toast('Change request sent');
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete "${doc.name}" and all its versions? This can't be undone.`)) return;
    try {
      await api.remove(doc.id);
      onDeleted(doc.id);
      toast('Document deleted');
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <section className="doc-detail" aria-labelledby="doc-title">
      <div className="doc-detail-head">
        <div style={{ minWidth: 0 }}>
          <h2 id="doc-title">{doc.name}</h2>
          <span className="muted">
            {doc.words.toLocaleString()} words, uploaded {timeAgo(doc.createdAt)}
          </span>
        </div>
        <button type="button" className="btn danger" onClick={remove} disabled={working}>
          <Trash2 size={16} aria-hidden="true" />
          Delete
        </button>
      </div>

      <div>
        <h3 className="section-title">Versions</h3>
        <ol className="timeline">
          {doc.versions.map((v) => (
            <li key={v.n} className={`version ${v.status}`}>
              <span className="version-dot" aria-hidden="true">
                {v.n}
              </span>
              <div style={{ minWidth: 0 }}>
                <div className="version-title">{v.label}</div>
                {v.note && <div className="version-note">"{v.note}"</div>}
                <div className="version-sub">
                  {v.status === 'processing'
                    ? `Working, ${v.progress || 0}% done`
                    : v.status === 'failed'
                      ? 'Failed'
                      : v.n === 0
                        ? 'Your upload'
                        : v.kind === 'revision' && !v.changed
                          ? `Nothing needed changing for this request, based on version ${v.from}. Try naming the section or the change more exactly`
                          : `${v.changed ?? 0} of ${v.total ?? 0} paragraphs changed${v.from !== undefined && v.from !== null ? `, based on version ${v.from}` : ''}`}
                  {v.createdAt ? `, ${timeAgo(v.createdAt)}` : ''}
                </div>
                {v.status === 'processing' && (
                  <div className="progress" role="progressbar" aria-valuenow={v.progress || 0} aria-valuemin={0} aria-valuemax={100}>
                    <span style={{ width: `${Math.max(4, v.progress || 0)}%` }} />
                  </div>
                )}
                {v.status === 'failed' && v.error && <div style={{ marginTop: 6 }}><ErrorNote>{v.error}</ErrorNote></div>}
              </div>
              {v.status === 'ready' && (
                <div className="version-actions">
                  <button type="button" className="btn" onClick={() => setPreview({ doc, version: v })}>
                    <Eye size={15} aria-hidden="true" />
                    Preview
                  </button>
                  <a className="btn" href={api.downloadUrl(doc.id, v.n)}>
                    <Download size={15} aria-hidden="true" />
                    Download
                  </a>
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="request-box">
        <h3 className="section-title" style={{ margin: 0 }}>
          Request changes
        </h3>
        <label className="sr-only" htmlFor="change-note">
          What should change?
        </label>
        <textarea
          id="change-note"
          value={note}
          maxLength={500}
          onChange={(e) => setNote(e.target.value)}
          placeholder='Say what to change, e.g. "make the Methodology section more formal" or "shorten the introduction".'
        />
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="row">
            <label className="field-label" htmlFor="from-version">
              Apply to
            </label>
            <select id="from-version" className="select" value={from} onChange={(e) => setFrom(Number(e.target.value))}>
              {ready.map((v) => (
                <option key={v.n} value={v.n}>
                  Version {v.n}: {v.label}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn primary" onClick={sendRequest} disabled={working || note.trim().length < 4 || !!busy}>
            {busy === 'request' ? <Spinner /> : <MessageSquarePlus size={16} aria-hidden="true" />}
            Send request
          </button>
        </div>
      </div>

      <div className="request-box">
        <h3 className="section-title" style={{ margin: 0 }}>
          Rewrite the original again
        </h3>
        <div className="row">
          <select className="select" value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Mode for the new rewrite">
            {meta.modes
              .filter((m) => m.id !== 'custom')
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
          </select>
          <button
            type="button"
            className="btn"
            disabled={working || !!busy}
            onClick={() => act('rewrite', () => api.rewriteAgain(doc.id, { mode, freezeWords: load('freeze', []), voiceSample, synonymLevel: load('level', 2) }))}
          >
            {busy === 'rewrite' ? <Spinner /> : <RefreshCw size={16} aria-hidden="true" />}
            Rewrite
          </button>
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>
      <PreviewDialog target={preview} onClose={() => setPreview(null)} />
    </section>
  );
}

export default function Documents() {
  const [docs, setDocs] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const { documents } = await api.documents();
      setDocs(documents);
      setError('');
    } catch (e) {
      setError(e.message);
      setDocs((d) => d || []);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Poll while anything is still being rewritten.
  const busy = docs?.some((d) => d.status === 'processing');
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [busy, refresh]);

  const current = docs?.find((d) => d.id === selected) || docs?.[0] || null;
  const upsert = (doc) => {
    setDocs((list) => [doc, ...(list || []).filter((d) => d.id !== doc.id)]);
    setSelected(doc.id);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Documents</h1>
          <p>Upload a Word file, download the rewritten copy, and ask for changes as many times as you need. Every version is kept.</p>
        </div>
      </div>

      <div className="docs-layout">
        <div>
          <Uploader onUploaded={upsert} />
          <ErrorNote>{error}</ErrorNote>
          {docs && docs.length > 0 && (
            <ul className="doc-list" aria-label="Your documents">
              {docs.map((d) => (
                <li key={d.id}>
                  <button type="button" className="doc-item" aria-current={current?.id === d.id} onClick={() => setSelected(d.id)}>
                    <FileText size={18} aria-hidden="true" />
                    <span style={{ minWidth: 0 }}>
                      <span className="doc-item-name" style={{ display: 'block' }}>
                        {d.name}
                      </span>
                      <span className="doc-item-sub">
                        {d.versions.length - 1} {d.versions.length - 1 === 1 ? 'version' : 'versions'}, {timeAgo(d.updatedAt)}
                      </span>
                    </span>
                    <Status status={d.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!docs ? (
          <Spinner />
        ) : current ? (
          <DocDetail key={current.id} doc={current} onChanged={upsert} onDeleted={(id) => { setDocs((l) => l.filter((d) => d.id !== id)); setSelected(null); }} />
        ) : (
          <div className="doc-detail">
            <div className="empty" style={{ padding: 8 }}>
              <strong>No documents yet</strong>
              <span>Upload a .docx on the left. You'll get a rewritten copy with the same headings, lists and styles, plus a version history.</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
