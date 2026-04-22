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

Object.assign(window, {
  CARD_TYPES, SCOPES, TODAY,
  addDays, dateKey, cardDisplayId, projectForCard,
});
