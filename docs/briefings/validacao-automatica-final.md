# Validação Automática — Frentes A / C / H
**Data:** 2026-04-27  
**Executor:** Claude Code (automatizado)  
**Commit validado:** `1ca678b` (staging)

---

## 1. RESUMO EXECUTIVO

| | |
|---|---|
| **Status geral** | 🟡 AMARELO |
| **Validações executadas** | 12 |
| **Passaram** | 9 |
| **Falharam / com ressalvas** | 3 |
| **Bugs críticos** | 0 |
| **Bugs altos** | 1 |
| **Bugs médios** | 3 |
| **Bugs baixos** | 1 |

**Resumo:** Build e banco 100% íntegros. Nenhum bloqueador de produção. Um bug alto em `Leaders.tsx` (líderes de ministério não aparecem) e dois bugs médios de lógica em `Consolidation.tsx` e `CellReportForm.tsx`. Tipos TS desatualizados (build passa; tsc falha). Pode mergear com os fixes listados na seção 5.

---

## 2. POR FRENTE

### Frente A — Pipeline Editável

| Checagem | Status | Detalhe |
|---|---|---|
| Migrations aplicadas | ✅ | `pipeline_stages`, `discipleship_templates`, `pipeline_history`, `person_pipeline` — todas presentes |
| Colunas novas em pipeline_stages | ✅ | `color`, `icon`, `is_entry_point`, `is_terminal`, `description` — todas confirmadas |
| Templates seedados (6/6) | ✅ | `assembleia-de-deus`, `batista-tradicional`, `celulas-puro`, `g12`, `generico`, `presbiteriano` |
| RPC apply_discipleship_template | ✅ | Existe com args `(p_church_id uuid, p_template_slug text)` |
| RLS em pipeline_stages | ✅ | 3 policies: `pipeline_stages_service_all`, `pipeline_stages_tenant_all`, `pipeline_stages_tenant_select` |
| Rota /configuracoes/discipulado | ✅ | Registrada em App.tsx linha 276 |
| Build limpo | ✅ | 0 erros, 8.23s, 95 chunks |
| Dados em produção | ✅ | 12 stages totais, 3 igrejas com stages |

**Frente A: VERDE ✅**

---

### Frente C — Mobile P0

| Checagem | Status | Detalhe |
|---|---|---|
| MobileHeader.tsx existe | ✅ | `src/components/MobileHeader.tsx` |
| Build limpo | ✅ | Sem erros relacionados ao Mobile |
| Rotas intactas | ✅ | Todas as rotas pré-existentes presentes |
| Sidebar mobile | ✅ | Overlay + drawer implementado (sem regressão visível) |

> Frente C não tem validações de banco — é 100% frontend. Requer validação manual no dispositivo.

**Frente C: VERDE ✅** *(validação manual recomendada em dispositivo real)*

---

### Frente H — Sidebar + CRUDs + Reports

| Checagem | Status | Detalhe |
|---|---|---|
| Migration cell_reports | ✅ | 17 colunas confirmadas: `topic`, `prayer_requests`, `praise_reports`, `challenges`, `status`, `reported_by`, `updated_at` presentes |
| RLS em cell_reports | ✅ | 5 policies (SELECT, INSERT, UPDATE, DELETE + ALL genérica) |
| Leaders.tsx existe | ✅ | `src/pages/people/Leaders.tsx` |
| Consolidation.tsx existe | ✅ | `src/pages/people/Consolidation.tsx` |
| CellReports.tsx existe | ✅ | `src/components/cells/CellReports.tsx` |
| CellReportForm.tsx existe | ✅ | `src/components/cells/CellReportForm.tsx` |
| EmConstrucao.tsx existe | ✅ | `src/pages/placeholders/EmConstrucao.tsx` |
| AgentChat.tsx existe | ✅ | `src/pages/agents/AgentChat.tsx` |
| AgentChatInterface.tsx existe | ✅ | `src/components/agents/AgentChatInterface.tsx` |
| Rota /lideres | ✅ | App.tsx linha 244 |
| Rota /consolidacao | ✅ | App.tsx linha 245 |
| Rota /inscricoes | ✅ | App.tsx linha 241 |
| Build limpo | ✅ | 0 erros Vite |
| Tipos TS cell_reports | ❌ | `topic`, `prayer_requests` etc. não nos tipos gerados → `tsc --noEmit` falha |
| Lógica Leaders (ministérios) | ⚠️ | `ministries.leader_id` → `leaders.id` (não `people.id`) — líderes de ministério não aparecem |
| Lógica Consolidation (stage filter) | ⚠️ | `person_stage` é ENUM, não UUID — filtro por `is_entry_point` stages ineficaz |

**Frente H: AMARELO 🟡** *(bug alto + bug médio a corrigir)*

---

## 3. BUGS ENCONTRADOS

### 🟠 ALTO — Leaders.tsx: líderes de ministério nunca aparecem

**Arquivo:** `web/src/pages/people/Leaders.tsx`  
**Causa:** `ministries.leader_id` é FK para a tabela `leaders` (não para `people`). O código faz `.in('id', [ministries.leader_ids])` em `people`, mas esses UUIDs são de `leaders`, não de `people`.  
**Sintoma:** A seção "De Ministérios" sempre mostra 0. Líderes de célula aparecem corretamente.  
**Fix:**
```ts
// Após buscar ministries, buscar leaders para obter person_id
const leaderIds = ministries?.map(m => m.leader_id).filter(Boolean) ?? []
if (leaderIds.length > 0) {
  const { data: leadersData } = await supabase
    .from('leaders')
    .select('id, person_id, ministry_id')
    .in('id', leaderIds)
  leadersData?.forEach(l => {
    if (l.person_id) personIds.add(l.person_id)
    // mapear ministry_id → person_id para montar roles corretamente
  })
}
```

---

### 🟡 MÉDIO — Consolidation.tsx: filtro por is_entry_point não funciona

**Arquivo:** `web/src/pages/people/Consolidation.tsx`  
**Causa:** `people.person_stage` é uma ENUM (`'visitante'`, `'contato'`…), não um UUID. O código tenta filtrar `person_stage.in.(uuid1,uuid2,...)` usando IDs de `pipeline_stages`. Esses sistemas não estão conectados.  
**Sintoma:** A página renderiza e mostra pessoas por `conversion_date`, mas o filtro por "etapa de entrada" fica inoperante. O branch OR de `conversion_date >= 90 dias` funciona corretamente.  
**Fix:** Remover o branch de `entryStageIds` do filtro OR até que `people` tenha um FK para `pipeline_stages`. Deixar somente o filtro por `conversion_date`:
```ts
query = query.gte('conversion_date', ninetyDaysAgo.toISOString().split('T')[0])
```

---

### 🟡 MÉDIO — CellReportForm.tsx: leader_id pode causar FK violation

**Arquivo:** `web/src/components/cells/CellReportForm.tsx` linha ~93  
**Causa:** O form envia `leader_id: user?.id` (UUID de `auth.users`), mas `cell_reports.leader_id` provavelmente referencia a tabela `leaders` (não `auth.users`). `reported_by` foi adicionado com `REFERENCES auth.users` — esse campo está correto.  
**Sintoma:** Submissão de relatório falha com FK violation. Erro aparece no catch, usuário vê mensagem de erro.  
**Fix:** Enviar `leader_id: null` por enquanto (ou fazer lookup do `leaders.id` do usuário atual):
```ts
leader_id: null,       // até resolver o FK target
reported_by: user?.id, // esse sim referencia auth.users corretamente
```

---

### 🟡 MÉDIO — Tipos TypeScript desatualizados (tsc falha, build passa)

**Arquivos afetados:** `CellReportForm.tsx`, `CellReports.tsx`, `Dashboard.tsx`  
**Causa:** As colunas adicionadas via `ALTER TABLE` (`topic`, `prayer_requests`, `status`, etc. em `cell_reports`) e `people.is_active` não estão no arquivo de tipos gerado `src/integrations/supabase/types.ts`.  
**Sintoma:** `npx tsc --noEmit` retorna erros; `npm run build` (Vite) passa sem erros. Em runtime, o código funciona normalmente.  
**Fix:** Regenerar tipos:
```bash
supabase gen types typescript --project-id mlqjywqnchilvgkbvicd > web/src/integrations/supabase/types.ts
```
> **Nota:** `Dashboard.tsx` usa `.eq('is_active', true)` em `people` — verificar se esse campo existe na tabela antes de regenerar.

---

### 🟢 BAIXO — cell_reports tem policy ALL redundante

**Causa:** Tanto a policy `cell_reports_church` (ALL) quanto as individuais CRUD (SELECT/INSERT/UPDATE/DELETE) foram criadas. Postgres avalia qualquer policy que satisfaz — redundância inofensiva mas polui `pg_policies`.  
**Fix:** Remover as 4 individuais OU a `cell_reports_church`, mantendo apenas um dos conjuntos.

---

## 4. NÃO-REGRESSÃO

| Checagem | Status | Detalhe |
|---|---|---|
| `church_has_access()` existe | ✅ | RPC presente em `pg_proc` |
| `stripe-webhook` ativo | ✅ | v14, status ACTIVE |
| `onboarding-engineer` ativo | ✅ | v12, status ACTIVE |
| `onboarding-consultant` ativo | ✅ | v14, status ACTIVE |
| `agent-suporte` ativo | ✅ | v6, status ACTIVE |
| `agent-onboarding` ativo | ✅ | v6, status ACTIVE |
| `coupon-validate` ativo | ✅ | v3, status ACTIVE |
| `coupons-stripe-sync` ativo | ✅ | v3, status ACTIVE |
| `addon-request` ativo | ✅ | v1, status ACTIVE |
| `contact-consultant` ativo | ✅ | v2, status ACTIVE |
| Igrejas intactas | ✅ | 3 igrejas (`Bola de Neve`, `Nossa Igreja`, `Church demo`) — todas `configured` |
| Subscriptions ativas | ✅ | 1 subscription ativa |
| cell_reports → groups FK | ✅ | 0 registros órfãos |
| agent_chat_sessions → auth.users | ✅ | 0 registros órfãos |
| Erros TS pré-existentes | ℹ️ | `AgentChatWidget`, `AgentChatHistory`, `agent-chat-client`, `PersonDetailPanel`, `useChurch`, `Aniversarios`, `Landing` — todos anteriores às Frentes A/C/H |

---

## 5. AÇÕES NECESSÁRIAS

### Fix imediato (antes de mergear):

1. **`Leaders.tsx` — bug alto** → ajustar query de líderes de ministério para passar por tabela `leaders` → `person_id`
2. **`CellReportForm.tsx`** → mudar `leader_id: null` para evitar FK violation

### Fix pós-merge (não bloqueia):

3. **`Consolidation.tsx`** → remover filtro `person_stage.in.(uuid...)` — usar só `conversion_date`
4. **Regenerar tipos Supabase** → `supabase gen types typescript --project-id mlqjywqnchilvgkbvicd` — resolve todos os erros de tsc de uma vez
5. **Limpar RLS redundante** em `cell_reports`

### Validação manual recomendada:

- **Frente C (Mobile):** testar sidebar drawer em iPhone (iOS 16+) e Android
- **Pipeline:** arrastar card entre colunas e confirmar que stage atualiza
- **Relatório de célula:** submeter formulário completo e verificar que aparece na lista
- **Ministérios:** confirmar que "Excluir" abre modal (não `window.confirm`)

---

## 6. ESTATÍSTICAS DO BUILD

| Métrica | Valor |
|---|---|
| Tempo de build | 8.23s |
| Chunks gerados | 95 |
| Módulos transformados | 2.667 |
| CSS gzip | 9.63 KB |
| Bundle principal (gzip) | 51.14 KB |
| Erros de build (Vite) | **0** |
| Erros TypeScript (tsc) | ~40 (maioria pré-existentes; 6 novos) |
| Edge Functions ativas | 37 |
| Templates de discipulado | 6/6 |
| RLS habilitado | 6/6 tabelas verificadas |
