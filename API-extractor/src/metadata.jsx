/* global React */
// ============================================================================
// metadata.jsx — Page 4 (Dossiers)
// ----------------------------------------------------------------------------
// Two-pane layout: a filterable list of indices on the left, a "dossier"
// (description, source, frequency, methodology, snapshot) on the right.
// Source of truth: window.META (data-meta.js) joined to window.INDICES by id.
// ============================================================================

const { useState, useMemo } = React;

function MetadataPage() {
  // Search + category filter for the left nav list.
  const [query, setQuery] = useState('');
  const [activeCat, setActiveCat] = useState(null);

  // Currently selected index — IPCA is the canonical default.
  const [selectedId, setSelectedId] = useState('ipca');

  // Build the filtered nav list (left column).
  const navItems = useMemo(() => {
    let list = window.INDICES;
    if (activeCat) list = list.filter(i => i.cat === activeCat);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(i =>
      i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)
    );
    return list;
  }, [query, activeCat]);

  // Look up the selected index + its metadata (META keyed by index id).
  const selected = window.INDICES.find(i => i.id === selectedId);
  const meta = selected ? (window.META[selected.id] || {}) : {};

  return (
    <main className="main">
      <header className="greet">
        <h1 className="greet__h">Metadados.</h1>
        <p className="greet__sub">Consulte fonte, frequência, calendário de divulgação e descrição de cada índice.</p>
      </header>

      {/* Toolbar — search input + category chips */}
      <div className="meta-toolbar">
        <div className="ix-search" style={{maxWidth: 380}}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path>
          </svg>
          <input type="text" placeholder="Buscar índice…"
                 value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="meta-cats">
          <button className="meta-cat" data-active={!activeCat} onClick={() => setActiveCat(null)}>Todas</button>
          {window.CATEGORIES.map(c => (
            <button key={c.id} className="meta-cat"
                    data-active={activeCat === c.id}
                    onClick={() => setActiveCat(c.id === activeCat ? null : c.id)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main layout — left rail of indices + right pane dossier */}
      <div className="meta-layout">
        <aside className="meta-nav">
          {navItems.length === 0 && <div className="empty" style={{margin: 0}}>Nada encontrado.</div>}
          {navItems.map(i => (
            <button key={i.id}
                    className="meta-nav-item"
                    data-active={selectedId === i.id}
                    onClick={() => setSelectedId(i.id)}>
              <span className="meta-nav-item__code">{i.code}</span>
              <span className="meta-nav-item__cat">{window.categoryLabel(i.cat)}</span>
            </button>
          ))}
        </aside>

        {/* Dossier panel — fallback empty state if nothing selected */}
        {selected ? <Dossier idx={selected} meta={meta} /> : (
          <div className="meta-dossier"><div className="empty">Selecione um índice na lista.</div></div>
        )}
      </div>
    </main>
  );
}

// ----------------------------------------------------------------------------
// Dossier — right pane for the selected index.
// Renders code/name header, description paragraph, definition grid, and a
// "snapshot" block showing the latest reading with a small sparkline.
// ----------------------------------------------------------------------------
function Dossier({ idx, meta }) {
  // Expand the short source code (IBGE → "Instituto Brasileiro …").
  const sourceFull = window.SOURCE_NAMES[idx.source] || idx.source;
  return (
    <article className="meta-dossier">
      <div className="dossier__head">
        <div>
          <div className="dossier__code">{idx.code}</div>
          <div className="dossier__name">{meta.full || idx.name}</div>
        </div>
        <span className="dossier__cat-pill">{window.categoryLabel(idx.cat)}</span>
      </div>

      {/* Long-form description from META */}
      {meta.desc && <p className="dossier__desc">{meta.desc}</p>}

      {/* Definition list — primary attributes, plus optional fields */}
      <dl className="dossier__grid">
        <Field label="Fonte"      value={`${idx.source} — ${sourceFull}`} />
        <Field label="Frequência" value={idx.freq} />
        <Field label="Unidade"    value={idx.unitLabel} />
        <Field label="Primeira observação" value={meta.firstObs ? formatYM(meta.firstObs) : '—'} />
        <Field label="Última divulgação"   value={formatLongDate(idx.lastUpdate)} />
        <Field label="Próxima divulgação"  value={formatLongDate(idx.nextRelease)} accent />
        <Field label="Calendário"  value={meta.releaseRule || '—'} wide />
        {meta.methodology && <Field label="Metodologia" value={meta.methodology} wide />}
        {meta.sourceUrl && <Field label="Site oficial" value={
          <a href={`https://${meta.sourceUrl}`} target="_blank" rel="noreferrer" className="dossier__link">
            {meta.sourceUrl} ↗
          </a>
        } wide />}
      </dl>

      {/* Snapshot — current reading + sparkline */}
      <div className="dossier__snap">
        <div className="dossier__snap-l">
          <div className="dossier__snap-label">Leitura atual</div>
          <div className="dossier__snap-value">
            {window.fmt(idx.current, idx.unit)}
            <span> {idx.unit === '%' ? '%' : idx.unit === 'R$' ? 'R$' : idx.unit === 'US$ bi' ? 'US$ bi' : ''}</span>
          </div>
        </div>
        <div className="dossier__snap-r">
          <div className="dossier__snap-spark">
            <window.Sparkline data={idx.spark} tone="neutral" />
          </div>
        </div>
      </div>
    </article>
  );
}

// Small helper component for a label/value row in the definition grid.
// `wide` = span both columns; `accent` = highlight the value (e.g. "próxima divulgação").
function Field({ label, value, wide, accent }) {
  return (
    <div className={'dossier__field' + (wide ? ' is-wide' : '') + (accent ? ' is-accent' : '')}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

// "1980-01" → "jan. 1980"
function formatYM(ym) {
  const [y, m] = ym.split('-').map(Number);
  return window.PT_MONTHS[m - 1] + '. ' + y;
}

// "2026-05-08" → "8 de maio de 2026"
function formatLongDate(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.getDate() + ' de '
    + ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][d.getMonth()]
    + ' de ' + d.getFullYear();
}

window.MetadataPage = MetadataPage;
