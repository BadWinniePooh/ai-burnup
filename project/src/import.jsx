// Excel / CSV import wizard (steps: type → sheet → map columns → preview → done).
// Requires SheetJS (window.XLSX) loaded before this script.

const CARD_FIELDS = [
  { key: 'cardNumber',     label: 'Card number',    required: false, hint: 'Auto-generated if blank' },
  { key: 'title',          label: 'Title',           required: true  },
  { key: 'createdDate',    label: 'Created date',    required: true  },
  { key: 'startedDate',    label: 'Started date',    required: false },
  { key: 'endDate',        label: 'Done date',       required: false },
  { key: 'estimation',     label: 'Estimation',      required: false, hint: 'Default: 1' },
  { key: 'estimationUnit', label: 'Unit',            required: false, enumOpts: ['days', 'points'],           defaultVal: 'days'    },
  { key: 'type',           label: 'Type',            required: false, enumOpts: ['feature','bug','no-code','tiny'], defaultVal: 'feature' },
  { key: 'scope',          label: 'Scope',           required: false, enumOpts: ['mvp','mlp','other'],        defaultVal: 'mvp'     },
];

const SNAPSHOT_FIELDS = [
  { key: 'date',       label: 'Date',          required: true,  hint: 'yyyy-MM-dd' },
  { key: 'scopeCount', label: 'Scope (count)', required: false, hint: 'Integer, default 0' },
  { key: 'doneCount',  label: 'Done (count)',  required: false, hint: 'Integer, default 0' },
  { key: 'scopeDays',  label: 'Scope (days)',  required: false, hint: 'Decimal, default 0' },
  { key: 'doneDays',   label: 'Done (days)',   required: false, hint: 'Decimal, default 0' },
];

function autoDetectCardMapping(headers) {
  const lc = headers.map(h => String(h || '').toLowerCase().trim());
  const patterns = {
    cardNumber:     [/#/, /\bnumber\b/, /\bnum\b/, /card.?num/, /ticket/, /\bid\b/],
    title:          [/title/, /\bname\b/, /summary/, /subject/],
    createdDate:    [/creat/, /\bopened?\b/, /\bdate\b/],
    startedDate:    [/start/, /progress/, /\bwip\b/],
    endDate:        [/\bdone\b/, /\bend\b/, /finish/, /clos/, /complet/, /resolv/],
    estimation:     [/estim/, /points?$/, /story.?point/, /effort/, /\bsize\b/, /days?$/],
    estimationUnit: [/unit/],
    type:           [/\btype\b/, /\bkind\b/, /categor/],
    scope:          [/\bscope\b/, /prior/, /\btier\b/],
  };
  const m = {};
  for (const [field, pats] of Object.entries(patterns)) {
    for (let i = 0; i < lc.length; i++) {
      if (pats.some(p => p.test(lc[i]))) { m[field] = String(i); break; }
    }
  }
  return m;
}

function autoDetectSnapshotMapping(headers) {
  const lc = headers.map(h => String(h || '').toLowerCase().trim());
  const patterns = {
    date:       [/\bdate\b/, /\bday\b/, /\bwhen\b/],
    scopeCount: [/scope.*(count|num|cards?)/, /total.*(count|cards?)/, /count.*scope/],
    doneCount:  [/done.*(count|num|cards?)/, /complet.*(count|cards?)/, /finish.*(count|cards?)/, /count.*done/],
    scopeDays:  [/scope.*days?/, /total.*days?/, /days?.*scope/, /scope.*effort/],
    doneDays:   [/done.*days?/, /complet.*days?/, /finish.*days?/, /days?.*done/],
  };
  const m = {};
  for (const [field, pats] of Object.entries(patterns)) {
    for (let i = 0; i < lc.length; i++) {
      if (pats.some(p => p.test(lc[i]))) { m[field] = String(i); break; }
    }
  }
  return m;
}

function fmtDate(val) {
  if (!val && val !== 0) return null;
  if (val instanceof Date) {
    const y = val.getFullYear();
    const mo = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
  }
  const s = String(val).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const p = new Date(s);
  if (!isNaN(p)) return `${p.getFullYear()}-${String(p.getMonth()+1).padStart(2,'0')}-${String(p.getDate()).padStart(2,'0')}`;
  return null;
}

function ImportModal({ theme, project, existingCards, onImported, onClose }) {
  const t = theme;
  const [importType, setImportType]    = React.useState(null); // 'cards' | 'snapshots'
  const [step, setStep]               = React.useState(0);
  const [workbook, setWorkbook]       = React.useState(null);
  const [sheetName, setSheetName]     = React.useState('');
  const [rows, setRows]               = React.useState([]);
  const [headers, setHeaders]         = React.useState([]);
  const [mapping, setMapping]         = React.useState({});
  const [enumDefaults, setEnumDefaults] = React.useState({ estimationUnit: 'days', type: 'feature', scope: 'mvp' });
  const [parsed, setParsed]           = React.useState([]);
  const [importing, setImporting]     = React.useState(false);
  const [importProgress, setImportProgress] = React.useState(0);
  const [result, setResult]           = React.useState(null);
  const [dragOver, setDragOver]       = React.useState(false);
  const fileRef = React.useRef(null);

  React.useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !importing) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [importing]);

  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: true });
        setWorkbook(wb);
        const first = wb.SheetNames[0];
        setSheetName(first);
        applySheet(wb, first);
        setStep(2);
      } catch (err) {
        alert('Could not parse file: ' + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function applySheet(wb, name) {
    const sheet = wb.Sheets[name];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', cellDates: true });
    const nonempty = data.filter(row => row.some(c => c !== ''));
    setRows(nonempty);
    const hdrs = (nonempty[0] || []).map(h => String(h));
    setHeaders(hdrs);
    setMapping(importType === 'snapshots' ? autoDetectSnapshotMapping(hdrs) : autoDetectCardMapping(hdrs));
  }

  // Re-run auto-detect when importType changes and headers are available
  React.useEffect(() => {
    if (headers.length > 0) {
      setMapping(importType === 'snapshots' ? autoDetectSnapshotMapping(headers) : autoDetectCardMapping(headers));
    }
  }, [importType]);

  const dataRows = rows.slice(1).filter(row => row.some(c => c !== ''));

  function buildParsedCards() {
    const usedNums = new Set(existingCards.map(c => c.cardNumber));
    let nextNum = (existingCards.length > 0 ? Math.max(...existingCards.map(c => c.cardNumber)) : 0) + 1;

    return dataRows.map(row => {
      const get = key => {
        const col = mapping[key];
        return (col !== undefined && col !== '') ? row[parseInt(col)] : undefined;
      };
      const errors = [];

      const title = String(get('title') ?? '').trim();
      if (!title) errors.push('Title is required');

      const createdDate = fmtDate(get('createdDate'));
      if (!createdDate) errors.push('Created date missing or invalid');

      let cardNumber;
      const rawNum = get('cardNumber');
      if (rawNum !== undefined && String(rawNum).trim() !== '') {
        cardNumber = parseInt(rawNum);
        if (isNaN(cardNumber)) errors.push('Card number must be a number');
        else if (usedNums.has(cardNumber)) errors.push(`#${cardNumber} already exists`);
        else usedNums.add(cardNumber);
      } else {
        while (usedNums.has(nextNum)) nextNum++;
        cardNumber = nextNum++;
        usedNums.add(cardNumber);
      }

      const startedDate = fmtDate(get('startedDate')) || null;
      const endDate     = fmtDate(get('endDate'))     || null;

      let estimation = parseFloat(String(get('estimation') ?? '').replace(',', '.'));
      if (isNaN(estimation) || estimation <= 0) estimation = 1;

      const rawUnit  = String(get('estimationUnit') ?? enumDefaults.estimationUnit).toLowerCase().trim();
      const rawType  = String(get('type')           ?? enumDefaults.type).toLowerCase().trim();
      const rawScope = String(get('scope')          ?? enumDefaults.scope).toLowerCase().trim();

      const estimationUnit = ['days','points'].includes(rawUnit)                  ? rawUnit  : enumDefaults.estimationUnit;
      const type           = ['feature','bug','no-code','tiny'].includes(rawType) ? rawType  : enumDefaults.type;
      const scope          = ['mvp','mlp','other'].includes(rawScope)             ? rawScope : enumDefaults.scope;

      return { errors, data: { cardNumber, title, createdDate, startedDate, endDate, estimation, estimationUnit, type, scope } };
    });
  }

  function buildParsedSnapshots() {
    return dataRows.map(row => {
      const get = key => {
        const col = mapping[key];
        return (col !== undefined && col !== '') ? row[parseInt(col)] : undefined;
      };
      const errors = [];

      const date = fmtDate(get('date'));
      if (!date) errors.push('Date is missing or invalid');

      const scopeCount = Math.max(0, parseInt(String(get('scopeCount') ?? '0').replace(',', '.')) || 0);
      const doneCount  = Math.max(0, parseInt(String(get('doneCount')  ?? '0').replace(',', '.')) || 0);
      const scopeDays  = Math.max(0, parseFloat(String(get('scopeDays') ?? '0').replace(',', '.')) || 0);
      const doneDays   = Math.max(0, parseFloat(String(get('doneDays')  ?? '0').replace(',', '.')) || 0);

      return { errors, data: { date, scopeCount, doneCount, scopeDays: Math.round(scopeDays * 10) / 10, doneDays: Math.round(doneDays * 10) / 10 } };
    });
  }

  async function doImportCards() {
    const valid = parsed.filter(r => r.errors.length === 0);
    setImporting(true);
    let imported = 0, failed = 0;
    for (let i = 0; i < valid.length; i++) {
      setImportProgress(i);
      try {
        const created = await window.api.createCard({ ...valid[i].data, projectId: project.id });
        onImported(created);
        imported++;
      } catch {
        failed++;
      }
    }
    setResult({ imported, failed });
    setImporting(false);
    setStep(5);
  }

  async function doImportSnapshots() {
    const valid = parsed.filter(r => r.errors.length === 0);
    setImporting(true);
    try {
      const res = await window.api.importSnapshots(project.id, valid.map(r => r.data));
      setResult({ imported: res.imported, failed: valid.length - res.imported });
    } catch {
      setResult({ imported: 0, failed: valid.length });
    }
    setImporting(false);
    setStep(5);
  }

  const activeFields = importType === 'snapshots' ? SNAPSHOT_FIELDS : CARD_FIELDS;

  const canAdvanceToPreview = activeFields
    .filter(f => f.required)
    .every(f => mapping[f.key] && mapping[f.key] !== '');

  const validCount = parsed.filter(r => r.errors.length === 0).length;
  const errorCount = parsed.filter(r => r.errors.length > 0).length;

  const sampleVal = colIdx => {
    const i = parseInt(colIdx);
    if (isNaN(i)) return '';
    const row = rows[1];
    if (!row) return '';
    const v = row[i];
    if (v instanceof Date) return fmtDate(v);
    return String(v ?? '').slice(0, 48);
  };

  const colOpts = (
    <>
      <option value="">— not mapped —</option>
      {headers.map((h, i) => <option key={i} value={String(i)}>{h || `Column ${i + 1}`}</option>)}
    </>
  );

  // Steps: 0=Type, 1=Upload, 2=Sheet, 3=Map, 4=Preview, 5=Done
  const STEPS = ['Type', 'Upload', 'Sheet', 'Map columns', 'Preview', 'Done'];

  const inputStyle = {
    padding: '6px 10px', border: `1px solid ${t.border}`, borderRadius: 6,
    background: t.surface, color: t.text, fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer',
  };

  const typeCardStyle = (active) => ({
    flex: 1, padding: '20px 18px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
    border: `2px solid ${active ? t.accent : t.border}`,
    background: active ? t.accentSoft : 'transparent',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={() => { if (!importing) onClose(); }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      <div style={{
        position: 'relative', zIndex: 1, background: t.surface, border: `1px solid ${t.borderStrong}`,
        borderRadius: 12, width: 'min(700px, 96vw)', maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        boxShadow: t.dark ? '0 24px 80px rgba(0,0,0,0.65)' : '0 24px 80px rgba(0,0,0,0.15)',
        fontFamily: 'Inter, system-ui, sans-serif', color: t.text,
      }}>

        {/* Header */}
        <div style={{ padding: '18px 22px 12px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Import from spreadsheet → {project.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto' }}>
            {STEPS.map((label, i) => (
              <React.Fragment key={i}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                  padding: '3px 8px 3px 5px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                  background: i === step ? t.accentSoft : 'transparent',
                  color: i === step ? t.accent : i < step ? t.textMuted : t.textSubtle,
                  whiteSpace: 'nowrap',
                }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: '50%', display: 'grid', placeItems: 'center',
                    fontSize: 9, fontWeight: 700, flexShrink: 0,
                    background: i < step ? t.success : i === step ? t.accent : t.border,
                    color: i <= step ? '#fff' : t.textSubtle,
                  }}>{i < step ? '✓' : i + 1}</span>
                  {label}
                </div>
                {i < STEPS.length - 1 && <div style={{ width: 14, height: 1, background: t.border, flexShrink: 0 }} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>

          {/* ── Step 0: Type selection ── */}
          {step === 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14 }}>What do you want to import?</div>
              <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
                <div style={typeCardStyle(importType === 'cards')} onClick={() => setImportType('cards')}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>🃏</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Cards</div>
                  <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.4 }}>
                    Import work items — title, dates, estimation, type and scope.
                  </div>
                </div>
                <div style={typeCardStyle(importType === 'snapshots')} onClick={() => setImportType('snapshots')}>
                  <div style={{ fontSize: 28, marginBottom: 10 }}>📈</div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>Snapshots</div>
                  <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.4 }}>
                    Import historical burnup data — daily scope and done counts/days.
                  </div>
                </div>
              </div>
              {importType && (
                <div style={{ marginTop: 6, fontSize: 12, color: t.textMuted, textAlign: 'center' }}>
                  {importType === 'snapshots'
                    ? 'Existing snapshots for the same dates will be overwritten.'
                    : 'Cards with duplicate numbers will be flagged before import.'}
                </div>
              )}
            </div>
          )}

          {/* ── Step 1: Upload ── */}
          {step === 1 && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); loadFile(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current.click()}
              style={{
                border: `2px dashed ${dragOver ? t.accent : t.border}`, borderRadius: 10,
                padding: '52px 48px', textAlign: 'center', cursor: 'pointer',
                background: dragOver ? t.accentSoft : 'transparent', transition: 'all 0.15s',
              }}
            >
              <div style={{ fontSize: 36, marginBottom: 14 }}>📊</div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Drop your spreadsheet here</div>
              <div style={{ fontSize: 13, color: t.textMuted, marginBottom: 18 }}>or click to browse files</div>
              <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: t.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', fontSize: 11.5, color: t.textSubtle, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                .xlsx · .xls · .csv
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                onChange={e => loadFile(e.target.files[0])} />
            </div>
          )}

          {/* ── Step 2: Sheet selection ── */}
          {step === 2 && workbook && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div>
                  <div style={{ fontSize: 11.5, color: t.textMuted, marginBottom: 5 }}>Select sheet</div>
                  <select value={sheetName} onChange={e => { setSheetName(e.target.value); applySheet(workbook, e.target.value); }} style={inputStyle}>
                    {workbook.SheetNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <div style={{ paddingTop: 18, fontSize: 12, color: t.textMuted }}>
                  {dataRows.length} data row{dataRows.length !== 1 ? 's' : ''} · {headers.length} column{headers.length !== 1 ? 's' : ''}
                </div>
              </div>

              <div style={{ overflowX: 'auto', border: `1px solid ${t.border}`, borderRadius: 8 }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace', minWidth: '100%' }}>
                  <thead>
                    <tr>
                      {headers.map((h, i) => (
                        <td key={i} style={{ padding: '7px 12px', background: t.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', borderBottom: `1px solid ${t.border}`, fontWeight: 600, whiteSpace: 'nowrap', color: t.textMuted }}>
                          {h || `Col ${i+1}`}
                        </td>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(1, 6).map((row, ri) => (
                      <tr key={ri}>
                        {headers.map((_, ci) => {
                          const v = row[ci];
                          return (
                            <td key={ci} style={{ padding: '5px 12px', borderBottom: `1px solid ${t.border}`, color: t.text, whiteSpace: 'nowrap', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {v instanceof Date ? fmtDate(v) : String(v ?? '')}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Step 3: Column mapping ── */}
          {step === 3 && (
            <div style={{ display: 'grid', gap: 14 }}>
              {activeFields.map(field => (
                <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 12, alignItems: 'start' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 2 }}>
                      {field.label}
                      {field.required && <span style={{ color: t.danger, marginLeft: 3 }}>*</span>}
                    </div>
                    {field.hint && <div style={{ fontSize: 11, color: t.textSubtle }}>{field.hint}</div>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <select
                      value={mapping[field.key] ?? ''}
                      onChange={e => setMapping(m => ({ ...m, [field.key]: e.target.value }))}
                      style={{ ...inputStyle, width: '100%' }}
                    >
                      {colOpts}
                    </select>
                    {mapping[field.key] && mapping[field.key] !== '' && (
                      <div style={{ fontSize: 11, color: t.textMuted, fontFamily: 'ui-monospace, Menlo, monospace', paddingLeft: 2 }}>
                        Sample: {sampleVal(mapping[field.key]) || <em style={{ color: t.textSubtle }}>empty</em>}
                      </div>
                    )}
                    {field.enumOpts && (!mapping[field.key] || mapping[field.key] === '') && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 }}>
                        <span style={{ color: t.textSubtle }}>Default:</span>
                        <select
                          value={enumDefaults[field.key] ?? field.defaultVal}
                          onChange={e => setEnumDefaults(d => ({ ...d, [field.key]: e.target.value }))}
                          style={{ ...inputStyle, fontSize: 11.5, padding: '3px 8px' }}
                        >
                          {field.enumOpts.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ── Step 4: Preview ── */}
          {step === 4 && (
            <div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 13 }}>
                <span style={{ color: t.success, fontWeight: 500 }}>✓ {validCount} ready</span>
                {errorCount > 0 && <span style={{ color: t.danger, fontWeight: 500 }}>✗ {errorCount} with errors</span>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
                {parsed.map((row, i) => (
                  <div key={i} style={{
                    padding: '9px 12px', borderRadius: 7, fontSize: 12,
                    border: `1px solid ${row.errors.length ? t.danger : t.border}`,
                    background: row.errors.length
                      ? (t.dark ? 'rgba(220,60,40,0.06)' : 'rgba(220,60,40,0.04)')
                      : (t.dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'),
                  }}>
                    {importType === 'snapshots' ? (
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 500, fontFamily: 'ui-monospace, Menlo, monospace' }}>{row.data.date || '—'}</span>
                        <span style={{ color: t.textMuted }}>scope: {row.data.scopeCount} cards / {row.data.scopeDays}d</span>
                        <span style={{ color: t.textMuted }}>done: {row.data.doneCount} cards / {row.data.doneDays}d</span>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'ui-monospace, Menlo, monospace', color: t.textMuted }}>#{row.data.cardNumber}</span>
                        <span style={{ fontWeight: 500 }}>{row.data.title}</span>
                        <span style={{ color: t.textMuted }}>{row.data.createdDate}</span>
                        <span style={{ color: t.textMuted }}>{row.data.estimation}{row.data.estimationUnit === 'days' ? 'd' : 'p'}</span>
                      </div>
                    )}
                    {row.errors.length > 0 && (
                      <div style={{ marginTop: 4, color: t.danger, fontSize: 11 }}>
                        {row.errors.join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 5: Done ── */}
          {step === 5 && result && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>{result.failed === 0 ? '✅' : '⚠️'}</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                {result.imported} {importType === 'snapshots' ? 'snapshot' : 'card'}{result.imported !== 1 ? 's' : ''} imported
              </div>
              {result.failed > 0 && (
                <div style={{ fontSize: 13, color: t.danger }}>{result.failed} failed</div>
              )}
              {importType === 'snapshots' && result.imported > 0 && (
                <div style={{ marginTop: 10, fontSize: 12, color: t.textMuted }}>
                  Switch to the Dashboard tab to see the updated burnup charts.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 22px 16px', borderTop: `1px solid ${t.border}`, flexShrink: 0,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
        }}>
          <window.Button theme={t} variant="ghost" size="sm" onClick={() => { if (!importing) onClose(); }} disabled={importing}>
            {step === 5 ? 'Close' : 'Cancel'}
          </window.Button>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {importing && (
              <span style={{ fontSize: 12, color: t.textMuted, fontFamily: 'ui-monospace, Menlo, monospace' }}>
                Importing {importProgress + 1} / {parsed.filter(r => r.errors.length === 0).length}…
              </span>
            )}
            {step > 0 && step < 5 && !importing && (
              <window.Button variant="default" size="sm" theme={t} onClick={() => setStep(s => s - 1)}>← Back</window.Button>
            )}
            {step === 0 && (
              <window.Button variant="primary" size="sm" theme={t}
                onClick={() => setStep(1)} disabled={!importType}>
                Next →
              </window.Button>
            )}
            {step === 1 && (
              <window.Button variant="default" size="sm" theme={t} onClick={() => fileRef.current?.click()}>
                Browse files…
              </window.Button>
            )}
            {step === 2 && (
              <window.Button variant="primary" size="sm" theme={t}
                onClick={() => setStep(3)} disabled={dataRows.length === 0}>
                Map columns →
              </window.Button>
            )}
            {step === 3 && (
              <window.Button variant="primary" size="sm" theme={t}
                onClick={() => {
                  setParsed(importType === 'snapshots' ? buildParsedSnapshots() : buildParsedCards());
                  setStep(4);
                }}
                disabled={!canAdvanceToPreview}>
                Preview →
              </window.Button>
            )}
            {step === 4 && (
              <window.Button variant="accent" size="sm" theme={t}
                onClick={importType === 'snapshots' ? doImportSnapshots : doImportCards}
                disabled={importing || validCount === 0}>
                Import {validCount} {importType === 'snapshots' ? 'snapshot' : 'card'}{validCount !== 1 ? 's' : ''}
              </window.Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

window.ImportModal = ImportModal;
