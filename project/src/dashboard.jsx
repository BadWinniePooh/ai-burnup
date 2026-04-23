// Dashboard — reporting view with stats + two burnup charts.
// Burnup series is fetched from the backend; card breakdown is derived from the
// cards already in local state so the view stays snappy after card edits.

function Dashboard({ project, cards, theme, chartStyle = 'area' }) {
  const [series, setSeries] = React.useState([]);
  const [burnupLoading, setBurnupLoading] = React.useState(true);

  // Re-fetch burnup whenever project or cards change in a chart-relevant way.
  const burnupKey = React.useMemo(() => {
    const relevant = cards.map(c => `${c.uid}:${c.endDate || ''}:${c.estimationDays || 0}:${c.startedDate || ''}:${c.createdDate}`);
    return `${project.id}|${relevant.join(',')}`;
  }, [project.id, cards]);

  React.useEffect(() => {
    setBurnupLoading(true);
    window.api.getBurnup(project.id)
      .then(setSeries)
      .catch(() => setSeries([]))
      .finally(() => setBurnupLoading(false));
  }, [burnupKey]);

  const filtered = cards.filter(c => c.projectId === project.id);

  const countSeries = series.map(s => ({ date: s.date, scope: s.scopeCount, done: s.doneCount }));
  const daysSeries  = series.map(s => ({ date: s.date, scope: Math.round(s.scopeDays * 10) / 10, done: Math.round(s.doneDays * 10) / 10 }));

  const latest = series[series.length - 1] || { scopeCount: 0, doneCount: 0, scopeDays: 0, doneDays: 0 };
  const pctCards = latest.scopeCount ? Math.round((latest.doneCount / latest.scopeCount) * 100) : 0;
  const pctDays  = latest.scopeDays  ? Math.round((latest.doneDays  / latest.scopeDays)  * 100) : 0;
  const remaining = latest.scopeCount - latest.doneCount;

  // Velocity over last 14 days
  const last14 = series.slice(-15);
  const doneInWindow     = last14.length > 1 ? last14[last14.length - 1].doneCount - last14[0].doneCount : 0;
  const daysDoneInWindow = last14.length > 1 ? Math.round(last14[last14.length - 1].doneDays - last14[0].doneDays) : 0;

  // Projected completion via linear extrapolation from last-14d velocity
  let projection = null;
  if (doneInWindow > 0 && remaining > 0) {
    const daysToDone = Math.round((remaining / doneInWindow) * 14);
    const projDate = window.addDays(new Date(latest.date), daysToDone);
    projection = window.dateKey(projDate);
  }

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
        <StatCard theme={theme} label="Total cards"   value={latest.scopeCount}           sub={`${remaining} remaining`} />
        <StatCard theme={theme} label="Completed"     value={latest.doneCount}             sub={`${pctCards}% of scope`} accent />
        <StatCard theme={theme} label="Scope · days"  value={Math.round(latest.scopeDays)} sub={`${Math.round(latest.doneDays)} done · ${pctDays}%`} />
        <StatCard theme={theme} label="Velocity"      value={doneInWindow}                 sub={`${daysDoneInWindow}d over last 14d`} />
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <ChartCard
          theme={theme}
          title="Cards burnup"
          subtitle="Total scope vs. completed cards over time"
          pct={pctCards}
          loading={burnupLoading}
          chart={<window.BurnupChart data={countSeries} scopeLabel="Scope" doneLabel="Done" accent={theme.accent} muted={theme.textMuted} dark={theme.dark} style={chartStyle} height={260} />}
        />
        <ChartCard
          theme={theme}
          title="Effort burnup · days"
          subtitle="Total estimated days vs. days delivered"
          pct={pctDays}
          loading={burnupLoading}
          chart={<window.BurnupChart data={daysSeries} scopeLabel="Total d" doneLabel="Done d" accent={theme.accent} muted={theme.textMuted} dark={theme.dark} style={chartStyle} height={260} />}
        />
      </div>

      {/* Breakdown row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <BreakdownCard theme={theme} title="By type"  items={byType}  meta={window.TYPE_META} mode="type" />
        <BreakdownCard theme={theme} title="By scope" items={byScope} mode="scope" />
        <ProjectionCard theme={theme} projection={projection} remaining={remaining} velocity={doneInWindow} />
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
        const hue = mode === 'type' ? (meta[k]?.hue ?? 258) : ({ mvp: 258, mlp: 178, other: 62 }[k] ?? 258);
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

function ProjectionCard({ theme, projection, remaining, velocity }) {
  return (
    <div style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 10, padding: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Projection</div>
      {projection ? (
        <>
          <div style={{ fontSize: 11, color: theme.textSubtle, fontFamily: 'ui-monospace, Menlo, monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Est. completion</div>
          <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.01em', fontFamily: 'ui-monospace, Menlo, monospace', marginBottom: 10 }}>{projection}</div>
          <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.5 }}>
            At current velocity ({velocity} cards / 14d), {remaining} remaining cards will finish around this date.
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: theme.textMuted }}>
          {remaining === 0 ? 'Project complete 🎯' : 'Not enough velocity data yet.'}
        </div>
      )}
    </div>
  );
}

window.Dashboard = Dashboard;
