import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(here, '..');

dotenv.config({ path: path.join(SERVER_ROOT, '.env'), quiet: true });

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const geminiKey = process.env.GEMINI_API_KEY?.trim() || '';
const groqKey = process.env.GROQ_API_KEY?.trim() || '';

// Pick the provider: explicit AI_PROVIDER wins, else whichever key is present, else demo.
let provider = (process.env.AI_PROVIDER || '').trim().toLowerCase();
if (!provider) provider = geminiKey ? 'gemini' : groqKey ? 'groq' : 'demo';
if (provider === 'gemini' && !geminiKey) provider = 'demo';
if (provider === 'groq' && !groqKey) provider = 'demo';

export const config = {
  port: num(process.env.PORT, 5000),
  provider,
  gemini: {
    key: geminiKey,
    model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
  },
  groq: {
    key: groqKey,
    model: process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile',
  },
  mongoUri: process.env.MONGO_URI?.trim() || '',
  dataDir: path.resolve(SERVER_ROOT, process.env.DATA_DIR || 'data'),
  clientOrigin: process.env.CLIENT_ORIGIN?.trim() || 'http://localhost:5173',
  limits: {
    textWords: num(process.env.MAX_TEXT_WORDS, 1500),
    summaryWords: num(process.env.MAX_SUMMARY_WORDS, 6000),
    docWords: num(process.env.MAX_DOC_WORDS, 15000),
    docMB: num(process.env.MAX_DOC_MB, 10),
    aiRequestsPerWindow: num(process.env.RATE_LIMIT_REQUESTS, 40),
    windowMinutes: num(process.env.RATE_LIMIT_WINDOW_MIN, 10),
  },
};
