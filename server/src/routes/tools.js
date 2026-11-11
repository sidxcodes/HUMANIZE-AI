import { Router } from 'express';
import { config } from '../config.js';
import { providerInfo } from '../services/ai.js';
import { MODES } from '../services/prompts.js';
import { paraphrase, compareModes, checkGrammar, summarize, cleanOptions } from '../services/textTools.js';
import { store } from '../store/index.js';

export function toolsRouter(aiLimiter) {
  const r = Router();

  r.get('/meta', (_req, res) => {
    res.json({
      ...providerInfo(),
      storage: store?.kind,
      limits: {
        textWords: config.limits.textWords,
        summaryWords: config.limits.summaryWords,
        docWords: config.limits.docWords,
        docMB: config.limits.docMB,
      },
      modes: Object.entries(MODES).map(([id, m]) => ({ id, label: m.label, hint: m.hint })),
    });
  });

  const text = (req) => (typeof req.body?.text === 'string' ? req.body.text : '');

  r.post('/paraphrase', aiLimiter, async (req, res, next) => {
    try {
      res.json(await paraphrase(text(req), cleanOptions(req.body)));
    } catch (e) {
      next(e);
    }
  });

  r.post('/compare', aiLimiter, async (req, res, next) => {
    try {
      res.json(await compareModes(text(req), cleanOptions(req.body), req.body?.modes));
    } catch (e) {
      next(e);
    }
  });

  r.post('/grammar', aiLimiter, async (req, res, next) => {
    try {
      res.json(await checkGrammar(text(req)));
    } catch (e) {
      next(e);
    }
  });

  r.post('/summarize', aiLimiter, async (req, res, next) => {
    try {
      res.json(await summarize(text(req), { format: req.body?.format, length: req.body?.length }));
    } catch (e) {
      next(e);
    }
  });

  return r;
}
