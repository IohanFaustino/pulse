/* global React */
// ============================================================================
// sidebar.jsx — Left navigation rail
// ----------------------------------------------------------------------------
// Houses: brand mark, 4 page-nav buttons, recents list, sync footer, and a
// circular collapse button that shrinks the rail from 240px → 68px.
// Active state is driven by the `page` prop owned by App.
// ============================================================================

const { useState } = React;

// Static list of pages. `hint` shows as a small subtitle under the label
// when the sidebar is expanded — vanishes when collapsed.
const NAV = [
  { id: 'painel',     label: 'Painel',     hint: 'visão macro' },
  { id: 'indices',    label: 'Índices',    hint: 'workspace' },
  { id: 'calendario', label: 'Calendário', hint: 'divulgações' },
  { id: 'metadados',  label: 'Metadados',  hint: 'dossiês' },
];

function Sidebar({ page, onPage }) {
  // Local state — only the sidebar itself cares whether it is collapsed.
  // CSS reads `data-collapsed="true"` on <aside> to animate width + hide labels.
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className="sidebar" data-collapsed={collapsed}>
      {/* Circular collapse toggle — chevron rotates 180° in collapsed state */}
      <button className="sidebar__toggle"
              onClick={() => setCollapsed(c => !c)}
              aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
              title={collapsed ? 'Expandir menu' : 'Recolher menu'}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="sidebar__toggle-icon">
          <path d="m15 18-6-6 6-6"/>
        </svg>
      </button>

      {/* Brand block — wordmark + small accent dot */}
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark">índices<span className="sidebar__brand-dot"></span></span>
      </div>
      <div className="sidebar__sub">workspace pessoal</div>

      {/* Primary navigation — one button per page */}
      <nav className="nav">
        {NAV.map(n => (
          <button key={n.id}
                  className="nav-item"
                  data-active={page === n.id}
                  onClick={() => onPage(n.id)}
                  title={n.label}>
            {/* Decorative leading dot — pulses to indicate active state */}
            <span className="nav-item__dot"></span>
            <span className="nav-item__label">{n.label}</span>
            <span className="nav-item__hint">{n.hint}</span>
          </button>
        ))}
      </nav>

      <div className="sidebar__divider"></div>

      {/* Recents — quick re-entry to recently consulted indices.
          Currently all route to the Índices page (single-index workspace TODO) */}
      <div className="sidebar__section">recentes</div>
      <div className="recents">
        <button className="recent-item" onClick={() => onPage('indices')} title="IPCA">
          <span className="recent-item__code">IPCA</span>
          <span className="recent-item__when">há 2 min</span>
        </button>
        <button className="recent-item" onClick={() => onPage('indices')} title="SELIC">
          <span className="recent-item__code">SELIC</span>
          <span className="recent-item__when">há 1 h</span>
        </button>
        <button className="recent-item" onClick={() => onPage('indices')} title="PTAX">
          <span className="recent-item__code">PTAX</span>
          <span className="recent-item__when">ontem</span>
        </button>
      </div>

      {/* Footer — pulsing dot to signal "alive / synced" */}
      <div className="sidebar__footer">
        <span className="sidebar__pulse"></span>
        <span className="sidebar__footer-text">sincronizado · agora</span>
      </div>
    </aside>
  );
}

// Expose on window so app.jsx can pick it up (Babel scripts don't share scope).
window.Sidebar = Sidebar;
