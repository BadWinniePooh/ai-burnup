// REST client for the BurnupApi backend.
// Override the base URL by setting window.__BURNUP_API__ before loading scripts:
//   <script>window.__BURNUP_API__ = 'http://localhost:5000';</script>

// Use ?? so an explicitly empty string (Docker / nginx-proxy mode) is respected.
// Falls back to localhost:5000 only when the variable is not defined at all.
const _BASE = (window.__BURNUP_API__ !== undefined ? window.__BURNUP_API__ : 'http://localhost:5000').replace(/\/$/, '');

async function apiFetch(path, options = {}) {
  const res = await fetch(_BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = await res.text(); } catch {}
    throw new Error(`${res.status}: ${msg}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const enc = encodeURIComponent;

window.api = {
  // Projects
  getProjects:   ()        => apiFetch('/api/projects'),
  getProject:    (id)      => apiFetch(`/api/projects/${enc(id)}`),
  createProject: (data)    => apiFetch('/api/projects',            { method: 'POST',   body: JSON.stringify(data) }),
  updateProject: (id, d)   => apiFetch(`/api/projects/${enc(id)}`, { method: 'PUT',    body: JSON.stringify(d)    }),
  deleteProject: (id)      => apiFetch(`/api/projects/${enc(id)}`, { method: 'DELETE'                             }),

  // Burnup series for a project (returns [{date, scopeCount, doneCount, scopeDays, doneDays}])
  getBurnup: (id, today) =>
    apiFetch(`/api/projects/${enc(id)}/burnup${today ? `?today=${enc(today)}` : ''}`),

  // Cards
  getCards:   (projectId) => apiFetch(`/api/cards${projectId ? `?projectId=${enc(projectId)}` : ''}`),
  getCard:    (uid)       => apiFetch(`/api/cards/${enc(uid)}`),
  createCard: (data)      => apiFetch('/api/cards',           { method: 'POST',   body: JSON.stringify(data) }),
  updateCard: (uid, data) => apiFetch(`/api/cards/${enc(uid)}`, { method: 'PUT',  body: JSON.stringify(data) }),
  deleteCard: (uid)       => apiFetch(`/api/cards/${enc(uid)}`, { method: 'DELETE'                           }),
};
