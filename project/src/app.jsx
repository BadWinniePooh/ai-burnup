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
  const [cards, setCards] = React.useState(window.SAMPLE_CARDS);
  const [selectedCardUid, setSelectedCardUid] = React.useState(null);

  React.useEffect(() => { localStorage.setItem('burnup.projectId', projectId); }, [projectId]);
  React.useEffect(() => { localStorage.setItem('burnup.view', view); }, [view]);

  // Edit-mode wiring
  React.useEffect(() => {
    const onMsg = (e) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === '__activate_edit_mode') setEditMode(true);
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
    const t = window.useThemeResolve ? window.useThemeResolve(tweaks.dark) : null;
    // Build theme inline with custom hue
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

  const project = window.SAMPLE_PROJECTS.find(p => p.id === projectId) || window.SAMPLE_PROJECTS[0];

  return (
    <div style={{
      height: '100vh',
      background: theme.bg,
      color: theme.text,
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      letterSpacing: '-0.005em',
    }}>
      <Header theme={theme} project={project} projects={window.SAMPLE_PROJECTS}
        onProjectChange={setProjectId} view={view} onViewChange={setView}
        tweaks={tweaks} updateTweak={updateTweak} />

      <div style={{ flex: 1, minHeight: 0, overflowY: view === 'dashboard' ? 'auto' : 'hidden' }}>
        {view === 'dashboard' && (
          <window.Dashboard project={project} cards={cards} theme={theme} chartStyle={tweaks.chartStyle} />
        )}
        {view === 'cards' && (
          <window.CardsView
            project={project}
            cards={cards}
            setCards={setCards}
            theme={theme}
            selectedUid={selectedCardUid}
            setSelectedUid={setSelectedCardUid}
          />
        )}
      </div>

      {editMode && <TweaksPanel theme={theme} tweaks={tweaks} updateTweak={updateTweak} />}
    </div>
  );
}

function Header({ theme, project, projects, onProjectChange, view, onViewChange, tweaks, updateTweak }) {
  const [pickerOpen, setPickerOpen] = React.useState(false);
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 20px',
      height: 54,
      borderBottom: `1px solid ${theme.border}`,
      background: theme.surface,
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 22, height: 22, borderRadius: 5,
            background: theme.text,
            position: 'relative',
            display: 'grid', placeItems: 'center',
          }}>
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
            padding: '5px 10px 5px 8px',
            border: `1px solid ${theme.border}`,
            background: theme.bg,
            color: theme.text,
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 13,
            fontFamily: 'inherit',
            fontWeight: 500,
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
                background: theme.surface,
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                boxShadow: theme.dark ? '0 12px 40px rgba(0,0,0,0.5)' : '0 12px 40px rgba(0,0,0,0.08)',
                width: 260,
                padding: 4,
              }}>
                {projects.map(p => (
                  <button key={p.id} onClick={() => { onProjectChange(p.id); setPickerOpen(false); }} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    width: '100%',
                    padding: '8px 10px',
                    border: 'none',
                    background: p.id === project.id ? theme.accentSoft : 'transparent',
                    color: theme.text,
                    borderRadius: 6,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                    fontSize: 13,
                  }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, flexShrink: 0 }}></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>{p.description}</div>
                    </div>
                    <span style={{ fontSize: 10.5, color: theme.textSubtle, fontFamily: 'ui-monospace, Menlo, monospace' }}>{p.code}</span>
                  </button>
                ))}
                <div style={{ borderTop: `1px solid ${theme.border}`, margin: '4px 0' }}></div>
                <button style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  width: '100%',
                  padding: '8px 10px',
                  border: 'none',
                  background: 'transparent',
                  color: theme.textMuted,
                  borderRadius: 6,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  fontSize: 12.5,
                }}>
                  <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> New project
                </button>
              </div>
            </>
          )}
        </div>

        {/* View tabs */}
        <div style={{ display: 'flex', gap: 2, padding: 2, background: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', borderRadius: 7 }}>
          {[
            ['dashboard', 'Dashboard'],
            ['cards', 'Cards'],
          ].map(([k, l]) => (
            <button key={k} onClick={() => onViewChange(k)} style={{
              padding: '5px 12px',
              fontSize: 12.5,
              border: 'none',
              borderRadius: 5,
              background: view === k ? theme.surface : 'transparent',
              color: view === k ? theme.text : theme.textMuted,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 500,
              boxShadow: view === k ? (theme.dark ? '0 1px 0 rgba(255,255,255,0.05)' : '0 1px 2px rgba(0,0,0,0.06)') : 'none',
            }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 11.5, color: theme.textMuted, fontFamily: 'ui-monospace, Menlo, monospace', marginRight: 6 }}>⌘K</div>
        <button onClick={() => updateTweak({ dark: !tweaks.dark })} title="Toggle theme" style={{
          width: 30, height: 30, borderRadius: 6,
          border: `1px solid ${theme.border}`,
          background: theme.surface,
          color: theme.textMuted,
          cursor: 'pointer',
          display: 'grid', placeItems: 'center',
        }}>
          {tweaks.dark ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11 8.5a4.5 4.5 0 01-5.5-5.5A5 5 0 107 12a5 5 0 004-3.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.3" /><path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.8 2.8l1 1M10.2 10.2l1 1M2.8 11.2l1-1M10.2 3.8l1-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
          )}
        </button>
        <div style={{
          width: 26, height: 26, borderRadius: '50%',
          background: `linear-gradient(135deg, ${theme.accent}, oklch(0.62 0.15 ${((tweaks.accentHue + 60) % 360)}))`,
          display: 'grid', placeItems: 'center',
          fontSize: 11, fontWeight: 600, color: '#fff',
        }}>KR</div>
      </div>
    </header>
  );
}

function TweaksPanel({ theme, tweaks, updateTweak }) {
  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 50,
      width: 270,
      background: theme.surface,
      border: `1px solid ${theme.borderStrong}`,
      borderRadius: 10,
      padding: 14,
      fontSize: 12,
      boxShadow: theme.dark ? '0 20px 60px rgba(0,0,0,0.6)' : '0 20px 60px rgba(0,0,0,0.12)',
      fontFamily: 'inherit',
      color: theme.text,
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
              border: tweaks.accentHue === h ? `2px solid ${theme.text}` : `2px solid transparent`,
              cursor: 'pointer',
              padding: 0,
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
          padding: '3px 9px',
          fontSize: 11,
          border: 'none',
          borderRadius: 4,
          background: value === k ? theme.surface : 'transparent',
          color: value === k ? theme.text : theme.textMuted,
          cursor: 'pointer',
          fontFamily: 'inherit',
          fontWeight: 500,
        }}>{l}</button>
      ))}
    </div>
  );
}

window.App = App;
