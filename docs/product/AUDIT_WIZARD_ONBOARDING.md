# Auditoria: Wizard / Onboarding — Mapeamento de Campos

> **Gerado:** MEGA-ONDA 2026-05-30 (F1.5)
> **Escopo:** Fluxo completo de onboarding + configuração de agentes IA
> **Método:** Leitura estática de código (subagent read-only audit)

---

## 1. Arquivos do Fluxo

| Arquivo | Rota | Propósito |
|---|---|---|
| `web/src/pages/Onboarding.tsx` | `/onboarding` | Chatbot conversacional com "Consultor Ekthos" — coleta dados gerais via LLM |
| `web/src/pages/onboarding/Wizard.tsx` | `/onboarding/wizard` | Wizard estruturado 2 etapas — dados formais + perfil pastoral |
| `web/src/pages/onboarding/Configuring.tsx` | `/onboarding/configuring` | Tela de progresso enquanto `onboarding-engineer` EF provisiona (20 steps) |
| `web/src/pages/agents/AgentConfig.tsx` | `/agentes/:slug/configurar` | Tela do pastor: status, teste e pausa/reativação — **NÃO** edita `church_agent_config` |
| `web/src/pages/admin/AgentConfigCockpit.tsx` | `/admin/churches/:id/agentes/:slug` | Cockpit admin: 7 abas de configuração completa por agente/igreja |
| `web/src/pages/admin/agent-tabs/TabIdentidade.tsx` | (aba admin) | Override: `agent_name`, `pastor_name`, `church_name_short` |
| `web/src/pages/admin/agent-tabs/TabPromptTom.tsx` | (aba admin) | `formality`, `pastoral_depth`, `emoji_usage`, `first_contact_delay`, `denomination`, `preferred_verses`, `forbidden_topics`, `custom_instructions` |
| `web/src/pages/admin/agent-tabs/TabFollowup.tsx` | (aba admin) | `followup_enabled`, `enabled_touchpoints`, `send_window`, `duration_days`, `stop_conditions`, `next_action_after_completion` |
| `web/src/pages/admin/agent-tabs/TabEscalonamento.tsx` | (aba admin) | `escalation_config`, `escalation_conditions` |
| `web/src/hooks/useChurchAgentConfig.ts` | hook | Leitura e upsert via RPCs Supabase |
| `web/src/types/churchAgentConfig.ts` | tipos | Definição completa dos campos de `church_agent_config` |

---

## 2. Mapeamento: O Que o Wizard Salva

### `/onboarding` — Chatbot conversacional (Edge Function `onboarding-consultant`)

Captura em `onboarding_sessions`. Dados coletados em linguagem natural:
- Nome da igreja, cidade, logo, cores
- Pipeline de discipulado, ministérios, células
- Agentes IA de interesse

**Destino:** A EF `onboarding-engineer` processa a sessão e provisiona tudo em 20 steps.

### `/onboarding/wizard` — Wizard estruturado (2 etapas)

**Etapa 1 — RPC `upsert_church_cadastro_cristalino` → tabela `churches`:**
- `name`, `city`, `uf`, `main_phone`, `main_email`
- `pastor_titular_name`, `pastor_titular_phone`, `pastor_titular_email`, `pastor_titular_can_be_quoted`
- Dados do contratante: CPF/CNPJ, role, email, phone, notes

**Etapa 2 — RPC `upsert_church_onboarding_pastoral` → campos pastorais em `churches`:**
- `estilo_comunicacao` (formal / intermediario / casual)
- `horarios_culto` (texto livre)
- `maior_desafio`
- `foco_pastoral_30_dias`
- `algo_importante_comunidade`

> ⚠️ **O wizard estruturado NÃO salva diretamente em `church_agent_config`.** Esses campos em
> `churches` servem de insumo para o `onboarding-engineer` popular os agentes.

### Admin Cockpit `/admin/churches/:id/agentes/:slug`

| Campo `church_agent_config` | Aba que salva | RPC chamada |
|---|---|---|
| `agent_name` | TabIdentidade | `upsert_church_agent_config_admin` |
| `pastor_name` | TabIdentidade | `upsert_church_agent_config_admin` |
| `church_name_short` | TabIdentidade | `upsert_church_agent_config_admin` |
| `formality` | TabPromptTom | `upsert_church_agent_config_admin` |
| `emoji_usage` | TabPromptTom | `upsert_church_agent_config_admin` |
| `pastoral_depth` | TabPromptTom | `upsert_church_agent_config_admin` |
| `first_contact_delay` | TabPromptTom | `upsert_church_agent_config_admin` |
| `custom_instructions` | TabPromptTom | `upsert_church_agent_config_admin` |
| `preferred_verses` | TabPromptTom | `upsert_church_agent_config_admin` |
| `forbidden_topics` | TabPromptTom | `upsert_church_agent_config_admin` |
| `denomination` | TabPromptTom | `upsert_church_agent_config_admin` |
| `escalation_config` | TabEscalonamento | `upsert_church_agent_config_admin` |
| `send_window` | TabFollowup | `upsert_church_followup_config_admin` |
| `enabled_touchpoints` | TabFollowup | `upsert_church_followup_config_admin` |
| `stop_conditions` | TabFollowup | `upsert_church_followup_config_admin` |

### Tela do Pastor `/agentes/:slug/configurar`

O pastor vê:
- Status do agente (`pending_activation` / `testing` / `active` / `paused`)
- Canal WhatsApp conectado
- Botão pausar / reativar
- Formulário de teste de mensagem

**O pastor NÃO acessa nenhum campo de `church_agent_config` por esta tela.**

---

## 3. Gaps — Campos Sem Interface de Configuração

| Campo `church_agent_config` | Situação |
|---|---|
| `service_schedule` | **SEM INTERFACE** — campo existe no tipo TypeScript mas nenhuma aba/wizard salva |
| `custom_overrides` | **SEM INTERFACE** — definido no tipo, nunca preenchido pelo frontend |
| Todos os campos de TabPromptTom | Somente admin — pastor não acessa |
| Todos os campos de TabIdentidade | Somente admin — pastor não acessa |
| `escalation_config` | Somente admin — pastor não acessa |

### Gap crítico: `service_schedule`

O wizard capta `horarios_culto` como texto livre na tabela `churches`.
Este campo **não é automaticamente mapeado** para `church_agent_config.service_schedule`.
A ponte deveria ser feita pelo `onboarding-engineer`, mas o campo pode estar sendo ignorado.

**Impacto:** O `agent-acolhimento` pode não saber os horários dos cultos da igreja, limitando
a personalização das mensagens de acolhimento.

**Recomendação:** Verificar se `onboarding-engineer` lê `churches.horarios_culto` e popula
`church_agent_config.service_schedule`. Se não, adicionar ao step de provisioning.

---

## 4. Fluxo Completo de Configuração (Resumo)

```
Pastor inicia onboarding
    ↓
/onboarding (chatbot LLM)
    → coleta preferências gerais
    → salva em onboarding_sessions
    ↓
/onboarding/wizard Step 1
    → RPC upsert_church_cadastro_cristalino
    → salva em churches (dados legais + pastor)
    ↓
/onboarding/wizard Step 2
    → RPC upsert_church_onboarding_pastoral
    → salva em churches (estilo + horários + desafios)
    ↓
/onboarding/configuring
    → POST onboarding-engineer
    → 20 steps de provisioning
    → popula church_agent_config para cada agente contratado
    → configura pipeline, células, etc.
    ↓
Equipe Ekthos finaliza via Admin Cockpit
    → /admin/churches/:id/agentes/:slug
    → 7 abas: Identidade, PromptTom, Contato, Followup, Escalonamento, etc.
    → RPC upsert_church_agent_config_admin
```

---

## 5. Recomendações de Roadmap

| Prioridade | Melhoria | Esforço |
|---|---|---|
| Alta | Verificar bridge `horarios_culto` → `service_schedule` no `onboarding-engineer` | Pequeno |
| Média | Expor `custom_instructions` na tela do pastor (`/agentes/:slug/configurar`) | Médio |
| Média | Expor `preferred_verses` e `forbidden_topics` em wizard guiado para o pastor | Médio |
| Baixa | Implementar `custom_overrides` com UI admin | Grande |
| Baixa | Tab de configuração self-service para o pastor no detalhe do agente | Grande |

---

*Auditoria gerada automaticamente — MEGA-ONDA F1.5 — 2026-05-30*
