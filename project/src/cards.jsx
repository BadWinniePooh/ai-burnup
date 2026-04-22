// CardsView — split: list on left, edit form on right.

function CardsView({ project, cards, setCards, theme, selectedUid, setSelectedUid }) {
  const filtered = cards.filter(c => c.projectId === project.id);
  const [typeFilter, setTypeFilter] = React.useState('all');
  const [scopeFilter, setScopeFilter] = React.useState('all');
  const [statusFilter, setStatusFilter] = React.useState('all');
  const [query, setQuery] = React.useState('');

  const visible = filtered.filter(c => {
    if (typeFilter !== 'all' && c.type !== typeFilter) return false;
    if (scopeFilter !== 'all' && c.scope !== scopeFilter) return false;
    if (statusFilter === 'done' && !c.endDate) return false;
    if (statusFilter === 'active' && (!c.startedDate || c.endDate)) return false;
    if (statusFilter === 'backlog' && c.startedDate) return false;
    if (query) {
      const display = window.cardDisplayId(c, project);
      if (!(`${display} ${c.title}`).toLowerCase().includes(query.toLowerCase())) return false;
    }
    return true;
  });

  React.useEffect(() => {
    if (!filtered.length) { setSelectedUid(null); return; }
    if (!filtered.find(c => c.uid === selectedUid)) {
      setSelectedUid(filtered[0].uid);
    }
  }, [project.id, filtered.length]);

  const selected = cards.find(c => c.uid === selectedUid);

  const handleUpdate = (updated) => {
    setCards(prev => prev.map(c => c.uid === updated.uid ? updated : c));
  };

  const handleDelete = (uid) => {
    setCards(prev => prev.filter(c => c.uid !== uid));
    setSelectedUid(filtered.filter(c => c.uid !== uid)[0]?.uid ?? null);
  };

  const handleNew = () => {
    const maxNum = filtered.reduce((m, c) => Math.max(m, c.cardNumber || 0), 0);
    const newCard = {
      uid: `${project.id}:${Date.now()}`,
      cardNumber: maxNum + 1,
      projectId: project.id,
      title: 'Untitled card',
      createdDate: '2026-04-22',
      startedDate: null,
      endDate: null,
      estimation: 1,
      estimationUnit: 'days',
      estimationDays: 1,
      type: 'feature',
      scope: 'mvp',
    };
    setCards(prev => [...prev, newCard]);
    setSelectedUid(newCard.uid);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', height: '100%', minHeight: 0 }}>
      {/* LEFT: list */}
      <div style={{ borderRight: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {/* Toolbar */}
        <div style={{ padding: '14px 16px 12px', borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Cards</div>
              <div style={{ fontSize: 11, color: theme.textMuted, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                {visible.length} of {filtered.length}
              </div>
            </div>
            <window.Button theme={theme} variant="primary" size="sm" onClick={handleNew}>
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> New card
            </window.Button>
          </div>

          <window.Input theme={theme} placeholder="Search by ID or title..." value={query} onChange={e => setQuery(e.target.value)}
            style={{ fontSize: 12.5, padding: '6px 10px' }} />

          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <FilterPill theme={theme} label="Status" value={statusFilter} onChange={setStatusFilter}
              options={[['all', 'All'], ['backlog', 'Backlog'], ['active', 'Active'], ['done', 'Done']]} />
            <FilterPill theme={theme} label="Type" value={typeFilter} onChange={setTypeFilter}
              options={[['all', 'All'], ...window.CARD_TYPES.map(t => [t, window.TYPE_META[t].label])]} />
            <FilterPill theme={theme} label="Scope" value={scopeFilter} onChange={setScopeFilter}
              options={[['all', 'All'], ...window.SCOPES.map(s => [s, s.toUpperCase()])]} />
          </div>
        </div>

        {/* Scrollable list */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {visible.length === 0 && (
            <div style={{ padding: 32, color: theme.textMuted, fontSize: 13, textAlign: 'center' }}>No cards match filters.</div>
          )}
          {visible.map(c => <CardRow key={c.uid} card={c} project={project} theme={theme} selected={c.uid === selectedUid} onClick={() => setSelectedUid(c.uid)} />)}
        </div>
      </div>

      {/* RIGHT: edit form or empty */}
      <div style={{ overflowY: 'auto' }}>
        {selected ? (
          <CardEditForm
            key={selected.uid}
            card={selected}
            project={project}
            allCards={cards}
            theme={theme}
            onUpdate={handleUpdate}
            onDelete={() => handleDelete(selected.uid)}
          />
        ) : (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: theme.textMuted }}>
            No card selected.
          </div>
        )}
      </div>
    </div>
  );
}

function FilterPill({ theme, label, value, onChange, options }) {
  return (
    <label style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 8px 4px 10px',
      border: `1px solid ${theme.border}`,
      borderRadius: 6,
      fontSize: 11.5,
      color: theme.textMuted,
      fontFamily: 'ui-monospace, Menlo, monospace',
      background: theme.surface,
    }}>
      <span>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)} style={{
        background: 'transparent',
        border: 'none',
        color: theme.text,
        fontFamily: 'inherit',
        fontSize: 11.5,
        outline: 'none',
        cursor: 'pointer',
      }}>
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

function CardRow({ card, project, theme, selected, onClick }) {
  const status = window.StatusDot({ card, theme });
  const displayId = window.cardDisplayId(card, project);
  return (
    <div onClick={onClick} style={{
      padding: '12px 16px',
      borderBottom: `1px solid ${theme.border}`,
      cursor: 'pointer',
      background: selected ? theme.accentSoft : 'transparent',
      borderLeft: selected ? `2px solid ${theme.accent}` : '2px solid transparent',
      paddingLeft: 14,
      display: 'flex',
      gap: 10,
      alignItems: 'flex-start',
    }}>
      <window.TypeGlyph type={card.type} size={18} theme={theme} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
          <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: 'ui-monospace, Menlo, monospace' }}>{displayId}</span>
          <span style={{ fontSize: 10.5, color: theme.textSubtle, fontFamily: 'ui-monospace, Menlo, monospace', textTransform: 'uppercase', letterSpacing: '0.06em' }}>· {card.scope}</span>
        </div>
        <div style={{ fontSize: 13.5, color: theme.text, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
          {card.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: theme.textMuted, fontFamily: 'ui-monospace, Menlo, monospace' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: status.color }}></span>
            {status.label}
          </span>
          <span>·</span>
          <span>{card.estimation}{card.estimationUnit === 'days' ? 'd' : 'p'}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function CardEditForm({ card, project, allCards, theme, onUpdate, onDelete }) {
  const [local, setLocal] = React.useState(card);
  React.useEffect(() => setLocal(card), [card.uid]);

  const update = (patch) => {
    const next = { ...local, ...patch };
    if ('estimation' in patch || 'estimationUnit' in patch) {
      const n = Number(next.estimation) || 0;
      next.estimationDays = next.estimationUnit === 'points' ? Math.max(0.5, n / 1.5) : n;
    }
    setLocal(next);
    onUpdate(next);
  };

  const status = window.StatusDot({ card: local, theme });
  const canComplete = local.startedDate && !local.endDate;
  const canStart = !local.startedDate;

  const displayId = window.cardDisplayId(local, project);
  // Collision check: another card in same project with same cardNumber
  const collision = allCards.some(c => c.uid !== local.uid && c.projectId === local.projectId && c.cardNumber === local.cardNumber);

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 32px 48px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <window.TypeGlyph type={local.type} size={24} theme={theme} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: theme.textSubtle, fontFamily: 'ui-monospace, Menlo, monospace', letterSpacing: '0.06em' }}>
              {displayId} · EDITING
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: status.color }}></span>
              {status.label}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {canStart && (
            <window.Button theme={theme} size="sm" onClick={() => update({ startedDate: '2026-04-22' })}>
              Start
            </window.Button>
          )}
          {canComplete && (
            <window.Button theme={theme} size="sm" variant="accent" onClick={() => update({ endDate: '2026-04-22' })}>
              Mark done
            </window.Button>
          )}
          {local.endDate && (
            <window.Button theme={theme} size="sm" onClick={() => update({ endDate: null })}>
              Reopen
            </window.Button>
          )}
          <window.Button theme={theme} size="sm" variant="danger" onClick={onDelete} title="Delete card">
            Delete
          </window.Button>
        </div>
      </div>

      {/* Title */}
      <FormField label="Title" theme={theme}>
        <input value={local.title} onChange={e => update({ title: e.target.value })} style={{
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontFamily: 'inherit',
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: '-0.015em',
          color: theme.text,
          width: '100%',
          padding: '6px 0',
          borderBottom: `1px solid ${theme.border}`,
        }} />
      </FormField>

      {/* Two-col meta */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 22 }}>
        <FormField label="Card type" theme={theme}>
          <window.Select theme={theme} value={local.type} onChange={e => update({ type: e.target.value })}>
            {window.CARD_TYPES.map(t => <option key={t} value={t}>{window.TYPE_META[t].label}</option>)}
          </window.Select>
        </FormField>

        <FormField label="Project scope" theme={theme}>
          <window.Select theme={theme} value={local.scope} onChange={e => update({ scope: e.target.value })}>
            {window.SCOPES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
          </window.Select>
        </FormField>

        <FormField label="Estimation" theme={theme}>
          <div style={{ display: 'flex', gap: 6 }}>
            <window.Input theme={theme} type="number" step="0.5" min="0" value={local.estimation}
              onChange={e => update({ estimation: Number(e.target.value) })} style={{ flex: 1 }} />
            <window.Select theme={theme} value={local.estimationUnit}
              onChange={e => update({ estimationUnit: e.target.value })} style={{ width: 120 }}>
              <option value="days">Days</option>
              <option value="points">Points</option>
            </window.Select>
          </div>
          <div style={{ fontSize: 11, color: theme.textSubtle, marginTop: 4, fontFamily: 'ui-monospace, Menlo, monospace' }}>
            ≈ {local.estimationDays.toFixed(1)} days for charts
          </div>
        </FormField>

        <FormField label="Card ID" theme={theme}>
          <div style={{
            display: 'flex',
            alignItems: 'stretch',
            border: `1px solid ${collision ? theme.danger : theme.border}`,
            borderRadius: 7,
            overflow: 'hidden',
            background: theme.surface,
            fontFamily: 'ui-monospace, Menlo, monospace',
          }}>
            <div
              title="Prefix comes from the project — change it in project settings"
              style={{
                padding: '8px 10px',
                fontSize: 13,
                color: theme.textMuted,
                background: theme.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                borderRight: `1px solid ${theme.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                userSelect: 'none',
              }}
            >
              <span>{project.code}-</span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ opacity: 0.55 }}>
                <path d="M3 4V2.8A2 2 0 015 .8h0a2 2 0 012 2V4M2 4h6v5H2V4z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round"/>
              </svg>
            </div>
            <input
              type="number"
              min="1"
              step="1"
              value={local.cardNumber ?? ''}
              onChange={e => {
                const v = e.target.value;
                const n = v === '' ? null : Math.max(1, Math.floor(Number(v)));
                update({ cardNumber: n });
              }}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                color: theme.text,
                fontFamily: 'inherit',
                fontSize: 13,
                padding: '8px 10px',
                outline: 'none',
                width: '100%',
              }}
            />
          </div>
          <div style={{ fontSize: 11, marginTop: 4, fontFamily: 'ui-monospace, Menlo, monospace', color: collision ? theme.danger : theme.textSubtle }}>
            {collision
              ? `${displayId} is already used by another card in ${project.name}.`
              : <>Full ID: <span style={{ color: theme.textMuted }}>{displayId}</span> · number maps to your kanban board</>}
          </div>
        </FormField>
      </div>

      {/* Dates timeline */}
      <div style={{ marginTop: 28 }}>
        <SectionLabel theme={theme}>Timeline</SectionLabel>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 12,
          marginTop: 10,
        }}>
          <DateField theme={theme} label="Created" value={local.createdDate} onChange={v => update({ createdDate: v })} required />
          <DateField theme={theme} label="Started" value={local.startedDate} onChange={v => update({ startedDate: v })} />
          <DateField theme={theme} label="Ended" value={local.endDate} onChange={v => update({ endDate: v })} />
        </div>

        <TimelineBar theme={theme} card={local} />
      </div>

      <div style={{ marginTop: 32, padding: '14px 16px', background: theme.dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)', border: `1px dashed ${theme.border}`, borderRadius: 8, fontSize: 12, color: theme.textMuted, lineHeight: 1.55 }}>
          <strong style={{ color: theme.text, fontWeight: 600 }}>How this rolls up:</strong> The charts treat this card as {local.estimationDays.toFixed(1)} day{local.estimationDays === 1 ? '' : 's'} of effort. It'll appear in total scope from <code style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: theme.text }}>{local.createdDate}</code>
          {local.endDate ? <> and contribute to <em>completed</em> from <code style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: theme.text }}>{local.endDate}</code>.</> : <>, not yet contributing to <em>completed</em>.</>}
      </div>
    </div>
  );
}

function FormField({ label, theme, children }) {
  return (
    <div>
      <div style={{
        fontSize: 11,
        color: theme.textSubtle,
        fontFamily: 'ui-monospace, Menlo, monospace',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginBottom: 6,
      }}>{label}</div>
      {children}
    </div>
  );
}

function SectionLabel({ theme, children }) {
  return <div style={{
    fontSize: 11,
    color: theme.textSubtle,
    fontFamily: 'ui-monospace, Menlo, monospace',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  }}>{children}</div>;
}

function DateField({ theme, label, value, onChange, required }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: theme.textSubtle, fontFamily: 'ui-monospace, Menlo, monospace', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5 }}>
        {label}{!required && !value && <span style={{ color: theme.textSubtle, textTransform: 'none' }}> · optional</span>}
      </div>
      <window.Input theme={theme} type="date" value={value || ''} onChange={e => onChange(e.target.value || null)} style={{
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: 12.5,
        colorScheme: theme.dark ? 'dark' : 'light',
      }} />
    </div>
  );
}

function TimelineBar({ theme, card }) {
  // Visual: horizontal track, markers for created/started/end
  const { createdDate, startedDate, endDate } = card;
  if (!createdDate) return null;
  const anchor = new Date(createdDate);
  const today = new Date('2026-04-22');
  const end = endDate ? new Date(endDate) : today;
  const rangeStart = anchor;
  const rangeEnd = end > today ? end : today;
  const spanMs = Math.max(1, rangeEnd - rangeStart);

  const pos = (d) => {
    const t = new Date(d);
    return Math.max(0, Math.min(100, ((t - rangeStart) / spanMs) * 100));
  };

  return (
    <div style={{ position: 'relative', marginTop: 22, padding: '24px 0 32px' }}>
      <div style={{ position: 'relative', height: 4, background: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', borderRadius: 2 }}>
        {startedDate && (
          <div style={{
            position: 'absolute',
            left: `${pos(startedDate)}%`,
            right: endDate ? `${100 - pos(endDate)}%` : `${100 - pos('2026-04-22')}%`,
            top: 0, bottom: 0,
            background: endDate ? theme.success : theme.accent,
            opacity: endDate ? 0.7 : 0.5,
            borderRadius: 2,
          }}></div>
        )}

        <Marker theme={theme} pct={pos(createdDate)} label="Created" date={createdDate} color={theme.textMuted} above />
        {startedDate && <Marker theme={theme} pct={pos(startedDate)} label="Started" date={startedDate} color={theme.accent} />}
        {endDate && <Marker theme={theme} pct={pos(endDate)} label="Ended" date={endDate} color={theme.success} above />}
      </div>
    </div>
  );
}

function Marker({ theme, pct, label, date, color, above }) {
  return (
    <div style={{ position: 'absolute', left: `${pct}%`, top: '50%', transform: 'translate(-50%, -50%)' }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, border: `2px solid ${theme.surface}`, boxShadow: `0 0 0 1px ${color}` }}></div>
      <div style={{
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        [above ? 'bottom' : 'top']: 14,
        fontSize: 10,
        fontFamily: 'ui-monospace, Menlo, monospace',
        color: theme.textMuted,
        whiteSpace: 'nowrap',
        textAlign: 'center',
      }}>
        <div style={{ color: theme.text, fontWeight: 500 }}>{label}</div>
        <div style={{ color: theme.textSubtle, fontSize: 9.5 }}>{date}</div>
      </div>
    </div>
  );
}

window.CardsView = CardsView;
