// Every browser gets a random id so it only sees its own documents. No login needed.
function clientId() {
  let id = null;
  try {
    id = localStorage.getItem('hai.clientId');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('hai.clientId', id);
    }
  } catch {
    id = window.__haiClientId ||= crypto.randomUUID();
  }
  return id;
}

export const CLIENT_ID = clientId();

async function request(path, { method = 'GET', body, form } = {}) {
  const headers = { 'x-client-id': CLIENT_ID };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: payload });
  } catch {
    throw new Error('Cannot reach the server. Make sure it is running (npm run dev in the project folder).');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status}).`);
  return data;
}

export const api = {
  meta: () => request('/meta'),
  paraphrase: (body) => request('/paraphrase', { method: 'POST', body }),
  compare: (body) => request('/compare', { method: 'POST', body }),
  grammar: (text) => request('/grammar', { method: 'POST', body: { text } }),
  summarize: (body) => request('/summarize', { method: 'POST', body }),
  documents: () => request('/documents'),
  document: (id) => request(`/documents/${id}`),
  upload: (form) => request('/documents', { method: 'POST', form }),
  rewriteAgain: (id, body) => request(`/documents/${id}/rewrites`, { method: 'POST', body }),
  requestChanges: (id, body) => request(`/documents/${id}/revisions`, { method: 'POST', body }),
  preview: (id, n) => request(`/documents/${id}/versions/${n}/preview`),
  remove: (id) => request(`/documents/${id}`, { method: 'DELETE' }),
  downloadUrl: (id, n) => `/api/documents/${id}/versions/${n}/download?cid=${encodeURIComponent(CLIENT_ID)}`,
};

export const countWords = (t = '') => (t.trim().match(/\S+/g) || []).length;

// Small localStorage helpers that never throw (private windows can block storage).
export function load(key, fallback) {
  try {
    const v = localStorage.getItem(`hai.${key}`);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
export function save(key, value) {
  try {
    localStorage.setItem(`hai.${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
