// REST client for the BurnupApi backend.
// Override the base URL by setting window.__BURNUP_API__ before loading scripts:
//   <script>window.__BURNUP_API__ = 'http://localhost:5000';</script>

const _BASE = (window.__BURNUP_API__ !== undefined ? window.__BURNUP_API__ : 'http://localhost:5000').replace(/\/$/, '');

function getToken() { return localStorage.getItem('burnup.token'); }

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(_BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  if (res.status === 401) {
    // Token expired or invalid — clear it so the app redirects to login
    localStorage.removeItem('burnup.token');
    window.dispatchEvent(new Event('burnup:unauthorized'));
    throw new Error('401: Unauthorized');
  }
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
  // Auth
  login:         (email, password)          => apiFetch('/api/auth/login',           { method: 'POST', body: JSON.stringify({ email, password }) }),
  register:      (email, password, token)   => apiFetch('/api/auth/register',        { method: 'POST', body: JSON.stringify({ email, password, inviteToken: token || null }) }),
  forgotPassword:(email)                    => apiFetch('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, newPassword)       => apiFetch('/api/auth/reset-password',  { method: 'POST', body: JSON.stringify({ token, newPassword }) }),
  me:            ()                         => apiFetch('/api/auth/me'),

  // Admin
  admin: {
    getUsers:            ()              => apiFetch('/api/admin/users'),
    deleteUser:          (id)            => apiFetch(`/api/admin/users/${id}`,              { method: 'DELETE' }),
    getSettings:         ()              => apiFetch('/api/admin/settings'),
    updateSettings:      (data)          => apiFetch('/api/admin/settings',                 { method: 'PUT', body: JSON.stringify(data) }),
    getInvites:          ()              => apiFetch('/api/admin/invites'),
    createInvite:        (email)         => apiFetch('/api/admin/invites',                  { method: 'POST', body: JSON.stringify({ email: email || null }) }),
    getUnassigned:       ()              => apiFetch('/api/admin/projects/unassigned'),
    assignProject:       (id, userId)    => apiFetch(`/api/admin/projects/${enc(id)}/assign`, { method: 'PUT', body: JSON.stringify({ userId: userId ?? null }) }),
  },

  // Projects
  getProjects:   ()        => apiFetch('/api/projects'),
  getProject:    (id)      => apiFetch(`/api/projects/${enc(id)}`),
  createProject: (data)    => apiFetch('/api/projects',            { method: 'POST',   body: JSON.stringify(data) }),
  updateProject: (id, d)   => apiFetch(`/api/projects/${enc(id)}`, { method: 'PUT',    body: JSON.stringify(d)    }),
  deleteProject: (id)      => apiFetch(`/api/projects/${enc(id)}`, { method: 'DELETE'                             }),

  // Burnup series for a project
  getBurnup: (id, today) =>
    apiFetch(`/api/projects/${enc(id)}/burnup${today ? `?today=${enc(today)}` : ''}`),

  // Cards
  getCards:   (projectId) => apiFetch(`/api/cards${projectId ? `?projectId=${enc(projectId)}` : ''}`),
  getCard:    (uid)       => apiFetch(`/api/cards/${enc(uid)}`),
  createCard: (data)      => apiFetch('/api/cards',             { method: 'POST',   body: JSON.stringify(data) }),
  updateCard: (uid, data) => apiFetch(`/api/cards/${enc(uid)}`, { method: 'PUT',    body: JSON.stringify(data) }),
  deleteCard: (uid)       => apiFetch(`/api/cards/${enc(uid)}`, { method: 'DELETE'                             }),

  // Snapshot import
  importSnapshots: (projectId, rows) =>
    apiFetch(`/api/projects/${enc(projectId)}/snapshots`, { method: 'POST', body: JSON.stringify(rows) }),
};
