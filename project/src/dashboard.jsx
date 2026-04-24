// Dashboard — reporting view with stats + two burnup charts.
// Burnup series is fetched from the backend; card breakdown is derived from the
// cards already in local state so the view stays snappy after card edits.

function computeCustomSeries(config, rawSeries, projectCards) {
  const { metric = 'cards', typeFilter = [], scopeFilter = [] } = config;
  const hasFilter = typeFilter.length > 0 || scopeFilter.length > 0;
  if (!hasFilter) {
    return rawSeries.map(s => metric === 'cards'
      ? { date: s.date, scope: s.scopeCount, done: s.doneCount }
      : { date: s.date, scope: Math.round(s.scopeDays * 10) / 10, done: Math.round(s.doneDays * 10) / 10 }
    );
  }
  const filtered = projectCards.filter(c => {
    if (typeFilter.length > 0 && !typeFilter.includes(c.type)) return false;
    if (scopeFilter.length > 0 && !scopeFilter.includes(c.scope)) return false;
    return true;
  });
  return rawSeries.map(s => {
    const d = s.date;
    const scopeCards = filtered.filter(c => c.createdDate <= d);
    const doneCards  = filtered.filter(c => c.endDate && c.endDate <= d);
    if (metric === 'cards') {
      return { date: d, scope: scopeCards.length, done: doneCards.length };
    }
    const sd = scopeCards.reduce((sum, c) => sum + (c.estimationDays || 0), 0);
    const dd = doneCards .reduce((sum, c) => sum + (c.estimationDays || 0), 0);
    return { date: d, scope: Math.round(sd * 10) / 10, done: Math.round(dd * 10) / 10 };
  });
}

function Dashboard({ project, cards, theme, chartStyle = 'area', externalSeries = null }) {
  const [series, setSeries] = React.useState(externalSeries || []);
  const [burnupLoading, setBurnupLoading] = React.useState(!externalSeries);

  const [customCharts, setCustomCharts] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(`burnup.customCharts.${project.id}`) || '[]'); }
    catch { return []; }
  });
  const [builderOpen, setBuilderOpen]   = React.useState(false);
  const [editingChart, setEditingChart] = React.useState(null);

  // Re-fetch burnup whenever project or cards change in a chart-relevant way.
  const burnupKey = React.useMemo(() => {
    const relevant = cards.map(c => `${c.uid}:${c.endDate || ''}:${c.estimationDays || 0}:${c.startedDate || ''}:${c.createdDate}`);
    return `${project.id}|${relevant.join(',')}`;
  }, [project.id, cards]);

  React.useEffect(() => {
    if (externalSeries) { setSeries(externalSeries); setBurnupLoading(false); return; }
    setBurnupLoading(true);
    window.api.getBurnup(project.id)
      .then(setSeries)
      .catch(() => setSeries([]))
      .finally(() => setBurnupLoading(false));
  }, [burnupKey]);

  // Load custom charts when project changes
  React.useEffect(() => {
    try { setCustomCharts(JSON.parse(localStorage.getItem(`burnup.customCharts.${project.id}`) || '[]')); }
    catch { setCustomCharts([]); }
  }, [project.id]);

  React.useEffect(() => {
    localStorage.setItem(`burnup.customCharts.${project.id}`, JSON.stringify(customCharts));
  }, [customCharts, project.id]);

  const handleSaveChart = (config) => {
    if (editingChart) {
      setCustomCharts(prev => prev.map(c => c.id === config.id ? config : c));
    } else {
      setCustomCharts(prev => [...prev, config]);
    }
    setBuilderOpen(false);
    setEditingChart(null);
  };

  const handleDeleteChart = (id) => {
    setCustomCharts(prev => prev.filter(c => c.id !== id));
  };

  const filtered = cards.filter(c => c.projectId === project.id);

  const countSeries = series.map(s => ({ date: s.date, scope: s.scopeCount, done: s.doneCount }));
  const daysSeries  = series.map(s => ({ date: s.date, scope: Math.round(s.scopeDays * 10) / 10, done: Math.round(s.doneDays * 10) / 10 }));

  const latest = series[series.length - 1] || { scopeCount: 0, doneCount: 0, scopeDays: 0, doneDays: 0 };
  const pctCards = latest.scopeCount ? Math.round((latest.doneCount / latest.scopeCount) * 100) : 0;
  const pctDays  = latest.scopeDays  ? Math.round((latest.doneDays  / latest.scopeDays)  * 100) : 0;
  const remaining = latest.scopeCount - latest.doneCount;

  // Linear regression — same algorithm as the chart trendlines, so numbers are consistent.
  // Each index step = 1 calendar day (series has one point per day after gap-fill).
  function linreg(data, key) {
    const n = data.length;
    if (n < 2) return { m: 0, b: data[0] ? data[0][key] : 0 };
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    for (let i = 0; i < n; i++) {
      const y = data[i][key];
      sx += i; sy += y; sxy += i * y; sxx += i * i;
    }
    const denom = n * sxx - sx * sx;
    if (denom === 0) return { m: 0, b: sy / n };
    const m = (n * sxy - sx * sy) / denom;
    const b = (sy - m * sx) / n;
    return { m, b };
  }

  const scopeFit = linreg(countSeries, 'scope');
  const doneFit  = linreg(countSeries, 'done');
  const doneRatePerDay  = doneFit.m;   // cards/day — matches the chart done trendline
  const scopeRatePerDay = scopeFit.m;  // cards/day — matches the chart scope trendline

  const effortScopeFit = linreg(daysSeries, 'scope');
  const effortDoneFit  = linreg(daysSeries, 'done');

  // Also compute 14-day window velocity for the sub-label comparison
  const last14 = series.slice(-15);
  const doneInWindow = last14.length > 1 ? last14[last14.length - 1].doneCount - last14[0].doneCount : 0;
  const windowDays   = last14.length > 1 ? last14.length - 1 : 14;

  // Solve: current_remaining / (doneRate - scopeRate) = days to completion
  // Returns { date } | { gapWidening: true } | null (already done)
  function computeProjection(remaining, doneRate, scopeRate) {
    if (remaining <= 0) return null;
    const net = doneRate - scopeRate;
    if (net > 0.001) {
      const d = window.addDays(new Date(latest.date), Math.round(remaining / net));
      return { date: window.dateKey(d), doneRate, scopeRate, net };
    }
    return { gapWidening: true, doneRate, scopeRate };
  }

  const remainingDays = latest.scopeDays - latest.doneDays;
  const cardsProj  = computeProjection(remaining,     doneRatePerDay,   scopeRatePerDay);
  const effortProj = computeProjection(remainingDays, effortDoneFit.m,  effortScopeFit.m);

  // Combined: both must close — take the later date, or flag widening if either metric diverges
  function combinedProjection() {
    if (!cardsProj && !effortProj) return { done: true };
    const cGap = cardsProj?.gapWidening;
    const eGap = effortProj?.gapWidening;
    if (cGap && eGap) return { gapWidening: 'both' };
    if (cGap) return { gapWidening: 'cards' };
    if (eGap) return { gapWidening: 'effort' };
    const dates = [cardsProj?.date, effortProj?.date].filter(Boolean);
    if (!dates.length) return { done: true };
    return { date: dates.sort().at(-1) }; // later of the two = conservative estimate
  }
  const combined = combinedProjection();

  // Breakdown by type and scope (from local card state — always up to date)
  const byType = {}, byScope = {};
  for (const c of filtered) {
    byType[c.type]   = (byType[c.type]   || 0) + 1;
    byScope[c.scope] = (byScope[c.scope] || 0) + 1;
  }

  return (
    <div style={{ padding: '24px 28px 48px', maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24, gap: 24 }}>
        <div>
          <div style={{ fontSize: 11, color: theme.textSubtle, fontFamily: 'ui-monospace, Menlo, monospace', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {project.code} · Reporting
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>{project.name}</h1>
          <div style={{ color: theme.textMuted, fontSize: 14, marginTop: 4 }}>{project.description}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: theme.textMuted, fontFamily: 'ui-monospace, Menlo, monospace' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: theme.success, boxShadow: `0 0 0 3px color-mix(in oklch, ${theme.success} 25%, transparent)` }}></span>
          Live · updated {window.TODAY}
        </div>
      </div>

      {/* Stat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <StatCard theme={theme} label="Total cards"   value={latest.scopeCount}                        sub={`${remaining} remaining`} />
        <StatCard theme={theme} label="Completed"     value={latest.doneCount}                         sub={`${pctCards}% of scope`} accent />
        <StatCard theme={theme} label="Scope · days"  value={Math.round(latest.scopeDays)}             sub={`${Math.round(latest.doneDays)} done · ${pctDays}%`} />
        <StatCard theme={theme} label="Velocity"      value={`${doneRatePerDay.toFixed(2)}/d`}         sub={`scope +${scopeRatePerDay.toFixed(2)}/d · ${doneInWindow} done last ${windowDays}d`} />
      </div>

      {/* Charts row — horizontally scrollable */}
      <div style={{ overflowX: 'auto', marginBottom: 20, paddingBottom: 4 }}>
        <div style={{ display: 'flex', gap: 12, minWidth: 'min-content', alignItems: 'stretch' }}>
          <div style={{ flex: '0 0 min(calc(50% - 6px), 540px)', minWidth: 320 }}>
            <ChartCard
              theme={theme}
              title="Cards burnup"
              subtitle="Total scope vs. completed cards over time"
              pct={pctCards}
              loading={burnupLoading}
              chart={<window.BurnupChart data={countSeries} scopeLabel="Scope" doneLabel="Done" accent={theme.accent} muted={theme.textMuted} dark={theme.dark} style={chartStyle} height={260} />}
            />
          </div>
          <div style={{ flex: '0 0 min(calc(50% - 6px), 540px)', minWidth: 320 }}>
            <ChartCard
              theme={theme}
              title="Effort burnup · days"
              subtitle="Total estimated days vs. days delivered"
              pct={pctDays}
              loading={burnupLoading}
              chart={<window.BurnupChart data={daysSeries} scopeLabel="Total d" doneLabel="Done d" accent={theme.accent} muted={theme.textMuted} dark={theme.dark} style={chartStyle} height={260} />}
            />
          </div>
          {customCharts.map(cfg => (
            <div key={cfg.id} style={{ flex: '0 0 min(calc(50% - 6px), 540px)', minWidth: 320 }}>
              <CustomChartCard
                theme={theme}
                config={cfg}
                series={series}
                cards={filtered}
                chartStyle={chartStyle}
                loading={burnupLoading}
                onEdit={() => { setEditingChart(cfg); setBuilderOpen(true); }}
                onDelete={() => handleDeleteChart(cfg.id)}
              />
            </div>
          ))}
          <div style={{ flex: '0 0 180px', minWidth: 160 }}>
            <AddChartButton theme={theme} onClick={() => { setEditingChart(null); setBuilderOpen(true); }} />
          </div>
        </div>
      </div>

      {builderOpen && (
        <ChartBuilderModal
          theme={theme}
          initial={editingChart}
          onSave={handleSaveChart}
          onClose={() => { setBuilderOpen(false); setEditingChart(null); }}
        />
      )}

      {/* Breakdown row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <BreakdownCard theme={theme} title="By type"  items={byType}  meta={window.TYPE_META} mode="type" />
        <BreakdownCard theme={theme} title="By scope" items={byScope} mode="scope" />
        <ProjectionCard theme={theme} combined={combined} cardsProj={cardsProj} effortProj={effortProj}
          remainingCards={remaining} remainingDays={remainingDays} />
      </div>
    </div>
  );
}

function StatCard({ theme, label, value, sub, accent }) {
  return (
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, color: theme.textSubtle, fontFamily: 'ui-monospace, Menlo, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', color: accent ? theme.accent : theme.text, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function ChartCard({ theme, title, subtitle, pct, loading, chart }) {
  return (
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{title}</div>
          <div style={{ fontSize: 12, color: theme.textMuted }}>{subtitle}</div>
        </div>
        <div style={{ textAlign: 'right', fontFamily: 'ui-monospace, Menlo, monospace' }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: theme.accent, fontVariantNumeric: 'tabular-nums' }}>{loading ? '…' : `${pct}%`}</div>
          <div style={{ fontSize: 10.5, color: theme.textSubtle, textTransform: 'uppercase', letterSpacing: '0.08em' }}>complete</div>
        </div>
      </div>
      {loading
        ? <div style={{ height: 260, display: 'grid', placeItems: 'center', color: theme.textSubtle, fontSize: 12 }}>Loading…</div>
        : chart
      }
      <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: theme.textMuted, marginTop: 10, fontFamily: 'ui-monospace, Menlo, monospace', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: window.getScopeColor(theme.dark) }}></span> Total scope
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: theme.accent }}></span> Completed
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 0.7 }}>
          <span style={{ width: 14, height: 0, borderTop: `1.5px dashed ${theme.textMuted}` }}></span> Trendlines
        </span>
      </div>
    </div>
  );
}

function BreakdownCard({ theme, title, items, meta, mode }) {
  const entries = Object.entries(items).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  return (
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{title}</div>
      {entries.map(([k, v]) => {
        const pct = Math.round((v / total) * 100);
        const hue = mode === 'type'
          ? (theme.typeHues?.[k]  ?? meta[k]?.hue ?? 258)
          : (theme.scopeHues?.[k] ?? { mvp: 258, mlp: 178, other: 62 }[k] ?? 258);
        const color = `oklch(0.62 0.13 ${hue})`;
        return (
          <div key={k} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ textTransform: 'capitalize' }}>{k}</span>
              <span style={{ color: theme.textMuted, fontFamily: 'ui-monospace, Menlo, monospace' }}>{v} · {pct}%</span>
            </div>
            <div style={{ height: 6, background: theme.dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color }}></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProjectionCard({ theme, combined, cardsProj, effortProj, remainingCards, remainingDays }) {
  const t = theme;
  const mono = { fontFamily: 'ui-monospace, Menlo, monospace' };

  function ProjRow({ label, proj, remaining, unit }) {
    if (!proj) return (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: t.textMuted }}>{label}</span>
        <span style={{ color: t.success, ...mono }}>✓ done</span>
      </div>
    );
    if (proj.gapWidening) return (
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}>
          <span style={{ color: t.textMuted }}>{label}</span>
          <span style={{ color: t.danger, fontWeight: 500 }}>gap widening ↗</span>
        </div>
        <div style={{ fontSize: 11, color: t.textSubtle, ...mono, marginTop: 2 }}>
          {proj.doneRate.toFixed(2)} done/d · {proj.scopeRate.toFixed(2)} scope/d
        </div>
      </div>
    );
    return (
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 12 }}>
          <span style={{ color: t.textMuted }}>{label}</span>
          <span style={{ ...mono, color: t.text, fontWeight: 500 }}>{proj.date}</span>
        </div>
        <div style={{ fontSize: 11, color: t.textSubtle, ...mono, marginTop: 2 }}>
          {proj.net.toFixed(2)} net/d · {remaining % 1 === 0 ? remaining : remaining.toFixed(1)} {unit} left
        </div>
      </div>
    );
  }

  const headlineColor = combined.gapWidening ? t.danger : combined.done ? t.success : t.text;
  const headlineText  = combined.done ? 'Complete 🎯'
    : combined.gapWidening === 'both'   ? 'Gap widening on both metrics'
    : combined.gapWidening === 'cards'  ? 'Card count gap widening ↗'
    : combined.gapWidening === 'effort' ? 'Effort gap widening ↗'
    : combined.date;

  return (
    <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Projection</div>

      {/* Combined headline */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10.5, color: t.textSubtle, ...mono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          Est. completion
        </div>
        <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em', ...mono, color: headlineColor }}>
          {headlineText}
        </div>
        {!combined.done && !combined.gapWidening && (
          <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 3 }}>
            later of cards &amp; effort (conservative)
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${t.border}`, marginBottom: 10 }} />

      {/* Per-metric rows */}
      <ProjRow label="Cards burnup"  proj={cardsProj}  remaining={remainingCards}              unit="cards" />
      <ProjRow label="Effort burnup" proj={effortProj} remaining={Math.round(remainingDays * 10) / 10} unit="days"  />
    </div>
  );
}

function CustomChartCard({ theme, config, series, cards, chartStyle, loading, onEdit, onDelete }) {
  const data = React.useMemo(() => computeCustomSeries(config, series, cards), [config, series, cards]);
  const latest = data[data.length - 1] || { scope: 0, done: 0 };
  const pct = latest.scope ? Math.round((latest.done / latest.scope) * 100) : 0;
  const isEffort = config.metric === 'effort';
  const filterLabels = [
    ...(config.typeFilter || []).map(t => t),
    ...(config.scopeFilter || []).map(s => s.toUpperCase()),
  ];

  return (
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 18, height: '100%', boxSizing: 'border-box', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0, paddingRight: 56 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{config.title || (isEffort ? 'Effort burnup' : 'Cards burnup')}</div>
          <div style={{ fontSize: 11.5, color: theme.textMuted }}>
            {filterLabels.length > 0 ? `Filter: ${filterLabels.join(', ')}` : isEffort ? 'Effort days' : 'Card count'}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, position: 'absolute', top: 14, right: 14 }}>
          <div style={{ textAlign: 'right', fontFamily: 'ui-monospace, Menlo, monospace' }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: theme.accent, fontVariantNumeric: 'tabular-nums' }}>{loading ? '…' : `${pct}%`}</div>
          </div>
          <button onClick={onEdit} title="Edit chart" style={{ width: 26, height: 26, border: `1px solid ${theme.border}`, borderRadius: 5, background: theme.bg, color: theme.textMuted, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0, flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8.5 1.5l2 2-6 6H2.5v-2l6-6z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
          </button>
          <button onClick={onDelete} title="Remove chart" style={{ width: 26, height: 26, border: `1px solid ${theme.border}`, borderRadius: 5, background: theme.bg, color: theme.danger, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0, flexShrink: 0 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 3h8M5 3V2h2v1M4.5 5v4M7.5 5v4M3 3l.5 7h5l.5-7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>
      </div>
      {loading
        ? <div style={{ height: 260, display: 'grid', placeItems: 'center', color: theme.textSubtle, fontSize: 12 }}>Loading…</div>
        : <window.BurnupChart data={data} scopeLabel={isEffort ? 'Total d' : 'Scope'} doneLabel={isEffort ? 'Done d' : 'Done'} accent={theme.accent} muted={theme.textMuted} dark={theme.dark} style={chartStyle} height={260} />
      }
      <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: theme.textMuted, marginTop: 10, fontFamily: 'ui-monospace, Menlo, monospace', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: window.getScopeColor(theme.dark) }}></span> Scope
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 14, height: 2, background: theme.accent }}></span> Done
        </span>
      </div>
    </div>
  );
}

function AddChartButton({ theme, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', height: '100%', minHeight: 200,
      border: `2px dashed ${theme.border}`, borderRadius: 10,
      background: 'transparent', color: theme.textSubtle,
      cursor: 'pointer', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 8,
      fontFamily: 'inherit', transition: 'border-color 0.15s, color 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = theme.accent; e.currentTarget.style.color = theme.accent; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = theme.border; e.currentTarget.style.color = theme.textSubtle; }}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <span style={{ fontSize: 13, fontWeight: 500 }}>Add chart</span>
    </button>
  );
}

const CHART_TYPES  = [['feature','Feature'],['bug','Bug'],['no-code','No-code'],['tiny','Tiny']];
const CHART_SCOPES = [['mvp','MVP'],['mlp','MLP'],['other','Other']];

function ChartBuilderModal({ theme, initial, onSave, onClose }) {
  const [title,       setTitle]       = React.useState(initial?.title || '');
  const [metric,      setMetric]      = React.useState(initial?.metric || 'cards');
  const [typeFilter,  setTypeFilter]  = React.useState(initial?.typeFilter  || []);
  const [scopeFilter, setScopeFilter] = React.useState(initial?.scopeFilter || []);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleFilter = (arr, setArr, val) => {
    setArr(prev => prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]);
  };

  const handleSave = () => {
    onSave({
      id:          initial?.id || Math.random().toString(36).slice(2),
      title:       title.trim() || (metric === 'effort' ? 'Effort burnup' : 'Cards burnup'),
      metric,
      typeFilter,
      scopeFilter,
    });
  };

  const isEdit = !!initial;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
      <div style={{
        position: 'relative', zIndex: 1,
        background: theme.surface, border: `1px solid ${theme.borderStrong}`,
        borderRadius: 12, width: 400, padding: 24, color: theme.text,
        fontFamily: 'Inter, system-ui, sans-serif',
        boxShadow: theme.dark ? '0 24px 80px rgba(0,0,0,0.6)' : '0 24px 80px rgba(0,0,0,0.14)',
      }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>
          {isEdit ? 'Edit chart' : 'Add custom chart'}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, color: theme.textMuted, marginBottom: 6 }}>Title (optional)</div>
          <window.Input theme={theme} value={title} onChange={e => setTitle(e.target.value)} placeholder="Custom chart" autoFocus />
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, color: theme.textMuted, marginBottom: 8 }}>Y axis metric</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[['cards','Cards count'],['effort','Effort days']].map(([k, l]) => (
              <button key={k} onClick={() => setMetric(k)} style={{
                flex: 1, padding: '8px 12px', border: `1px solid ${metric === k ? theme.accent : theme.border}`,
                borderRadius: 7, background: metric === k ? theme.accentSoft : 'transparent',
                color: metric === k ? theme.accent : theme.textMuted, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12.5, fontWeight: metric === k ? 600 : 400,
              }}>{l}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11.5, color: theme.textMuted, marginBottom: 8 }}>Filter by card type <span style={{ opacity: 0.6 }}>(empty = all)</span></div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CHART_TYPES.map(([k, l]) => {
              const active = typeFilter.includes(k);
              return (
                <button key={k} onClick={() => toggleFilter(typeFilter, setTypeFilter, k)} style={{
                  padding: '4px 10px', border: `1px solid ${active ? theme.accent : theme.border}`,
                  borderRadius: 6, background: active ? theme.accentSoft : 'transparent',
                  color: active ? theme.accent : theme.textMuted, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: active ? 600 : 400,
                }}>{l}</button>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11.5, color: theme.textMuted, marginBottom: 8 }}>Filter by scope <span style={{ opacity: 0.6 }}>(empty = all)</span></div>
          <div style={{ display: 'flex', gap: 6 }}>
            {CHART_SCOPES.map(([k, l]) => {
              const active = scopeFilter.includes(k);
              return (
                <button key={k} onClick={() => toggleFilter(scopeFilter, setScopeFilter, k)} style={{
                  padding: '4px 10px', border: `1px solid ${active ? theme.accent : theme.border}`,
                  borderRadius: 6, background: active ? theme.accentSoft : 'transparent',
                  color: active ? theme.accent : theme.textMuted, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12, fontWeight: active ? 600 : 400,
                }}>{l}</button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <window.Button theme={theme} variant="ghost" size="sm" onClick={onClose}>Cancel</window.Button>
          <window.Button theme={theme} variant="primary" size="sm" onClick={handleSave}>
            {isEdit ? 'Save changes' : 'Add chart'}
          </window.Button>
        </div>
      </div>
    </div>
  );
}

window.Dashboard = Dashboard;
