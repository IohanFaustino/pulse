/**
 * i18n — lightweight translation system (no external deps).
 *
 * Usage:
 *   const { t, lang, setLang } = useTranslation()
 *   <h1>{t('indices.title')}</h1>
 *
 * Keys follow the pattern: "section.subsection.identifier".
 * Categories, series codes and series names are NOT translated — they are
 * proper nouns of the Brazilian economic domain.
 */

import { useUiStore } from '@/stores/uiStore'
import type { Lang } from '@/stores/uiStore'

// ── Translation dictionary ─────────────────────────────────────────────────────

const STRINGS: Record<Lang, Record<string, string>> = {
  pt: {
    // ── Sidebar ──────────────────────────────────────────────────────────────
    'sidebar.nav.aria':             'Páginas',
    'sidebar.nav.label.painel':     'Painel',
    'sidebar.nav.hint.painel':      'visão macro',
    'sidebar.nav.label.indices':    'Índices',
    'sidebar.nav.hint.indices':     'workspace',
    'sidebar.nav.label.calendario': 'Calendário',
    'sidebar.nav.hint.calendario':  'divulgações',
    'sidebar.nav.label.metadados':  'Metadados',
    'sidebar.nav.hint.metadados':   'dossiês',
    'sidebar.recents':              'Recentes',
    'sidebar.toggle.collapse':      'Colapsar menu',
    'sidebar.toggle.expand':        'Expandir menu',
    'sidebar.theme.toggle':         'Alternar modo escuro',
    'sidebar.lang.toggle':          'Alternar idioma',

    // ── Painel ───────────────────────────────────────────────────────────────
    'painel.greeting.morning':      'Bom dia.',
    'painel.greeting.afternoon':    'Boa tarde.',
    'painel.greeting.evening':      'Boa noite.',
    'painel.calendar.title':        'Agenda — próximos 30 dias',
    'painel.status.today.one':      'índice com divulgação hoje',
    'painel.status.today.many':     'índices com divulgação hoje',
    'painel.status.week':           'esta semana',
    'painel.status.pinned.one':     'índice fixado',
    'painel.status.pinned.many':    'índices fixados',
    'painel.empty.title':           'Nenhum índice fixado',
    'painel.empty.subtitle':        'Vá até a página Índices e clique na estrela para adicionar séries ao Painel.',
    'painel.empty.cta':             'Ir para Índices',

    // ── Índices ───────────────────────────────────────────────────────────────
    'indices.title':                'índices',
    'indices.subtitle':             'Use a estrela para adicionar ao Painel.',
    'indices.search.placeholder':   'Buscar por código ou nome…',
    'indices.search.aria':          'Buscar índices por código ou nome',
    'indices.count.one':            '1 índice',
    'indices.count.many':           '{n} índices',

    // ── Calendário ───────────────────────────────────────────────────────────
    'calendario.title':             'Calendário de Divulgações',
    'calendario.today':             'Hoje',
    'calendario.today.kicker':      'hoje',
    'calendario.legend.expected':   'Esperado',
    'calendario.legend.realized':   'Realizado',
    'calendario.counter.expected':  '{n} esperados',
    'calendario.counter.realized':  '{n} realizados',
    'calendario.filter.label':      'Categoria',
    'calendario.note.daily':        'Índices com frequência diária (CDI, PTAX, Ibov, IFIX) não constam neste calendário.',
    'calendario.empty.title':       'Sem divulgações neste mês',
    'calendario.empty.cat':         'Nenhuma divulgação de {cat} encontrada para {month}.',
    'calendario.empty.all':         'Nenhuma divulgação encontrada para {month}.',
    'calendario.error.title':       'Erro ao carregar calendário',
    'calendario.error.subtitle':    'Verifique se o servidor está disponível e tente novamente.',
    'calendario.nav.prev':          'Mês anterior',
    'calendario.nav.next':          'Próximo mês',

    // ── Metadados ────────────────────────────────────────────────────────────
    'metadados.title':              'metadados',
    'metadados.search.placeholder': 'Buscar por código ou nome…',
    'metadados.search.aria':        'Buscar série',
    'metadados.select.prompt':      'Selecione um índice',
    'metadados.select.subtitle':    'Escolha um item à esquerda para ver a ficha técnica.',
    'metadados.field.fonte':        'Fonte',
    'metadados.field.frequencia':   'Frequência',
    'metadados.field.unidade':      'Unidade',
    'metadados.field.primeira_obs': 'Primeira observação',
    'metadados.field.ultima_div':   'Última divulgação',
    'metadados.field.proxima_div':  'Próxima divulgação',
    'metadados.field.calendario':   'Calendário',
    'metadados.field.metodologia':  'Metodologia',
    'metadados.field.site_oficial': 'Site oficial',
    'metadados.field.ver_calendario': 'Ver Calendário',
    'metadados.list.empty':         'Nenhuma série encontrada.',
    'metadados.subtitle':           'Ficha técnica de cada índice.',
    'metadados.action.pin':         'Fixar no Painel',
    'metadados.action.unpin':       'Desafixar do Painel',
    'metadados.action.analysis':    'Abrir análise',
    'metadados.action.site':        'Visitar site',
    'metadados.action.methodology': 'Metodologia',
    'metadados.section.id':         'Identificação',
    'metadados.section.history':    'Histórico',
    'metadados.section.resources':  'Recursos',
    'metadados.value.current':      'Valor atual',
    'metadados.value.updatedAt':    'atualizado em {date}',
    'metadados.proxima.empty':      'sem divulgação programada',
    'metadados.status.fresh':       'atualizado',
    'metadados.status.stale':       'desatualizado',
    'metadados.status.failed':      'coleta falhou',
    'metadados.search.clear':       'Limpar busca',

    // ── Common ────────────────────────────────────────────────────────────────
    'common.refresh':               'Atualizar',

    // ── AnalysisPanel ────────────────────────────────────────────────────────
    'analysis.kicker':              'Análise',
    'analysis.acc.transform':       'Transformação',
    'analysis.acc.format':          'Formato do gráfico',
    'analysis.group.original':      'Série original',
    'analysis.group.variacao':      'Variação',
    'analysis.group.suavizacao':    'Suavização',
    'analysis.group.janelas':       'Janelas',
    'analysis.group.normalizacao':  'Normalização',
    'analysis.format.line':         'Linha',
    'analysis.format.bar':          'Barras',
    'analysis.format.area':         'Área',
    'analysis.btn.apply':           'Aplicar',
    'analysis.btn.applying':        'Aplicando…',
    'analysis.btn.clear':           'Limpar',
    'analysis.btn.saveImage':       'Salvar imagem',
    'analysis.btn.saveData':        'Salvar dados',
    'analysis.btn.close':           'Fechar painel de análise',
    'analysis.kbd.esc':             'fechar',
    'analysis.kbd.enter':           'aplicar',
    'analysis.error.transform':     'Erro ao aplicar transformação. Tente novamente.',
    'analysis.op.level':            'Nível (original)',
    'analysis.op.sa':               'Dessazonalizado',
    'analysis.op.calendar_adj':     'Ajuste de calendário',
    'analysis.op.mom':              'MoM — variação mensal',
    'analysis.op.qoq':              'QoQ — variação trimestral',
    'analysis.op.yoy':              'YoY — variação anual',
    'analysis.op.annualized':       'Anualizada',
    'analysis.op.diff':             'Primeira diferença',
    'analysis.op.log_diff':         'Log-diferença',
    'analysis.op.pp':               'Pontos percentuais',
    'analysis.op.ma_3':             'Média móvel 3m',
    'analysis.op.ma_6':             'Média móvel 6m',
    'analysis.op.ma_12':            'Média móvel 12m',
    'analysis.op.ewma':             'EWMA (span)',
    'analysis.op.accum12':          'Acumulado 12m',
    'analysis.op.stddev12':         'Desvio-padrão 12m',
    'analysis.op.rebase':           'Rebase = 100',
    'analysis.op.zscore':           'Z-score',
    'analysis.op.percentile':       'Percentil',
  },

  en: {
    // ── Sidebar ──────────────────────────────────────────────────────────────
    'sidebar.nav.aria':             'Pages',
    'sidebar.nav.label.painel':     'Panel',
    'sidebar.nav.hint.painel':      'overview',
    'sidebar.nav.label.indices':    'Indexes',
    'sidebar.nav.hint.indices':     'workspace',
    'sidebar.nav.label.calendario': 'Calendar',
    'sidebar.nav.hint.calendario':  'releases',
    'sidebar.nav.label.metadados':  'Metadata',
    'sidebar.nav.hint.metadados':   'dossiers',
    'sidebar.recents':              'Recents',
    'sidebar.toggle.collapse':      'Collapse menu',
    'sidebar.toggle.expand':        'Expand menu',
    'sidebar.theme.toggle':         'Toggle dark mode',
    'sidebar.lang.toggle':          'Toggle language',

    // ── Painel ───────────────────────────────────────────────────────────────
    'painel.greeting.morning':      'Good morning.',
    'painel.greeting.afternoon':    'Good afternoon.',
    'painel.greeting.evening':      'Good evening.',
    'painel.calendar.title':        'Agenda — next 30 days',
    'painel.status.today.one':      'index with release today',
    'painel.status.today.many':     'indexes with release today',
    'painel.status.week':           'this week',
    'painel.status.pinned.one':     'pinned index',
    'painel.status.pinned.many':    'pinned indexes',
    'painel.empty.title':           'No pinned indexes',
    'painel.empty.subtitle':        'Go to the Indexes page and click the star to add series to the Panel.',
    'painel.empty.cta':             'Go to Indexes',

    // ── Índices ───────────────────────────────────────────────────────────────
    'indices.title':                'indexes',
    'indices.subtitle':             'Use the star to add to Panel.',
    'indices.search.placeholder':   'Search by code or name…',
    'indices.search.aria':          'Search indexes by code or name',
    'indices.count.one':            '1 index',
    'indices.count.many':           '{n} indexes',

    // ── Calendário ───────────────────────────────────────────────────────────
    'calendario.title':             'Release Calendar',
    'calendario.today':             'Today',
    'calendario.today.kicker':      'today',
    'calendario.legend.expected':   'Expected',
    'calendario.legend.realized':   'Released',
    'calendario.counter.expected':  '{n} expected',
    'calendario.counter.realized':  '{n} released',
    'calendario.filter.label':      'Category',
    'calendario.note.daily':        'Daily-frequency series (CDI, PTAX, Ibov, IFIX) are not shown in this calendar.',
    'calendario.empty.title':       'No releases this month',
    'calendario.empty.cat':         'No {cat} releases found for {month}.',
    'calendario.empty.all':         'No releases found for {month}.',
    'calendario.error.title':       'Failed to load calendar',
    'calendario.error.subtitle':    'Check that the server is running and try again.',
    'calendario.nav.prev':          'Previous month',
    'calendario.nav.next':          'Next month',

    // ── Metadados ────────────────────────────────────────────────────────────
    'metadados.title':              'metadata',
    'metadados.search.placeholder': 'Search by code or name…',
    'metadados.search.aria':        'Search series',
    'metadados.select.prompt':      'Select an index',
    'metadados.select.subtitle':    'Choose an item on the left to view the technical file.',
    'metadados.field.fonte':        'Source',
    'metadados.field.frequencia':   'Frequency',
    'metadados.field.unidade':      'Unit',
    'metadados.field.primeira_obs': 'First observation',
    'metadados.field.ultima_div':   'Last release',
    'metadados.field.proxima_div':  'Next release',
    'metadados.field.calendario':   'Calendar',
    'metadados.field.metodologia':  'Methodology',
    'metadados.field.site_oficial': 'Official site',
    'metadados.field.ver_calendario': 'View Calendar',
    'metadados.list.empty':         'No series found.',
    'metadados.subtitle':           'Technical file for every index.',
    'metadados.action.pin':         'Pin to Panel',
    'metadados.action.unpin':       'Unpin from Panel',
    'metadados.action.analysis':    'Open analysis',
    'metadados.action.site':        'Visit site',
    'metadados.action.methodology': 'Methodology',
    'metadados.section.id':         'Identification',
    'metadados.section.history':    'History',
    'metadados.section.resources':  'Resources',
    'metadados.value.current':      'Current value',
    'metadados.value.updatedAt':    'updated on {date}',
    'metadados.proxima.empty':      'no release scheduled',
    'metadados.status.fresh':       'fresh',
    'metadados.status.stale':       'stale',
    'metadados.status.failed':      'fetch failed',
    'metadados.search.clear':       'Clear search',

    // ── Common ────────────────────────────────────────────────────────────────
    'common.refresh':               'Refresh',

    // ── AnalysisPanel ────────────────────────────────────────────────────────
    'analysis.kicker':              'Analysis',
    'analysis.acc.transform':       'Transformation',
    'analysis.acc.format':          'Chart format',
    'analysis.group.original':      'Original series',
    'analysis.group.variacao':      'Variation',
    'analysis.group.suavizacao':    'Smoothing',
    'analysis.group.janelas':       'Windows',
    'analysis.group.normalizacao':  'Normalization',
    'analysis.format.line':         'Line',
    'analysis.format.bar':          'Bars',
    'analysis.format.area':         'Area',
    'analysis.btn.apply':           'Apply',
    'analysis.btn.applying':        'Applying…',
    'analysis.btn.clear':           'Clear',
    'analysis.btn.saveImage':       'Save image',
    'analysis.btn.saveData':        'Save data',
    'analysis.btn.close':           'Close analysis panel',
    'analysis.kbd.esc':             'close',
    'analysis.kbd.enter':           'apply',
    'analysis.error.transform':     'Failed to apply transform. Try again.',
    'analysis.op.level':            'Level (original)',
    'analysis.op.sa':               'Seasonally adjusted',
    'analysis.op.calendar_adj':     'Calendar-adjusted',
    'analysis.op.mom':              'MoM — month-over-month',
    'analysis.op.qoq':              'QoQ — quarter-over-quarter',
    'analysis.op.yoy':              'YoY — year-over-year',
    'analysis.op.annualized':       'Annualized',
    'analysis.op.diff':             'First difference',
    'analysis.op.log_diff':         'Log-difference',
    'analysis.op.pp':               'Percentage points',
    'analysis.op.ma_3':             'Moving avg 3m',
    'analysis.op.ma_6':             'Moving avg 6m',
    'analysis.op.ma_12':            'Moving avg 12m',
    'analysis.op.ewma':             'EWMA (span)',
    'analysis.op.accum12':          'Accumulated 12m',
    'analysis.op.stddev12':         'Std-dev 12m',
    'analysis.op.rebase':           'Rebase = 100',
    'analysis.op.zscore':           'Z-score',
    'analysis.op.percentile':       'Percentile',
  },
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns a translation function `t(key)`, the current `lang`, and `setLang`.
 *
 * `t(key)` returns the translated string for the current language.
 * If the key is not found, returns the key itself as a fallback (never throws).
 *
 * For keys with `{n}` placeholder, pass the value as the second argument:
 *   t('indices.count.many', { n: 12 }) → "12 índices"
 */
export function useTranslation() {
  const lang = useUiStore((s) => s.lang)
  const setLang = useUiStore((s) => s.setLang)

  function t(key: string, vars?: Record<string, string | number>): string {
    const dict = STRINGS[lang]
    let value = dict[key] ?? key
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        value = value.replace(`{${k}}`, String(v))
      }
    }
    return value
  }

  return { t, lang, setLang }
}

export type { Lang }
