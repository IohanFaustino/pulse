/* global React */
// ============================================================================
// calendario.jsx — Page 3 (Full-month calendar)
// ----------------------------------------------------------------------------
// A traditional 7-column calendar grid. Each cell shows release "pills" for
// that day, tagged "E" (Esperado / expected) or "R" (Realizado / released).
// Daily-frequency indices (CDI, PTAX, Ibovespa, IFIX) are excluded — too noisy.
// ============================================================================

const { useState, useMemo } = React;

function CalendarioPage() {
  // "Today" — a fixed reference date from data.js (so the demo is reproducible).
  const todayObj = new Date(window.TODAY + 'T12:00:00');

  // Which month is being viewed. Defaults to the month containing TODAY.
  const [month, setMonth] = useState(() => ({
    y: todayObj.getFullYear(),
    m: todayObj.getMonth(),
  }));

  // Optional category filter (null = show all).
  const [filterCat, setFilterCat] = useState(null);

  // First/last day of the viewed month + their ISO strings (used for queries).
  const firstOfMonth = new Date(month.y, month.m, 1);
  const lastOfMonth  = new Date(month.y, month.m + 1, 0);
  const fromIso = firstOfMonth.toISOString().slice(0,10);
  const toIso   = lastOfMonth.toISOString().slice(0,10);

  // -------- Build the 42-cell calendar grid (6 weeks max). --------
  // Start on the Sunday before/at firstOfMonth, then walk 42 days. Trailing
  // weeks that contain ZERO in-month days are trimmed so the grid is tight.
  const cells = useMemo(() => {
    const startDow = firstOfMonth.getDay();           // 0 = Sunday
    const start = new Date(firstOfMonth);
    start.setDate(firstOfMonth.getDate() - startDow); // back-step to the Sunday
    const out = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push(d);
    }
    // Trim: keep only the weeks needed to contain all days of the month.
    const lastNeededIdx = startDow + lastOfMonth.getDate() - 1;
    const weeksNeeded = Math.ceil((lastNeededIdx + 1) / 7);
    return out.slice(0, weeksNeeded * 7);
  }, [month.y, month.m]);

  // -------- Build the events map: { isoDate: [{ idx, kind }, ...] } --------
  // window.getReleases(idx, from, to) returns every release date the index has
  // in that window, tagged 'R' if past TODAY and 'E' if future.
  const eventsByDay = useMemo(() => {
    const map = {};
    const filtered = filterCat ? window.INDICES.filter(i => i.cat === filterCat) : window.INDICES;
    filtered.forEach(idx => {
      const rels = window.getReleases(idx, fromIso, toIso);
      rels.forEach(r => {
        if (!map[r.iso]) map[r.iso] = [];
        map[r.iso].push({ idx, kind: r.kind });
      });
    });
    return map;
  }, [month.y, month.m, filterCat]);

  const todayIso = window.TODAY;

  // -------- Month-navigation handlers --------
  const goPrev  = () => setMonth(m => m.m === 0 ? { y: m.y - 1, m: 11 } : { y: m.y, m: m.m - 1 });
  const goNext  = () => setMonth(m => m.m === 11 ? { y: m.y + 1, m: 0 } : { y: m.y, m: m.m + 1 });
  const goToday = () => setMonth({ y: todayObj.getFullYear(), m: todayObj.getMonth() });

  // Totals shown in the toolbar — split between Esperado and Realizado.
  const totals = useMemo(() => {
    let E = 0, R = 0;
    Object.values(eventsByDay).forEach(arr =>
      arr.forEach(e => { if (e.kind === 'E') E++; else R++; })
    );
    return { E, R };
  }, [eventsByDay]);

  return (
    <main className="main">
      <header className="greet">
        <h1 className="greet__h">Calendário.</h1>
        <p className="greet__sub">
          Divulgações ao longo do mês — <strong>E</strong> = esperado · <strong>R</strong> = realizado
        </p>
      </header>

      {/* Month nav + summary stats */}
      <div className="cal-toolbar">
        <div className="cal-month-nav">
          <button className="cal-nav-btn" onClick={goPrev} aria-label="Mês anterior">‹</button>
          <span className="cal-month-label">{window.fmtMonthYearLong(firstOfMonth)}</span>
          <button className="cal-nav-btn" onClick={goNext} aria-label="Próximo mês">›</button>
          <button className="cal-today-btn" onClick={goToday}>Hoje</button>
        </div>
        <div className="cal-stats">
          <span className="cal-stat"><span className="cal-stat__r">R</span> {totals.R} realizadas</span>
          <span className="cal-stat"><span className="cal-stat__e">E</span> {totals.E} esperadas</span>
        </div>
      </div>

      {/* Category chips — same component vocabulary as Metadados */}
      <div className="meta-cats" style={{marginTop: 14}}>
        <button className="meta-cat" data-active={!filterCat} onClick={() => setFilterCat(null)}>Todas</button>
        {window.CATEGORIES.map(c => (
          <button key={c.id} className="meta-cat"
                  data-active={filterCat === c.id}
                  onClick={() => setFilterCat(c.id === filterCat ? null : c.id)}>
            {c.label}
          </button>
        ))}
      </div>

      {/* The calendar grid */}
      <div className="cal-month">
        {/* Day-of-week header row */}
        <div className="cal-month__dow">
          {['dom','seg','ter','qua','qui','sex','sáb'].map(d => (
            <div key={d} className="cal-month__dow-cell">{d}</div>
          ))}
        </div>

        {/* Day cells — each renders up to 6 pills, then a "+N" overflow chip */}
        <div className="cal-month__grid">
          {cells.map((d, i) => {
            const iso = d.toISOString().slice(0,10);
            const inMonth = d.getMonth() === month.m;
            const isToday = iso === todayIso;
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const events = eventsByDay[iso] || [];
            return (
              <div key={i} className="cal-cell"
                   data-in-month={inMonth}
                   data-today={isToday}
                   data-weekend={isWeekend}>
                <div className="cal-cell__num">{d.getDate()}</div>
                <div className="cal-cell__events">
                  {events.slice(0, 6).map((e, j) => (
                    <span key={j} className="cal-pill" data-cat={e.idx.cat}
                          title={`${e.idx.code} — ${e.kind === 'E' ? 'Esperado' : 'Realizado'}`}>
                      <span className="cal-pill__kind" data-kind={e.kind}>{e.kind}</span>
                      <span className="cal-pill__code">{e.idx.code}</span>
                    </span>
                  ))}
                  {events.length > 6 && (
                    <span className="cal-pill cal-pill--more">+{events.length - 6}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Caveat — daily indices are intentionally excluded from this view */}
      <p className="cal-foot-note">
        Índices diários (CDI, PTAX, Ibovespa, IFIX, Euro PTAX) não aparecem neste calendário.
      </p>
    </main>
  );
}

window.CalendarioPage = CalendarioPage;
