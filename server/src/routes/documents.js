import { Router } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { AIError } from '../services/ai.js';
import { MODES } from '../services/prompts.js';
import { cleanOptions } from '../services/textTools.js';
import { analyzeDocx, preview, rewriteDocx, reviseDocx } from '../services/docx.js';
import { store, writeVersionFiles, readVersionFile, readPreview, removeFiles } from '../store/index.js';
import { clampText } from '../utils/text.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.limits.docMB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (/\.docx$/i.test(file.originalname)) cb(null, true);
    else cb(new AIError('Only .docx files are supported. In Word, use File > Save As > Word Document (.docx).', 415));
  },
});

// Each browser gets a random id (stored in localStorage) so people only see their own documents.
function owner(req) {
  const id = req.get('x-client-id') || '';
  if (!/^[\w-]{8,64}$/.test(id)) throw new AIError('Missing client id.', 400);
  return id;
}

const latest = (doc) => doc.versions.at(-1);
const versionLabel = (kind, mode, n) =>
  kind === 'original' ? 'Original' : kind === 'revision' ? `Revision ${n}` : `${MODES[mode]?.label || 'Standard'} rewrite`;

function parseOptions(body) {
  let freezeWords = body.freezeWords;
  if (typeof freezeWords === 'string') {
    try {
      freezeWords = JSON.parse(freezeWords);
    } catch {
      freezeWords = freezeWords.split(',');
    }
  }
  return cleanOptions({ ...body, freezeWords });
}

/** Run a rewrite/revision in the background and record the outcome on the version. */
function runJob(docId, n, work) {
  const setProgress = (progress) =>
    store.update(docId, (d) => {
      const v = d.versions.find((x) => x.n === n);
      if (v && v.status === 'processing') v.progress = progress;
    }).catch(() => {});

  work(setProgress)
    .then(async ({ buffer, preview: pv, changed, total }) => {
      await writeVersionFiles(docId, n, buffer, pv);
      await store.update(docId, (d) => {
        const v = d.versions.find((x) => x.n === n);
        Object.assign(v, { status: 'ready', progress: 100, changed, total });
        d.status = latest(d).status;
      });
    })
    .catch(async (err) => {
      console.error(`  ! Job ${docId} v${n} failed:`, err.message);
      await store.update(docId, (d) => {
        const v = d.versions.find((x) => x.n === n);
        Object.assign(v, { status: 'failed', error: err.message || 'Something went wrong.' });
        d.status = latest(d).status;
      }).catch(() => {});
    });
}

export function documentsRouter(aiLimiter) {
  const r = Router();

  r.get('/', async (req, res, next) => {
    try {
      res.json({ documents: await store.list(owner(req)) });
    } catch (e) {
      next(e);
    }
  });

  r.get('/:id', async (req, res, next) => {
    try {
      const doc = await store.get(req.params.id, owner(req));
      if (!doc) throw new AIError('Document not found.', 404);
      res.json(doc);
    } catch (e) {
      next(e);
    }
  });

  // Upload a .docx: saves the original as v0 and starts the first rewrite as v1.
  r.post('/', aiLimiter, upload.single('file'), async (req, res, next) => {
    try {
      const who = owner(req);
      if (!req.file) throw new AIError('Please choose a .docx file.', 400);
      const opts = parseOptions(req.body);
      const analysis = await analyzeDocx(req.file.buffer);
      if (analysis.words > config.limits.docWords) {
        throw new AIError(`This document has ${analysis.words} words. The limit is ${config.limits.docWords}.`, 413);
      }
      if (!analysis.paragraphs.some((p) => p.eligible)) {
        throw new AIError('No body paragraphs long enough to rewrite were found in this document.', 422);
      }

      const id = nanoid(12);
      const now = new Date().toISOString();
      await writeVersionFiles(id, 0, req.file.buffer, preview(analysis));
      const doc = await store.create({
        id,
        owner: who,
        name: clampText(req.file.originalname.replace(/\.docx$/i, ''), 120) || 'Untitled',
        words: analysis.words,
        status: 'processing',
        versions: [
          { n: 0, kind: 'original', label: 'Original', status: 'ready', progress: 100, createdAt: now },
          { n: 1, kind: 'rewrite', mode: opts.mode, label: versionLabel('rewrite', opts.mode), note: opts.customInstruction || '', status: 'processing', progress: 0, createdAt: now },
        ],
      });
      runJob(id, 1, (onProgress) => rewriteDocx(req.file.buffer, opts, onProgress));
      res.status(201).json(doc);
    } catch (e) {
      next(e);
    }
  });

  // Rewrite the original again in another mode.
  r.post('/:id/rewrites', aiLimiter, async (req, res, next) => {
    try {
      const doc = await store.get(req.params.id, owner(req));
      if (!doc) throw new AIError('Document not found.', 404);
      if (doc.status === 'processing') throw new AIError('Please wait for the current version to finish.', 409);
      const opts = parseOptions(req.body || {});
      const n = latest(doc).n + 1;
      const updated = await store.update(doc.id, (d) => {
        d.versions.push({ n, kind: 'rewrite', mode: opts.mode, label: versionLabel('rewrite', opts.mode), note: opts.customInstruction || '', status: 'processing', progress: 0, createdAt: new Date().toISOString() });
        d.status = 'processing';
      });
      const original = await readVersionFile(doc.id, 0);
      runJob(doc.id, n, (onProgress) => rewriteDocx(original, opts, onProgress));
      res.status(201).json(updated);
    } catch (e) {
      next(e);
    }
  });

  // Request changes: apply a written instruction to an existing version.
  r.post('/:id/revisions', aiLimiter, async (req, res, next) => {
    try {
      const doc = await store.get(req.params.id, owner(req));
      if (!doc) throw new AIError('Document not found.', 404);
      if (doc.status === 'processing') throw new AIError('Please wait for the current version to finish.', 409);
      const note = clampText(req.body?.note, 500).trim();
      if (note.length < 4) throw new AIError('Describe the change you want, e.g. "make the introduction more formal".', 400);
      const readyVersions = doc.versions.filter((v) => v.status === 'ready');
      const fromN = Number.isInteger(req.body?.from) ? req.body.from : readyVersions.at(-1).n;
      const from = readyVersions.find((v) => v.n === fromN);
      if (!from) throw new AIError('That version is not available.', 400);

      const n = latest(doc).n + 1;
      const revisionCount = doc.versions.filter((v) => v.kind === 'revision').length + 1;
      const updated = await store.update(doc.id, (d) => {
        d.versions.push({ n, kind: 'revision', label: versionLabel('revision', null, revisionCount), note, from: fromN, status: 'processing', progress: 0, createdAt: new Date().toISOString() });
        d.status = 'processing';
      });
      const source = await readVersionFile(doc.id, fromN);
      runJob(doc.id, n, (onProgress) => reviseDocx(source, note, onProgress));
      res.status(201).json(updated);
    } catch (e) {
      next(e);
    }
  });

  r.get('/:id/versions/:n/preview', async (req, res, next) => {
    try {
      const doc = await store.get(req.params.id, owner(req));
      const v = doc?.versions.find((x) => x.n === Number(req.params.n));
      if (!v || v.status !== 'ready') throw new AIError('That version is not ready.', 404);
      res.json({ paragraphs: (await readPreview(doc.id, v.n)) || [] });
    } catch (e) {
      next(e);
    }
  });

  // Plain links can't send headers, so downloads also accept the client id as a query param.
  r.get('/:id/versions/:n/download', async (req, res, next) => {
    try {
      if (!req.get('x-client-id') && req.query.cid) req.headers['x-client-id'] = String(req.query.cid);
      const doc = await store.get(req.params.id, owner(req));
      const v = doc?.versions.find((x) => x.n === Number(req.params.n));
      if (!v || v.status !== 'ready') throw new AIError('That version is not ready.', 404);
      const buffer = await readVersionFile(doc.id, v.n);
      const suffix = v.n === 0 ? 'original' : `v${v.n}`;
      const filename = `${doc.name}-${suffix}.docx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.\- ]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  });

  r.delete('/:id', async (req, res, next) => {
    try {
      const ok = await store.remove(req.params.id, owner(req));
      if (!ok) throw new AIError('Document not found.', 404);
      await removeFiles(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  return r;
}
