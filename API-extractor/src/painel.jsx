/* global React */
// ============================================================================
// painel.jsx — Page 1 (Dashboard)
// ----------------------------------------------------------------------------
// Layout:
//   • Greeting (Bom dia, data, contagens)
//   • Category toggle (Todos / Inflação / Atividade / …)
//   • Small-multiples grid — one mini card per index, grouped by category
//   • 14-day calendar strip of upcoming releases
//   • Transform modal (when user clicks a card's edit icon)
// ============================================================================

const { useMemo, useState } = React;

// ----------------------------------------------------------------------------
// SmallMultiple — single card in the dashboard grid.
// Shows: code, source, sparkline, current value, delta, optional transform tag.
// Two click targets: edit icon (top-right) → transform modal; main body → open.
// ----------------------------------------------------------------------------
function SmallMultiple({ idx, transform, onOpen, onEdit, onUnpin }) {
  // Compute color tone for the delta number (e.g. red if inflation rises).
  const tone = window.deltaTone(idx.direction, idx.delta);

  // Sparkline tone is simpler: only up/down/neutral — we collapse the 4 delta
  // tones (up-bad, up-good, down-bad, down-good) into two stroke colors.
  const sparkTone = (tone === 'up-bad' || tone === 'down-bad') ? 'up'
                   : (tone === 'down-good' || tone === 'up-good') ? 'down' : 'neutral';

  // Has the user applied a transformation? Empty/'raw' = original series.
  const hasTransform = transform && transform !== 'raw';

  return (
    <div className="sm" data-edited={hasTransform}>
      {/* Unpin icon — removes the card from the dashboard (sends it back to Índices) */}
      {onUnpin && (
        <button className="sm__unpin"
                onClick={(e) => { e.stopPropagation(); onUnpin(idx.id); }}
                aria-label={`Desfixar ${idx.code}`}
                title="Desfixar do Painel">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.5L6 22l1.5-7.2L2 10l7.1-1.1L12 2z"/>
          </svg>
        </button>
      )}
      {/* Edit icon — stopPropagation so it doesn't trigger the main onOpen */}
      <button className="sm__edit"
              onClick={(e) => { e.stopPropagation(); onEdit && onEdit(idx); }}
              aria-label={`Modificar ${idx.code}`}
              title="Modificar este card">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h4l3-9 4 18 3-9h4"/>
        </svg>
      </button>

      {/* Main click target — opens single-index workspace */}
      <button className="sm__main" onClick={() => onOpen && onOpen(idx)}>
        <div className="sm__head">
          <span className="sm__code">{idx.code}</span>
          <span className="sm__src">{idx.source}</span>
        </div>
        <div className="sm__chart">
          <window.Sparkline data={idx.spark} tone={sparkTone} />
        </div>
        <div className="sm__foot">
          <span className="sm__val">{window.fmt(idx.current, idx.unit)}</span>
          <span className="sm__delta" data-tone={tone}>
            {window.fmtDelta(idx.delta, idx.deltaUnit)}
          </span>
        </div>
        {/* Transform tag — only shown when a non-raw transformation is active */}
        {hasTransform && (
          <div className="sm__tx-badge">{window.transformLabel(transform)}</div>
        )}
      </button>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Painel — page-level component.
// ----------------------------------------------------------------------------
function Painel({ onOpenIndex, pinned, onTogglePin }) {
  // Restrict the dashboard to indices the user has pinned.
  const PINNED_INDICES = window.INDICES.filter(i => pinned[i.id]);
  // Active category filter from the toggle. 'todos' = show everything grouped.
  const [activeCat, setActiveCat] = useState('todos');

  // Per-card transformation map: { [idxId]: 'mom' | 'yoy' | ... }.
  // Lives at this level so it persists across category switches.
  const [transforms, setTransforms] = useState({});

  // Which index is currently open in the transform modal (null = closed).
  const [editing, setEditing] = useState(null);

  // -------- Greeting strip (top of page) --------
  const today = new Date(window.TODAY + 'T12:00:00');
  const greeting = (() => {
    const h = today.getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  })();
  const dateStr = `${window.PT_DAYS[today.getDay()]}, ${today.getDate()} de ${window.PT_MONTHS[today.getMonth()]}`;

  // Counts are over the pinned set only — the dashboard is a curated view.
  const todaysReleases = PINNED_INDICES.filter(i =>
    i.lastUpdate === window.TODAY || i.nextRelease === window.TODAY
  ).length;

  const upcomingWeek = PINNED_INDICES.filter(i => {
    const d = window.daysAgo(i.nextRelease, window.TODAY);
    return d <= 0 && d >= -7;
  }).length;

  // -------- Category toggle options --------
  // Prepend 'Todos' to the categories defined in data.js.
  const toggleOptions = [
    { id: 'todos', label: 'Todos' },
    ...window.CATEGORIES.map(c => ({ id: c.id, label: c.label }))
  ];

  // List of indices to render when a single category is selected.
  // Always scoped to PINNED_INDICES — the dashboard never shows anything else.
  const visible = useMemo(() => {
    if (activeCat === 'todos') return PINNED_INDICES;
    return PINNED_INDICES.filter(i => i.cat === activeCat);
  }, [activeCat, pinned]);

  // When 'todos' is active, group by category for section headers.
  // Returns null when a single category is active (we use `visible` instead).
  const grouped = useMemo(() => {
    if (activeCat !== 'todos') return null;
    return window.CATEGORIES.map(c => ({
      ...c,
      items: PINNED_INDICES.filter(i => i.cat === c.id),
    })).filter(g => g.items.length);
  }, [activeCat, pinned]);

  // Set or clear a transformation for one card. Passing 'raw' removes the entry.
  const applyTransform = (id, tx) => {
    setTransforms(prev => {
      const next = { ...prev };
      if (!tx || tx === 'raw') delete next[id]; else next[id] = tx;
      return next;
    });
  };

  return (
    <main className="main">
      {/* Greeting + status line */}
      <header className="greet">
        <h1 className="greet__h">{greeting}. <em>Hoje é {dateStr}.</em></h1>
        <p className="greet__sub">
          {todaysReleases} índice{todaysReleases !== 1 ? 's' : ''} com divulgação hoje · <strong>{upcomingWeek}</strong> esta semana · <strong>{PINNED_INDICES.length}</strong> {PINNED_INDICES.length === 1 ? 'índice fixado' : 'índices fixados'}
        </p>
      </header>

      {/* Category toggle (collapses to a chevron when not open) */}
      <div className="painel-controls">
        <window.CategoryToggle
          value={activeCat}
          onChange={setActiveCat}
          options={toggleOptions} />
      </div>

      {/* Empty state — no pinned indices at all */}
      {PINNED_INDICES.length === 0 ? (
        <div className="empty empty--pin">
          Nenhum índice fixado. Vá para <strong>Índices</strong> e fixe os que quiser acompanhar no Painel.
        </div>
      ) : grouped ? (
        grouped.map(g => (
          <section key={g.id} className="sm-section">
            <h3 className="sm-section__title">
              {g.label}<span className="sm-section__hint">{g.hint}</span>
            </h3>
            <div className="sm-grid">
              {g.items.map(i => (
                <SmallMultiple key={i.id} idx={i}
                               transform={transforms[i.id]}
                               onOpen={onOpenIndex}
                               onEdit={setEditing}
                               onUnpin={onTogglePin} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div className="sm-grid sm-grid--solo">
          {visible.map(i => (
            <SmallMultiple key={i.id} idx={i}
                           transform={transforms[i.id]}
                           onOpen={onOpenIndex}
                           onEdit={setEditing}
                           onUnpin={onTogglePin} />
          ))}
        </div>
      )}

      {/* 14-day calendar strip below the grid */}
      <div className="section-title">
        <h2>Calendário de divulgações</h2>
        <span className="section-title__sub">próximos 14 dias</span>
      </div>
      <window.CalendarStrip indices={PINNED_INDICES.length ? PINNED_INDICES : window.INDICES} />

      {/* Transform picker modal — rendered only when an index is being edited */}
      {editing && (
        <window.TransformModal
          idx={editing}
          current={transforms[editing.id] || 'raw'}
          onApply={(tx) => applyTransform(editing.id, tx)}
          onClose={() => setEditing(null)} />
      )}
    </main>
  );
}

window.Painel = Painel;
