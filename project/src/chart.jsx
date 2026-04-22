// BurnupChart — SVG chart with scope + done lines, area fill, trendlines, hover tooltip.
// Scope: solid, distinct color (not dashed, not the accent).
// Trendlines: dashed, linear-regression over the series.

function linreg(data, key) {
  // Returns {m, b} for y = m*x + b where x is the index 0..n-1
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

function BurnupChart({ data, scopeLabel = 'Scope', doneLabel = 'Completed', accent, muted, dark, style = 'area', height = 260 }) {
  const wrapRef = React.useRef(null);
  const [w, setW] = React.useState(600);
  const [hover, setHover] = React.useState(null);

  React.useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setW(Math.max(320, e.contentRect.width));
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  if (!data || data.length < 2) {
    return <div ref={wrapRef} style={{ height, display: 'grid', placeItems: 'center', color: muted, fontSize: 13 }}>Not enough data yet.</div>;
  }

  const pad = { t: 16, r: 18, b: 28, l: 40 };
  const h = height;
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  // Scope line color: a warm amber, distinct from the (cool) accent
  const scopeColor = dark ? 'oklch(0.78 0.14 70)' : 'oklch(0.62 0.15 60)';

  // Trendlines
  const scopeFit = linreg(data, 'scope');
  const doneFit = linreg(data, 'done');
  const scopeTrendEnd = Math.max(0, scopeFit.m * (data.length - 1) + scopeFit.b);
  const scopeTrendStart = Math.max(0, scopeFit.b);
  const doneTrendEnd = Math.max(0, doneFit.m * (data.length - 1) + doneFit.b);
  const doneTrendStart = Math.max(0, doneFit.b);

  const maxY = Math.max(
    ...data.map(d => d.scope),
    scopeTrendEnd, scopeTrendStart, doneTrendEnd, doneTrendStart
  ) || 1;
  const niceMax = Math.ceil(maxY * 1.1);

  const x = i => pad.l + (i / (data.length - 1)) * innerW;
  const y = v => pad.t + innerH - (v / niceMax) * innerH;

  const scopeLine = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(d.scope).toFixed(2)}`).join(' ');
  const doneLine = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(d.done).toFixed(2)}`).join(' ');
  const doneArea = `${doneLine} L${x(data.length - 1).toFixed(2)},${y(0).toFixed(2)} L${x(0).toFixed(2)},${y(0).toFixed(2)} Z`;

  // Y axis ticks
  const tickCount = 4;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((niceMax / tickCount) * i));
  const xTickIdx = [0, Math.floor(data.length / 3), Math.floor((2 * data.length) / 3), data.length - 1];

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const ratio = (mx - pad.l) / innerW;
    const i = Math.round(Math.max(0, Math.min(1, ratio)) * (data.length - 1));
    setHover(i);
  };

  const gridColor = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const axisColor = muted;

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <svg width={w} height={h} style={{ display: 'block', overflow: 'visible' }}
        onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <line key={i} x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={gridColor} strokeWidth="1" />
        ))}
        {ticks.map((t, i) => (
          <text key={i} x={pad.l - 8} y={y(t) + 4} fill={axisColor} fontSize="10.5" textAnchor="end" fontFamily="ui-monospace, Menlo, monospace">{t}</text>
        ))}
        {xTickIdx.map((i) => (
          <text key={i} x={x(i)} y={h - 10} fill={axisColor} fontSize="10.5" textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} fontFamily="ui-monospace, Menlo, monospace">
            {data[i].date.slice(5)}
          </text>
        ))}

        {style !== 'lines' && (
          <path d={doneArea} fill={accent} opacity="0.12" />
        )}

        {/* Trendlines (dashed, under the actual series) */}
        <line
          x1={x(0)} y1={y(scopeTrendStart)}
          x2={x(data.length - 1)} y2={y(scopeTrendEnd)}
          stroke={scopeColor} strokeWidth="1.25" strokeDasharray="5 4" opacity="0.55" />
        <line
          x1={x(0)} y1={y(doneTrendStart)}
          x2={x(data.length - 1)} y2={y(doneTrendEnd)}
          stroke={accent} strokeWidth="1.25" strokeDasharray="5 4" opacity="0.55" />

        {/* Scope line — solid, distinct color */}
        <path d={scopeLine} fill="none" stroke={scopeColor} strokeWidth="2" strokeLinejoin="round" />

        {/* Done line — solid, accent */}
        <path d={doneLine} fill="none" stroke={accent} strokeWidth="2" strokeLinejoin="round" />

        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + innerH} stroke={axisColor} strokeDasharray="3 3" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(data[hover].done)} r="4" fill={accent} stroke={dark ? '#0b0a09' : '#fff'} strokeWidth="2" />
            <circle cx={x(hover)} cy={y(data[hover].scope)} r="4" fill={scopeColor} stroke={dark ? '#0b0a09' : '#fff'} strokeWidth="2" />
          </g>
        )}
      </svg>

      {hover !== null && (
        <div style={{
          position: 'absolute',
          left: Math.min(w - 170, Math.max(4, x(hover) + 10)),
          top: 12,
          background: dark ? '#1a1816' : '#fff',
          border: `1px solid ${dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
          borderRadius: 8,
          padding: '8px 10px',
          fontSize: 11.5,
          fontFamily: 'ui-monospace, Menlo, monospace',
          boxShadow: dark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.08)',
          pointerEvents: 'none',
          minWidth: 150,
        }}>
          <div style={{ color: muted, marginBottom: 4 }}>{data[hover].date}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: scopeColor }}>
            <span>{scopeLabel}</span>
            <span>{data[hover].scope}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, color: accent }}>
            <span>{doneLabel}</span>
            <span>{data[hover].done}</span>
          </div>
          <div style={{ borderTop: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`, marginTop: 6, paddingTop: 6, color: muted, fontSize: 10.5 }}>
            Trend: {scopeFit.m >= 0 ? '+' : ''}{scopeFit.m.toFixed(2)}/d scope · {doneFit.m >= 0 ? '+' : ''}{doneFit.m.toFixed(2)}/d done
          </div>
        </div>
      )}
    </div>
  );
}

// Expose scopeColor resolver for the legend
window.BurnupChart = BurnupChart;
window.getScopeColor = (dark) => dark ? 'oklch(0.78 0.14 70)' : 'oklch(0.62 0.15 60)';
