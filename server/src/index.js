import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { config, SERVER_ROOT } from './config.js';
import { AIError, providerInfo } from './services/ai.js';
import { initStore } from './store/index.js';
import { toolsRouter } from './routes/tools.js';
import { documentsRouter } from './routes/documents.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({ origin: [config.clientOrigin, /^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
app.use(express.json({ limit: '1mb' }));

// Keeps a public demo inside the AI provider's free quota.
const aiLimiter = rateLimit({
  windowMs: config.limits.windowMinutes * 60 * 1000,
  limit: config.limits.aiRequestsPerWindow,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: `Slow down a little: you can run ${config.limits.aiRequestsPerWindow} actions every ${config.limits.windowMinutes} minutes.` },
});

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api', toolsRouter(aiLimiter));
app.use('/api/documents', documentsRouter(aiLimiter));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// In production the React build is served from the same port.
const clientDist = path.resolve(SERVER_ROOT, '..', 'client', 'dist');
if (fs.existsSync(path.join(clientDist, 'index.html'))) {
  app.use(express.static(clientDist));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// One error shape for the whole API: { error: "message" }
app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? `That file is over ${config.limits.docMB} MB.` : err.message;
    return res.status(413).json({ error: msg });
  }
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'That text is too long.' });
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Invalid request.' });
  const status = err instanceof AIError ? err.status : 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Something went wrong.' });
});

const store = await initStore();
const stuck = await store.failStuck();

app.listen(config.port, () => {
  const { provider, model } = providerInfo();
  console.log(`\n  Humanize AI server running on http://localhost:${config.port}`);
  console.log(`  AI: ${provider === 'demo' ? 'DEMO MODE (no API key in server/.env)' : `${provider} / ${model}`}`);
  console.log(`  Storage: ${store.kind}${stuck ? ` (${stuck} interrupted job(s) marked failed)` : ''}\n`);
});
