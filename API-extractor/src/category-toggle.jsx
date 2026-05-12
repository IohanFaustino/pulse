/* global React */
// ============================================================================
// category-toggle.jsx — Expandable horizontal category picker
// ----------------------------------------------------------------------------
// Used on the Painel. Collapsed state shows just the current selection
// ("Mostrando: Inflação ›"). Click to expand a row of chips inline. Each chip
// stagger-fades in. Clicking outside closes it again.
// ============================================================================

const { useState, useRef, useEffect } = React;

function CategoryToggle({ value, onChange, options }) {
  const [open, setOpen] = useState(false);

  // Ref to the wrapper — used to detect "click outside" for auto-close.
  const ref = useRef(null);

  // Bind a document-level mousedown listener while open, to close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Find the selected option object (defensive fallback to first if missing).
  const current = options.find(o => o.id === value) || options[0];

  return (
    <div className="ct" data-open={open} ref={ref}>
      {/* Trigger — always visible. Shows current selection. */}
      <button className="ct__trigger" onClick={() => setOpen(o => !o)}>
        <span className="ct__trigger-label">Mostrando</span>
        <span className="ct__trigger-current">{current.label}</span>
        <svg className="ct__chev" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 18 6-6-6-6"/>
        </svg>
      </button>

      {/* Panel — slides out inline. Each chip uses transitionDelay to stagger. */}
      <div className="ct__panel" aria-hidden={!open}>
        {options.map((o, i) => (
          <button key={o.id}
                  className="ct__opt"
                  data-active={value === o.id}
                  style={{ transitionDelay: open ? `${i * 18}ms` : '0ms' }}
                  onClick={() => { onChange(o.id); setOpen(false); }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

window.CategoryToggle = CategoryToggle;
