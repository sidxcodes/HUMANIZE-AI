import { useEffect, useState } from 'react';
import { useApp } from '../App.jsx';
import { Dialog } from './ui.jsx';
import { countWords } from '../lib/api.js';

const MIN_WORDS = 80;

export default function VoiceDialog({ open, onClose }) {
  const { voice, setVoice, toast } = useApp();
  const [sample, setSample] = useState(voice.sample);
  const [enabled, setEnabled] = useState(voice.enabled);

  useEffect(() => {
    if (open) {
      setSample(voice.sample);
      setEnabled(voice.enabled || !voice.sample);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const words = countWords(sample);
  const tooShort = words > 0 && words < MIN_WORDS;

  const saveVoice = () => {
    const on = enabled && words > 0;
    setVoice({ enabled: on, sample: sample.slice(0, 2000) });
    toast(on ? 'My voice is on for rewrites' : 'My voice is off');
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="My voice"
      actions={
        <button type="button" className="btn primary" onClick={saveVoice}>
          Save
        </button>
      }
    >
      <p style={{ margin: 0, color: 'var(--ink-soft)', maxWidth: '62ch' }}>
        Paste something you wrote yourself, like an old assignment or a long message. Rewrites will copy your sentence length and word choice instead of sounding generic.
        It stays in this browser and is only sent along with your rewrite requests.
      </p>
      <label className="sr-only" htmlFor="voice-sample">
        Your writing sample
      </label>
      <textarea
        id="voice-sample"
        value={sample}
        onChange={(e) => setSample(e.target.value)}
        placeholder="Paste 100 to 300 words of your own writing here."
      />
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <label className="row" style={{ gap: 8 }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Use my voice in rewrites
        </label>
        <span className={`counter ${tooShort ? 'over' : ''}`}>
          {words} words{tooShort ? `. Add at least ${MIN_WORDS} for good results.` : ''}
        </span>
      </div>
    </Dialog>
  );
}
