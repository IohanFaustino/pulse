// ============================================================================
// data-meta.js — Per-index metadata + release-calendar generator
// ----------------------------------------------------------------------------
// Exposes on window:
//   META          — dossier-grade info keyed by index id (description, methodology,
//                   release rule, first observation, source URL, full name)
//   SOURCE_NAMES  — short institution code → full institutional name
//   getReleases() — builds an event list (R = realised, E = expected) for an
//                   index within an ISO date window. Used by the Calendário page.
//   fmtMonthYear() / fmtMonthYearLong() — pt-BR month labels for headers.
// ============================================================================

// ----------------------------------------------------------------------------
// META — extended dossier data per index id. Joined to INDICES in metadata.jsx.
// Fields are all optional — the Dossier component renders only what exists.
//   full         long official name (often differs from `name` in INDICES)
//   desc         3–4 sentence description shown above the definition list
//   firstObs     start of the series, format "YYYY-MM" (rendered as "jan. 1980")
//   releaseRule  human description of the publication schedule
//   sourceUrl    canonical URL (without protocol) — rendered as external link
//   methodology  one-paragraph note on how the index is constructed
// ----------------------------------------------------------------------------
window.META = {
  ipca: {
    full: 'Índice Nacional de Preços ao Consumidor Amplo',
    desc: 'Índice oficial de inflação do Brasil. Mede a variação de preços para famílias com rendimento de 1 a 40 salários mínimos em 11 regiões metropolitanas. Define o centro da meta perseguida pelo Copom.',
    firstObs: '1980-01',
    releaseRule: 'Em torno do 8º dia útil do mês de referência seguinte',
    sourceUrl: 'ibge.gov.br/explica/inflacao',
    methodology: 'Coleta mensal de preços em 11 regiões metropolitanas; ponderação pela estrutura de consumo da Pesquisa de Orçamentos Familiares (POF).',
  },
  ipca15: {
    full: 'IPCA-15 — Prévia da inflação',
    desc: 'Prévia do IPCA. Mesma metodologia e abrangência, com período de coleta antecipado em ~15 dias. Funciona como antecipador do número cheio.',
    firstObs: '2000-05', releaseRule: 'Em torno do dia 24 do mês de referência',
    sourceUrl: 'ibge.gov.br', methodology: 'Idem IPCA, com janela de coleta deslocada.',
  },
  igpm: {
    full: 'Índice Geral de Preços — Mercado',
    desc: 'Índice da FGV composto por IPA (60%), IPC (30%) e INCC (10%). Amplamente usado em contratos de aluguel e indexação de tarifas.',
    firstObs: '1989-06', releaseRule: 'Último dia útil do mês de referência',
    sourceUrl: 'portalibre.fgv.br', methodology: 'Média ponderada de IPA-M, IPC-M e INCC-M.',
  },
  igpdi: {
    full: 'Índice Geral de Preços — Disponibilidade Interna',
    desc: 'Variação do IGP com coleta no mês cheio (1 a 30). Usado em contratos do setor público e indexação de tarifas.',
    firstObs: '1944-01', releaseRule: 'Primeira semana do mês seguinte',
    sourceUrl: 'portalibre.fgv.br', methodology: 'Mesma cesta do IGP-M com janela de coleta calendário cheio.',
  },
  inpc: {
    full: 'Índice Nacional de Preços ao Consumidor',
    desc: 'Mede inflação para famílias com renda de 1 a 5 salários mínimos. Usado em reajustes salariais.',
    firstObs: '1979-03', releaseRule: 'Junto com o IPCA — em torno do 8º dia útil',
    sourceUrl: 'ibge.gov.br', methodology: 'Cesta com peso maior em alimentação e habitação.',
  },
  incc: {
    full: 'Índice Nacional de Custo da Construção',
    desc: 'Componente do IGP. Mede o custo de obras habitacionais — materiais, mão de obra e serviços.',
    firstObs: '1944-01', releaseRule: 'Último dia útil do mês',
    sourceUrl: 'portalibre.fgv.br', methodology: 'Pesquisa em 7 capitais com peso definido pela Sinapi.',
  },
  ibcbr: {
    full: 'Índice de Atividade Econômica do Banco Central',
    desc: 'Proxy mensal do PIB construída pelo BCB com base em produção industrial, comércio, serviços e agropecuária.',
    firstObs: '2003-01', releaseRule: 'Por volta do dia 15 do mês de referência seguinte',
    sourceUrl: 'bcb.gov.br', methodology: 'Ponderação dos setores conforme contas nacionais.',
  },
  pib: {
    full: 'Produto Interno Bruto — Trimestral',
    desc: 'Valor agregado da economia brasileira, divulgado pelo IBGE trimestralmente. Variação dessazonalizada.',
    firstObs: '1996-01', releaseRule: 'Primeira semana do segundo mês após o trimestre',
    sourceUrl: 'ibge.gov.br', methodology: 'Sistema de Contas Nacionais Trimestral.',
  },
  pim: {
    full: 'Pesquisa Industrial Mensal — Produção Física',
    desc: 'Evolução do volume produzido pela indústria geral brasileira. Importante indicador antecedente da atividade.',
    firstObs: '2002-01', releaseRule: 'Primeira semana do segundo mês após referência',
    sourceUrl: 'ibge.gov.br', methodology: '~8.500 unidades locais selecionadas em 13 grandes regiões.',
  },
  pmc: {
    full: 'Pesquisa Mensal de Comércio',
    desc: 'Volume de vendas do varejo restrito e ampliado. Inclui combustíveis, supermercados, vestuário, móveis.',
    firstObs: '2000-01', releaseRule: 'Em torno do dia 13 do segundo mês após referência',
    sourceUrl: 'ibge.gov.br', methodology: 'Amostra probabilística em estabelecimentos varejistas.',
  },
  pms: {
    full: 'Pesquisa Mensal de Serviços',
    desc: 'Volume e receita do setor de serviços não financeiros.',
    firstObs: '2011-01', releaseRule: 'Em torno do dia 14 do segundo mês após referência',
    sourceUrl: 'ibge.gov.br', methodology: 'Amostra em ~13 mil empresas de serviços.',
  },
  desemp: {
    full: 'Taxa de Desocupação — PNADC',
    desc: 'Pesquisa Nacional por Amostra de Domicílios Contínua. Taxa trimestral móvel divulgada mensalmente.',
    firstObs: '2012-03', releaseRule: 'Último dia útil do mês',
    sourceUrl: 'ibge.gov.br', methodology: 'Amostra trimestral móvel de domicílios.',
  },
  caged: {
    full: 'Cadastro Geral de Empregados e Desempregados (Novo CAGED)',
    desc: 'Saldo de admissões menos desligamentos no mercado formal. Reportado pelo MTE.',
    firstObs: '1992-01', releaseRule: 'Por volta do dia 25 do mês seguinte',
    sourceUrl: 'gov.br/trabalho-e-emprego', methodology: 'Declarações eletrônicas das empresas (eSocial).',
  },
  massa: {
    full: 'Rendimento Médio Real Habitual',
    desc: 'Rendimento médio do trabalho principal, deflacionado pelo INPC. Base PNAD Contínua.',
    firstObs: '2012-03', releaseRule: 'Último dia útil do mês',
    sourceUrl: 'ibge.gov.br', methodology: 'PNAD-C, com deflação por INPC mensal.',
  },
  selic: {
    full: 'Taxa SELIC — Meta',
    desc: 'Taxa básica de juros definida a cada 45 dias pelo Copom. Principal instrumento da política monetária.',
    firstObs: '1996-06', releaseRule: '8 reuniões por ano — quartas-feiras de Copom',
    sourceUrl: 'bcb.gov.br/controleinflacao', methodology: 'Decisão do colegiado por maioria.',
  },
  cdi: {
    full: 'Certificado de Depósito Interbancário (CDI/DI)',
    desc: 'Taxa média ponderada das operações de troca de reservas entre bancos. Benchmark para renda fixa.',
    firstObs: '1986-06', releaseRule: 'Diária, ao final do pregão',
    sourceUrl: 'b3.com.br', methodology: 'Cálculo da B3 com base em operações compromissadas.',
  },
  focus: {
    full: 'Boletim Focus — Expectativa IPCA 12 meses',
    desc: 'Mediana da expectativa do mercado para o IPCA acumulado nos próximos 12 meses. Coletada pelo BCB junto a ~100 instituições.',
    firstObs: '2001-11', releaseRule: 'Segundas-feiras pela manhã',
    sourceUrl: 'bcb.gov.br/publicacoes/focus', methodology: 'Coleta diária; consolidação na sexta para divulgação na 2ª.',
  },
  ptax: {
    full: 'Taxa de Câmbio — PTAX',
    desc: 'Taxa de referência do dólar publicada pelo BCB com base em 4 janelas de consulta ao mercado.',
    firstObs: '1999-01', releaseRule: 'Diária, com fechamento por volta das 13h',
    sourceUrl: 'bcb.gov.br', methodology: 'Média das taxas das janelas de consulta a dealers.',
  },
  europtax: {
    full: 'Taxa de Câmbio Euro — PTAX',
    desc: 'Taxa de referência do Euro publicada pelo BCB, derivada do dólar PTAX e da paridade EUR/USD.',
    firstObs: '1999-01', releaseRule: 'Diária',
    sourceUrl: 'bcb.gov.br', methodology: 'Idem PTAX, via paridade.',
  },
  ibov: {
    full: 'Índice Bovespa',
    desc: 'Carteira teórica das ações mais negociadas na B3. Principal indicador do mercado acionário brasileiro.',
    firstObs: '1968-01', releaseRule: 'Tempo real durante o pregão',
    sourceUrl: 'b3.com.br', methodology: 'Carteira rebalanceada quadrimestralmente.',
  },
  ifix: {
    full: 'Índice de Fundos Imobiliários',
    desc: 'Carteira teórica de FIIs mais negociados na B3.',
    firstObs: '2012-12', releaseRule: 'Tempo real durante o pregão',
    sourceUrl: 'b3.com.br', methodology: 'Critérios de liquidez e capitalização.',
  },
  divpib: {
    full: 'Dívida Bruta do Governo Geral / PIB',
    desc: 'Estoque da dívida bruta do governo geral em proporção do PIB. Métrica fiscal observada por agências de risco.',
    firstObs: '2001-12', releaseRule: 'Estatísticas fiscais mensais — final do mês seguinte',
    sourceUrl: 'bcb.gov.br', methodology: 'Critério harmonizado com o FMI.',
  },
  primario: {
    full: 'Resultado Primário do Setor Público Consolidado',
    desc: 'Receitas menos despesas excluindo juros, em 12 meses, % do PIB. Métrica central do arcabouço fiscal.',
    firstObs: '1991-01', releaseRule: 'Final do mês seguinte',
    sourceUrl: 'bcb.gov.br', methodology: 'Consolidação Governo Central + Estados e Municípios + Estatais.',
  },
  balanca: {
    full: 'Balança Comercial — Saldo',
    desc: 'Exportações menos importações de bens, US$. Reportada pelo MDIC.',
    firstObs: '1989-01', releaseRule: 'Primeiro dia útil do mês seguinte',
    sourceUrl: 'gov.br/mdic', methodology: 'Compilação via SISCOMEX.',
  },
  contacorr: {
    full: 'Conta Corrente do Balanço de Pagamentos',
    desc: 'Saldo do balanço corrente acumulado em 12 meses, em US$ bi. Inclui bens, serviços, renda primária e secundária.',
    firstObs: '1947-12', releaseRule: 'Por volta do dia 24 do mês seguinte',
    sourceUrl: 'bcb.gov.br', methodology: 'BPM6 — Manual do FMI.',
  },
};

// ----------------------------------------------------------------------------
// SOURCE_NAMES — short institution code → full institutional name.
// Used in the dossier to expand e.g. "IBGE" → "Instituto Brasileiro de…".
// ----------------------------------------------------------------------------
window.SOURCE_NAMES = {
  IBGE:  'Instituto Brasileiro de Geografia e Estatística',
  BCB:   'Banco Central do Brasil',
  FGV:   'Fundação Getulio Vargas',
  B3:    'Brasil, Bolsa, Balcão',
  MDIC:  'Ministério do Desenvolvimento, Indústria, Comércio e Serviços',
  MTE:   'Ministério do Trabalho e Emprego',
};

// ----------------------------------------------------------------------------
// getReleases — synthesise the release-event history/forecast for one index
// across an ISO date window.
//
// Strategy: from the known `lastUpdate` and `nextRelease`, walk backwards
// (history) and forwards (future) in the index's natural cadence:
//   Mensal    → ±1 month
//   Trimestral→ ±3 months
//   Semanal   → ±7 days (encoded as 0.25 of a "month")
// Daily-frequency indices return an empty array — too noisy to render in the
// monthly grid.
//
// Each event is tagged 'R' (Realizado / past) if its date ≤ TODAY, else 'E'
// (Esperado / future). Returns: [{ iso: 'YYYY-MM-DD', kind: 'E'|'R' }, …]
// ----------------------------------------------------------------------------
window.getReleases = function(idx, fromIso, toIso) {
  const from = new Date(fromIso + 'T12:00:00').getTime();
  const to   = new Date(toIso + 'T12:00:00').getTime();
  const today = new Date(window.TODAY + 'T12:00:00').getTime();
  const out = [];

  // Daily indices would emit ~22 events per month — we skip them entirely.
  if (idx.freq === 'Diária') {
    return out;
  }

  // Anchor points: most recent release we know happened, and the next one.
  const lu = new Date(idx.lastUpdate + 'T12:00:00');
  const nr = new Date(idx.nextRelease + 'T12:00:00');

  // Cadence in "months" units. <1 means we step in days instead (weekly).
  const stepMonths = idx.freq === 'Trimestral' ? 3
                   : idx.freq === 'Semanal'    ? 0.25
                   :                              1;

  // ── Walk backwards from lastUpdate to populate history ─────────────────
  let cur = new Date(lu);
  while (cur.getTime() >= from) {
    if (cur.getTime() <= to) {
      out.push({ iso: cur.toISOString().slice(0,10), kind: cur.getTime() <= today ? 'R' : 'E' });
    }
    // Step backward — by months when cadence ≥ 1mo, else by 7-day weeks.
    if (stepMonths >= 1) cur.setMonth(cur.getMonth() - Math.round(stepMonths));
    else cur.setDate(cur.getDate() - 7);
  }

  // ── Walk forward from nextRelease to populate future expectations ──────
  cur = new Date(nr);
  while (cur.getTime() <= to) {
    if (cur.getTime() >= from) {
      out.push({ iso: cur.toISOString().slice(0,10), kind: cur.getTime() <= today ? 'R' : 'E' });
    }
    if (stepMonths >= 1) cur.setMonth(cur.getMonth() + Math.round(stepMonths));
    else cur.setDate(cur.getDate() + 7);
  }
  return out;
};

// ----------------------------------------------------------------------------
// Month-label helpers — short and long forms.
//   fmtMonthYear(d)     → "abr/26"
//   fmtMonthYearLong(d) → "abril de 2026"
// ----------------------------------------------------------------------------
window.fmtMonthYear = function(d) {
  return window.PT_MONTHS[d.getMonth()] + '/' + String(d.getFullYear()).slice(-2);
};
window.fmtMonthYearLong = function(d) {
  const m = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'][d.getMonth()];
  return m + ' de ' + d.getFullYear();
};
