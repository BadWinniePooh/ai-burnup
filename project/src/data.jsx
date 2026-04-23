// Client-side display utilities. Seeded data and domain calculations live in the backend.

const CARD_TYPES = ['feature', 'bug', 'no-code', 'tiny'];
const SCOPES     = ['mvp', 'mlp', 'other'];

// Today's date as yyyy-MM-dd (local time)
function _localDateStr() {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}
const TODAY = _localDateStr();

function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Derives the display ID locally — used for live preview while the user edits
// the card number before the auto-save round-trip completes.
function cardDisplayId(card, project) {
  const n = Number.isFinite(card.cardNumber) ? card.cardNumber : 0;
  return `${project.code}-${String(n).padStart(3, '0')}`;
}

function projectForCard(card, projects) {
  return projects.find(p => p.id === card.projectId);
}

// ── Working-day calculation ────────────────────────────────────────
// Meeus/Jones/Butcher algorithm — returns Date of Easter Sunday for the given year.
function _easterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(year, Math.floor((h + l - 7 * m + 114) / 31) - 1,
                        (h + l - 7 * m + 114) % 31 + 1);
}

// Returns a Set of 'yyyy-MM-dd' strings for German public holidays in the given year.
// List matches the user's Excel formula:
//   1.1, Easter-2, Easter, Easter+1, 1.5, Easter+39,
//   Easter+50, Easter+60, 3.10, 1.11, 24.12, 25.12, 26.12
function _germanHolidays(year) {
  const e   = _easterSunday(year);
  const add = n => new Date(e.getTime() + n * 86400000);
  const fix = (m, d) => new Date(year, m - 1, d);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return new Set([
    fix(1,1), add(-2), add(0), add(1),
    fix(5,1), add(39), add(50), add(60),
    fix(10,3), fix(11,1), fix(12,24), fix(12,25), fix(12,26),
  ].map(fmt));
}

const _holidayCache = {};
function _holidays(year) {
  return _holidayCache[year] || (_holidayCache[year] = _germanHolidays(year));
}

function _isWorkday(dateStr) {
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  return dow !== 0 && dow !== 6 && !_holidays(Number(dateStr.slice(0, 4))).has(dateStr);
}

// Count working days in [fromStr, toStr] — both endpoints inclusive.
// A card started and finished on the same workday counts as 1.
// Both arguments are 'yyyy-MM-dd' strings.
function countWorkdays(fromStr, toStr) {
  const from = new Date(fromStr + 'T00:00:00');
  const to   = new Date(toStr   + 'T00:00:00');
  if (to < from) return 0;
  let count = 0;
  const cur = new Date(from.getTime());
  while (cur <= to) {
    const s = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}-${String(cur.getDate()).padStart(2,'0')}`;
    if (_isWorkday(s)) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

Object.assign(window, {
  CARD_TYPES, SCOPES, TODAY,
  addDays, dateKey, cardDisplayId, projectForCard,
  countWorkdays,
});
