// ============================================================================
// data.js — Master dataset + formatting helpers
// ----------------------------------------------------------------------------
// All values are fabricated but plausible. Reference month is maio/2026.
// Exposed on window:
//   CATEGORIES   — the 8 category definitions used for filtering + grouping
//   INDICES      — the full list of indices (each with current value + spark)
//   TODAY        — fixed "today" anchor for the demo (2026-05-08, Friday)
//   fmt(v,unit)        — number formatter (returns pt-BR locale string)
//   fmtDelta(d,u)      — signed delta with appropriate suffix
//   fmtDateShort(iso)  — "8 mai"
//   fmtFreshness(...)  — "hoje" / "ontem" / "há N dias"
//   daysAgo(iso, t)    — integer day difference
//   PT_MONTHS / PT_DAYS — pt-BR short labels
//   categoryLabel(id)  — category id → label
// ============================================================================

// ----------------------------------------------------------------------------
// series — generate a 24-point pseudo-realistic timeseries that ends on `current`.
// We seed a value 24 steps back, walk it forward with a small drift plus a
// deterministic sinusoidal noise so the line has visible texture but reaches
// `current` at the last point. Used only for sparkline rendering.
// ----------------------------------------------------------------------------
function series(current, vol, drift = 0) {
  const out = [];
  let v = current - drift * 24;
  for (let i = 0; i < 23; i++) {
    // sin+cos combo with `current` as phase offset → different shape per index
    v = v + drift + (Math.sin(i * 1.3 + current) + Math.cos(i * 0.7)) * vol;
    out.push(+v.toFixed(3));
  }
  out.push(current); // ensure the sparkline lands exactly on the current value
  return out;
}

// ----------------------------------------------------------------------------
// CATEGORIES — drives the toggle on Painel, the tabs on Índices, the filter
// chips on Metadados and Calendário, and the color tags on cards.
// `hint` is shown as small subtitle under section titles on the dashboard.
// ----------------------------------------------------------------------------
window.CATEGORIES = [
  { id: 'inflacao',  label: 'Inflação',  hint: 'preços e índices de custo' },
  { id: 'atividade', label: 'Atividade', hint: 'PIB, produção, varejo' },
  { id: 'trabalho',  label: 'Trabalho',  hint: 'emprego e renda' },
  { id: 'juros',     label: 'Juros',     hint: 'taxas básicas e expectativas' },
  { id: 'cambio',    label: 'Câmbio',    hint: 'moedas e taxa efetiva' },
  { id: 'mercado',   label: 'Mercado',   hint: 'bolsa e fundos' },
  { id: 'fiscal',    label: 'Fiscal',    hint: 'dívida e resultado primário' },
  { id: 'externo',   label: 'Externo',   hint: 'balança e contas externas' },
];

// ----------------------------------------------------------------------------
// INDICES — every series the app knows about.
//
// Schema (per row):
//   id          short slug, used as key + lookup
//   code        display code shown in cards/headings (e.g. "IPCA")
//   name        full human-readable name
//   cat         category id (see CATEGORIES)
//   source      issuing institution code (IBGE, BCB, FGV, B3, MDIC, MTE)
//   unit        raw unit token: '%', 'R$', 'pts', 'US$ bi', 'mil', 'índice'
//   unitLabel   long-form unit caption shown in the dossier
//   current     latest reading
//   delta       change vs previous reading
//   deltaUnit   'pp' | '%' | 'abs' — controls how delta is formatted
//   freq        Mensal | Trimestral | Diária | Semanal | Reunião
//   lastUpdate  ISO date of latest published reading
//   nextRelease ISO date of next expected release
//   direction   semantic direction for color tint:
//                  "bad"     → rising is bad   (inflação, desemprego, dívida)
//                  "good"    → rising is good  (PIB, produção, emprego)
//                  "neutral" → no tint         (juros, câmbio)
//   pctile      historical percentile (0–1) — reserved for future heatmap
//   spark       24-point series for the sparkline (generated above)
//   pinned      pre-pinned in Índices tab (initial state for the star toggle)
// ----------------------------------------------------------------------------
window.INDICES = [
  // ── INFLAÇÃO ───────────────────────────────────────────────────────────
  { id: 'ipca',     code: 'IPCA',     name: 'Índice de Preços ao Consumidor Amplo', cat: 'inflacao', source: 'IBGE',
    unit: '%', unitLabel: '% em 12 meses', current: 4.42, delta: -0.12, deltaUnit: 'pp',
    freq: 'Mensal', lastUpdate: '2026-04-30', nextRelease: '2026-05-09', direction: 'bad',
    pctile: 0.62, spark: series(4.42, 0.12, -0.02), pinned: true },
  { id: 'ipca15',   code: 'IPCA-15',  name: 'IPCA-15 — prévia da inflação', cat: 'inflacao', source: 'IBGE',
    unit: '%', unitLabel: '% em 12 meses', current: 4.28, delta: -0.08, deltaUnit: 'pp',
    freq: 'Mensal', lastUpdate: '2026-04-24', nextRelease: '2026-05-22', direction: 'bad',
    pctile: 0.58, spark: series(4.28, 0.10, -0.015), pinned: false },
  { id: 'igpm',     code: 'IGP-M',    name: 'Índice Geral de Preços — Mercado', cat: 'inflacao', source: 'FGV',
    unit: '%', unitLabel: '% em 12 meses', current: 3.81, delta: 0.34, deltaUnit: 'pp',
    freq: 'Mensal', lastUpdate: '2026-04-29', nextRelease: '2026-05-28', direction: 'bad',
    pctile: 0.41, spark: series(3.81, 0.28, 0.04), pinned: true },
  { id: 'igpdi',    code: 'IGP-DI',   name: 'Índice Geral de Preços — Disponibilidade Interna', cat: 'inflacao', source: 'FGV',
    unit: '%', unitLabel: '% em 12 meses', current: 3.94, delta: 0.21, deltaUnit: 'pp',
    freq: 'Mensal', lastUpdate: '2026-05-06', nextRelease: '2026-06-05', direction: 'bad',
    pctile: 0.44, spark: series(3.94, 0.22, 0.03), pinned: false },
  { id: 'inpc',     code: 'INPC',     name: 'Índice Nacional de Preços ao Consumidor', cat: 'inflacao', source: 'IBGE',
    unit: '%', unitLabel: '% em 12 meses', current: 4.19, delta: -0.05, deltaUnit: 'pp',
    freq: 'Mensal', lastUpdate: '2026-04-30', nextRelease: '2026-05-09', direction: 'bad',
    pctile: 0.55, spark: series(4.19, 0.11, -0.01), pinned: false },
  { id: 'incc',     code: 'INCC',     name: 'Índice Nacional de Custo da Construção', cat: 'inflacao', source: 'FGV',
    unit: '%', unitLabel: '% em 12 meses', current: 6.12, delta: 0.18, deltaUnit: 'pp',
    freq: 'Mensal', lastUpdate: '2026-04-29', nextRelease: '2026-05-28', direction: 'bad',
    pctile: 0.71, spark: series(6.12, 0.20, 0.05), pinned: false },

  // ── ATIVIDADE ─────────────────────────────────────────────────────────
  { id: 'ibcbr',    code: 'IBC-Br',   name: 'Índice de Atividade Econômica do BCB', cat: 'atividade', source: 'BCB',
    unit: 'índice', unitLabel: 'índice (2002 = 100)', current: 178.4, delta: 0.42, deltaUnit: '%',
    freq: 'Mensal', lastUpdate: '2026-04-15', nextRelease: '2026-05-15', direction: 'good',
    pctile: 0.78, spark: series(178.4, 0.9, 0.15), pinned: true },
  { id: 'pib',      code: 'PIB',      name: 'Produto Interno Bruto — Trimestral', cat: 'atividade', source: 'IBGE',
    unit: '%', unitLabel: '% no trimestre', current: 0.7, delta: -0.2, deltaUnit: 'pp',
    freq: 'Trimestral', lastUpdate: '2026-03-04', nextRelease: '2026-06-03', direction: 'good',
    pctile: 0.52, spark: series(0.7, 0.4, 0.01), pinned: false },
  { id: 'pim',      code: 'PIM',      name: 'Produção Industrial Mensal', cat: 'atividade', source: 'IBGE',
    unit: '%', unitLabel: '% mensal, com ajuste', current: -0.4, delta: -0.9, deltaUnit: 'pp',
    freq: 'Mensal', lastUpdate: '2026-04-02', nextRelease: '2026-05-08', direction: 'good',
    pctile: 0.31, spark: series(-0.4, 0.6, -0.02), pinned: false },
  { id: 'pmc',      code: 'PMC',      name: 'Pesquisa Mensal de Comércio (Varejo)', cat: 'atividade', source: 'IBGE',
    unit: '%', unitLabel: '% mensal, com ajuste', current: 0.3, delta: 0.5, deltaUnit: 'pp',
    freq: 'Mensal', lastUpdate: '2026-04-10', nextRelease: '2026-05-13', direction: 'good',
    pctile: 0.61, spark: series(0.3, 0.5, 0.02), pinned: false },
  { id: 'pms',      code: 'PMS',      name: 'Pesquisa Mensal de Serviços', cat: 'atividade', source: 'IBGE',
    unit: '%', unitLabel: '% mensal, com ajuste', current: 0.8, delta: 0.4, deltaUnit: 'pp',
    freq: 'Mensal', lastUpdate: '2026-04-11', nextRelease: '2026-05-14', direction: 'good',
    pctile: 0.69, spark: series(0.8, 0.4, 0.03), pinned: false },

  // ── TRABALHO ──────────────────────────────────────────────────────────
  { id: 'desemp',   code: 'Desemprego', name: 'Taxa de Desocupação — PNADC', cat: 'trabalho', source: 'IBGE',
    unit: '%', unitLabel: 'taxa de desocupação', current: 7.4, delta: -0.2, deltaUnit: 'pp',
    freq: 'Mensal', lastUpdate: '2026-04-30', nextRelease: '2026-05-30', direction: 'bad',
    pctile: 0.18, spark: series(7.4, 0.18, -0.04), pinned: true },
  { id: 'caged',    code: 'CAGED',    name: 'Saldo de Empregos Formais — Novo CAGED', cat: 'trabalho', source: 'MTE',
    unit: 'mil', unitLabel: 'mil vagas líquidas', current: 184, delta: 22, deltaUnit: 'abs',
    freq: 'Mensal', lastUpdate: '2026-04-25', nextRelease: '2026-05-26', direction: 'good',
    pctile: 0.74, spark: series(184, 35, 2), pinned: false },
  { id: 'massa',    code: 'Massa Salarial', name: 'Rendimento real médio efetivo', cat: 'trabalho', source: 'IBGE',
    unit: 'R$', unitLabel: 'R$ — habitualmente recebido', current: 3214, delta: 38, deltaUnit: 'abs',
    freq: 'Mensal', lastUpdate: '2026-04-30', nextRelease: '2026-05-30', direction: 'good',
    pctile: 0.66, spark: series(3214, 22, 5), pinned: false },

  // ── JUROS ─────────────────────────────────────────────────────────────
  { id: 'selic',    code: 'SELIC',    name: 'Taxa SELIC — Meta', cat: 'juros', source: 'BCB',
    unit: '%', unitLabel: '% a.a. — meta do Copom', current: 10.50, delta: -0.25, deltaUnit: 'pp',
    freq: 'Reunião', lastUpdate: '2026-03-19', nextRelease: '2026-05-07', direction: 'neutral',
    pctile: 0.48, spark: series(10.50, 0.05, -0.04), pinned: true },
  { id: 'cdi',      code: 'CDI',      name: 'Certificado de Depósito Interbancário', cat: 'juros', source: 'B3',
    unit: '%', unitLabel: '% a.a.', current: 10.40, delta: -0.25, deltaUnit: 'pp',
    freq: 'Diária', lastUpdate: '2026-05-07', nextRelease: '2026-05-08', direction: 'neutral',
    pctile: 0.48, spark: series(10.40, 0.06, -0.04), pinned: true },
  { id: 'focus',    code: 'Focus',    name: 'Expectativa IPCA 12 meses — Boletim Focus', cat: 'juros', source: 'BCB',
    unit: '%', unitLabel: 'mediana — 12m à frente', current: 3.92, delta: -0.04, deltaUnit: 'pp',
    freq: 'Semanal', lastUpdate: '2026-05-05', nextRelease: '2026-05-12', direction: 'bad',
    pctile: 0.39, spark: series(3.92, 0.07, -0.012), pinned: false },

  // ── CÂMBIO ────────────────────────────────────────────────────────────
  { id: 'ptax',     code: 'PTAX',     name: 'Dólar Americano — Cotação PTAX', cat: 'cambio', source: 'BCB',
    unit: 'R$', unitLabel: 'R$ por US$', current: 5.124, delta: -0.038, deltaUnit: 'abs',
    freq: 'Diária', lastUpdate: '2026-05-07', nextRelease: '2026-05-08', direction: 'neutral',
    pctile: 0.43, spark: series(5.124, 0.045, -0.008), pinned: true },
  { id: 'europtax', code: 'EUR PTAX', name: 'Euro — Cotação PTAX', cat: 'cambio', source: 'BCB',
    unit: 'R$', unitLabel: 'R$ por €', current: 5.541, delta: -0.029, deltaUnit: 'abs',
    freq: 'Diária', lastUpdate: '2026-05-07', nextRelease: '2026-05-08', direction: 'neutral',
    pctile: 0.51, spark: series(5.541, 0.05, -0.006), pinned: false },

  // ── MERCADO ───────────────────────────────────────────────────────────
  { id: 'ibov',     code: 'Ibovespa', name: 'Índice Bovespa', cat: 'mercado', source: 'B3',
    unit: 'pts', unitLabel: 'pontos', current: 135420, delta: 1.34, deltaUnit: '%',
    freq: 'Diária', lastUpdate: '2026-05-07', nextRelease: '2026-05-08', direction: 'good',
    pctile: 0.81, spark: series(135420, 1100, 380), pinned: true },
  { id: 'ifix',     code: 'IFIX',     name: 'Índice de Fundos Imobiliários', cat: 'mercado', source: 'B3',
    unit: 'pts', unitLabel: 'pontos', current: 3284, delta: 0.41, deltaUnit: '%',
    freq: 'Diária', lastUpdate: '2026-05-07', nextRelease: '2026-05-08', direction: 'good',
    pctile: 0.58, spark: series(3284, 18, 4), pinned: false },

  // ── FISCAL ────────────────────────────────────────────────────────────
  { id: 'divpib',   code: 'Dívida/PIB', name: 'Dívida Bruta do Governo Geral / PIB', cat: 'fiscal', source: 'BCB',
    unit: '%', unitLabel: '% do PIB', current: 76.4, delta: 0.3, deltaUnit: 'pp',
    freq: 'Mensal', lastUpdate: '2026-04-28', nextRelease: '2026-05-29', direction: 'bad',
    pctile: 0.84, spark: series(76.4, 0.4, 0.06), pinned: false },
  { id: 'primario', code: 'Primário', name: 'Resultado Primário do Setor Público', cat: 'fiscal', source: 'BCB',
    unit: '% PIB', unitLabel: '% do PIB — 12 meses', current: -1.8, delta: -0.1, deltaUnit: 'pp',
    freq: 'Mensal', lastUpdate: '2026-04-28', nextRelease: '2026-05-29', direction: 'good',
    pctile: 0.22, spark: series(-1.8, 0.15, -0.02), pinned: false },

  // ── EXTERNO ───────────────────────────────────────────────────────────
  { id: 'balanca',  code: 'Balança',  name: 'Balança Comercial — Saldo', cat: 'externo', source: 'MDIC',
    unit: 'US$ bi', unitLabel: 'US$ bi — saldo mensal', current: 9.4, delta: 0.8, deltaUnit: 'abs',
    freq: 'Mensal', lastUpdate: '2026-05-02', nextRelease: '2026-06-02', direction: 'good',
    pctile: 0.72, spark: series(9.4, 1.4, 0.1), pinned: false },
  { id: 'contacorr',code: 'C. Corrente', name: 'Conta Corrente — 12 meses', cat: 'externo', source: 'BCB',
    unit: 'US$ bi', unitLabel: 'US$ bi — 12 meses', current: -28.6, delta: -1.4, deltaUnit: 'abs',
    freq: 'Mensal', lastUpdate: '2026-04-24', nextRelease: '2026-05-26', direction: 'good',
    pctile: 0.34, spark: series(-28.6, 1.2, -0.2), pinned: false },
];

// ----------------------------------------------------------------------------
// fmt — pt-BR locale-aware number formatter. Branches on the `unit` token to
// pick precision and grouping (e.g. R$ keeps 3 decimals like 5.124).
// ----------------------------------------------------------------------------
window.fmt = function fmt(value, unit) {
  const abs = Math.abs(value);
  if (unit === 'pts' && abs >= 1000) {
    return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }
  if (unit === 'R$') return value.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  if (unit === 'mil') return value.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  if (unit === 'US$ bi') return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  if (unit === 'índice') return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ----------------------------------------------------------------------------
// fmtDelta — formats a signed delta with the right suffix.
//   'pp'  → "+0.34 pp"        (percentage points)
//   '%'   → "+1.34%"          (percent change)
//   'abs' → "+1.234" / "+22"  (absolute change, precision depends on magnitude)
// Uses Unicode minus (−) for negatives to match the rest of the typography.
// ----------------------------------------------------------------------------
window.fmtDelta = function fmtDelta(delta, deltaUnit) {
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  const abs = Math.abs(delta);
  let body;
  if (deltaUnit === 'pp') body = abs.toFixed(2) + ' pp';
  else if (deltaUnit === '%') body = abs.toFixed(2) + '%';
  else if (deltaUnit === 'abs') {
    body = abs.toLocaleString('pt-BR', {
      minimumFractionDigits: abs < 10 ? 2 : 0,
      maximumFractionDigits: abs < 10 ? 3 : 0,
    });
  }
  return sign + body;
};

// ----------------------------------------------------------------------------
// Date helpers — all pt-BR.
// PT_MONTHS / PT_DAYS are short forms ("jan", "sex"); long forms are inlined
// where they're needed (e.g. dossier formatLongDate).
// ----------------------------------------------------------------------------
window.PT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
window.PT_DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// "2026-05-08" → "8 mai"
window.fmtDateShort = function fmtDateShort(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.getDate() + ' ' + window.PT_MONTHS[d.getMonth()];
};

// Integer day difference. Positive = `iso` is older than `today`.
window.daysAgo = function daysAgo(iso, today) {
  const d = new Date(iso + 'T12:00:00');
  const t = new Date(today + 'T12:00:00');
  return Math.round((t - d) / 86400000);
};

// Human-readable freshness label. Used on card footers ("há 3 dias").
window.fmtFreshness = function fmtFreshness(iso, today) {
  const n = window.daysAgo(iso, today);
  if (n === 0) return 'hoje';
  if (n === 1) return 'ontem';
  if (n < 30) return 'há ' + n + ' dias';
  if (n < 60) return 'há 1 mês';
  return 'há ' + Math.round(n / 30) + ' meses';
};

// Fixed "today" anchor — keeps the demo deterministic across reloads/sessions.
window.TODAY = '2026-05-08'; // Friday

// Category id → pt-BR label. Defined here AND in card.jsx; both point to the
// same CATEGORIES array so they stay in sync.
window.categoryLabel = function(id) {
  const c = window.CATEGORIES.find(c => c.id === id);
  return c ? c.label : id;
};
