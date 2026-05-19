# Auditoria de Estado de Produção — Ekthos Church
**Data:** 2026-05-03 (tarde/noite — pós-sessão maratona 02–03/05/2026)**  
**Auditor:** Claude Code (subagentes Haiku + Playwright)  
**Projeto Supabase:** `mlqjywqnchilvgkbvicd`  
**Escopo:** Schema/dados (Áreas 1+2), RPCs/funções (Área 2), Edge Functions/Seeds (Áreas 3+7), UI/fluxos (Área 4), Dívida técnica/segurança (Áreas 5+6)  
**Metodologia:** Leitura. Nenhuma modificação realizada. Nenhum commit. Nenhum push.

---

## Resumo Executivo

Auditoria pós-maratona revelou **6 achados críticos** e **7 importantes**. O PASSO 7.5 (tela de canais do pastor) está funcional e renderizando corretamente. Os bugs A e B das RPCs foram corrigidos com sucesso. O principal risco imediato é a **ANON_KEY com `\n` trailing** que quebra o Realtime/WebSocket em toda a aplicação, e **duas tabelas operacionais sem RLS** que expõem dados a qualquer usuário autenticado.

---

## Tabela de Achados

| # | Área | Severidade | Descrição | Arquivo / Tabela |
|---|------|-----------|-----------|-----------------|
| C1 | DB | **CRÍTICO** | `channel_dispatch_queue` sem RLS — dados de fila de mensagens expostos a todos os autenticados | `channel_dispatch_queue` |
| C2 | DB | **CRÍTICO** | `visitor_capture_rate_limits` sem RLS — dados de rate limit expostos | `visitor_capture_rate_limits` |
| C3 | DB | **CRÍTICO** | `admin_events` + `admin_tasks` têm `rowsecurity=true` mas **0 policies** — bloqueia tudo (inclusive admins via app) | `admin_events`, `admin_tasks` |
| C4 | UI | **CRÍTICO** | `VITE_SUPABASE_ANON_KEY` tem `\n` trailing no Vercel — WebSocket/Realtime falha em todo o app (URL mostra `%0A` no apikey) | Vercel env var |
| C5 | EF | **CRÍTICO** | CORS `'*'` em `agent-acolhimento` — função com `verify_jwt: false` acessível por qualquer origem | `supabase/functions/agent-acolhimento/index.ts:50` |
| C6 | EF | **CRÍTICO** | `error.message` exposto em responses HTTP de 4 EFs admin (vaza schema SQL, stack traces) | `admin-notes-crud`, `admin-churches-list`, `admin-events-list`, `admin-tasks-crud` |
| I1 | DB | **IMPORTANTE** | `subscription_agents`: 8 de 12 linhas sem `activated_at` — rastreabilidade de ativação incompleta | `subscription_agents` |
| I2 | DB | **IMPORTANTE** | 3 de 4 igrejas sem `subscription` ativa no banco — `church_demo` e `Bola de Neve` sem billing funcional | `subscriptions` |
| I3 | DB | **IMPORTANTE** | Igreja "Bola de Neve" tem subscription ativa mas **zero profiles** — ninguém consegue logar | `profiles`, `churches` |
| I4 | RPC | **IMPORTANTE** | `is_ekthos_admin()` e `auth_church_id()` usam `auth.jwt()` em vez de `auth.uid()` — desvio da Decisão 57 | `is_ekthos_admin`, `auth_church_id` |
| I5 | RPC | **IMPORTANTE** | 15 funções SECURITY DEFINER sem `SET search_path = public` — vulneráveis a search_path injection | múltiplas RPCs |
| I6 | RPC | **IMPORTANTE** | `grant_access()` usa string hardcoded `'system'` como `actor_id` no audit log — não rastreável | `grant_access` RPC |
| I7 | DB | **IMPORTANTE** | `upsert_session_token` RPC não existe (404) — feature de session token quebrada em toda a app | RPC inexistente |
| INF1 | EF | Informativo | 5 de 7 agentes no catálogo sem prompt template no banco — fallback hardcoded funciona, mas viola rastreabilidade | `agent_prompt_templates` |
| INF2 | DB | Informativo | "Igreja de Teste — Mock" sem subscription e `ultimo_plano: null` — dados inconsistentes de ambiente de teste | `churches`, `subscriptions` |
| INF3 | DB | Informativo | Divergência de canais: "Igreja de Teste — Mock" tem 3 registros legacy em `church_channels`, zero em `church_whatsapp_channels` | `church_channels` |
| INF4 | Code | Informativo | 5 TODOs no codebase — todos de roadmap futuro, nenhum crítico | `Celulas.tsx`, `admin-cockpit-metrics`, `dispatch-person-event`, `visitor-capture`, `message-enqueue` |

---

## Área 1 — Banco de Dados: Schema e Dados

### Achados

**[C1] `channel_dispatch_queue` sem RLS**  
Tabela de fila de despacho de mensagens não tem `rowsecurity = true`. Qualquer usuário autenticado pode `SELECT`, `INSERT`, `UPDATE` e `DELETE` diretamente via API REST do Supabase, sem nenhuma verificação de `church_id`.

**[C2] `visitor_capture_rate_limits` sem RLS**  
Mesma situação. Tabela operacional de rate limiting exposta.

**[C3] `admin_events` e `admin_tasks` com 0 policies**  
`rowsecurity = true` está ativo, porém nenhuma policy foi criada. No PostgreSQL isso bloqueia **100% dos acessos**, inclusive os legítimos de admin. Qualquer `INSERT` via frontend admin falha silenciosamente.

**[I1] `subscription_agents.activated_at` nulo em 8/12 linhas**  
Das 12 linhas na tabela, apenas 4 têm `activated_at` preenchido. As outras 8 têm `NULL`. Impossível saber quando o agente foi ativado para SLA, billing e auditoria.

**[I2] 3 de 4 igrejas sem subscription ativa**  
Apenas "Nossa Igreja" tem `subscriptions.status = 'active'`. Igrejas `church_demo` (avivamento) e "Bola de Neve" (missao) não têm subscription ativa — controle de acesso por plano está quebrado para elas.

**[I3] "Bola de Neve" sem profiles**  
`church_id = a07a054b-3982-4163-a9ef-c0f173126f3e` — church existe, subscription existe (plan: missao), mas `profiles` tem 0 registros para essa church. Nenhum usuário consegue acessar o sistema.

**[I7] `upsert_session_token` 404**  
A RPC `upsert_session_token` não existe no banco. Todo carregamento de página gera 4 erros 404 no console. Feature de session token está completamente quebrada.

---

## Área 2 — RPCs e Funções Banco

### Achados

**[I4] `auth.jwt()` em vez de `auth.uid()`**  
As funções utilitárias `is_ekthos_admin()` e `auth_church_id()` buscam o claim via `auth.jwt() ->> 'app_metadata'` em vez de usar `auth.uid()` combinado com `auth.users`. Desvio da Decisão 57, que padronizou `auth.uid()`. Em teoría, `auth.jwt()` pode ser obsoleto/stale enquanto `auth.uid()` é always-fresh.

**[I5] 15 funções SECURITY DEFINER sem `SET search_path`**  
Levantamento identificou 15 funções `SECURITY DEFINER` que não têm `SET search_path = public`. Em ambientes comprometidos, um schema malicioso poderia ser injetado na search_path e executado com privilégios elevados.

**[I6] `grant_access()` com actor_id hardcoded**  
A RPC `grant_access()` registra ação no audit_log com `actor_id = 'system'` (string literal). Em logs de compliance isso aparece como "sistema" em vez do UUID real do admin que executou a ação.

**Positivo confirmado:**  
- Bugs A (42702 ambiguity) e B (`profiles.id` → `profiles.user_id`) corrigidos nas migrations 000001–000003. RPCs `list_church_channels` e `list_church_whatsapp_channels` retornam dados corretamente para pastores.
- Total de 41 RPCs SECURITY DEFINER auditadas — nenhuma com Bug A ou B remanescente.

---

## Área 3 — Edge Functions

### Achados

**[C5] CORS `'*'` em `agent-acolhimento`**  
```typescript
// agent-acolhimento/index.ts:50
const CORS = {
  'Access-Control-Allow-Origin': '*',
  // ...
}
```
Todas as outras EFs usam `ALLOWED_ORIGIN` com domínio restrito. Esta função é exception. Combinado com `verify_jwt: false`, qualquer origem pode chamar a EF.

**[C6] `error.message` em respostas HTTP**  
4 EFs retornam `{ error: error.message }` diretamente em respostas 500. Embora protegidas por JWT manual, o anti-pattern pode vazar informações do schema ou stack traces para clientes autenticados.

| EF | Linhas afetadas |
|----|----------------|
| `admin-notes-crud` | 69, 92, 109 |
| `admin-churches-list` | 79 |
| `admin-events-list` | 73 |
| `admin-tasks-crud` | 75, 100, 127, 143 |

**Fix recomendado:** Criar helper `jsonError(status)` que sempre retorna `{ error: 'Operação não foi possível' }` sem expor `error.message`.

**Positivos confirmados:**  
- 35 EFs com `verify_jwt: false` todas têm validação JWT manual interna + comentário explicativo.
- Nenhum token/secret hardcoded. Todos via `Deno.env.get()`.
- Nenhuma interpolação de variável em SQL — 100% prepared statements via SDK.
- `provision-whatsapp-channel` legacy removida corretamente (apenas `provision-channel` existe).

---

## Área 4 — UI / Fluxos (Playwright)

### Achados

**[C4] `VITE_SUPABASE_ANON_KEY` com `\n` trailing**  
URL WebSocket capturada no console:
```
wss://mlqjywqnchilvgkbvicd.supabase.co/realtime/v1/websocket
  ?apikey=sb_publishable_-X0LP_4SrWjuC-WdE5Gdlw_ZqkxxuY1%0A&vsn=2.0.0
```
O `%0A` no final é newline URL-encoded, indicando que o valor da env var no Vercel tem um `\n` trailing. Isso causa falha de autenticação em **todas** as conexões WebSocket/Realtime do app.

**[I7] `upsert_session_token` 404 (confirmado UI)**  
4 erros 404 por navegação — consistente em todas as páginas testadas (`/configuracoes/canais`, `/agents`, `/admin/cockpit`).

**Positivos confirmados (PASSO 7.5):**  
- `/configuracoes/canais` renderiza corretamente: card Z-API visível com provider, status "Pendente", número `+55 21 99309-2146`, instance ID `3F2…`, e agente roteado "Reengajamento".
- Banner de impersonação admin aparece corretamente quando em modo de visualização.
- Sidebar de Configurações mostra tab "Canais" ativa e navegável.
- `/admin/cockpit` acessível com sidebar admin completo (Cockpit, Leads, Igrejas, Onboardings, Tarefas, Receita, Pricing, Afiliados, Comunicação, Ativações).

---

## Área 5 — Dívida Técnica

### Achados

**Positivos (zero problemas detectados):**
- **Código morto:** 0 componentes não importados em `web/src/components/`.
- **Rotas comentadas:** 0 em `web/src/App.tsx`.
- **`console.log` em produção:** 0 instâncias em `web/src/**/*.{ts,tsx}`.
- **Imports órfãos:** Nenhum detectado na amostragem.

**[INF4] TODOs/FIXMEs:**  
5 comentários no codebase, todos de roadmap futuro ou refatoração técnica planejada. Nenhum crítico.

| Arquivo | TODO |
|---------|------|
| `web/src/pages/Celulas.tsx:7` | Relatórios → placeholder Fase 3 |
| `supabase/functions/admin-cockpit-metrics/index.ts:230` | `agent_errors: 0` — aguarda logs de agentes |
| `supabase/functions/dispatch-person-event/index.ts:357` | Frente N v3 (versões futuras) |
| `supabase/functions/visitor-capture/index.ts:29` | Refatorar injeção de `sendTextMessage` |
| `supabase/functions/message-enqueue/index.ts:13` | Frente M Fase 2 |

---

## Área 6 — Segurança

### Achados

**[C6] `error.message` em responses** — detalhado na Área 3 acima.

**Positivos confirmados:**
- **Tokens hardcoded:** 0. Todas as secrets via `Deno.env.get()`.
- **`VITE_` secrets:** Apenas chaves públicas (`ANON_KEY`, `URL`, analytics IDs). Nenhuma `service_role` ou secret privada.
- **`service_role` no frontend:** 0 referências.
- **`localStorage` com dados sensíveis:** Apenas `ekthos_session_token` (não-JWT), tema e `impersonating: {church_id, church_name}` (dados públicos).
- **`coupon-validate`:** Proteção correta — `affiliate_id`, `coupon_type`, `redemption_id` só retornados quando `channel === 'cockpit_assisted'`.
- **`verify_jwt`:** 100% das EFs documentadas com comentário explicativo.

---

## Área 7 — Seeds e Integridade de Dados

### Achados

**[INF1] `agent_prompt_templates` incompleto**  
Apenas 1 template existe no banco (`agent-acolhimento`, 5481 bytes). Os outros 6 agentes ativos no catálogo (`agent-cadastro`, `-config`, `-onboarding`, `-reengajamento`, `-suporte`, `-operacao`) usam prompt hardcoded no código das EFs. Funciona operacionalmente, mas viola rastreabilidade e auditoria.

**[INF2] "Igreja de Teste — Mock" sem subscription**  
`church_id = 62e473b8-cd39-4da2-aa5d-c296b03d6873` — sem subscription ativa, `ultimo_plano: null`. Dados de ambiente de teste inconsistentes.

**[INF3] Divergência de canais em "Igreja de Teste — Mock"**  
3 registros legacy em `church_channels` (schema antigo), 0 em `church_whatsapp_channels` (schema novo). Indica que a migração de dados para o schema PASSO 7.5 não foi aplicada a esta church.

**Positivos confirmados:**  
- Catálogo de agentes: 7 agentes ativos, todos com model correto (`claude-haiku-4-5-20251001` ou Sonnet conforme tier). Zero agentes inativos.
- `church_agent_config`: Schema refatorado com `custom_instructions` e `custom_overrides` — dados compatíveis.
- Nenhuma SQL injection detectada em Edge Functions. 100% prepared statements.

---

## Recomendações por Prioridade

### 🔴 Crítico — Resolver antes do próximo deploy

1. **[C4] ANON_KEY com `\n` no Vercel**  
   → Vercel Dashboard → Settings → Environment Variables → editar `VITE_SUPABASE_ANON_KEY` e remover o newline trailing. Redeploy obrigatório.

2. **[C1/C2] RLS em `channel_dispatch_queue` e `visitor_capture_rate_limits`**  
   → Criar migration com `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` + policies restritivas por `church_id`.

3. **[C3] Policies em `admin_events` e `admin_tasks`**  
   → Criar migration com policies que permitem `SELECT/INSERT/UPDATE` apenas para `is_ekthos_admin() = true`.

4. **[C5] CORS `*` em `agent-acolhimento`**  
   → Trocar `'*'` por `Deno.env.get('ALLOWED_ORIGIN')` no arquivo `agent-acolhimento/index.ts`.

5. **[C6] `error.message` em EFs admin**  
   → Criar helper `jsonError()` e substituir os 8 pontos mapeados.

### 🟡 Importante — Resolver no próximo sprint

6. **[I7] `upsert_session_token` 404**  
   → Criar a RPC no banco ou remover as chamadas do frontend que a referenciam.

7. **[I3] "Bola de Neve" sem profiles**  
   → Verificar se é cliente real: se sim, criar profile e user_roles. Se não, soft-delete.

8. **[I4] `auth.jwt()` → `auth.uid()` em `is_ekthos_admin()` e `auth_church_id()`**  
   → Alinhar com Decisão 57. Criar migration de substituição.

9. **[I5] 15 RPCs sem `SET search_path = public`**  
   → Migration batch adicionando `SET search_path = public` em todas.

10. **[I2] Subscriptions ausentes**  
    → Criar subscriptions ativas para `church_demo` e "Bola de Neve" (ou confirmar que são ambientes de teste).

### 🔵 Informativo — Backlog técnico

11. **[INF1]** Criar prompt templates no banco para os 6 agentes restantes.  
12. **[INF3]** Migrar dados legacy de `church_channels` para `church_whatsapp_channels` na "Igreja de Teste — Mock".  
13. **[INF4]** Endereçar TODO de `visitor-capture` na próxima refatoração de agent-tools.

---

## Status do PASSO 7.5

| Item | Status |
|------|--------|
| Bug A (42702 ambiguity) em `list_church_channels` | ✅ Corrigido (migration 000001) |
| Bug A em `list_church_whatsapp_channels` | ✅ Corrigido (migration 000002) |
| Bug B (`profiles.id` → `profiles.user_id`) em ambas as RPCs | ✅ Corrigido (migration 000003) |
| Profile de `felipeabrantess@gmail.com` criado | ✅ Validado (`pastor_pode_ler = true`) |
| Renderização de `/configuracoes/canais` | ✅ Card Z-API renderiza corretamente |
| Commit + push para `feat/passo-7-5-tela-pastor-canais` | ✅ Commit `f947f0d` |
| PR para `main` | ⏳ Aguardando criação manual |

---

*Relatório gerado automaticamente por auditoria sistemática pós-sessão.*  
*Metodologia: dispatching-parallel-agents (4 subagentes Haiku) + Playwright visual.*  
*Nenhuma modificação de dados, código ou configuração foi realizada durante esta auditoria.*
