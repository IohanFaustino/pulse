/* global React */
// ============================================================================
// indices.jsx — Page 2 (Workspace / Index browser)
// ----------------------------------------------------------------------------
// Searchable grid of all indices. Tabs filter by category, "Fixados" tab shows
// pinned items, and the search input matches code or name. Clicking a card
// will eventually open the single-index workspace.
// ============================================================================

const { useState, useMemo } = React;

function IndicesPage({ onOpenIndex, pinned, onTogglePin }) {
  // Free-text search query (matches code OR name, case-insensitive).
  const [query, setQuery] = useState('');

  // Active tab — 'todos' | <category id>. "Fixados" lives on the Painel now.
  const [activeCat, setActiveCat] = useState('todos');

  // Source list: ONLY non-pinned indices. Pinned indices live on the Painel —
  // pinning here moves them there; unpinning on the Painel sends them back.
  const AVAILABLE = useMemo(
    () => window.INDICES.filter(i => !pinned[i.id]),
    [pinned]
  );

  // Apply both category and search filters in order.
  const filtered = useMemo(() => {
    let list = AVAILABLE;

    // Step 1 — category filter
    if (activeCat !== 'todos') {
      list = list.filter(i => i.cat === activeCat);
    }

    // Step 2 — search filter
    const q = query.trim().toLowerCase();
    if (q) list = list.filter(i =>
      i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)
    );
    return list;
  }, [activeCat, query, AVAILABLE]);

  // Tab list with counts — built from AVAILABLE so counts shrink as user pins.
  const tabs = [
    { id: 'todos', label: 'Todos', count: AVAILABLE.length },
    ...window.CATEGORIES.map(c => ({
      id: c.id, label: c.label,
      count: AVAILABLE.filter(i => i.cat === c.id).length
    }))
  ];

  return (
    <main className="main">
      {/* Page header */}
      <header className="greet">
        <h1 className="greet__h">Índices.</h1>
        <p className="greet__sub">
          Catálogo dos índices ainda não fixados. Use a estrela para adicionar ao <strong>Painel</strong>.
        </p>
      </header>

      {/* Search bar */}
      <div className="indices-toolbar">
        <div className="ix-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"></circle><path d="m21 21-4.3-4.3"></path>
          </svg>
          <input type="text" placeholder="Buscar índice por código ou nome…"
                 value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      </div>

      {/* Category tabs */}
      <nav className="tabs" role="tablist">
        {tabs.map(t => (
          <button key={t.id} className="tab"
                  data-active={activeCat === t.id}
                  onClick={() => setActiveCat(t.id)}>
            {t.label}<span className="tab__count">{t.count}</span>
          </button>
        ))}
      </nav>

      {/* Result grid OR empty-state message */}
      {filtered.length === 0 ? (
        <div className="empty">
          {AVAILABLE.length === 0
            ? 'Todos os índices estão fixados no Painel.'
            : 'Nenhum índice encontrado.'}
        </div>
      ) : (
        <div className="grid">
          {filtered.map(i => (
            <window.IndexCard key={i.id} idx={i}
              pinned={!!pinned[i.id]}
              onTogglePin={() => onTogglePin(i.id)}
              onOpen={onOpenIndex} />
          ))}
        </div>
      )}
    </main>
  );
}

window.IndicesPage = IndicesPage;
