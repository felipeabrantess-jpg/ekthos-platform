# Pessoas — filtros simples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar a tela Pessoas em "Quem" × "Atendimento" + "Mais filtros" (janela lateral), com os mesmos números de hoje e fechamento garantido por teste com dados reais.

**Architecture:** Só front (`web/src/pages/People.tsx` + um componente novo de janela de filtros). Nenhuma RPC, regra ou dado muda: "Quem" = `get_care_status_counts` chamada por classificação; "Atendimento" = a mesma chamada com a classificação escolhida; lista = `get_people_page`. Uma suíte de conferência só-leitura com dados reais bloqueia a publicação se qualquer número ou ordenação divergir.

**Tech Stack:** React + Vite + TanStack Query, Supabase RPC, Playwright (mock) em `web/test-*.mjs`, Node 24 para a conferência via Management API.

**Spec:** `docs/superpowers/specs/2026-10-28-pessoas-filtros-simples-design.md`

## Global Constraints

- Nenhum número muda em relação à tela atual sem filtros extras (Visitantes 757 · Membros 66 · Não classificados 4.541 · Não atendida 5.253 · Em atendimento 109 · Atendida 0 · Cancelado 2 em 28/10).
- Nenhuma migration, nenhuma escrita em dados, nenhuma Edge Function tocada.
- Coluna Contatos, STATUS (`person_care_state`), alerta 48h, CSV, unidade (corte 28/06), QR e acolhimento intocados.
- Textos: "Quem", "Atendimento", "Não atendida", "Em atendimento", "Atendida", "Cancelado", "Não atendidas", "Sem atendimento há 48h", "Mais filtros", "Aniversariantes".
- `tsc`: nenhum erro novo além da linha de base (91 em main 04c44b1).
- Publicação só com autorização do Felipe.

## Review Focus

1. Link antigo `?tab=stage:visitante` (notificações, favoritos) → abre com o filtro Etapa = Visitante ligado, não uma tela vazia. (teste na Task 3)
2. Etapa "Membro" + Quem "Visitantes" → lista vazia e números 0 coerentes, sem trocar de tela sozinho. (Task 3)
3. Trocar de unidade com filtros ligados → todos os números recalculam juntos; página volta à 1. (Task 3)
4. Ordenação decrescente na última página com empates (muitos "0 contatos") → nenhuma pessoa repetida ou faltando entre páginas. (Task 1)
5. Clicar no botão de Atendimento já escolhido → desmarca (volta a "todos"); "Sem atendimento há 48h" desmarca junto. (Task 3)

---

### Task 1: Suíte de conferência com dados reais (números + ordenação)

**Files:**
- Create: `supabase/tests/pessoas_conferencia.mjs` (a partir de `C:\Users\felip\AppData\Local\Temp\claude\fc4\conf.mjs`, já validado 36/36)

**Interfaces:**
- Produces: `SUPABASE_ACCESS_TOKEN=… node supabase/tests/pessoas_conferencia.mjs` → imprime ✅/❌ por caso e `=== X/Y batem ===`; exit 1 se Y≠X. Só leitura (cada requisição: `BEGIN; set_config(jwt admin IGV); SET LOCAL ROLE authenticated; SELECT …`, sem COMMIT).

- [ ] **Step 1:** Números: 4 unidades (`NULL`, Itaipu `dcf2852d-…`, Trindade `c90fde1a-…`, `'none'`) × classificação (`NULL`,`visitor`,`member`,`none`) × estado (`NULL`, 4 estados, `sem_contato_48h`): `botão === pessoas distintas da lista` e `linhas === distintas`; mais fechamentos `Σ Quem = Todos` e `Σ Atendimento = Quem`; mais cada etapa de `get_people_stage_counts`. Listas paginadas de 1000 em 1000; linhas sem `id` são ignoradas (a API devolve o resultado anterior quando a consulta vem vazia).
- [ ] **Step 2:** Ordenação, para `p_sort_by` ∈ {nome, telefone, atendimento, contatos, cadastro} × {asc, desc}, em Todas as unidades e Itaipu, sem filtro e com `visitor`: lista completa paginada em páginas de 50 (o tamanho da tela) sem repetidos e sem faltantes (conjunto = lista sem ordem); chave monotônica (`nome`: `name_sort`; `cadastro`: `created_at`; `contatos`: contagem de `pastoral_contact` por pessoa; `telefone`/`atendimento`: a sequência asc é a desc invertida comparando só as chaves).
- [ ] **Step 3:** Rodar contra produção (só leitura). Expected: tudo ✅. Se a ordenação falhar, PARAR e reportar ao Felipe antes da Task 2 (é defeito existente no banco, fora deste escopo de front).
- [ ] **Step 4:** Commit `test(pessoas): conferência de números e ordenação com dados reais (só leitura)`.

### Task 2: Contagens de "Quem" e de "Mais filtros" (hook)

**Files:**
- Create: `web/src/features/people/hooks/usePeopleQuemCounts.ts`

**Interfaces:**
- Consumes: `useAcolhimentoStatus(churchId, filters)` existente (mesma chamada que alimenta o STATUS hoje; retorna `{ total, naoAtendida, emAtendimento, atendida, cancelado, semContato48h, alertThresholdHours }`).
- Produces:
  - `usePeopleQuemCounts(churchId: string, base: CareCountFilters): { todos?: number; visitor?: number; member?: number; none?: number; stale: boolean }` — 4 chamadas com `classification` = undefined/visitor/member/none e o restante de `base` igual (sem estado de atendimento).
  - `useStageFilterCounts(churchId: string, base: CareCountFilters, stageKeys: string[], enabled: boolean): Record<string, number | undefined>` — `total` por etapa com os mesmos filtros; só roda com a janela aberta.
  - `CareCountFilters` = o tipo do 2º argumento de `useAcolhimentoStatus` (reexportar, não duplicar).

- [ ] **Step 1:** Implementar com `useQueries` do TanStack, chaves derivadas das do `useAcolhimentoStatus` (para compartilhar cache).
- [ ] **Step 2:** `npx tsc --noEmit -p web` → nenhum erro novo em relação a 91.
- [ ] **Step 3:** Commit.

### Task 3: Tela — Quem × Atendimento, Aniversariantes, Mais filtros

**Files:**
- Create: `web/src/features/people/components/MaisFiltrosDrawer.tsx`
- Modify: `web/src/pages/People.tsx` (abas 921–948, período 950–977, linha de filtros 979–1056, classificação 1058–1100, atendimento 1102–1144, faixa amarela 1185–1196, `clearFilters`/`activeFilterLabels` 743–766, espelho de URL 592–604)
- Test: `web/test-pessoas-tela-simples.mjs` (novo, harness de mock igual a `web/test-pessoas-contadores.mjs`)

**Interfaces:**
- Consumes: Task 2.
- Produces: `MaisFiltrosDrawer({ open, onClose, value: MaisFiltros, onChange, stages: {stage_key,name}[], stageCounts: Record<string,number|undefined>, unitTotal })` com `MaisFiltros = { stageKey?: string; source?: string; createdFrom?: string; createdTo?: string; role?: RoleFilter; birthMonth?: number; tagId?: string }`.

Comportamento (decidido no spec §5, §6, §12):
- Topo: "Aniversariantes" (ícone de presente) ao lado do seletor de unidade → abre a visão de aniversariantes **exatamente como a aba Aniversários de hoje** (mesma lista, cards de contato, `birthMonth` do mês); o número do botão = `stageCounts.aniversarios` (o mesmo de hoje).
- "Quem": Todos · Visitantes · Membros · Não classificados com números de `usePeopleQuemCounts` (testids `classificacao-todas|visitor|member|none` mantidos).
- "Atendimento": Não atendida (com "⚠ N sem atendimento há 48h") · Em atendimento · Atendida · Cancelado, números de `careStatusData` (testids `estado-*` mantidos); clicar no escolhido desmarca. Com "Não atendida" escolhida: "Mostrar: Não atendidas N | Sem atendimento há 48h N" (`sem_contato_48h`, testid `alerta-sem-contato`).
- Linha: busca · "Mais filtros" (com contador de filtros ligados) · CSV. Abaixo: chips removíveis dos filtros ligados + "Limpar filtros".
- Saem: abas, botões de período, select Contato, bloco "Classificação (total da unidade)", bloco Alerta, faixa amarela, auto-troca de aba por incompatibilidade (`isCompatible`/`selectTab`).
- URL: `?etapa=<stage_key>` novo; `?tab=stage:x` e aliases antigos convertem para `etapa=x`; `?tab=aniversarios` abre Aniversariantes; demais chaves (`cls`, `estado`, `origem`, `de`, `ate`, `funcao`, `q`, `pagina`, `ordem`, `dir`) inalteradas; `contato` deixa de ser lido.

- [ ] **Step 1: Testes (falham):** em `test-pessoas-tela-simples.mjs`, com mock de contagens fechando (Todos 349 = 325+21+3; Visitantes 325 = 250+74+0+1; 48h 249):
  - sem abas de etapa e sem "Classificação (total da unidade)", sem faixa amarela, sem `filtro-contato`;
  - "Mais filtros" fechado por padrão (nenhum nome de etapa visível); abre e fecha no ✕;
  - Quem mostra 349/325/21/3; clicar Visitantes → Atendimento 250/74/0/1 e soma = 325;
  - clicar Não atendida → aparece "Não atendidas 250 | Sem atendimento há 48h 249"; escolher 48h → chamada `get_people_page` com `p_care_status='sem_contato_48h'`; clicar Não atendida de novo → desmarca tudo;
  - Etapa "Novo Convertido" na janela → chip "Etapa: Novo Convertido ✕" + `p_stage_key='novo_convertido'` em lista e contagens; remover chip limpa;
  - `?tab=stage:visitante` abre com chip "Etapa: Visitante";
  - Etapa Membro + Visitantes → lista vazia, Visitantes 0, sem trocar de tela;
  - trocar unidade com filtro ligado → todas as contagens re-chamadas com a nova unidade, `pagina` some da URL;
  - Aniversariantes → mesma visão de hoje (texto "Aniversariantes de outubro", cards de contato).
- [ ] **Step 2:** Rodar → falha.
- [ ] **Step 3:** Implementar `MaisFiltrosDrawer` (painel lateral à direita, sobreposto, fecha em ✕/Esc/clique fora; lista de etapas da igreja com números, Origem, Cadastro de/até, Função, Mês de aniversário, Etiqueta) e a reorganização em `People.tsx`.
- [ ] **Step 4:** Rodar o teste novo → passa.
- [ ] **Step 5:** Commit.

### Task 4: Regressão completa

**Files:**
- Modify: testes existentes que dependem de abas/filtro Contato/faixa: `web/test-pessoas-filtros.mjs`, `web/test-pessoas-contadores.mjs`, `web/test-pessoas-classificacao.mjs`, `web/test-pessoas-contexto.mjs`, `web/test-pessoas-paginacao.mjs`, `web/test-pessoas-ordenacao.mjs`, `web/test-pessoas-outras-unidades.mjs`, `web/test-pessoas-csv.mjs` (só os passos que clicam em abas/Contato passam a usar a janela "Mais filtros"; as asserções de números ficam iguais).

- [ ] **Step 1:** Rodar todos os `web/test-pessoas-*.mjs`, `web/test-atendimento-*.mjs` e `web/test-ministerios-*.mjs` contra o dev server da branch; ajustar apenas a navegação; nenhuma asserção de número pode ser alterada.
- [ ] **Step 2:** `npx tsc --noEmit -p web` (≤ 91, nenhum novo em arquivos tocados) e `npm --prefix web run build` OK.
- [ ] **Step 3:** `node supabase/tests/pessoas_conferencia.mjs` → tudo ✅.
- [ ] **Step 4:** Homologação local com dados reais (`homolog` apontando para a branch): para Todas/Itaipu, anotar Quem/Atendimento da tela nova e comparar com a tela atual (main) — números idênticos; screenshot.
- [ ] **Step 5:** Commit, push e PR (sem merge) com resultados.
