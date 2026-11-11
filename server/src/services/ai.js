import { config } from '../config.js';

export class AIError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

export const isDemo = () => config.provider === 'demo';

export function providerInfo() {
  if (config.provider === 'gemini') return { provider: 'gemini', model: config.gemini.model };
  if (config.provider === 'groq') return { provider: 'groq', model: config.groq.model };
  return { provider: 'demo', model: null };
}

/** Pull a JSON object out of a model reply, tolerating code fences or stray text. */
export function parseJSON(raw) {
  if (!raw || typeof raw !== 'string') throw new AIError('The AI returned an empty reply. Please try again.');
  let text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        /* fall through */
      }
    }
    throw new AIError('The AI reply was not in the expected format. Please try again.');
  }
}

function friendlyHttpError(provider, status, body) {
  const snippet = String(body || '').slice(0, 300);
  if (status === 429) return new AIError(`The ${provider} free-tier limit was reached. Wait a minute and try again.`, 429);
  if (status === 401 || status === 403) return new AIError(`The ${provider} API key was rejected. Check the key in server/.env.`, 502);
  if (status === 400 && /api key/i.test(snippet)) return new AIError(`The ${provider} API key is not valid. Check the key in server/.env.`, 502);
  if (status === 404) return new AIError(`The ${provider} model name was not found. Check the model setting in server/.env.`, 502);
  return new AIError(`The ${provider} API returned an error (${status}). ${snippet}`, 502);
}

async function callGemini({ system, prompt, temperature }) {
  const { key, model } = config.gemini;
  const generationConfig = { temperature, responseMimeType: 'application/json' };
  // Flash 2.5 thinks by default; rewriting doesn't need it and it slows replies down.
  if (/2\.5-flash/.test(model)) generationConfig.thinkingConfig = { thinkingBudget: 0 };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  const body = await res.text();
  if (!res.ok) throw friendlyHttpError('Gemini', res.status, body);
  const data = JSON.parse(body);
  const candidate = data.candidates?.[0];
  if (!candidate) {
    const reason = data.promptFeedback?.blockReason;
    throw new AIError(reason ? `Gemini declined this text (${reason}).` : 'Gemini returned no answer.');
  }
  return (candidate.content?.parts || []).map((p) => p.text || '').join('');
}

async function callGroq({ system, prompt, temperature }) {
  const { key, model } = config.groq;
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.text();
  if (!res.ok) throw friendlyHttpError('Groq', res.status, body);
  return JSON.parse(body).choices?.[0]?.message?.content || '';
}

/**
 * Ask the configured model for a JSON object.
 * `demo` is a function returning a stand-in result, used when no API key is set.
 */
export async function askJSON({ system, prompt, temperature = 0.7, demo }) {
  if (isDemo()) return demo();
  try {
    const raw = config.provider === 'groq'
      ? await callGroq({ system, prompt, temperature })
      : await callGemini({ system, prompt, temperature });
    return parseJSON(raw);
  } catch (err) {
    if (err instanceof AIError) throw err;
    if (err?.name === 'TimeoutError') throw new AIError('The AI took too long to reply. Try a shorter text.', 504);
    throw new AIError(`Could not reach the AI service: ${err.message}`);
  }
}
