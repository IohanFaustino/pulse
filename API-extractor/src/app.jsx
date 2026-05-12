/* global React, ReactDOM */
// ============================================================================
// app.jsx — Root component + page router
// ----------------------------------------------------------------------------
// Wires the Sidebar (left nav) to one of four page components rendered on the
// right (Painel, Índices, Calendário, Metadados). Also hosts the TweaksPanel
// for in-page design controls (layout density right now).
// ============================================================================

// Pull React hooks out of the global React namespace (loaded via UMD <script>).
const { useState } = React;

// Tweaks helpers — exposed on `window` by tweaks-panel.jsx.
//   useTweaks(defaults) → [state, setTweak]  — persisted across reload
//   TweaksPanel         → floating draggable panel that listens to host toggle
//   TweakSection        → titled group inside the panel
//   TweakRadio          → segmented control for 2–3 options
const { useTweaks, TweaksPanel, TweakSection, TweakRadio } = window;

// Default values for tweaks. The /*EDITMODE-BEGIN*/.../*EDITMODE-END*/ markers
// let the host rewrite this JSON on disk when the user changes a tweak, so
// edits survive a reload. The block between the markers MUST be valid JSON.
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "compact"
}/*EDITMODE-END*/;

function App() {
  // `t` = current tweak values (e.g. t.density). `setTweak('density', v)`
  // updates state AND posts __edit_mode_set_keys to the host for persistence.
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Which page is open in the right pane. One of:
  //   'painel'     → dashboard with small-multiples + 14-day calendar strip
  //   'indices'    → searchable workspace grid of all indices
  //   'calendario' → full-month calendar of releases
  //   'metadados'  → dossier per index (source, freq, methodology)
  const [page, setPage] = useState('painel');

  // Global pin state. The Painel shows ONLY pinned indices (curated dashboard);
  // the Índices page lists every NON-pinned index (discovery). Both pages get
  // the same toggle handler so pinning/unpinning is a true move between pages.
  const [pinned, setPinned] = useState(() => {
    const p = {};
    window.INDICES.forEach(i => { if (i.pinned) p[i.id] = true; });
    return p;
  });
  const togglePin = (id) => setPinned(s => {
    const n = { ...s };
    if (n[id]) delete n[id]; else n[id] = true;
    return n;
  });

  // Stub: opening an index from any page eventually leads to the single-index
  // workspace. For now we just route the user to the Índices page and log.
  const handleOpenIndex = (idx) => {
    setPage('indices');
    console.log('open index', idx.code);
  };

  return (
    // `data-density` is read by CSS to adjust padding/gap (compact vs spacious).
    <div className="app" data-density={t.density}>
      {/* Left navigation — also handles the collapse/expand toggle */}
      <window.Sidebar page={page} onPage={setPage} />

      {/* Page router — conditional render based on `page` state */}
      {page === 'painel'     && <window.Painel       onOpenIndex={handleOpenIndex} pinned={pinned} onTogglePin={togglePin} />}
      {page === 'indices'    && <window.IndicesPage  onOpenIndex={handleOpenIndex} pinned={pinned} onTogglePin={togglePin} />}
      {page === 'calendario' && <window.CalendarioPage />}
      {page === 'metadados'  && <window.MetadataPage />}

      {/* Floating Tweaks panel — toggled by the host toolbar */}
      <TweaksPanel title="Tweaks" defaultPos={{ right: 24, bottom: 24 }}>
        <TweakSection title="Layout">
          <TweakRadio
            label="Densidade"
            value={t.density}
            onChange={v => setTweak('density', v)}
            options={[
              { value: 'compact',  label: 'Compacto' },
              { value: 'spacious', label: 'Espaçoso' },
            ]}
          />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

// Mount the React tree into the #root div of Painel.html.
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
