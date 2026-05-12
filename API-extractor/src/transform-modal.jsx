/* global React */
// ============================================================================
// transform-modal.jsx — Picker modal for card transformations
// ----------------------------------------------------------------------------
// Triggered by the small edit icon on each Painel small-multiple. Lists every
// transformation grouped (Série original / Variação / Suavização / Janelas /
// Normalização). Catalog comes from transforms.js. Esc closes the modal.
// ============================================================================

const { useState, useEffect } = React;

function TransformModal({ idx, current, onApply, onClose }) {
  // Locally-selected transform id; only persisted when "Aplicar" is clicked.
  const [selected, setSelected] = useState(current || 'raw');

  // Esc → close. Bind once on mount.
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    // Scrim — clicking the dimmed backdrop closes the modal.
    <div className="modal-scrim" onClick={onClose}>
      {/* Card body — stopPropagation so clicks inside don't bubble to the scrim */}
      <div className="modal-card" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">

        {/* Header — kicker, title (code + name), close button */}
        <header className="modal-card__head">
          <div>
            <div className="modal-card__kicker">Transformação</div>
            <h3 className="modal-card__title">
              <span className="modal-card__code">{idx.code}</span>
              <span className="modal-card__name">{idx.name}</span>
            </h3>
          </div>
          <button className="modal-card__close" onClick={onClose} aria-label="Fechar">✕</button>
        </header>

        {/* Body — lede + transformation groups */}
        <div className="modal-card__body">
          <p className="modal-card__lede">
            Escolha como o {idx.code} será apresentado. A transformação é aplicada apenas a este card.
          </p>

          {/* Iterate each group in the catalog (defined in transforms.js) */}
          {window.TRANSFORMS.map(g => (
            <section key={g.group} className="tx-group">
              <h4 className="tx-group__title">{g.group}</h4>
              <div className="tx-options">
                {g.items.map(t => (
                  <button key={t.id}
                          className="tx-opt"
                          data-active={selected === t.id}
                          onClick={() => setSelected(t.id)}>
                    {/* Custom radio dot */}
                    <span className="tx-opt__dot" aria-hidden="true">
                      {selected === t.id && <span className="tx-opt__dot-inner"/>}
                    </span>
                    <span className="tx-opt__text">
                      <span className="tx-opt__label">{t.label}</span>
                      {t.hint && <span className="tx-opt__hint">{t.hint}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Footer — Cancel or Apply (commits + closes) */}
        <footer className="modal-card__foot">
          <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn--primary" onClick={() => { onApply(selected); onClose(); }}>
            Aplicar transformação
          </button>
        </footer>
      </div>
    </div>
  );
}

window.TransformModal = TransformModal;
