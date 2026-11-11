import { useState } from 'react';
import { api, countWords } from '../lib/api.js';
import { Dialog, Spinner, ErrorNote, WordDiff } from './ui.jsx';
import { assemble } from '../pages/Rewrite.jsx';
import { useApp } from '../App.jsx';

const DEFAULT_PICK = ['natural', 'formal', 'simple'];

export default function CompareDialog({ open, onClose, text, baseOptions, modes, onPick }) {
  const { meta } = useApp();
  const [picked, setPicked] = useState(DEFAULT_PICK);
  const [runs, setRuns] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const limit = Math.round(meta.limits.textWords / 3);
  const words = countWords(text);
  const choices = modes.filter((m) => m.id !== 'custom');

  const toggle = (id) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? [...p.slice(1), id] : [...p, id]));

  const compare = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.compare({ text, ...baseOptions, modes: picked });
      setRuns(data.results);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Compare modes"
      actions={
        <button type="button" className="btn primary" onClick={compare} disabled={loading || picked.length < 2 || words > limit}>
          {loading && <Spinner />}
          {loading ? 'Comparing' : 'Compare'}
        </button>
      }
    >
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="chips" role="group" aria-label="Modes to compare">
          {choices.map((m) => (
            <button key={m.id} type="button" className="chip" aria-pressed={picked.includes(m.id)} onClick={() => toggle(m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <span className={`counter ${words > limit ? 'over' : ''}`}>
          Pick 2 or 3. Up to {limit} words ({words} now).
        </span>
      </div>
      <ErrorNote>{error}</ErrorNote>
      {runs && (
        <div className="compare-grid">
          {runs.map((run) => (
            <article className="compare-col" key={run.mode}>
              <header>
                {run.label}
                <button type="button" className="btn" onClick={() => onPick(run)}>
                  Use this
                </button>
              </header>
              <div className="prose">
                {assemble(run.sentences.map((s) => ({ ...s, keep: false })))
                  .split('\n\n')
                  .map((para, i) => (
                    <p key={i}>
                      <WordDiff before={run.sentences.filter((s) => s.p === i).map((s) => s.original).join(' ')} after={para} />
                    </p>
                  ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </Dialog>
  );
}
