/* global React */
// ============================================================================
// card.jsx — Index card + sparkline + delta-color helpers
// ----------------------------------------------------------------------------
// Defines two reusable components and two helpers exposed on `window`:
//   • Sparkline      — tiny inline SVG chart used in cards and dossier
//   • IndexCard      — the big card used on the Índices workspace grid
//   • deltaTone()    — computes a 4-way color tag for a delta value
//   • categoryLabel()— resolves a category id → pt-BR label
// ============================================================================

// ----------------------------------------------------------------------------
// Sparkline — small inline SVG line+area chart.
// `data` is an array of numbers; `tone` is 'up' | 'down' | 'neutral'.
// Sized via parent (viewBox preserveAspectRatio="none" stretches to fit).
// ----------------------------------------------------------------------------
function Sparkline({ data, tone }) {
  if (!data || !data.length) return null;

  // Fixed internal coordinate system. SVG scales itself to the parent.
  const w = 100, h = 28, pad = 1;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1; // guard against constant series

  // Map each datum to (x, y) within the box, with 1px padding.
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * (w - pad * 2) + pad;
    const y = h - ((v - min) / range) * (h - pad * 2) - pad;
    return [x, y];
  });

  // Build SVG path strings. `d` is the line; `area` closes it for the fill.
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join(' ');
  const area = d + ` L${w} ${h} L0 ${h} Z`;

  // Pick stroke + fill from tone. Colors reference CSS vars defined in styles.css.
  const stroke = tone === 'up'   ? 'var(--up)'
              : tone === 'down' ? 'var(--down)'
              :                   'var(--muted)';
  const fill = tone === 'up'   ? 'rgba(200,85,61,0.08)'
            : tone === 'down' ? 'rgba(93,127,110,0.08)'
            :                   'rgba(122,114,99,0.06)';
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={area} fill={fill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth="1"
            strokeLinejoin="round" strokeLinecap="round"
            vectorEffect="non-scaling-stroke" />
      {/* Endpoint dot — orients the eye to "latest" */}
      <circle cx={pts[pts.length-1][0]} cy={pts[pts.length-1][1]} r="1.6" fill={stroke} />
    </svg>
  );
}

// ----------------------------------------------------------------------------
// deltaTone — 4-way tone tag for a delta number.
// Returns one of: 'neutral', 'up-bad', 'down-good', 'up-good', 'down-bad'.
//   direction = 'bad'   → rising values are bad   (e.g. inflation, unemployment)
//   direction = 'good'  → rising values are good  (e.g. PIB, production)
//   direction = 'neutral' → never tinted (e.g. interest rate, FX)
// CSS reads `data-tone` to apply red/green accents.
// ----------------------------------------------------------------------------
function deltaTone(direction, delta) {
  if (direction === 'neutral' || delta === 0) return 'neutral';
  const goingUp = delta > 0;
  if (direction === 'bad')  return goingUp ? 'up-bad'  : 'down-good';
  if (direction === 'good') return goingUp ? 'up-good' : 'down-bad';
  return 'neutral';
}

// Resolve a category id → its pt-BR label. Falls back to the id itself.
function categoryLabel(cid) {
  const c = window.CATEGORIES.find(x => x.id === cid);
  return c ? c.label : cid;
}

// ----------------------------------------------------------------------------
// IndexCard — large card used on the Índices grid.
// Layout:
//   head   →  CODE  ·  category tag  ·  star (pin)
//   value  →  big current value + unit
//   delta  →  ± vs previous, with tone color
//   spark  →  small sparkline
//   foot   →  source · freshness  |  next release
// ----------------------------------------------------------------------------
function IndexCard({ idx, onOpen, pinned, onTogglePin }) {
  const tone = deltaTone(idx.direction, idx.delta);
  const sparkTone = (tone === 'up-bad' || tone === 'down-bad') ? 'up'
                   : (tone === 'down-good' || tone === 'up-good') ? 'down' : 'neutral';
  return (
    <button className="card" onClick={() => onOpen && onOpen(idx)}>
      {/* Header row — code + category + star */}
      <div className="card__head">
        <span className="card__code">{idx.code}</span>
        <span className="card__tag">{categoryLabel(idx.cat)}</span>
        {onTogglePin && (
          <span className="card__star"
                data-on={pinned ? 'true' : 'false'}
                onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
                title={pinned ? 'Desfixar' : 'Fixar'}>
            {pinned
              // Filled star icon
              ? <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.5L6 22l1.5-7.2L2 10l7.1-1.1L12 2z"/></svg>
              // Outline star icon
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.5L6 22l1.5-7.2L2 10l7.1-1.1L12 2z"/></svg>}
          </span>
        )}
      </div>

      {/* Big current value + small unit suffix */}
      <div className="card__value-row">
        <span className="card__value">{window.fmt(idx.current, idx.unit)}</span>
        <span className="card__unit">{
          idx.unit === '%' ? '%' :
          idx.unit === 'R$' ? 'R$' :
          idx.unit === 'US$ bi' ? 'US$ bi' :
          idx.unit === 'pts' ? 'pts' :
          idx.unit === 'mil' ? 'mil' : ''
        }</span>
      </div>

      {/* Delta vs previous reading */}
      <div className="card__delta" data-tone={tone}>
        {window.fmtDelta(idx.delta, idx.deltaUnit)}{' '}
        <span style={{color: 'var(--muted-2)', marginLeft: 2}}>· vs. anterior</span>
      </div>

      {/* Sparkline */}
      <div className="card__spark">
        <Sparkline data={idx.spark} tone={sparkTone} />
      </div>

      {/* Footer — source · freshness  ◇  próx. release */}
      <div className="card__foot">
        <span className="card__foot-l">
          <span className="card__source">{idx.source}</span>
          <span>· {window.fmtFreshness(idx.lastUpdate, window.TODAY)}</span>
        </span>
        <span>próx. {window.fmtDateShort(idx.nextRelease)}</span>
      </div>
    </button>
  );
}

// Expose for sibling Babel scripts.
window.IndexCard = IndexCard;
window.Sparkline = Sparkline;
window.deltaTone = deltaTone;
window.categoryLabel = categoryLabel;
