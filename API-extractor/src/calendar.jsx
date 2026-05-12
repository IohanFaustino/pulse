/* global React */
// ============================================================================
// calendar.jsx — 14-day calendar strip (Painel only)
// ----------------------------------------------------------------------------
// Compact horizontal strip used on the Dashboard. Distinct from the full-month
// calendar page (calendario.jsx) — this is a 14-cell sliding window starting
// at TODAY, showing only the `nextRelease` of each index (no history).
// ============================================================================

const { useMemo } = React;

// Build an array of 14 day-objects starting at `todayIso`.
function buildDays(todayIso) {
  const t = new Date(todayIso + 'T12:00:00');
  const out = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(t);
    d.setDate(t.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    out.push({ iso, d, dow: d.getDay(), date: d.getDate() });
  }
  return out;
}

function CalendarStrip({ indices }) {
  // 14 days starting today — memoised; recomputed only if TODAY changes.
  const days = useMemo(() => buildDays(window.TODAY), []);

  // Group indices by their `nextRelease` ISO date for O(1) lookup per cell.
  const events = useMemo(() => {
    const map = {};
    indices.forEach(i => {
      if (!map[i.nextRelease]) map[i.nextRelease] = [];
      map[i.nextRelease].push(i);
    });
    return map;
  }, [indices]);

  return (
    <div className="calendar">
      <div className="calendar__grid">
        {days.map((d, idx) => {
          const isWeekend = d.dow === 0 || d.dow === 6;
          const isToday = idx === 0;                   // first cell = today
          const evts = events[d.iso] || [];
          return (
            <div key={d.iso}
                 className="cal-day"
                 data-today={isToday}
                 data-weekend={isWeekend}>
              <div className="cal-day__dow">{window.PT_DAYS[d.dow]}</div>
              <div className="cal-day__num">{d.date}</div>
              <div className="cal-day__events">
                {/* Show up to 3 release chips, then an overflow chip */}
                {evts.slice(0, 3).map(e => (
                  <span key={e.id} className="cal-event" data-cat={e.cat} title={e.name}>
                    {e.code}
                  </span>
                ))}
                {evts.length > 3 && (
                  <span className="cal-event" style={{background: 'var(--surface-2)', color: 'var(--muted)'}}>
                    +{evts.length - 3}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

window.CalendarStrip = CalendarStrip;
