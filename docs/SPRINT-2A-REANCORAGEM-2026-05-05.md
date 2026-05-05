# Sprint 2A — Reancoragem Fundadora (05/05/2026)

> **Auditoria de alinhamento antes da Onda A.**
> Sem código. Sem migrations. Sem commits. Apenas diagnóstico real.
> Leitura direta de: App.tsx, AgentConfig.tsx, EFs, MCP Supabase (SQL direto), docs comerciais.

---

## 1. DIVERGÊNCIA DE NOMENCLATURA DE PLANOS

### Veredicto: docs/commercial está desatualizado. Banco e frontend estão alinhados.

| Fonte | Nomenclatura encontrada | Status |
|-------|------------------------|--------|
| `plans` (banco, SQL real) | `chamado`, `missao`, `avivamento` | ✅ ATUAL |
| `web/src/pages/ChoosePlan.tsx` | Chamado, Missão, Avivamento | ✅ ATUAL |
| `web/src/pages/settings/Billing.tsx` | Chamado, Missão, Avivamento | ✅ ATUAL |
| `web/src/pages/admin/Churches.tsx` | Chamado, Missão, Avivamento | ✅ ATUAL |
| `web/src/pages/admin/Revenue.tsx` | Chamado, Missão, Avivamento | ✅ ATUAL |
| `web/src/pages/onboarding/Configuring.tsx` | Chamado (R$689,90), Missão (R$1.639,90), Avivamento (R$2.469,90) | ✅ ATUAL |
| `docs/commercial/planos-pricing.md` | Professional, Business, Enterprise | ❌ DESATUALIZADO |
| `docs/commercial/catalogo-agentes-ia.md` | Sem nome de plano, mas preços divergem | ❌ DESATUALIZADO |

### Anomalia detectada em Landing.tsx

`Landing.tsx` linha 1040 exibe badge `<span>Enterprise</span>` sobreposto ao card `Avivamento`. É um artefato visual — o conteúdo é do Avivamento. Não afeta lógica de negócio, mas é confuso para quem lê o código.

### Preços reais no banco (SQL confirmado):

| slug | nome | preço/mês | max_users | agentes inclusos |
|------|------|-----------|-----------|-----------------|
| chamado | Chamado | R$689,90 | 5 | 0 (nenhum incluso) |
| missao | Missão | R$1.639,90 | 8 | 0 (nenhum incluso) |
| avivamento | Avivamento | R$2.469,90 | 10 | 0 (nenhum incluso) |

> **Nota crítica:** `included_agents = 0` para TODOS os planos no banco. Todos os agentes premium são sempre pagos. O docs/commercial desatualizado dizia "2 agentes inclusos no Business" — isso não existe mais na realidade do banco.

### Ação necessária (pós-Sprint 2A, não agora):
- Atualizar `docs/commercial/planos-pricing.md` com nomenclatura Chamado/Missão/Avivamento e preços reais
- Atualizar `docs/commercial/catalogo-agentes-ia.md` com slugs reais e agentes atuais
- Remover badge "Enterprise" de Landing.tsx (ou renomear para "Avivamento")

---

## 2. MAPA TÉCNICO/COMERCIAL DE AGENTES

### 2.1 Estado real do banco

```sql
-- Resultado de: SELECT slug, name, price_cents, active, category, pricing_tier FROM agents_catalog ORDER BY sort_order
```

| slug | nome | preço | active | categoria | tier |
|------|------|-------|--------|-----------|------|
| agent-suporte | Agente Suporte | GRÁTIS | ✅ | interno | free |
| agent-onboarding | Agente Onboarding | GRÁTIS | ✅ | interno | free |
| agent-cadastro | Agente Cadastro | GRÁTIS | ✅ | interno | free |
| agent-config | Agente Config | GRÁTIS | ✅ | interno | free |
| agent-acolhimento | Agente Acolhimento Pastoral | R$290 | ✅ | premium | always_paid |
| agent-reengajamento | Agente Reengajamento Pastoral | R$290 | ✅ | premium | always_paid |
| agent-operacao | Agente Operação Pastoral | R$390 | ✅ | premium | always_paid |

### 2.2 Edge Functions reais (confirmadas em supabase/functions/)

| EF slug | existe? | tipo |
|---------|---------|------|
| agent-suporte | ✅ | interno/pastoral |
| agent-onboarding | ✅ | interno/onboarding |
| agent-cadastro | ✅ | interno |
| agent-acolhimento | ✅ 433 linhas | premium pastoral |
| agent-reengajamento | ✅ | premium pastoral |
| **agent-escalas** | ✅ | **Módulo Pro — não está no catálogo** |
| **agent-financeiro** | ✅ | **Módulo Pro — não está no catálogo** |
| agent-haiku-triagem | ✅ Sprint 1 | infraestrutura interna |
| whatsapp-attendant | ✅ | infraestrutura legada |
| demand-router | ✅ | infraestrutura legada |
| conversation-router | ✅ | infraestrutura legada |
| webhook-receiver | ✅ | infraestrutura |

### 2.3 Tabela cruzada completa

| agent_slug | tipo comercial | plano/módulo | EF existe? | template existe? | no catálogo? | status real | recomendação |
|---|---|---|---|---|---|---|---|
| agent-suporte | interno/incluso | todos os planos | ✅ | ❌ | ✅ | operacional | precisa template |
| agent-onboarding | interno/incluso | todos os planos | ✅ | ❌ | ✅ | operacional | precisa template |
| agent-cadastro | interno/incluso | todos os planos | ✅ | ❌ | ✅ | parcial | precisa template |
| agent-config | interno stub | todos os planos | ❌ | ❌ | ✅ (active=true) | placeholder | remover catálogo ou active=false |
| agent-acolhimento | premium pastoral | always_paid R$290 | ✅ | ✅ v1 | ✅ | operacional c/ fallback | Sprint 2A — migrar hardcoded |
| agent-reengajamento | premium pastoral | always_paid R$290 | ✅ | ❌ | ✅ | parcial (sem template, sem journey table) | Sprint 2A — completar |
| agent-operacao | premium pastoral | always_paid R$390 | ❌ | ❌ | ✅ (active=true) | **ghost — vende mas não existe** | active=false urgente |
| agent-escalas | módulo pro | Volunteer Pro? | ✅ | ❌ | ❌ | operacional parcial | auditar + decidir posição comercial |
| agent-financeiro | módulo pro | Financeiro Pro? | ✅ | ❌ | ❌ | operacional parcial | auditar + decidir posição comercial |
| agent-haiku-triagem | infraestrutura | Sprint 1 | ✅ | n/a | ❌ | operacional | não entra no catálogo |
| whatsapp-attendant | infraestrutura legada | n/a | ✅ | n/a | ❌ | legado | avaliar deprecação |
| demand-router | infraestrutura legada | n/a | ✅ | n/a | ❌ | legado | avaliar deprecação |
| conversation-router | infraestrutura legada | n/a | ✅ | n/a | ❌ | legado | avaliar deprecação |

### 2.4 Descoberta importante — agent-escalas e agent-financeiro

Dois EFs existem sem entrada no catálogo. Provavelmente são os "Módulos Pro" mencionados no CLAUDE.md (Volunteer Pro e Financeiro Pro). **Esta auditoria anterior não mapeou isso.** Precisam de decisão de produto: são agentes vendáveis separados? Estão inclusos em algum plano? Não entra no Sprint 2A mas precisa de resposta antes de go-live.

---

## 3. ESTADO DE AgentConfig.tsx

### Localização
`web/src/pages/agents/AgentConfig.tsx` — rota `/agentes/:slug/configurar` — dentro do CRM do pastor (Layout, ProtectedRoute + StatusGuard)

### O que realmente faz

**Leitura direta do arquivo — essa tela NÃO é uma tela de configuração de prompt.**

O que ela faz:
- Lê `subscription_agents` (somente `id, agent_slug, active, activation_status`) — leitura
- Lê `church_whatsapp_channels` — leitura do canal conectado
- Permite **pausar/reativar** o agente (`UPDATE subscription_agents SET active, activation_status`)
- Permite **enviar mensagem de teste** via EF `test-whatsapp-message`
- Exibe status visual (pending_activation / testing / active / paused)

**O que ela NÃO faz:**
- Não lê nem escreve `church_agent_config`
- Não edita prompt, tom, touchpoints, follow-up, escalação
- Não acessa `agent_prompt_templates`

### Avaliação honesta

O nome "configurar" é enganoso. Na prática é uma tela de **status e controle operacional** — pausar/reativar e testar. Não é uma tela de configuração técnica do agente.

### Risco de manter

| Risco | Nível | Observação |
|-------|-------|-----------|
| Pastor editar prompt/tom | **Nenhum** — não existe essa funcionalidade hoje | — |
| Pastor pausar agente sem consultar Ekthos | **Baixo/médio** — pode gerar confusão operacional | Ekthos perderia controle de quando agente está ativo |
| Teste de WhatsApp exposto ao pastor | **Baixo** — funcionalidade legítima, mas deveria ser cockpit | Duplicate com cockpit futuro |
| Rota acessível mas sem conteúdo real | **Baixo** — apenas confunde o pastor | |

### Recomendação

**Curto prazo (pré-go-live):** Converter em tela read-only de status. Remover botão de pausar/reativar (operação do cockpit). Manter apenas a exibição de status e canal.

**Médio prazo (Sprint dedicado):** Mover controle de pausa para cockpit. A tela pastor pode exibir status resumido sem ações.

**Não alterar agora.** Marcar como tech-debt pré-go-live.

---

## 4. ESTADO DE TEMPLATES POR AGENTE

Resultado SQL de `agent_prompt_templates`:

| agent_slug | template existe? | versão | ativo? |
|------------|-----------------|--------|--------|
| agent-acolhimento | ✅ | v1 | sim |
| agent-reengajamento | ❌ | — | — |
| agent-operacao | ❌ | — | — |
| agent-suporte | ❌ | — | — |
| agent-onboarding | ❌ | — | — |
| agent-cadastro | ❌ | — | — |
| agent-config | ❌ | — | — |

**Apenas 1 template existe no banco.** Todos os outros agentes operam sem template — ou hardcoded, ou simplesmente sem prompt de IA.

---

## 5. ESTADO REAL DE EFs POR AGENTE

### agent-acolhimento
- ✅ EF real, ~433 linhas, modelo claude-sonnet-4-6
- ✅ Chama `get_agent_prompt_resolved` (RPC) — usa se disponível
- ✅ Tem fallback hardcoded se RPC falhar
- ✅ Touchpoints D+0/D+3/D+7/D+14/D+30/D+60/D+90 hardcoded no prompt de fallback
- ✅ Jornada rastreada em `acolhimento_journey`
- ⚠️ `cache_control: {type: 'ephemeral'}` — verificar se está nos blocos de sistema

### agent-reengajamento
- ✅ EF real, verificado na sessão anterior
- ❌ Não chama `get_agent_prompt_resolved` — totalmente hardcoded
- ❌ Nenhuma tabela de jornada para reengajamento (não existe `reengagement_journey`)
- ❌ Sem template em `agent_prompt_templates`
- ⚠️ Cron existe mas é stub (`SELECT 1`)

### agent-operacao
- ❌ Nenhum arquivo EF existe — pasta não existe em `supabase/functions/`
- ❌ Está `active=true` no catálogo com preço R$390 — **GHOST**
- ❌ Sem template, sem EF, sem lógica

### agent-suporte
- ✅ EF existe
- ❌ Sem template

### agent-config
- ❌ Sem EF, sem template, `active=true` no catálogo

---

## 6. ESTADO DE church_agent_config

### Schema real (SQL confirmado):

| coluna | tipo | nullable |
|--------|------|----------|
| church_id | uuid | NO |
| agent_slug | text | NO |
| formality | text | YES |
| denomination | text | YES |
| preferred_verses | ARRAY | YES |
| forbidden_topics | ARRAY | YES |
| pastoral_depth | text | YES |
| first_contact_delay | text | YES |
| send_window | jsonb | YES |
| emoji_usage | text | YES |
| custom_overrides | jsonb | YES |
| active | boolean | YES |
| created_at | timestamptz | YES |
| updated_at | timestamptz | YES |
| custom_instructions | text | YES |
| updated_by | uuid | YES |

### Rows existentes:
- 2 rows para `agent-acolhimento`
- 1 row para `agent-reengajamento`
- 1 row para `agent-operacao`
- Total: 4 rows (dados de dev/seed)

### O que falta para Sprint 2A

Para suportar a configuração completa dos agentes pastorais, faltam:

| campo | necessário | onde colocar |
|-------|-----------|--------------|
| `agent_name` (nome que o agente usa) | Sim | ALTER church_agent_config |
| `pastor_name` (para personalizar saudação) | Sim | ALTER church_agent_config |
| `church_name_short` (apelido da igreja no prompt) | Sim | ALTER church_agent_config |
| Horários de funcionamento/cultos | Sim | JSONB em church_agent_config **ou** tabela própria |
| Régua de touchpoints ativados | Sim | nova tabela `church_followup_config` |
| Modo de escalonamento | Sim | JSONB em `custom_overrides` (não tabela separada) |

---

## 7. ESTADO DE FOLLOW-UP HARDCODED

### agent-acolhimento
Os touchpoints D+0, D+3, D+7, D+14, D+30, D+60, D+90 estão **hardcoded no texto do prompt** da EF como fallback. A EF usa `get_agent_prompt_resolved` primeiro — se o template contiver os touchpoints configuráveis, o hardcoded não é chamado.

O template atual em `agent_prompt_templates` (v1) existe mas **não sabemos se contém placeholders para touchpoints** — a coluna `base_prompt` não foi lida aqui por tamanho. Isso precisa ser verificado antes da Onda A.

O `acolhimento_journey` tem CHECK constraint que só aceita: `D+0, D+3, D+7, D+14, D+30, D+60, D+90`. **Esta tabela não é reusável para reengajamento.**

### agent-reengajamento
Totalmente hardcoded. Não usa `get_agent_prompt_resolved`. Não tem tabela de jornada. Os touchpoints RE+15/30/60/90 são propostos mas não existem nem no banco nem no código. Esta EF provavelmente usa `last_contact_at` e `last_attendance_at` mas sem rastreamento formal de jornada.

---

## 8. ESTADO DE ESCALONAMENTO HARDCODED

Não existe nenhuma tabela de regras de escalonamento configuráveis. O escalonamento atual (se existe) está hardcoded dentro das EFs.

**Decisão de Sprint 2A:** escalonamento entra como JSONB em `custom_overrides` dentro de `church_agent_config` — não como tabela separada. Isso é suficiente para o caso de uso atual e evita a `church_escalation_rules` proposta na auditoria anterior (que era excesso de engenharia).

---

## 9. PROPOSTA ENXUTA DE SCHEMA

### Sprint 2A precisa de exatamente 2 mudanças no banco:

#### 9.1 ALTER TABLE church_agent_config (adicionar colunas)

```sql
-- Identidade pastoral configurável
ALTER TABLE church_agent_config
  ADD COLUMN IF NOT EXISTS agent_name text,            -- nome que o agente usa para se apresentar
  ADD COLUMN IF NOT EXISTS pastor_name text,           -- nome do pastor para personalização
  ADD COLUMN IF NOT EXISTS church_name_short text,     -- apelido/nome curto da igreja no prompt
  ADD COLUMN IF NOT EXISTS service_schedule jsonb,     -- horários de cultos/reuniões
  ADD COLUMN IF NOT EXISTS escalation_config jsonb;    -- regras de escalonamento (JSONB, não tabela)
```

Campos já existentes que cobrem o resto: `formality`, `denomination`, `preferred_verses`, `forbidden_topics`, `pastoral_depth`, `emoji_usage`, `custom_instructions`, `send_window`.

#### 9.2 CREATE TABLE church_followup_config (nova, para touchpoints)

```sql
CREATE TABLE IF NOT EXISTS public.church_followup_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  agent_slug      text NOT NULL,
  
  -- Touchpoints ativos (lista fechada com checkboxes)
  enabled_touchpoints text[] NOT NULL DEFAULT '{}',
  -- Para acolhimento: subset de ['D+0','D+3','D+7','D+14','D+30','D+60','D+90']
  -- Para reengajamento: subset de ['RE+15','RE+30','RE+60','RE+90']
  
  followup_enabled    boolean NOT NULL DEFAULT true,
  send_window         jsonb,    -- {"start": "08:00", "end": "20:00", "days": [1,2,3,4,5]}
  stop_conditions     jsonb,    -- {"on_response": true, "on_attendance": true}
  escalation_after    text,     -- ex: 'D+30' — após este touchpoint sem resposta, escalar
  
  updated_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (church_id, agent_slug)
);

ALTER TABLE public.church_followup_config ENABLE ROW LEVEL SECURITY;

-- Equipe Ekthos (admin) lê e escreve tudo
CREATE POLICY cfc_admin ON public.church_followup_config
  FOR ALL USING (is_ekthos_admin()) WITH CHECK (is_ekthos_admin());

-- Service role (EFs) lê para executar follow-up
CREATE POLICY cfc_service ON public.church_followup_config
  FOR SELECT USING (current_setting('role') = 'service_role');

REVOKE ALL ON TABLE public.church_followup_config FROM PUBLIC;
GRANT SELECT ON public.church_followup_config TO authenticated;
GRANT ALL ON public.church_followup_config TO service_role;
```

#### 9.3 CREATE TABLE reengagement_journey (nova, para rastreamento)

```sql
CREATE TABLE IF NOT EXISTS public.reengagement_journey (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id        uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  person_id        uuid NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  
  started_at       timestamptz NOT NULL DEFAULT now(),
  current_touchpoint text NOT NULL,  -- RE+15, RE+30, RE+60, RE+90
  next_touchpoint_at timestamptz NOT NULL,
  iteration        int NOT NULL DEFAULT 1,  -- suporta múltiplos ciclos de reengajamento
  
  touchpoints_sent    jsonb NOT NULL DEFAULT '[]',
  responses_received  jsonb NOT NULL DEFAULT '[]',
  
  status    text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','cancelled','paused')),
  
  is_sensitive_case boolean NOT NULL DEFAULT false,
  pastoral_notes    text,
  stop_reason       text,
  completed_at      timestamptz,
  cancelled_reason  text,
  
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reengagement_journey ENABLE ROW LEVEL SECURITY;

CREATE POLICY rj_tenant ON public.reengagement_journey
  FOR ALL USING (church_id = auth_church_id()) WITH CHECK (church_id = auth_church_id());

CREATE POLICY rj_admin ON public.reengagement_journey
  FOR ALL USING (is_ekthos_admin()) WITH CHECK (is_ekthos_admin());

-- Sem tabela para NOT EXISTS checagem:
-- CHECK constraint é validação de status, não de touchpoints
-- touchpoints válidos são validados pela EF e pela church_followup_config
```

### O que NÃO fazer:
- ❌ NÃO criar `church_escalation_rules` como tabela separada — JSONB em `escalation_config` resolve
- ❌ NÃO criar `church_identity` separada — ALTER em `church_agent_config` resolve
- ❌ NÃO criar 9 RPCs — ver seção 10

---

## 10. QUAIS RPCs SÃO REALMENTE NECESSÁRIAS

### Situação atual
Existe: `get_agent_prompt_resolved(p_church_id, p_agent_slug)` — SECURITY DEFINER, já em produção.

### Para Sprint 2A são necessárias apenas:

| RPC | necessária? | motivo |
|-----|------------|--------|
| `get_agent_prompt_resolved` (existente) | ✅ já existe | não alterar assinatura |
| `upsert_church_agent_config` | ✅ sim | cockpit faz UPSERT com todos os campos |
| `upsert_church_followup_config` | ✅ sim | cockpit salva touchpoints e janela de envio |
| `get_agent_full_config(church_id, agent_slug)` | ✅ sim | retorna config completa para cockpit exibir |
| `activate_agent(church_id, agent_slug)` | ✅ sim | muda activation_status para active (auditado) |
| Outras 5+ propostas na auditoria anterior | ❌ não | queries diretas com RLS resolvem |

**Total: 3 RPCs novas + 1 existente.** Não 9.

---

## 11. QUAIS TELAS DO COCKPIT EXISTEM HOJE

### Admin cockpit (/admin/*) — confirmado via App.tsx e Church.tsx

| rota | componente | o que faz |
|------|-----------|-----------|
| /admin/cockpit | AdminCockpit | métricas MRR, igrejas, alertas |
| /admin/churches | AdminChurches | lista de igrejas com filtros |
| /admin/churches/:id | AdminChurch | detalhe da igreja |
| /admin/onboardings | AdminOnboardings | fila de onboardings |
| /admin/leads | AdminLeads | leads capturados |
| /admin/tasks | AdminTasks | tarefas internas |
| /admin/revenue | AdminRevenue | métricas de receita |
| /admin/pricing | AdminPricing | precificação customizada |
| /admin/afiliados | AdminAffiliates | afiliados |
| /admin/comunicacao | AdminComunicacao | comunicação |

### Tabs em AdminChurch (/admin/churches/:id):
`Resumo | Assinatura | Operação | Saúde | Financeiro | Precificação | Notas Internas | Logs e Ações`

**Nenhuma tab de agentes/configuração IA existe.** O campo `agents` existe no tipo ChurchDetail (array com nome/status/calls_30d) mas é só leitura. Não há nem uma linha de interface para editar `church_agent_config` no cockpit.

**0% implementado de configuração de agentes no cockpit.**

---

## 12. COMO FICA A ONDA A

### Onda A — Schema + Migrations (estimativa: 4-6h)

Escopo exato, sem mais, sem menos:

1. **Migration 1:** ALTER TABLE `church_agent_config` — adicionar 5 colunas
2. **Migration 2:** CREATE TABLE `church_followup_config` com RLS
3. **Migration 3:** CREATE TABLE `reengagement_journey` com RLS
4. **Migration 4:** UPDATE `agents_catalog` SET `active = false` WHERE `slug = 'agent-operacao'` (pré-go-live urgente)
5. **Migration 5:** UPDATE `agents_catalog` SET `active = false` WHERE `slug = 'agent-config'` (stub sem EF)
6. **Seed:** INSERT seed de `church_followup_config` para igrejas de teste com touchpoints padrão

**Não entra na Onda A:**
- Cockpit frontend (Onda C)
- Migração do hardcoded para config (Onda D/E)

---

## 13. RISCOS

| risco | severidade | detalhe |
|-------|-----------|---------|
| `agent-operacao` active=true no catálogo | 🔴 CRÍTICO | Igreja pode contratar. EF não existe. Promessa não cumprida. |
| `agent-config` active=true no catálogo | 🟡 MÉDIO | Confuso. Nenhuma EF. Parece feature não entregue. |
| `agent-escalas` e `agent-financeiro` sem catálogo | 🟡 MÉDIO | EFs existem mas sem posição comercial definida. |
| Cron de reengajamento é stub | 🟡 MÉDIO | Agente vendido mas o trigger automático não funciona. |
| `acolhimento_journey` sem `paused` status | 🟡 MÉDIO | Não dá para pausar uma jornada sem cancelar. |
| Template agent-acolhimento v1 pode não ter placeholders | 🟡 MÉDIO | Se base_prompt é texto fixo, `get_agent_prompt_resolved` resolve o texto mas não personaliza. Verificar antes da Onda D. |
| AgentConfig.tsx expõe pause/reativação ao pastor | 🟢 BAIXO | Conflito com decisão do cockpit, mas não quebra nada agora. |
| docs/commercial desatualizados | 🟢 BAIXO | Impacto zero em produção. Apenas confunde devs. |

---

## 14. ESTIMATIVA REAL

| Onda | Escopo | Estimativa |
|------|--------|-----------|
| A | 3 migrations + 2 disables no catálogo | 3-4h |
| B | 3 RPCs novas (upsert config, upsert followup, get full config, activate_agent) | 4-5h |
| C | Tab "Agentes" no cockpit: lista de agentes da igreja + tela de config por agente (identidade + touchpoints + escalonamento + teste) | 8-12h |
| D | Migrar agent-acolhimento: ler church_followup_config para touchpoints, remover hardcoded como default, adicionar placeholders no template | 3-4h |
| E | agent-reengajamento completo: template v1, reengagement_journey, cron real, integrar get_agent_prompt_resolved | 8-12h |
| F | E2E: 2 igrejas mock, config diferente, verificar isolamento, verificar touchpoints corretos | 3-4h |

**Sprint 2A total: 29-41h** (vs. 36-49h estimado antes — enxugado pela decisão de JSONB para escalonamento e menos RPCs)

---

## 15. RECOMENDAÇÃO FINAL ANTES DE CODAR

### O que está travado e não deveria travar Onda A:

As decisões D1-D10 da auditoria anterior estão **resolvidas ou clarificadas** com esta reancoragem:

| decisão | status |
|---------|--------|
| D1: Expandir churches ou church_identity separada? | ✅ RESOLVIDO — ALTER em church_agent_config |
| D2: Pastor acessa cockpit? | ✅ RESOLVIDO — NÃO. Pastor não acessa cockpit. |
| D3: Régua padrão reengajamento? | ✅ RESOLVIDO — RE+15/30/60/90, checkboxes, sem travar por plano |
| D5: Régua acolhimento igual todos os planos? | ✅ RESOLVIDO — sim, checkboxes configura por igreja, não por plano |
| D6: Escalonamento padrão notify ou silent? | ✅ RESOLVIDO — JSONB escalation_config em church_agent_config |
| D7: Rascunhar template reengajamento? | ✅ RESOLVIDO — Onda E inclui criação do template |
| D8: Planos afetam touchpoints? | ✅ RESOLVIDO — NÃO por agora. Diferenciação futura por volume/canais. |
| D9: Remover agent-config do catálogo? | ✅ RESOLVIDO — active=false na Onda A migration |
| D10: Desativar agent-operacao pré-go-live? | ✅ RESOLVIDO — active=false na Onda A migration |

### Única questão antes de iniciar Onda A:

> **Felipe confirma que o conteúdo atual de `agent_prompt_templates` (agent-acolhimento v1) contém placeholders como `{{formality}}`, `{{denomination}}` etc.?**
>
> Se sim: a Onda D é apenas ligar `church_followup_config` aos touchpoints.
> Se não: a Onda D precisa também reescrever o template base antes de ligar.
> Impacta estimativa da Onda D em ±2-3h.

Isso pode ser verificado em 1 query SQL (SELECT base_prompt FROM agent_prompt_templates WHERE agent_slug = 'agent-acolhimento') — mas não rodar sem autorização de Felipe pois pode expor conteúdo sensível.

### Liberação da Onda A

**Onda A pode iniciar imediatamente após Felipe confirmar.**

A Onda A é pura SQL/schema — sem frontend, sem EF, sem commit de código React. Risco mínimo. Reversível. Três tabelas novas + dois disables no catálogo.

---

## APÊNDICE — Separação oficial de papéis (cravada)

```
┌─────────────────────────────────────────────────────────────────┐
│ COCKPIT EKTHOS (/admin/*)                                       │
│ Equipe Ekthos apenas. isEkthosAdmin guard.                      │
│ Configura: identidade, tom, prompt, follow-up, reengajamento,   │
│ escalonamento, canais, testes, ativação.                        │
├─────────────────────────────────────────────────────────────────┤
│ CRM DA IGREJA (/dashboard, /pessoas, /agentes, etc.)            │
│ Pastor, liderança, equipe da igreja.                            │
│ Usa: membros, células, pipeline, conversas, relatórios.        │
│ Vê: status dos agentes (ativo/pausado). NÃO configura.         │
├─────────────────────────────────────────────────────────────────┤
│ SITE/APP DA IGREJA (/visita/:slug, público)                     │
│ Membros, visitantes, público.                                   │
│ Landing de QR code. Formulário de visitante. Info pública.     │
└─────────────────────────────────────────────────────────────────┘

AgentConfig.tsx (/agentes/:slug/configurar):
→ TECH-DEBT: converte para read-only de status. Remove pause button.
→ NÃO AGORA. Pré-go-live.
```

---

*Documento produzido em 05/05/2026. Baseado em leitura direta de código, SQL ao vivo no Supabase, e arquivos canônicos. Sem especulação.*
