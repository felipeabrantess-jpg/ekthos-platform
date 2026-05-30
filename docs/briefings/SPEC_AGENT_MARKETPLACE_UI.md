# Spec: Agent Marketplace UI Improvements

**Data:** 2026-05-30
**Autor:** SA-A3 (Lane A — investigate/spec only)
**Status:** Pronto para revisão

---

## 1. Estado Atual

### Arquivos relevantes

| Arquivo | Rota | Função |
|---|---|---|
| `web/src/pages/Agents.tsx` | `/agentes` | Marketplace principal — lista de cards |
| `web/src/pages/agents/AgentConfig.tsx` | `/agentes/:slug/configurar` | Tela de configuração/controle do agente |
| `web/src/pages/agents/AgentChat.tsx` | `/agentes/:slug/conversar[/:sessionId]` | Interface de chat com o agente |
| `web/src/components/agents/AgentStatusBlock.tsx` | (componente) | Bloco de status por `activation_status` |
| `web/src/hooks/usePlan.ts` | (hook) | Dados de plano, agentes ativos, slots |
| `web/src/hooks/useAgentSubscriptionStatus.ts` | (hook) | Status granular de ativação + Realtime |
| `web/src/lib/agents-content.ts` | (lib) | Conteúdo enriquecido — ícones, longDesc, howItWorks |
| `web/src/components/Sidebar.tsx` | (layout) | Sub-painel "Agentes IA" na navegação lateral |

### Catalogo de agentes no banco (`agents_catalog`)

| slug | name | pricing_tier | price_cents | active |
|---|---|---|---|---|
| agent-suporte | Agente Suporte | internal | 0 | true |
| agent-onboarding | Agente Onboarding | internal | 0 | true |
| agent-cadastro | Agente Cadastro | internal | 0 | true |
| agent-haiku-triagem | Agente Triagem (Interno) | internal | 0 | true |
| agent-acolhimento | Agente Acolhimento Pastoral | premium | 29000 | true |
| agent-reengajamento | Agente Reengajamento Pastoral | premium | 29000 | true |
| agent-operacao | Agente Operação Pastoral | premium | 39000 | true |
| agent-financeiro | Agente Financeiro Pastoral | coming_soon | 8900 | true |
| agent-escalas | Agente de Escalas | coming_soon | 0 | true |
| agent-config | Agente Config | free | 0 | **false** |

**Total:** 10 registros no banco. 9 ativos, 1 inativo (agent-config).

**Divergência banco x frontend:** `agents-content.ts` lista apenas 6 agentes (3 internos + 3 premium). `agent-haiku-triagem` existe no banco mas não no frontend — correto, é agente interno de triagem invisível ao pastor. `agent-config` está inativo no banco e ausente do frontend — descontinuado.

### Ativações ativas em produção (`subscription_agents.active = true`)

| agent_slug | igrejas ativas |
|---|---|
| agent-suporte | 4 |
| agent-onboarding | 4 |
| agent-acolhimento | 3 |
| agent-haiku-triagem | 2 |
| agent-cadastro | 1 |
| agent-operacao | 1 |
| agent-reengajamento | 1 |

**Observação:** Nenhuma igreja tem `agent-financeiro` ou `agent-escalas` ativo (coming_soon).

---

## 2. Jornada do Usuário Hoje

1. Pastor clica em "Agentes IA" na sidebar (rail icon Bot)
2. Sub-painel exibe lista de agentes internos (link direto para `/agentes/:slug/conversar`) e agentes premium (link para detalhes)
3. Rota `/agentes` exibe o marketplace completo em seções:
   - **Incluídos gratuitamente** (free)
   - **Incluídos no plano** (always_paid)
   - **Agentes elegíveis — escolha os seus** (eligible + slot counter)
   - **Em breve** (coming_soon)
4. Cada card mostra: nome, badge de tier, descrição curta, lista de até 4 features, pain_solved highlight
5. Ação: botão "Ativar agente" / "Desativar agente" / "Sem slots disponíveis" (para `pricing_tier === 'eligible'`)
6. Para agentes premium: a ativação redireciona para `/agentes/:slug/configurar` onde o pastor vê o status operacional (pending_activation / in_setup / active / paused) e pode testar via WhatsApp

---

## 3. Problemas Identificados

### P1 — Marketplace (`/agentes`) não usa o modelo atual de pricing_tier

O hook `usePlan` filtra por `pricing_tier` (`free`, `always_paid`, `eligible`, `coming_soon`), mas o banco só tem `internal`, `premium`, `coming_soon`. Não existe nenhum agente com tier `free`, `always_paid` ou `eligible` ativo no banco. Resultado: as seções "Incluídos gratuitamente" e "Agentes elegíveis" ficam vazias. O marketplace está **estruturalmente quebrado** — nunca renderiza o conteúdo correto para os planos reais.

**Causa raiz:** O catálogo foi refatorado para `internal` + `premium` mas o código do `Agents.tsx` e `usePlan.ts` ainda usa a nomenclatura antiga (`free` / `always_paid` / `eligible`).

### P2 — Sem indicador de crédito por agente

Os cards não mostram saldo de créditos. O pastor não sabe quantas mensagens o agente enviou, quantas restam no ciclo ou se está próximo de um limite. Não existe nenhuma tabela de `agent_credits` ou `agent_usage` mapeada no frontend.

### P3 — Sem estatísticas de uso por agente

Nenhum card ou tela mostra: mensagens enviadas este ciclo, jornadas ativas, taxa de resposta. O pastor não tem visibilidade de ROI do agente.

### P4 — Status operacional opaco no marketplace

O card do marketplace não mostra o `activation_status` real do agente (pending_activation / in_setup / active / paused). O pastor só vê "Ativo" ou "Disponível" — sem saber se o agente está de fato respondendo ou em fila de setup.

### P5 — Sem CTA de trial

Não existe fluxo de "Testar grátis por X dias" visível no card. O modelo é binário: contratar ou não. Para um pastor que nunca usou um agente pastoral, falta um CTA de menor fricção.

### P6 — Sidebar acopla navegação a conteúdo de lib (agents-content.ts)

A sidebar usa `INTERNAL_AGENTS` e `PREMIUM_AGENTS` de `agents-content.ts`, que é hardcoded no frontend, enquanto o banco é a fonte de verdade. Se um novo agente for adicionado no banco, ele não aparece na sidebar automaticamente.

### P7 — Ausência de categorias visuais claras no marketplace

Não há separação visual entre "Agentes de Pastoral" (acolhimento, reengajamento) e "Agentes Operacionais" (operacao) e "Agentes de Sistema" (suporte, onboarding, cadastro). Um pastor novo não sabe por onde começar.

### P8 — Card "Em breve" usa link WhatsApp hardcoded

O CTA dos agentes coming_soon aponta para `wa.me/5521993092146` fixo. Deveria ser parametrizado ou usar o mesmo fluxo de "Falar com consultor" dos módulos (EF `notify-admin`).

### P9 — Design diverge do sistema Ekthos

O marketplace usa `bg-white`, `border-gray-200`, `text-gray-900` — Tailwind genérico — ao invés do design system (`cream-*`, `brand-*`, `var(--bg-surface)`, `var(--text-primary)`). Os cards dos agentes não seguem o padrão visual dos módulos e configurações.

### P10 — Falta navegação entre detalhes do agente e marketplace

Não existe rota `/agentes/:slug` de detalhe do agente (como existe `/modulos/:id`). A rota de configuração (`/agentes/:slug/configurar`) é a única tela dedicada ao agente, mas assume que o agente já foi contratado. O pastor não tem tela de "apresentação" do agente antes de comprar.

---

## 4. Design Proposto: Card de Agente Premium

```
┌─────────────────────────────────────────────┐
│  [icone]  Agente Acolhimento Pastoral       │
│           Premium Pastoral              [●]  │
│  Acolhe visitantes e conduz os primeiros    │
│  90 dias na Igreja via WhatsApp             │
│                                             │
│  ✓ Contato no mesmo dia                    │
│  ✓ Follow-up semanal automático            │
│  ✓ Alerta membros sem resposta 14d+        │
│                                             │
│  Resolve: Visitantes perdidos nos           │
│  primeiros 90 dias                          │
│                                             │
│  ████████████░░░░ 427 msgs (72%)           │
│  600 mensagens/ciclo · R$290/mês           │
│                                             │
│  [Ativo]                [Configurar →]     │
└─────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────┐
│  [icone]  Agente Reengajamento Pastoral     │
│           Premium Pastoral                   │
│  Detecta membros esfriando e retoma         │
│  o vínculo antes que se percam              │
│                                             │
│  ✓ Detecta inativos 30/60/90 dias          │
│  ✓ Mensagem personalizada ao histórico     │
│  ✓ Lista "Em Risco" semanal                │
│                                             │
│  R$290/mês                                  │
│                                             │
│  [Contratar →]         [Testar 7 dias]     │
└─────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────┐
│  [icone]  Agente Suporte                    │
│           Incluso no plano              [●]  │
│  Tira dúvidas sobre o Ekthos a qualquer    │
│  hora, sem espera                           │
│                                             │
│  ✓ Responde sobre qualquer funcionalidade  │
│  ✓ Escalona para equipe quando necessário  │
│                                             │
│  [Conversar →]                              │
└─────────────────────────────────────────────┘
```

---

## 5. Melhorias Propostas (por prioridade)

### M1 — Corrigir mapeamento pricing_tier (CRÍTICO)

**Problema:** P1 — Seções do marketplace ficam vazias.

Alinhar `usePlan.ts` e `Agents.tsx` com os tiers reais do banco:
- `internal` → "Incluso no plano" (sempre visível, link para chat)
- `premium` → "Agentes Pastorais" (contratar avulso, self-service via EF)
- `coming_soon` → "Em breve" (CTA consultor)

Alternativamente: migrar o banco para usar os tiers do frontend — decisão de produto necessária antes de implementar.

**Componentes:** `usePlan.ts`, `Agents.tsx`

---

### M2 — Status visual do agente no card (ALTA)

**Problema:** P4

Adicionar um indicador de `activation_status` diretamente no card do marketplace usando o hook `useAgentSubscriptionStatus` já existente:

- `pending_activation` → badge âmbar "Aguardando setup"
- `in_setup` → badge laranja "Configurando"
- `active` → ponto verde + badge "Ativo"
- `paused` → badge cinza "Pausado"
- `not_contracted` → sem badge de status (CTA de contratar)

**Componentes:** `AgentCard` (novo campo `statusBadge`), reutilizar `useAgentSubscriptionStatus`

---

### M3 — Tela de detalhe do agente `/agentes/:slug` (ALTA)

**Problema:** P10

Criar tela `AgentDetail.tsx` análoga a `ModuleDetail.tsx` para agentes premium. Rota: `/agentes/:slug`.

Conteúdo:
- Hero: ícone + nome + badge + preço
- CTA: "Contratar" (self-service) ou "Pausar/Reativar" (se ativo)
- Bloco `AgentStatusBlock` (já existe)
- "Como funciona" (bullets de `howItWorks`)
- "Para quem" (campo `forWhom`)
- "O que resolve" (campo `pain_solved`)
- "Sem o agente" (campo `without_me` — o que acontece sem ele)
- Seção de test drive (link para `/agentes/:slug/conversar` se já contratado)

**Componentes novos:** `AgentDetail.tsx`
**Reutiliza:** `AgentStatusBlock`, `getAgentContent`, `useAgentSubscriptionStatus`, `useAddonActions`

---

### M4 — Categorias visuais no marketplace (MÉDIA)

**Problema:** P7

Reorganizar o marketplace em categorias temáticas ao invés de tiers técnicos:

```
AGENTES DE SISTEMA (sempre inclusos)
  Suporte · Onboarding · Cadastro

AGENTES PASTORAIS (contratar avulso)
  Acolhimento · Reengajamento · Operação

EM BREVE
  Financeiro · Escalas
```

Adicionar campo `category` no `agents_catalog` ou manter em `agents-content.ts`.

**Componentes:** `Agents.tsx` (nova estrutura de seções)

---

### M5 — Barra de uso de mensagens (MÉDIA)

**Problema:** P2, P3

Para agentes premium ativos, exibir barra de progresso de uso do ciclo:

```
████████████░░░ 427/600 msgs este mês
```

Requer:
- Nova tabela `agent_usage_cycles` (ou coluna em `subscription_agents`) com `messages_sent_this_cycle`, `cycle_limit`, `cycle_reset_at`
- Edge Function que incrementa `messages_sent_this_cycle` a cada chamada ao agente
- Componente `CreditProgressBar.tsx`

**Impacto de banco:** migration necessária — fora do escopo deste spec.
**Componentes novos:** `CreditProgressBar.tsx`

---

### M6 — CTA de trial (BAIXA)

**Problema:** P5

Adicionar botão "Testar 7 dias" nos cards de agentes premium não contratados. Ao clicar, cria `subscription_agents` com `activation_status = 'pending_activation'` e `trial_end = now() + 7 days`.

Requer:
- Campo `trial_end` em `subscription_agents` (ou tabela separada)
- Lógica de expiração automática (cron ou trigger)
- UI de countdown ("X dias de trial restantes")

**Impacto de banco:** migration necessária — fora do escopo deste spec.

---

### M7 — Correção de design system (BAIXA)

**Problema:** P9

Refatorar `Agents.tsx` para usar tokens do design system Ekthos:
- `bg-white` → `var(--bg-surface)` / `bg-cream-light`
- `border-gray-200` → `border-cream-dark/60`
- `text-gray-900` → `var(--text-primary)` / `text-ekthos-black`
- `text-gray-500` → `var(--text-secondary)` / `text-ekthos-black/55`
- `text-green-500` → `text-brand-500`

---

### M8 — Parametrizar CTA WhatsApp de "Em breve" (BAIXA)

**Problema:** P8

Substituir link hardcoded `wa.me/5521993092146` pela chamada ao mesmo fluxo de `useAddonActions → falarComConsultor` usado em `ModuleDetail.tsx`, que dispara a EF `notify-admin`.

---

## 6. Componentes a Criar / Modificar

### Criar
- `web/src/pages/agents/AgentDetail.tsx` — tela de detalhe `/agentes/:slug`
- `web/src/components/agents/CreditProgressBar.tsx` — barra de uso (depende de M5 DB)
- `web/src/components/agents/AgentStatusBadge.tsx` — badge inline de status para card do marketplace

### Modificar
- `web/src/pages/Agents.tsx` — corrigir tiers (M1), adicionar categorias (M4), aplicar design system (M7), parametrizar WhatsApp CTA (M8)
- `web/src/hooks/usePlan.ts` — alinhar filtros com tiers reais do banco (M1)
- `web/src/lib/agents-content.ts` — adicionar campo `category` tipado por categoria pastoral/operacional/sistema
- Routing em `web/src/App.tsx` (ou equivalente) — adicionar rota `/agentes/:slug`

---

## 7. API / Dados Necessários

### Já existem (sem novas EFs/migrações)

| Dado | Fonte |
|---|---|
| Catálogo de agentes | `agents_catalog` via `usePlan.agents_catalog query` |
| Status de ativação | `subscription_agents` via `useAgentSubscriptionStatus` |
| Plano / slots | `subscriptions + plans` via `usePlan` |
| Canal WhatsApp | `church_whatsapp_channels` (já em AgentConfig.tsx) |

### Necessários para M5/M6 (requerem DB migration)

| Dado | Tabela/Coluna proposta |
|---|---|
| Mensagens enviadas no ciclo | `subscription_agents.messages_sent_this_cycle INT DEFAULT 0` |
| Limite de mensagens | `agents_catalog.monthly_message_limit INT` |
| Reset do ciclo | `subscription_agents.cycle_reset_at TIMESTAMPTZ` |
| Trial end | `subscription_agents.trial_end TIMESTAMPTZ` |

---

## 8. Mapa de Prioridade de Implementação

```
Sprint imediato (sem migration):
  M1 — Corrigir tiers (CRÍTICO) — 2-3h
  M2 — Status badge no card (ALTA) — 1h
  M3 — AgentDetail page (ALTA) — 4-6h
  M7 — Design system fix (BAIXA) — 1h
  M8 — CTA WhatsApp parametrizado (BAIXA) — 30min

Sprint seguinte (requer migration + decisão produto):
  M4 — Categorias visuais — 2h + decisão schema
  M5 — Barra de uso — 1 dia (migration + EF + componente)
  M6 — Trial flow — 2 dias (migration + cron/trigger + UI)
```

---

## 9. Notas e Decisões Pendentes

1. **Decisão de produto obrigatória antes de M1:** confirmar se o banco adota os tiers do frontend (`free/always_paid/eligible`) ou se o frontend adota os tiers do banco (`internal/premium`). Não implementar M1 sem essa decisão.

2. **agent-haiku-triagem:** existe no banco como `internal` mas não deve aparecer no frontend (agente de roteamento interno). Filtrar explicitamente por slug ou adicionar campo `visible_to_pastor BOOLEAN DEFAULT true` no `agents_catalog`.

3. **agent-config (inactive):** descontinuado. Não ressuscitar. Manter `active = false` no banco.

4. **Preços dos agentes premium:** não hardcodar no frontend. Sempre buscar `price_cents` do banco via `agents_catalog`.

5. **M5 (créditos):** verificar se o modelo de negócio usa créditos por mensagem ou por ciclo mensal antes de definir o schema. Armadilha #21 do CLAUDE.md pode se aplicar se houver constraint de preço.
