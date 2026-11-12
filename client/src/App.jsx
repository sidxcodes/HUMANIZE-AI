import { createContext, useContext, useEffect, useState } from 'react';
import { PenLine, SpellCheck, ScrollText, FileText, Moon, Sun, Mic } from 'lucide-react';
import { api, load, save } from './lib/api.js';
import { BRAND, BrandMark, useToast } from './components/ui.jsx';
import VoiceDialog from './components/VoiceDialog.jsx';
import Rewrite from './pages/Rewrite.jsx';
import Grammar from './pages/Grammar.jsx';
import Summarize from './pages/Summarize.jsx';
import Documents from './pages/Documents.jsx';

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

const PAGES = [
  { path: 'rewrite', label: 'Paraphraser', icon: PenLine, Component: Rewrite },
  { path: 'grammar', label: 'Grammar', icon: SpellCheck, Component: Grammar },
  { path: 'summarize', label: 'Summarizer', icon: ScrollText, Component: Summarize },
  { path: 'documents', label: 'Documents', icon: FileText, Component: Documents },
];

const currentPath = () => {
  const p = window.location.hash.replace(/^#\/?/, '');
  return PAGES.some((x) => x.path === p) ? p : 'rewrite';
};

const FALLBACK_META = {
  provider: 'demo',
  limits: { textWords: 1500, summaryWords: 6000, docWords: 15000, docMB: 10 },
  modes: [
    { id: 'standard', label: 'Standard', hint: 'Balanced rewrite' },
    { id: 'fluency', label: 'Fluency', hint: 'Fix awkward bits only' },
    { id: 'natural', label: 'Natural', hint: 'Sounds like a person wrote it' },
    { id: 'formal', label: 'Formal', hint: 'Professional tone' },
    { id: 'academic', label: 'Academic', hint: 'For papers and reports' },
    { id: 'simple', label: 'Simple', hint: 'Plain, easy English' },
    { id: 'creative', label: 'Creative', hint: 'More vivid' },
    { id: 'shorten', label: 'Shorten', hint: 'Same point, fewer words' },
    { id: 'expand', label: 'Expand', hint: 'Add clarity' },
    { id: 'custom', label: 'Custom', hint: 'Your own instruction' },
  ],
};

export default function App() {
  const [path, setPath] = useState(currentPath);
  const [meta, setMeta] = useState(FALLBACK_META);
  const [offline, setOffline] = useState(false);
  const [theme, setTheme] = useState(() => load('theme', null));
  const [voice, setVoiceState] = useState(() => load('voice', { enabled: false, sample: '' }));
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [toast, showToast] = useToast();

  useEffect(() => {
    const onHash = () => setPath(currentPath());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => setOffline(true));
  }, []);

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }, [theme]);

  useEffect(() => {
    const page = PAGES.find((p) => p.path === path);
    document.title = `${page.label} | ${BRAND}`;
  }, [path]);

  const isDark = theme ? theme === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const toggleTheme = () => {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    save('theme', next);
  };

  const setVoice = (v) => {
    setVoiceState(v);
    save('voice', v);
  };

  // What gets sent with every rewrite request when "My voice" is on.
  const voiceSample = voice.enabled && voice.sample.trim() ? voice.sample : '';

  const { Component } = PAGES.find((p) => p.path === path);

  return (
    <AppContext.Provider value={{ meta, voice, voiceSample, setVoice, openVoice: () => setVoiceOpen(true), toast: showToast }}>
      <div className="shell">
        <header className="topbar">
          <div className="topbar-inner">
            <a className="brand" href="#/rewrite">
              <BrandMark className="brand-mark" />
              {BRAND}
            </a>
            <nav className="nav" aria-label="Tools">
              {PAGES.map(({ path: p, label, icon: Icon }) => (
                <a key={p} href={`#/${p}`} aria-current={path === p ? 'page' : undefined}>
                  <Icon size={16} aria-hidden="true" />
                  <span>{label}</span>
                </a>
              ))}
            </nav>
            <div className="topbar-tools">
              <button
                type="button"
                className={`btn ${voice.enabled && voice.sample.trim() ? 'on' : 'ghost'}`}
                onClick={() => setVoiceOpen(true)}
                title="Make rewrites sound like your own writing"
              >
                <Mic size={16} aria-hidden="true" />
                My voice{voice.enabled && voice.sample.trim() ? ': on' : ''}
              </button>
              <button type="button" className="btn ghost icon" onClick={toggleTheme} aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}>
                {isDark ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </div>
          {offline ? (
            <div className="demo-bar">The server is not running. Start it with <code>npm run dev</code> in the project folder, then reload.</div>
          ) : meta.provider === 'demo' ? (
            <div className="demo-bar">
              Demo mode: rewrites use simple word rules, not AI. Add a free <code>GEMINI_API_KEY</code> to <code>server/.env</code> and restart for real rewrites.
            </div>
          ) : null}
        </header>

        <main>
          <Component />
        </main>

        <footer className="footer">
          <div className="footer-inner">
            <span>Rewrites can change meaning. Read every result before you use it, and follow your school's rules on AI use.</span>
            <span>
              Built by{' '}
              <a href="https://github.com/sidxcodes" target="_blank" rel="noreferrer">
                Siddharth Bhat
              </a>
            </span>
          </div>
        </footer>

        <VoiceDialog open={voiceOpen} onClose={() => setVoiceOpen(false)} />
        {toast}
      </div>
    </AppContext.Provider>
  );
}
