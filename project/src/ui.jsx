// Design tokens + small shared UI primitives (Button, Input, Select, Badge, Tag)

function useTheme(dark) {
  return React.useMemo(() => {
    const accent = 'oklch(0.62 0.15 258)'; // indigo-ish
    if (dark) return {
      bg: '#0e0d0c',
      surface: '#16140f',
      surfaceElev: '#1c1915',
      border: 'rgba(255,255,255,0.08)',
      borderStrong: 'rgba(255,255,255,0.14)',
      text: '#f2ece1',
      textMuted: 'rgba(242,236,225,0.58)',
      textSubtle: 'rgba(242,236,225,0.38)',
      accent,
      accentSoft: 'color-mix(in oklch, ' + accent + ' 18%, transparent)',
      danger: 'oklch(0.68 0.18 25)',
      success: 'oklch(0.72 0.14 155)',
      dark: true,
    };
    return {
      bg: '#faf8f4',
      surface: '#ffffff',
      surfaceElev: '#ffffff',
      border: 'rgba(30,25,20,0.08)',
      borderStrong: 'rgba(30,25,20,0.16)',
      text: '#17150f',
      textMuted: 'rgba(23,21,15,0.58)',
      textSubtle: 'rgba(23,21,15,0.38)',
      accent,
      accentSoft: 'color-mix(in oklch, ' + accent + ' 14%, transparent)',
      danger: 'oklch(0.55 0.18 25)',
      success: 'oklch(0.58 0.14 155)',
      dark: false,
    };
  }, [dark]);
}

function Button({ variant = 'default', size = 'md', theme, children, style, ...rest }) {
  const sizes = {
    sm: { padding: '5px 10px', fontSize: 12, height: 28 },
    md: { padding: '7px 12px', fontSize: 13, height: 32 },
  };
  const base = {
    ...sizes[size],
    border: `1px solid ${theme.border}`,
    borderRadius: 7,
    background: theme.surface,
    color: theme.text,
    fontFamily: 'inherit',
    fontWeight: 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    transition: 'background 0.12s, border-color 0.12s, transform 0.08s',
    letterSpacing: '-0.005em',
  };
  const variants = {
    default: {},
    primary: theme.dark
      ? { background: theme.text, color: '#0e0d0c', borderColor: theme.text }
      : { background: '#17150f', color: '#faf8f4', borderColor: '#17150f' },
    accent: { background: theme.accent, color: '#fff', borderColor: theme.accent },
    ghost: { background: 'transparent', borderColor: 'transparent' },
    danger: { color: theme.danger, borderColor: theme.border },
  };
  return <button {...rest} style={{ ...base, ...variants[variant], ...style }}>{children}</button>;
}

function Input({ theme, style, ...rest }) {
  return <input {...rest} style={{
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 7,
    padding: '8px 10px',
    fontSize: 13,
    color: theme.text,
    fontFamily: 'inherit',
    width: '100%',
    outline: 'none',
    transition: 'border-color 0.12s, box-shadow 0.12s',
    ...style,
  }}
    onFocus={e => { e.target.style.borderColor = theme.accent; e.target.style.boxShadow = `0 0 0 3px ${theme.accentSoft}`; rest.onFocus?.(e); }}
    onBlur={e => { e.target.style.borderColor = theme.border; e.target.style.boxShadow = 'none'; rest.onBlur?.(e); }}
  />;
}

function Select({ theme, children, style, ...rest }) {
  const arrowColor = theme.dark ? '%23a69f91' : '%234a463e';
  return <select {...rest} style={{
    background: theme.surface,
    border: `1px solid ${theme.border}`,
    borderRadius: 7,
    padding: '8px 10px',
    fontSize: 13,
    color: theme.text,
    fontFamily: 'inherit',
    width: '100%',
    outline: 'none',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    colorScheme: theme.dark ? 'dark' : 'light',
    backgroundImage: `url("data:image/svg+xml;charset=utf-8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='${arrowColor}' stroke-width='1.5' fill='none' stroke-linecap='round'/></svg>")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    paddingRight: 28,
    cursor: 'pointer',
    ...style,
  }}>{children}</select>;
}

function Badge({ theme, tone = 'neutral', children, style }) {
  const tones = {
    neutral: { bg: theme.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', fg: theme.textMuted },
    accent: { bg: theme.accentSoft, fg: theme.accent },
    success: { bg: theme.dark ? 'rgba(120,190,150,0.12)' : 'rgba(60,140,90,0.1)', fg: theme.success },
    danger: { bg: theme.dark ? 'rgba(220,120,100,0.14)' : 'rgba(200,80,60,0.1)', fg: theme.danger },
  };
  const t = tones[tone] || tones.neutral;
  return <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 7px',
    fontSize: 11,
    fontWeight: 500,
    borderRadius: 4,
    background: t.bg,
    color: t.fg,
    fontFamily: 'ui-monospace, Menlo, monospace',
    letterSpacing: '0',
    ...style,
  }}>{children}</span>;
}

// Map card type to an icon/color
const TYPE_META = {
  feature: { label: 'Feature', hue: 258, letter: 'F' },
  bug: { label: 'Bug', hue: 25, letter: 'B' },
  'no-code': { label: 'No-code', hue: 155, letter: 'N' },
  tiny: { label: 'Tiny', hue: 62, letter: 'T' },
};

function TypeGlyph({ type, size = 16, theme }) {
  const m = TYPE_META[type] || TYPE_META.feature;
  const hue = theme?.typeHues?.[type] ?? m.hue;
  const color = `oklch(0.62 0.13 ${hue})`;
  const bg = `color-mix(in oklch, ${color} 18%, transparent)`;
  return <span style={{
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    borderRadius: 4,
    background: bg,
    color,
    fontSize: size * 0.62,
    fontWeight: 600,
    fontFamily: 'ui-monospace, Menlo, monospace',
    flexShrink: 0,
  }}>{m.letter}</span>;
}

function StatusDot({ card, theme }) {
  let color = theme.textSubtle;
  let label = 'Backlog';
  if (card.endDate) { color = theme.success; label = 'Done'; }
  else if (card.startedDate) { color = theme.accent; label = 'In progress'; }
  return { color, label };
}

Object.assign(window, { useTheme, Button, Input, Select, Badge, TypeGlyph, TYPE_META, StatusDot });
