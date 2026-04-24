// Admin panel: Users, Unassigned projects, App settings, Invites

function AdminPanel({ theme, currentUser, onClose }) {
  const [tab, setTab] = React.useState('projects');

  const tabs = [
    ['projects', 'Unassigned'],
    ['users',    'Users'],
    ['invites',  'Invites'],
    ['settings', 'Settings'],
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 150, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 60 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div style={{
        position: 'relative', zIndex: 1,
        background: theme.surface, border: `1px solid ${theme.borderStrong}`,
        borderRadius: 14, width: '100%', maxWidth: 620, maxHeight: 'calc(100vh - 80px)',
        display: 'flex', flexDirection: 'column',
        boxShadow: theme.dark ? '0 24px 80px rgba(0,0,0,0.6)' : '0 24px 80px rgba(0,0,0,0.14)',
        fontFamily: 'Inter, system-ui, sans-serif', color: theme.text,
      }}>
        {/* Header */}
        <div style={{ padding: '18px 20px 0', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Admin</span>
            <button onClick={onClose} style={{ border: 'none', background: 'transparent', color: theme.textMuted, cursor: 'pointer', fontSize: 16, padding: 4 }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: 0 }}>
            {tabs.map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer',
                fontSize: 13, fontFamily: 'inherit', fontWeight: 500,
                color: tab === k ? theme.text : theme.textMuted,
                borderBottom: tab === k ? `2px solid ${theme.accent}` : '2px solid transparent',
                marginBottom: -1,
              }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {tab === 'projects' && <UnassignedTab theme={theme} currentUser={currentUser} />}
          {tab === 'users'    && <UsersTab theme={theme} currentUser={currentUser} />}
          {tab === 'invites'  && <InvitesTab theme={theme} />}
          {tab === 'settings' && <SettingsTab theme={theme} />}
        </div>
      </div>
    </div>
  );
}

// ── Unassigned projects ────────────────────────────────────────────────────

function UnassignedTab({ theme, currentUser }) {
  const [projects, setProjects] = React.useState(null);
  const [users,    setUsers]    = React.useState([]);
  const [error,    setError]    = React.useState(null);

  const load = () => Promise.all([
    window.api.admin.getUnassigned(),
    window.api.admin.getUsers(),
  ]).then(([ps, us]) => { setProjects(ps); setUsers(us); }).catch(e => setError(e.message));

  React.useEffect(() => { load(); }, []);

  const assign = async (projectId, userId) => {
    try {
      await window.api.admin.assignProject(projectId, userId);
      setProjects(prev => prev.filter(p => p.id !== projectId));
    } catch (e) { setError(e.message); }
  };

  if (!projects) return <Loading theme={theme} />;

  return (
    <div>
      <p style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 0, marginBottom: 16 }}>
        Projects without an owner. Assign them to a user so they appear in that user's account.
      </p>
      {error && <ErrBanner theme={theme} msg={error} />}
      {projects.length === 0 && (
        <div style={{ textAlign: 'center', padding: 32, color: theme.textSubtle, fontSize: 13 }}>All projects are assigned.</div>
      )}
      {projects.map(p => (
        <div key={p.id} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
          borderRadius: 8, border: `1px solid ${theme.border}`, marginBottom: 8,
        }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flexShrink: 0 }}></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
            <div style={{ fontSize: 11, color: theme.textMuted, fontFamily: 'ui-monospace, Menlo, monospace' }}>{p.id}</div>
          </div>
          <select onChange={e => assign(p.id, e.target.value ? Number(e.target.value) : null)}
            defaultValue=""
            style={{
              fontSize: 12, padding: '5px 8px', borderRadius: 6,
              border: `1px solid ${theme.border}`, backgroundColor: theme.surface,
              color: theme.text, cursor: 'pointer', fontFamily: 'inherit',
            }}>
            <option value="">Assign to…</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>
                {u.email}{u.id === currentUser.id ? ' (you)' : ''}
              </option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

// ── Users ──────────────────────────────────────────────────────────────────

function UsersTab({ theme, currentUser }) {
  const [users,   setUsers]   = React.useState(null);
  const [error,   setError]   = React.useState(null);
  const [confirm, setConfirm] = React.useState(null);

  React.useEffect(() => {
    window.api.admin.getUsers()
      .then(setUsers)
      .catch(e => setError(e.message));
  }, []);

  const deleteUser = async (id) => {
    try {
      await window.api.admin.deleteUser(id);
      setUsers(prev => prev.filter(u => u.id !== id));
      setConfirm(null);
    } catch (e) { setError(e.message); }
  };

  if (!users) return <Loading theme={theme} />;

  return (
    <div>
      {error && <ErrBanner theme={theme} msg={error} />}
      {users.map(u => (
        <div key={u.id} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
          borderRadius: 8, border: `1px solid ${theme.border}`, marginBottom: 8,
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
            background: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            fontSize: 12, fontWeight: 600, color: theme.textMuted,
          }}>{u.email[0].toUpperCase()}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
              {u.email}
              {u.role === 'admin' && (
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: theme.accentSoft, color: theme.accent, fontWeight: 600 }}>admin</span>
              )}
              {!u.isActive && (
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: `color-mix(in oklch, ${theme.danger} 12%, transparent)`, color: theme.danger }}>inactive</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: theme.textMuted }}>
              Joined {new Date(u.createdAt).toLocaleDateString()}
            </div>
          </div>
          {u.id !== currentUser.id && (
            confirm === u.id
              ? <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: theme.danger }}>Delete + all projects?</span>
                  <window.Button theme={theme} variant="danger" size="sm" onClick={() => deleteUser(u.id)}>Yes</window.Button>
                  <window.Button theme={theme} variant="ghost"  size="sm" onClick={() => setConfirm(null)}>No</window.Button>
                </div>
              : <window.Button theme={theme} variant="ghost" size="sm" onClick={() => setConfirm(u.id)}>Delete</window.Button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Invites ────────────────────────────────────────────────────────────────

function InvitesTab({ theme }) {
  const [invites, setInvites] = React.useState(null);
  const [email,   setEmail]   = React.useState('');
  const [error,   setError]   = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    window.api.admin.getInvites().then(setInvites).catch(e => setError(e.message));
  }, []);

  const create = async () => {
    setLoading(true); setError(null);
    try {
      const invite = await window.api.admin.createInvite(email || null);
      setInvites(prev => [invite, ...(prev || [])]);
      setEmail('');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const appUrl = window.__BURNUP_APP__ || window.location.origin;

  return (
    <div>
      <p style={{ fontSize: 12.5, color: theme.textMuted, marginTop: 0, marginBottom: 16 }}>
        Create invite links for new users when registration is closed.
      </p>
      {error && <ErrBanner theme={theme} msg={error} />}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <window.Input theme={theme} type="email" placeholder="Optional: restrict to email" value={email} onChange={e => setEmail(e.target.value)} style={{ flex: 1 }} />
        <window.Button theme={theme} variant="primary" size="sm" onClick={create} disabled={loading}>
          {loading ? '…' : 'Create invite'}
        </window.Button>
      </div>
      {!invites && <Loading theme={theme} />}
      {invites?.map(i => {
        const link = `${appUrl}/#/register?invite=${i.token}`;
        const expired = new Date(i.expiresAt) < new Date();
        return (
          <div key={i.id} style={{
            padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.border}`,
            marginBottom: 8, opacity: i.used || expired ? 0.5 : 1,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 12, color: theme.textMuted }}>{i.email || 'Open invite'}</span>
              <span style={{ fontSize: 11, color: i.used ? theme.success : expired ? theme.danger : theme.textSubtle }}>
                {i.used ? 'Used' : expired ? 'Expired' : `Expires ${new Date(i.expiresAt).toLocaleDateString()}`}
              </span>
            </div>
            {!i.used && !expired && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <div style={{
                  flex: 1, fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace',
                  color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{link}</div>
                <button onClick={() => navigator.clipboard.writeText(link)} style={{
                  border: `1px solid ${theme.border}`, borderRadius: 5, padding: '3px 8px',
                  fontSize: 11, background: theme.surface, color: theme.textMuted, cursor: 'pointer',
                  fontFamily: 'inherit', flexShrink: 0,
                }}>Copy</button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Settings ───────────────────────────────────────────────────────────────

function SettingsTab({ theme }) {
  const [settings, setSettings]   = React.useState(null);
  const [error,    setError]      = React.useState(null);
  const [saving,   setSaving]     = React.useState(false);

  React.useEffect(() => {
    window.api.admin.getSettings().then(setSettings).catch(e => setError(e.message));
  }, []);

  const toggle = async () => {
    setSaving(true); setError(null);
    try {
      const updated = await window.api.admin.updateSettings({ registrationEnabled: !settings.registrationEnabled });
      setSettings(updated);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (!settings) return <Loading theme={theme} />;

  return (
    <div>
      {error && <ErrBanner theme={theme} msg={error} />}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 16px', borderRadius: 10, border: `1px solid ${theme.border}`,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Open registration</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>
            {settings.registrationEnabled
              ? 'Anyone can create an account.'
              : 'New accounts require an invite link.'}
          </div>
        </div>
        <button onClick={toggle} disabled={saving} style={{
          width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
          background: settings.registrationEnabled ? theme.success : theme.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
          position: 'relative', transition: 'background 0.15s', flexShrink: 0,
        }}>
          <span style={{
            position: 'absolute', top: 3, left: settings.registrationEnabled ? 23 : 3,
            width: 18, height: 18, borderRadius: '50%', background: '#fff',
            transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </button>
      </div>
    </div>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────

function Loading({ theme }) {
  return <div style={{ padding: 32, textAlign: 'center', color: theme.textSubtle, fontSize: 13 }}>Loading…</div>;
}

function ErrBanner({ theme, msg }) {
  return (
    <div style={{
      fontSize: 12.5, color: theme.danger, marginBottom: 14, padding: '9px 12px',
      borderRadius: 7, background: `color-mix(in oklch, ${theme.danger} 10%, transparent)`,
    }}>{msg}</div>
  );
}

Object.assign(window, { AdminPanel });
