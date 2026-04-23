// Excel / CSV import wizard (4 steps: sheet → map columns → preview → done).
// Requires SheetJS (window.XLSX) loaded before this script.

const IMPORT_FIELDS = [
  { key: 'cardNumber',     label: 'Card number',    required: false, hint: 'Auto-generated if blank' },
  { key: 'title',          label: 'Title',           required: true  },
  { key: 'createdDate',    label: 'Created date',    required: true  },
  { key: 'startedDate',    label: 'Started date',    required: false },
  { key: 'endDate',        label: 'Done date',       required: false },
  { key: 'estimation',     label: 'Estimation',      required: false, hint: 'Default: 1' },
  { key: 'estimationUnit', label: 'Unit',            required: false, enumOpts: ['days', 'points'],          defaultVal: 'days'    },
  { key: 'type',           label: 'Type',            required: false, enumOpts: ['feature','bug','no-code','tiny'], defaultVal: 'feature' },
  { key: 'scope',          label: 'Scope',           required: false, enumOpts: ['mvp','mlp','other'],       defaultVal: 'mvp'     },
];

function autoDetectMapping(headers) {
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
  const [step, setStep]               = React.useState(0);
  const [workbook, setWorkbook]       = React.useState(null);
  const [sheetName, setSheetName]     = React.useState('');
  const [rows, setRows]               = React.useState([]);   // incl. header row
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
        setStep(1);
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
    setMapping(autoDetectMapping(hdrs));
  }

  const dataRows = rows.slice(1).filter(row => row.some(c => c !== ''));

  function buildParsed() {
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

  async function doImport() {
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
    setStep(4);
  }

  const canAdvanceToPreview = IMPORT_FIELDS
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

  const STEPS = ['Upload', 'Sheet', 'Map columns', 'Preview', 'Done'];

  const inputStyle = {
    padding: '6px 10px', border: `1px solid ${t.border}`, borderRadius: 6,
    background: t.surface, color: t.text, fontFamily: 'inherit', fontSize: 12.5, cursor: 'pointer',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={() => { if (!importing) onClose(); }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      <div style={{
        position: 'relative', zIndex: 1, background: t.surface, border: `1px solid ${t.borderStrong}`,
        borderRadius: 12, width: 700, maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: t.dark ? '0 24px 80px rgba(0,0,0,0.65)' : '0 24px 80px rgba(0,0,0,0.15)',
        fontFamily: 'Inter, system-ui, sans-serif', color: t.text,
      }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 14px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>Import from spreadsheet → {project.name}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {STEPS.map((label, i) => (
              <React.Fragment key={i}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 10px 3px 6px', borderRadius: 20, fontSize: 11.5, fontWeight: 500,
                  background: i === step ? t.accentSoft : 'transparent',
                  color: i === step ? t.accent : i < step ? t.textMuted : t.textSubtle,
                }}>
                  <span style={{
                    width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center',
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                    background: i < step ? t.success : i === step ? t.accent : t.border,
                    color: i <= step ? '#fff' : t.textSubtle,
                  }}>{i < step ? '✓' : i + 1}</span>
                  {label}
                </div>
                {i < STEPS.length - 1 && <div style={{ width: 20, height: 1, background: t.border, flexShrink: 0 }} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px' }}>

          {/* ── Step 0: Upload ── */}
          {step === 0 && (
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

          {/* ── Step 1: Sheet selection ── */}
          {step === 1 && workbook && (
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

          {/* ── Step 2: Column mapping ── */}
          {step === 2 && (
            <div>
              <div style={{ fontSize: 12.5, color: t.textMuted, marginBottom: 16 }}>
                Map spreadsheet columns to card fields. Columns were auto-detected where possible — adjust as needed.
              </div>
              <div style={{ border: `1px solid ${t.border}`, borderRadius: 8, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: t.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
                      {['App field', 'Spreadsheet column', 'Sample value'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: t.textMuted, borderBottom: `1px solid ${t.border}`, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {IMPORT_FIELDS.map((field, fi) => {
                      const isMapped = mapping[field.key] && mapping[field.key] !== '';
                      return (
                        <tr key={field.key} style={{ borderBottom: fi < IMPORT_FIELDS.length - 1 ? `1px solid ${t.border}` : 'none' }}>
                          <td style={{ padding: '10px 14px', verticalAlign: 'middle', minWidth: 140 }}>
                            <div style={{ fontWeight: 500, fontSize: 13 }}>{field.label}</div>
                            {field.required
                              ? <div style={{ fontSize: 10.5, color: t.danger, fontWeight: 600, marginTop: 2 }}>REQUIRED</div>
                              : field.hint
                                ? <div style={{ fontSize: 11, color: t.textSubtle, marginTop: 2 }}>{field.hint}</div>
                                : null
                            }
                          </td>
                          <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <select value={mapping[field.key] ?? ''} onChange={e => setMapping(m => ({ ...m, [field.key]: e.target.value }))} style={{ ...inputStyle, flex: 1, minWidth: 0 }}>
                                {colOpts}
                              </select>
                              {field.enumOpts && !isMapped && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                  <span style={{ fontSize: 11, color: t.textSubtle }}>default:</span>
                                  <select value={enumDefaults[field.key] ?? field.defaultVal}
                                    onChange={e => setEnumDefaults(d => ({ ...d, [field.key]: e.target.value }))}
                                    style={{ ...inputStyle, background: t.accentSoft, color: t.accent, fontWeight: 500 }}>
                                    {field.enumOpts.map(o => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', verticalAlign: 'middle', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5, color: isMapped ? t.textMuted : t.textSubtle, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {isMapped ? (sampleVal(mapping[field.key]) || '—') : ''}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Step 3: Preview ── */}
          {step === 3 && (
            <div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                <div style={{ flex: 1, padding: '14px 18px', borderRadius: 8, border: `1px solid color-mix(in oklch, ${t.success} 30%, transparent)`, background: `color-mix(in oklch, ${t.success} 10%, transparent)` }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: t.success, lineHeight: 1 }}>{validCount}</div>
                  <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>row{validCount !== 1 ? 's' : ''} ready to import</div>
                </div>
                {errorCount > 0 && (
                  <div style={{ flex: 1, padding: '14px 18px', borderRadius: 8, border: `1px solid color-mix(in oklch, ${t.danger} 30%, transparent)`, background: `color-mix(in oklch, ${t.danger} 8%, transparent)` }}>
                    <div style={{ fontSize: 28, fontWeight: 700, color: t.danger, lineHeight: 1 }}>{errorCount}</div>
                    <div style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>row{errorCount !== 1 ? 's' : ''} with errors (skipped)</div>
                  </div>
                )}
              </div>

              {validCount > 0 && (
                <div style={{ overflowX: 'auto', border: `1px solid ${t.border}`, borderRadius: 8, marginBottom: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: t.dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
                        {['#', 'Title', 'Created', 'Started', 'Done', 'Est.', 'Type', 'Scope'].map(h => (
                          <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: t.textMuted, borderBottom: `1px solid ${t.border}`, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.filter(r => r.errors.length === 0).slice(0, 10).map(({ data: d }, i) => (
                        <tr key={i}>
                          <td style={{ padding: '6px 10px', borderBottom: `1px solid ${t.border}`, fontFamily: 'ui-monospace, Menlo, monospace', color: t.textMuted }}>{d.cardNumber}</td>
                          <td style={{ padding: '6px 10px', borderBottom: `1px solid ${t.border}`, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</td>
                          <td style={{ padding: '6px 10px', borderBottom: `1px solid ${t.border}`, fontFamily: 'ui-monospace, Menlo, monospace', color: t.textMuted, whiteSpace: 'nowrap' }}>{d.createdDate}</td>
                          <td style={{ padding: '6px 10px', borderBottom: `1px solid ${t.border}`, fontFamily: 'ui-monospace, Menlo, monospace', color: t.textMuted, whiteSpace: 'nowrap' }}>{d.startedDate || '—'}</td>
                          <td style={{ padding: '6px 10px', borderBottom: `1px solid ${t.border}`, fontFamily: 'ui-monospace, Menlo, monospace', color: t.textMuted, whiteSpace: 'nowrap' }}>{d.endDate || '—'}</td>
                          <td style={{ padding: '6px 10px', borderBottom: `1px solid ${t.border}`, fontFamily: 'ui-monospace, Menlo, monospace', color: t.textMuted }}>{d.estimation}{d.estimationUnit === 'points' ? 'p' : 'd'}</td>
                          <td style={{ padding: '6px 10px', borderBottom: `1px solid ${t.border}`, color: t.textMuted }}>{d.type}</td>
                          <td style={{ padding: '6px 10px', borderBottom: `1px solid ${t.border}`, color: t.textMuted }}>{d.scope}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {validCount > 10 && (
                    <div style={{ padding: '8px 12px', fontSize: 12, color: t.textSubtle }}>… and {validCount - 10} more rows</div>
                  )}
                </div>
              )}

              {errorCount > 0 && (
                <div style={{ border: `1px solid color-mix(in oklch, ${t.danger} 25%, transparent)`, borderRadius: 8, overflow: 'hidden' }}>
                  {parsed.filter(r => r.errors.length > 0).slice(0, 5).map(({ data: d, errors }, i, arr) => (
                    <div key={i} style={{ padding: '8px 14px', borderBottom: i < arr.length - 1 ? `1px solid color-mix(in oklch, ${t.danger} 15%, transparent)` : 'none', fontSize: 12, display: 'flex', gap: 10, alignItems: 'baseline' }}>
                      <span style={{ color: t.danger, flexShrink: 0 }}>✕</span>
                      <span style={{ color: t.textMuted, flexShrink: 0 }}>{d.title || '(no title)'}</span>
                      <span style={{ color: t.danger }}>{errors.join(' · ')}</span>
                    </div>
                  ))}
                  {errorCount > 5 && <div style={{ padding: '6px 14px', fontSize: 11, color: t.textSubtle }}>… and {errorCount - 5} more</div>}
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Done ── */}
          {step === 4 && result && (
            <div style={{ textAlign: 'center', padding: '32px 0' }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>{result.failed === 0 ? '✅' : '⚠️'}</div>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
                {result.imported} card{result.imported !== 1 ? 's' : ''} imported
              </div>
              {result.failed > 0 && (
                <div style={{ fontSize: 13, color: t.danger, marginTop: 6 }}>
                  {result.failed} row{result.failed !== 1 ? 's' : ''} failed to import
                </div>
              )}
              <div style={{ fontSize: 12, color: t.textMuted, marginTop: 12 }}>
                Cards are now visible in the {project.name} card list.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 24px', borderTop: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <Button variant="ghost" size="sm" theme={t} onClick={onClose} disabled={importing}>
            {step === 4 ? 'Close' : 'Cancel'}
          </Button>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {importing && (
              <span style={{ fontSize: 12, color: t.textMuted }}>
                Importing {importProgress + 1} / {parsed.filter(r => r.errors.length === 0).length}…
              </span>
            )}
            {step > 0 && step < 4 && !importing && (
              <Button variant="default" size="sm" theme={t} onClick={() => setStep(s => s - 1)}>← Back</Button>
            )}
            {step === 1 && (
              <Button variant="primary" size="sm" theme={t} onClick={() => setStep(2)} disabled={dataRows.length === 0}>
                Map columns →
              </Button>
            )}
            {step === 2 && (
              <Button variant="primary" size="sm" theme={t}
                onClick={() => { setParsed(buildParsed()); setStep(3); }}
                disabled={!canAdvanceToPreview}>
                Preview →
              </Button>
            )}
            {step === 3 && (
              <Button variant="accent" size="sm" theme={t}
                onClick={doImport} disabled={importing || validCount === 0}>
                Import {validCount} card{validCount !== 1 ? 's' : ''}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

window.ImportModal = ImportModal;
