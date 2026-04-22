// Sample data + burnup math for the PM tool.
// 3 projects, ~20 cards each, deterministic generation.

const CARD_TYPES = ['feature', 'bug', 'no-code', 'tiny'];
const SCOPES = ['mvp', 'mlp', 'other'];

// Deterministic PRNG so the sample data is stable across reloads.
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function genCards(projectId, projectPrefix, count, seed, projectStart, projectEndMonths) {
  const rnd = mulberry32(seed);
  const cards = [];
  const startDate = new Date(projectStart);
  const horizonDays = projectEndMonths * 30;

  for (let i = 0; i < count; i++) {
    const type = CARD_TYPES[Math.floor(rnd() * CARD_TYPES.length)];
    const scope = rnd() < 0.6 ? 'mvp' : rnd() < 0.6 ? 'mlp' : 'other';

    // Created somewhere in the first 60% of horizon
    const createdOffset = Math.floor(rnd() * horizonDays * 0.6);
    const created = addDays(startDate, createdOffset);

    // Estimation: tiny = 0.5-1, no-code = 1-2, feature = 2-8, bug = 1-3 (days)
    let estDays;
    if (type === 'tiny') estDays = 0.5 + Math.floor(rnd() * 2) * 0.5;
    else if (type === 'no-code') estDays = 1 + Math.floor(rnd() * 2);
    else if (type === 'bug') estDays = 1 + Math.floor(rnd() * 3);
    else estDays = 2 + Math.floor(rnd() * 7);

    const estUnit = rnd() < 0.75 ? 'days' : 'points';
    const estimation = estUnit === 'points' ? Math.max(1, Math.round(estDays * 1.5)) : estDays;

    // 75% are started, 55% of those completed
    const isStarted = rnd() < 0.85;
    const startedOffset = isStarted ? createdOffset + Math.floor(rnd() * 8) : null;
    const started = isStarted ? addDays(startDate, startedOffset) : null;

    // Completion depends on time passed; older projects have more completions
    const isCompleted = isStarted && rnd() < 0.62;
    let endDate = null;
    if (isCompleted) {
      const duration = Math.max(1, Math.round(estDays + (rnd() - 0.3) * estDays));
      endDate = addDays(started, duration);
    }

    const cardNumber = i + 1;
    cards.push({
      uid: `${projectId}:${cardNumber}:${seed}`,
      cardNumber,
      projectId,
      title: generateTitle(type, rnd),
      createdDate: dateKey(created),
      startedDate: started ? dateKey(started) : null,
      endDate: endDate ? dateKey(endDate) : null,
      estimation,
      estimationUnit: estUnit,
      estimationDays: estDays, // canonical days for charts
      type,
      scope,
    });
  }

  return cards.sort((a, b) => a.createdDate.localeCompare(b.createdDate));
}

// Derive the display ID from a card + its project. Prefix always comes from project.code.
function cardDisplayId(card, project) {
  const n = Number.isFinite(card.cardNumber) ? card.cardNumber : 0;
  return `${project.code}-${String(n).padStart(3, '0')}`;
}

function projectForCard(card, projects) {
  return projects.find(p => p.id === card.projectId);
}

const FEATURE_WORDS = [
  'Auth flow', 'Dashboard', 'Settings panel', 'Onboarding', 'Notifications',
  'Search', 'Filters', 'Export', 'Import wizard', 'Webhook receiver',
  'API rate limiter', 'Billing portal', 'Team invites', 'SSO provider',
  'Dark mode', 'Keyboard shortcuts', 'Empty states', 'Bulk actions',
];
const BUG_WORDS = [
  'Date picker timezone', 'Modal focus trap', 'Pagination off-by-one',
  'Stale cache on logout', 'Race condition on save', 'Crash on empty list',
  'Incorrect sort order', 'Missing ARIA labels',
];
const NOCODE_WORDS = [
  'Copy review', 'Add help docs', 'Pricing page content', 'Terms update',
  'Blog draft', 'Email template', 'Landing hero copy',
];
const TINY_WORDS = [
  'Fix typo in footer', 'Update favicon', 'Adjust spacing', 'Rename label',
  'Remove console.log', 'Update deps', 'Tweak accent color',
];

function generateTitle(type, rnd) {
  const pools = { feature: FEATURE_WORDS, bug: BUG_WORDS, 'no-code': NOCODE_WORDS, tiny: TINY_WORDS };
  const pool = pools[type];
  return pool[Math.floor(rnd() * pool.length)];
}

const PROJECTS = [
  {
    id: 'aurora',
    name: 'Aurora',
    code: 'AUR',
    description: 'Internal analytics platform',
    color: 'oklch(0.62 0.15 258)',
    startDate: '2025-09-01',
  },
  {
    id: 'harbor',
    name: 'Harbor',
    code: 'HBR',
    description: 'Customer-facing payments API',
    color: 'oklch(0.62 0.15 178)',
    startDate: '2025-11-15',
  },
  {
    id: 'meridian',
    name: 'Meridian',
    code: 'MRD',
    description: 'Mobile companion app',
    color: 'oklch(0.68 0.14 62)',
    startDate: '2026-01-10',
  },
];

const ALL_CARDS = [
  ...genCards('aurora', 'AUR', 24, 101, '2025-09-01', 8),
  ...genCards('harbor', 'HBR', 18, 202, '2025-11-15', 6),
  ...genCards('meridian', 'MRD', 21, 303, '2026-01-10', 5),
];

// ─── Burnup math ──────────────────────────────────────────────────
// Return array of {date, scopeCount, doneCount, scopeDays, doneDays}
// sampled daily from project start to today (or last activity).
function buildBurnup(cards, projectStartDate, today = '2026-04-22') {
  if (!cards.length) return [];
  const start = new Date(projectStartDate);
  const end = new Date(today);
  const days = Math.max(1, Math.round((end - start) / 86400000));
  const series = [];
  for (let i = 0; i <= days; i++) {
    const d = addDays(start, i);
    const dk = dateKey(d);
    let scopeCount = 0;
    let doneCount = 0;
    let scopeDays = 0;
    let doneDays = 0;
    for (const c of cards) {
      if (c.createdDate <= dk) {
        scopeCount += 1;
        scopeDays += c.estimationDays;
      }
      if (c.endDate && c.endDate <= dk) {
        doneCount += 1;
        doneDays += c.estimationDays;
      }
    }
    series.push({ date: dk, scopeCount, doneCount, scopeDays, doneDays });
  }
  return series;
}

Object.assign(window, {
  SAMPLE_PROJECTS: PROJECTS,
  SAMPLE_CARDS: ALL_CARDS,
  CARD_TYPES,
  SCOPES,
  buildBurnup,
  addDays,
  dateKey,
  cardDisplayId,
  projectForCard,
});
