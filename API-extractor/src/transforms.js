/* global React */
// ============================================================================
// transforms.js — Catalog of series transformations
// ----------------------------------------------------------------------------
// Pure data — no React. Defines every transformation the user can pick in
// the transform modal, grouped by family. Consumed by transform-modal.jsx
// (for the picker) and painel.jsx (for the badge label on each card).
// ============================================================================

window.TRANSFORMS = [
  // ── Original-series adjustments — no math on top, just different vintages.
  { group: 'Série original', items: [
    { id: 'raw',      label: 'Nível original',          hint: 'Valor publicado, sem ajuste' },
    { id: 'sa',       label: 'Dessazonalizado',         hint: 'Remove sazonalidade recorrente' },
    { id: 'cal',      label: 'Ajuste de calendário',    hint: 'Corrige efeitos de dias úteis' },
  ]},

  // ── Period-over-period variation. MoM/QoQ/YoY are the canonical 3.
  //    `pp` is for series that are already in %, where we use percentage points.
  { group: 'Variação', items: [
    { id: 'mom',      label: 'Variação MoM',            hint: '% vs mês anterior' },
    { id: 'qoq',      label: 'Variação QoQ',            hint: '% vs trimestre anterior' },
    { id: 'yoy',      label: 'Variação YoY',            hint: '% vs 12 meses atrás' },
    { id: 'ann',      label: 'Anualizada',              hint: 'Variação curta em ritmo anual' },
    { id: 'diff',    label: 'Primeira diferença',       hint: 'xₜ − xₜ₋₁' },
    { id: 'logdiff', label: 'Diferença logarítmica',    hint: 'Aproxima crescimento' },
    { id: 'pp',      label: 'Variação em p.p.',         hint: 'Para taxas (juros, desemprego)' },
  ]},

  // ── Smoothing — moving averages of various windows.
  { group: 'Suavização', items: [
    { id: 'ma3',     label: 'Média móvel 3m',           hint: 'Suaviza ruído de curto prazo' },
    { id: 'ma6',     label: 'Média móvel 6m',           hint: '' },
    { id: 'ma12',    label: 'Média móvel 12m',          hint: 'Tendência anual' },
    { id: 'ewma',    label: 'Média móvel exponencial',  hint: 'Reage mais rápido' },
  ]},

  // ── Rolling-window aggregates.
  { group: 'Janelas', items: [
    { id: 'roll12',  label: 'Acumulado 12 meses',       hint: 'Soma dos últimos 12' },
    { id: 'rollstd', label: 'Desvio-padrão 12m',        hint: 'Volatilidade recente' },
  ]},

  // ── Normalisations — rebase to a common point or scale by history.
  { group: 'Normalização', items: [
    { id: 'rebase',  label: 'Rebase = 100',             hint: 'Base em data escolhida' },
    { id: 'zscore',  label: 'Z-score',                  hint: 'Desvios da média histórica' },
    { id: 'pct',     label: 'Percentil histórico',      hint: 'Posição na distribuição' },
  ]},
];

// Look up the human-readable label for a transform id. Linear scan is fine —
// the catalog is small and we only call this when rendering a badge.
window.transformLabel = function(id) {
  for (const g of window.TRANSFORMS)
    for (const t of g.items) if (t.id === id) return t.label;
  return id;
};
