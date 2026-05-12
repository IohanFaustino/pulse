# API-extractor — Documentação de estrutura

Workspace para consultar e extrair indicadores econômicos brasileiros (IPCA, SELIC, CDI, IGP-M, PIB, PTAX, Ibovespa, e outros). pt-BR. Tema finance-blue com navy escuro como acento principal e cinza-grafite (quase preto) para destaque ativo.

---

## 1. Estrutura geral

```
App
├── Sidebar               (navegação entre páginas + recentes)
└── Main
    ├── Painel
    ├── Índices
    ├── Calendário
    └── Metadados
```

Arquivos:

| Arquivo                    | Papel                                                |
| -------------------------- | ---------------------------------------------------- |
| `Painel.html`              | Entry point — carrega React, Babel e todos os scripts |
| `src/data.js`              | 25 índices fictícios + helpers de formatação         |
| `src/data-meta.js`         | Metadados editorializados + cálculo de divulgações   |
| `src/transforms.js`        | Catálogo de transformações por grupo                 |
| `src/styles.css`           | Estilos globais (paleta finance-blue)                |
| `src/app.jsx`              | Roteamento (state `page`)                            |
| `src/sidebar.jsx`          | Sidebar + toggle colapsar                            |
| `src/painel.jsx`           | Página Painel                                        |
| `src/indices.jsx`          | Página Índices                                       |
| `src/calendario.jsx`       | Página Calendário                                    |
| `src/metadata.jsx`         | Página Metadados                                     |
| `src/card.jsx`             | Card de índice (usado em Índices)                    |
| `src/calendar.jsx`         | Strip de 14 dias usada no Painel                     |
| `src/category-toggle.jsx`  | Toggle horizontal expansível                         |
| `src/transform-modal.jsx`  | Modal de transformações                              |

---

## 2. Sidebar

Faixa fixa de 240px à esquerda (colapsa para 68px).

**Elementos (de cima para baixo):**

1. **Botão de toggle** — botão circular branco em cima/direita, chevron gira 180° ao colapsar
2. **Brand** — "índices•" em serif italic + sub "workspace pessoal"
3. **Nav** — 4 itens: Painel · Índices · Calendário · Metadados
   - Cada item: dot + label (serif) + hint (texto pequeno)
   - **Ativo:** fundo gradient grafite-preto (`#050505 → #1F2530`), barra-acento sky `#6FB8FF` à esquerda, item desloca 6px à direita
   - **Hover:** fundo `rgba(255,255,255,0.06)` + dot em sky-blue
4. **Recentes** — atalhos para últimos índices consultados (IPCA, SELIC, PTAX)
5. **Footer** — dot pulsante + "sincronizado · agora"

Quando colapsada: labels/hints/recentes-when somem com fade; dots e ícones permanecem.

---

## 3. Painel (visão macro)

Página de entrada — **curadoria pessoal**. Mostra **apenas os índices fixados**. O usuário monta seu dashboard fixando itens da página Índices.

**Elementos:**

1. **Saudação** — "Bom dia." + data corrente em pt-BR
2. **Linha de status** — `N índices com divulgação hoje · X esta semana · K índices fixados`
3. **Toggle de categoria** — pílula escura "Mostrando · Todos ›". Ao clicar, expande horizontalmente com chips animados em cascata (Todos / Inflação / Atividade / Trabalho / Juros / Câmbio / Mercado / Fiscal / Externo)
4. **Grade de small-multiples** (apenas fixados) — quando "Todos", agrupada por categoria com título; quando filtrada, grade única
   - Cada small-multiple: código + fonte / sparkline / valor atual + delta
   - **Botão desfixar** (estrela dourada à direita, aparece no hover): remove o card do Painel e devolve à página Índices
   - **Botão modificar** (ícone discreto à esquerda, aparece no hover): abre modal de transformação
   - **Badge de transformação** abaixo do delta quando há transformação ativa
5. **Empty state** — quando nada está fixado, mensagem convidando a ir até a página Índices e fixar séries
6. **Calendário de divulgações** — strip horizontal dos próximos 14 dias com índices esperados em cada coluna (escopo: fixados; cai para todos quando nenhum está fixado)

---

## 4. Índices (catálogo)

Catálogo dos índices **ainda não fixados** — a fonte de itens para o Painel. Fixar um índice aqui o move para o Painel; desfixar lá o traz de volta.

**Elementos:**

1. **Greeting** — "Catálogo dos índices ainda não fixados. Use a estrela para adicionar ao Painel."
2. **Busca** — filtro em tempo real por código ou nome
3. **Tabs** — Todos / por categoria (a aba "Fixados" não existe mais — eles vivem no Painel)
4. **Grade de cards** — cards densos com:
   - **Estrela** — fixar (envia ao Painel)
   - Código (serif) + nome
   - Valor atual grande
   - Delta colorido (semântica financeira: vermelho = piora, verde = melhora)
   - Sparkline ambiente
   - Fonte · frequência · última atualização
5. **Empty state** — "Todos os índices estão fixados no Painel" quando o catálogo for esvaziado

Clicar em um card abre o workspace single-index (stub).

---

## 5. Calendário (página)

Calendário mensal completo de divulgações.

**Elementos:**

1. **Greeting** + legenda E/R
2. **Barra de navegação** — ‹ Mês ›, botão "Hoje", contadores de R/E no mês
3. **Filtros por categoria** — chips pílula
4. **Grade do mês** — 7 colunas (dom→sáb)
   - Células com data + chips de eventos (até 6, "+N" se exceder)
   - **E** (esperado, verde): divulgações futuras
   - **R** (realizado, vermelho): divulgações já ocorridas
   - Cor do código do chip varia por categoria
   - Hoje: borda navy + número sky
   - Fim-de-semana: sutilmente esmaecido
5. **Nota** — índices diários (CDI, PTAX, Ibov, IFIX) ficam fora

---

## 6. Metadados (dossiês)

Consulta detalhada da ficha técnica de cada índice.

**Elementos:**

1. **Greeting**
2. **Toolbar** — busca + chips de categoria
3. **Layout em duas colunas:**
   - **Esquerda (sticky):** lista de índices filtrada (código + categoria)
   - **Direita:** dossier
4. **Dossier** contém:
   - Cabeçalho: código grande (navy) + nome completo + chip de categoria
   - Descrição editorial
   - Grid de campos: Fonte · Frequência · Unidade · Primeira observação · Última divulgação · Próxima divulgação (destacada em navy) · Calendário · Metodologia · Site oficial
   - Snapshot: valor atual (hero em navy) + sparkline

---

## 7. Modal de transformação

Disparado pelo botão "modificar" em cada small-multiple do Painel.

**Estrutura:**
- Cabeçalho: kicker "Transformação" + código + nome do índice
- Lede explicando o escopo
- Grupos de opções (radio):
  - **Série original** — nível, dessazonalizado, ajuste de calendário
  - **Variação** — MoM, QoQ, YoY, anualizada, primeira diferença, log-diff, p.p.
  - **Suavização** — médias móveis 3/6/12, EWMA
  - **Janelas** — acumulado 12m, desvio-padrão 12m
  - **Normalização** — rebase=100, z-score, percentil
- Rodapé: Cancelar / Aplicar transformação

---

## 8. Paleta e tipografia

**Cores principais:**

| Token            | Hex        | Uso                                    |
| ---------------- | ---------- | -------------------------------------- |
| `--bg`           | `#F2F5FA`  | Fundo da aplicação                     |
| `--bg-deep`      | `#E6ECF5`  | Tons mais densos                       |
| `--surface`      | `#FFFFFF`  | Cards, modais                          |
| `--ink`          | `#0B1730`  | Tipografia principal                   |
| `--accent`       | `#1E4FBF`  | Cobalto — ação primária                |
| `--accent-2`     | `#2C7BE5`  | Azure — destaque secundário            |
| `--accent-3`     | `#4FA3E0`  | Sky — acento suave                     |
| `--navy`         | `#0B2F66`  | Navy profundo (headers e hero numérico) |
| Grafite          | `#050505`–`#1F2530` | Fundo da sidebar (item ativo)  |
| `--up` / `--down`| `#1D7A55` / `#C04050` | Semântica financeira         |

**Tipografia:**
- **Serif (Instrument Serif)** — hero numbers, códigos de índice, labels da nav
- **Sans (IBM Plex Sans)** — UI, body, textos curtos
- **Mono (IBM Plex Mono)** — deltas, badges, links de fonte

---

## 9. Convenções de motion

- **Sidebar collapse:** 320ms cubic-bezier(.2,.7,.2,1) na grid-template-columns + opacidades em cascata
- **Toggle horizontal:** chevron rotaciona 90°, chips entram com delay escalonado (~18ms/item)
- **Item de nav ativo:** gradient expand de scaleX(0.85) → 1, padding-left 10 → 16
- **Modal:** scrim fade-in 160ms, card translateY(8px)+scale(0.98) → 0 em 220ms
- **Pulse de sincronização:** opacidade 1 ↔ 0.45 em 2.4s loop
