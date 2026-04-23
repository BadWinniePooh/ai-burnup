// App shell: project switcher header + nav + Dashboard/Cards views + Tweaks.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": false,
  "accentHue": 258,
  "chartStyle": "area",
  "density": "comfortable"
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweaks] = React.useState(TWEAK_DEFAULTS);
  const [editMode, setEditMode] = React.useState(false);
  const [projectId, setProjectId] = React.useState(() => localStorage.getItem('burnup.projectId') || 'aurora');
  const [view, setView] = React.useState(() => localStorage.getItem('burnup.view') || 'dashboard');

  const [projects, setProjects] = React.useState([]);
  const [cards, setCards] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [apiError, setApiError] = React.useState(null);
  const [selectedCardUid, setSelectedCardUid] = React.useState(null);
  const [modalProject, setModalProject] = React.useState(null); // null | { mode:'new' } | { mode:'edit', project }

  // Load all projects once on mount
  React.useEffect(() => {
    window.api.getProjects()
      .then(ps => {
        setProjects(ps);
        if (ps.length > 0 && !ps.find(p => p.id === projectId)) setProjectId(ps[0].id);
      })
      .catch(err => setApiError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Re-load cards whenever the active project changes
  React.useEffect(() => {
    if (!projectId) return;
    window.api.getCards(projectId).then(setCards).catch(() => {});
  }, [projectId]);

  React.useEffect(() => { localStorage.setItem('burnup.projectId', projectId); }, [projectId]);
  React.useEffect(() => { localStorage.setItem('burnup.view', view); }, [view]);

  // Edit-mode wiring (design canvas integration)
  React.useEffect(() => {
    const onMsg = (e) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === '__activate_edit_mode')   setEditMode(true);
      if (e.data.type === '__deactivate_edit_mode') setEditMode(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const updateTweak = (patch) => {
    setTweaks(prev => {
      const next = { ...prev, ...patch };
      try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits: patch }, '*'); } catch {}
      return next;
    });
  };

  const theme = React.useMemo(() => {
    const accent = `oklch(0.62 0.15 ${tweaks.accentHue})`;
    if (tweaks.dark) return {
      bg: '#0e0d0c', surface: '#16140f', surfaceElev: '#1c1915',
      border: 'rgba(255,255,255,0.08)', borderStrong: 'rgba(255,255,255,0.14)',
      text: '#f2ece1', textMuted: 'rgba(242,236,225,0.58)', textSubtle: 'rgba(242,236,225,0.38)',
      accent, accentSoft: `color-mix(in oklch, ${accent} 18%, transparent)`,
      danger: 'oklch(0.68 0.18 25)', success: 'oklch(0.72 0.14 155)', dark: true,
    };
    return {
      bg: '#faf8f4', surface: '#ffffff', surfaceElev: '#ffffff',
      border: 'rgba(30,25,20,0.08)', borderStrong: 'rgba(30,25,20,0.16)',
      text: '#17150f', textMuted: 'rgba(23,21,15,0.58)', textSubtle: 'rgba(23,21,15,0.38)',
      accent, accentSoft: `color-mix(in oklch, ${accent} 14%, transparent)`,
      danger: 'oklch(0.55 0.18 25)', success: 'oklch(0.58 0.14 155)', dark: false,
    };
  }, [tweaks.dark, tweaks.accentHue]);

  // ── Project CRUD ─────────────────────────────────────────────────

  const handleSaveProject = async (data) => {
    if (modalProject.mode === 'new') {
      const created = await window.api.createProject(data);
      setProjects(ps => [...ps, created].sort((a, b) => a.name.localeCompare(b.name)));
      setProjectId(created.id);
    } else {
      const updated = await window.api.updateProject(modalProject.project.id, data);
      setProjects(ps => ps.map(p => p.id === updated.id ? updated : p));
    }
    setModalProject(null);
  };

  const handleDeleteProject = async (id) => {
    await window.api.deleteProject(id);
    const remaining = projects.filter(p => p.id !== id);
    setProjects(remaining);
    if (projectId === id) setProjectId(remaining[0]?.id ?? null);
    setModalProject(null);
  };

  // ── Loading / error screens ───────────────────────────────────

  if (loading) return (
    <div style={{
      height: '100vh', background: '#faf8f4', display: 'grid', placeItems: 'center',
      fontFamily: 'Inter, system-ui, sans-serif', color: 'rgba(23,21,15,0.4)', fontSize: 13,
    }}>
      Loading…
    </div>
  );

  if (apiError) return (
    <div style={{
      height: '100vh', background: '#faf8f4', display: 'grid', placeItems: 'center',
      fontFamily: 'Inter, system-ui, sans-serif', padding: 32, textAlign: 'center',
    }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#17150f' }}>Cannot reach the API</div>
        <div style={{ fontSize: 13, color: 'rgba(23,21,15,0.55)', marginBottom: 20, maxWidth: 400 }}>{apiError}</div>
        <div style={{
          fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace',
          background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: 8, padding: '12px 18px', display: 'inline-block', color: '#555',
        }}>
          cd BurnupApi &amp;&amp; dotnet run
        </div>
      </div>
    </div>
  );

  const project = projects.find(p => p.id === projectId) || projects[0];

  if (!project) return (
    <div style={{
      height: '100vh', background: '#faf8f4', display: 'grid', placeItems: 'center',
      fontFamily: 'Inter, system-ui, sans-serif', textAlign: 'center',
    }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: '#17150f' }}>No projects yet</div>
        <div style={{ fontSize: 13, color: 'rgba(23,21,15,0.45)', marginBottom: 20 }}>
          Create your first project to get started.
        </div>
        <button onClick={() => setModalProject({ mode: 'new' })} style={{
          padding: '8px 16px', fontSize: 13, fontWeight: 500, border: 'none', borderRadius: 7,
          background: '#17150f', color: '#faf8f4', cursor: 'pointer',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>+ New project</button>
      </div>
      {modalProject && (
        <ProjectModal theme={{ bg:'#faf8f4', surface:'#fff', surfaceElev:'#fff',
          border:'rgba(30,25,20,0.08)', borderStrong:'rgba(30,25,20,0.16)',
          text:'#17150f', textMuted:'rgba(23,21,15,0.58)', textSubtle:'rgba(23,21,15,0.38)',
          accent:'oklch(0.62 0.15 258)', accentSoft:'color-mix(in oklch,oklch(0.62 0.15 258) 14%,transparent)',
          danger:'oklch(0.55 0.18 25)', dark: false }}
          initialProject={{}} onSave={handleSaveProject} onDelete={handleDeleteProject}
          onClose={() => setModalProject(null)} />
      )}
    </div>
  );

  return (
    <div style={{
      height: '100vh', background: theme.bg, color: theme.text,
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      display: 'flex', flexDirection: 'column', overflow: 'hidden', letterSpacing: '-0.005em',
    }}>
      <Header theme={theme} project={project} projects={projects}
        onProjectChange={setProjectId} view={view} onViewChange={setView}
        tweaks={tweaks} updateTweak={updateTweak}
        onNewProject={() => setModalProject({ mode: 'new' })}
        onEditProject={(p) => setModalProject({ mode: 'edit', project: p })}
      />

      <div style={{ flex: 1, minHeight: 0, overflowY: view === 'dashboard' ? 'auto' : 'hidden' }}>
        {view === 'dashboard' && (
          <window.Dashboard project={project} cards={cards} theme={theme} chartStyle={tweaks.chartStyle} />
        )}
        {view === 'cards' && (
          <window.CardsView project={project} cards={cards} setCards={setCards} theme={theme}
            selectedUid={selectedCardUid} setSelectedUid={setSelectedCardUid} />
        )}
      </div>

      {editMode && <TweaksPanel theme={theme} tweaks={tweaks} updateTweak={updateTweak} />}

      {modalProject && (
        <ProjectModal theme={theme}
          initialProject={modalProject.mode === 'edit' ? modalProject.project : {}}
          onSave={handleSaveProject} onDelete={handleDeleteProject}
          onClose={() => setModalProject(null)} />
      )}
    </div>
  );
}

function Header({ theme, project, projects, onProjectChange, view, onViewChange, tweaks, updateTweak, onNewProject, onEditProject }) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', height: 54,
      borderBottom: `1px solid ${theme.border}`, background: theme.surface, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: 5, background: theme.text, display: 'grid', placeItems: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M1 10 L4 6 L7 8 L11 2" stroke={theme.bg} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em' }}>Burnup</span>
        </div>

        {/* Project switcher */}
        <div style={{ height: 22, width: 1, background: theme.border }}></div>
        <div style={{ position: 'relative' }}>
          <button onClick={() => setPickerOpen(v => !v)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 10px 5px 8px', border: `1px solid ${theme.border}`,
            background: theme.bg, color: theme.text, borderRadius: 6,
            cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', fontWeight: 500,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: project.color }}></span>
            <span>{project.name}</span>
            <span style={{ fontSize: 10.5, color: theme.textSubtle, fontFamily: 'ui-monospace, Menlo, monospace' }}>{project.code}</span>
            <svg width="9" height="6" viewBox="0 0 9 6" fill="none" style={{ marginLeft: 2 }}>
              <path d="M1 1l3.5 3.5L8 1" stroke={theme.textMuted} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>

          {pickerOpen && (
            <>
              <div onClick={() => setPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 5 }}></div>
              <div style={{
                position: 'absolute', top: 34, left: 0, zIndex: 6,
                background: theme.surface, border: `1px solid ${theme.border}`,
                borderRadius: 8,
                boxShadow: theme.dark ? '0 12px 40px rgba(0,0,0,0.5)' : '0 12px 40px rgba(0,0,0,0.08)',
                width: 280, padding: 4,
              }}>
                {projects.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <button onClick={() => { onProjectChange(p.id); setPickerOpen(false); }} style={{
                      flex: 1, display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', border: 'none',
                      background: p.id === project.id ? theme.accentSoft : 'transparent',
                      color: theme.text, borderRadius: 6, cursor: 'pointer',
                      textAlign: 'left', fontFamily: 'inherit', fontSize: 13,
                    }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flexShrink: 0 }}></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 500 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>{p.description}</div>
                      </div>
                      <span style={{ fontSize: 10.5, color: theme.textSubtle, fontFamily: 'ui-monospace, Menlo, monospace' }}>{p.code}</span>
                    </button>
                    <button onClick={() => { onEditProject(p); setPickerOpen(false); }} title="Edit project" style={{
                      padding: 6, border: 'none', background: 'transparent',
                      color: theme.textSubtle, borderRadius: 5, cursor: 'pointer',
                      display: 'grid', placeItems: 'center', flexShrink: 0,
                    }}>
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M9.5 1.5l2 2-7 7H2.5v-2l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                ))}
                <div style={{ borderTop: `1px solid ${theme.border}`, margin: '4px 0' }}></div>
                <button onClick={() => { onNewProject(); setPickerOpen(false); }} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%', padding: '8px 10px', border: 'none',
                  background: 'transparent', color: theme.textMuted,
                  borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'inherit', fontSize: 12.5,
                }}>
                  <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> New project
                </button>
              </div>
            </>
          )}
        </div>

        {/* View tabs */}
        <div style={{ display: 'flex', gap: 2, padding: 2, background: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', borderRadius: 7 }}>
          {[['dashboard', 'Dashboard'], ['cards', 'Cards']].map(([k, l]) => (
            <button key={k} onClick={() => onViewChange(k)} style={{
              padding: '5px 12px', fontSize: 12.5, border: 'none', borderRadius: 5,
              background: view === k ? theme.surface : 'transparent',
              color: view === k ? theme.text : theme.textMuted,
              cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
              boxShadow: view === k ? (theme.dark ? '0 1px 0 rgba(255,255,255,0.05)' : '0 1px 2px rgba(0,0,0,0.06)') : 'none',
            }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 11.5, color: theme.textMuted, fontFamily: 'ui-monospace, Menlo, monospace', marginRight: 6 }}>⌘K</div>
        <button onClick={() => updateTweak({ dark: !tweaks.dark })} title="Toggle theme" style={{
          width: 30, height: 30, borderRadius: 6, border: `1px solid ${theme.border}`,
          background: theme.surface, color: theme.textMuted, cursor: 'pointer',
          display: 'grid', placeItems: 'center',
        }}>
          {tweaks.dark
            ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11 8.5a4.5 4.5 0 01-5.5-5.5A5 5 0 107 12a5 5 0 004-3.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
            : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3" /><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.8 2.8l1 1M10.2 10.2l1 1M2.8 11.2l1-1M10.2 3.8l1-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
          }
        </button>
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: `linear-gradient(135deg, ${theme.accent}, oklch(0.62 0.15 ${((tweaks.accentHue + 60) % 360)}))`,
          display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600, color: '#fff',
        }}>KR</div>
      </div>
    </header>
  );
}

function TweaksPanel({ theme, tweaks, updateTweak }) {
  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 50, width: 270,
      background: theme.surface, border: `1px solid ${theme.borderStrong}`,
      borderRadius: 10, padding: 14, fontSize: 12,
      boxShadow: theme.dark ? '0 20px 60px rgba(0,0,0,0.6)' : '0 20px 60px rgba(0,0,0,0.12)',
      fontFamily: 'inherit', color: theme.text,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Tweaks</span>
        <span style={{ fontSize: 10.5, color: theme.textSubtle, fontFamily: 'ui-monospace, Menlo, monospace', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Live</span>
      </div>
      <TweakRow label="Theme">
        <Seg theme={theme} value={tweaks.dark ? 'dark' : 'light'}
          options={[['light', 'Light'], ['dark', 'Dark']]}
          onChange={v => updateTweak({ dark: v === 'dark' })} />
      </TweakRow>
      <TweakRow label="Accent">
        <div style={{ display: 'flex', gap: 4 }}>
          {[258, 178, 62, 25, 320].map(h => (
            <button key={h} onClick={() => updateTweak({ accentHue: h })} style={{
              width: 22, height: 22, borderRadius: '50%',
              background: `oklch(0.62 0.15 ${h})`,
              border: tweaks.accentHue === h ? `2px solid ${theme.text}` : '2px solid transparent',
              cursor: 'pointer', padding: 0,
            }}></button>
          ))}
        </div>
      </TweakRow>
      <TweakRow label="Chart style">
        <Seg theme={theme} value={tweaks.chartStyle}
          options={[['area', 'Area'], ['lines', 'Lines']]}
          onChange={v => updateTweak({ chartStyle: v })} />
      </TweakRow>
    </div>
  );
}

function TweakRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
      <span style={{ fontSize: 11.5, opacity: 0.7 }}>{label}</span>
      {children}
    </div>
  );
}

function Seg({ theme, value, options, onChange }) {
  return (
    <div style={{ display: 'inline-flex', padding: 2, background: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', borderRadius: 6 }}>
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)} style={{
          padding: '3px 9px', fontSize: 11, border: 'none', borderRadius: 4,
          background: value === k ? theme.surface : 'transparent',
          color: value === k ? theme.text : theme.textMuted,
          cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
        }}>{l}</button>
      ))}
    </div>
  );
}

const PROJECT_COLORS = [
  '#6366f1','#3b82f6','#06b6d4','#22c55e',
  '#84cc16','#eab308','#f97316','#ef4444',
  '#ec4899','#a855f7','#64748b','#78716c',
];

function ProjectModal({ theme, initialProject, onSave, onDelete, onClose }) {
  const isNew = !initialProject.id;
  const [name, setName]             = React.useState(initialProject.name        || '');
  const [code, setCode]             = React.useState(initialProject.code        || '');
  const [description, setDescription] = React.useState(initialProject.description || '');
  const [color, setColor]           = React.useState(initialProject.color       || PROJECT_COLORS[0]);
  const [startDate, setStartDate]   = React.useState(initialProject.startDate   || window.TODAY);
  const [saving, setSaving]         = React.useState(false);
  const [error, setError]           = React.useState(null);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [saving]);

  const handleSave = async () => {
    if (!name.trim())      { setError('Name is required.');       return; }
    if (!code.trim())      { setError('Code is required.');       return; }
    if (!startDate)        { setError('Start date is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave({ name: name.trim(), code: code.trim(), description: description.trim(), color, startDate });
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${initialProject.name}"? All cards in this project will also be deleted.`)) return;
    setSaving(true);
    try {
      await onDelete(initialProject.id);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={() => { if (!saving) onClose(); }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div style={{
        position: 'relative', zIndex: 1,
        background: theme.surface, border: `1px solid ${theme.borderStrong}`,
        borderRadius: 12, width: 440, padding: 24,
        boxShadow: theme.dark ? '0 24px 80px rgba(0,0,0,0.6)' : '0 24px 80px rgba(0,0,0,0.14)',
        fontFamily: 'Inter, system-ui, sans-serif', color: theme.text,
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>
          {isNew ? 'New project' : 'Edit project'}
        </div>

        {/* Name + Code */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 88px', gap: 10, marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 11.5, color: theme.textMuted, marginBottom: 5 }}>Name</div>
            <Input theme={theme} value={name} onChange={e => setName(e.target.value)}
              placeholder="My Project" autoFocus />
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: theme.textMuted, marginBottom: 5 }}>Code</div>
            <Input theme={theme} value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
              placeholder="PRJ"
              style={{ fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '0.04em' }} />
          </div>
        </div>

        {/* Description */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, color: theme.textMuted, marginBottom: 5 }}>Description</div>
          <Input theme={theme} value={description} onChange={e => setDescription(e.target.value)}
            placeholder="What is this project about?" />
        </div>

        {/* Start date */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, color: theme.textMuted, marginBottom: 5 }}>Start date</div>
          <Input theme={theme} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        </div>

        {/* Color swatches */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 11.5, color: theme.textMuted, marginBottom: 8 }}>Color</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PROJECT_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{
                width: 22, height: 22, borderRadius: 5, padding: 0, cursor: 'pointer',
                background: c, border: 'none',
                outline: color === c ? `2px solid ${theme.text}` : '2px solid transparent',
                outlineOffset: 2,
              }} />
            ))}
          </div>
        </div>

        {error && (
          <div style={{
            fontSize: 12, color: theme.danger, marginBottom: 14,
            padding: '8px 10px', borderRadius: 6,
            background: `color-mix(in oklch, ${theme.danger} 10%, transparent)`,
          }}>{error}</div>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {!isNew
            ? <Button variant="danger" size="sm" theme={theme} onClick={handleDelete} disabled={saving}>Delete project</Button>
            : <div />
          }
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="sm" theme={theme} onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" size="sm" theme={theme} onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create' : 'Save changes'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

window.App = App;
