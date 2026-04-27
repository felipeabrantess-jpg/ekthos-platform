# Lote A — Fases 3, 4, 5 (Agentes IA · Módulos · Configurações)
**Data:** 2026-04-27  
**Commit:** `cccc434`  
**Branch:** `staging`

---

## Resumo

Implementação das páginas de Agentes IA, Módulos pagos e Configurações reestruturadas do CRM Pastoral.

---

## Arquivos criados / modificados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `web/src/lib/agents-content.ts` | NOVO | 14 agentes com conteúdo enriquecido |
| `web/src/lib/modules-content.ts` | NOVO | Volunteer Pro, Kids Pro, Financeiro Pro |
| `web/src/pages/agents/AgentsList.tsx` | NOVO | `/agentes` — lista de agentes por seção |
| `web/src/pages/agents/AgentDetail.tsx` | NOVO | `/agentes/:slug` — detalhe com estado |
| `web/src/pages/modules/ModuleDetail.tsx` | NOVO | `/modulos/:id` — página genérica de módulo |
| `web/src/pages/configuracoes/SettingsLayout.tsx` | NOVO | Layout `/configuracoes` com tabs verticais |
| `web/src/pages/configuracoes/Dados.tsx` | NOVO | Dados básicos da Igreja |
| `web/src/pages/configuracoes/Identidade.tsx` | NOVO | Re-export de `settings/Branding` |
| `web/src/pages/configuracoes/Plano.tsx` | NOVO | Re-export de `settings/Billing` |
| `web/src/pages/configuracoes/Usuarios.tsx` | NOVO | Re-export de `settings/Users` |
| `web/src/pages/configuracoes/Modulos.tsx` | NOVO | Cards dos módulos → /modulos/:id |
| `web/src/App.tsx` | MODIFY | +rotas /agentes, /agentes/:slug, /modulos/:id, /configuracoes/* |
| `web/src/components/Sidebar.tsx` | MODIFY | "Agentes IA" → /agentes; módulos → /modulos/:id; Config → /configuracoes |

---

## Fase 3 — Páginas de Agentes

### `/agentes` (AgentsList)

Três seções:
1. **ATIVOS** — agentes que `hasAgent(slug) = true`; card verde com ✓
2. **CONTRATAR AVULSO** — elegíveis sem `moduleId`, não ativos; card brand com preço
3. **VIA MÓDULO** — agentes com `moduleId`; card cinza → linka para `/modulos/:id`

### `/agentes/:slug` (AgentDetail)

Quatro estados:
| Estado | Condição | UI |
|--------|----------|----|
| `active` | `hasAgent(slug)` | Badge verde "Agente ativo" + instrução de uso |
| `contractable` | sem moduleId, não ativo | Botão "Contratar — Em breve" disabled + tooltip |
| `module-bound` | tem `moduleId` | Bloco brand + botão "Ver módulo" |
| `unavailable` | whatsapp + plano ≠ avivamento | Bloco âmbar "Exclusivo Avivamento" |

Conteúdo exibido: shortDesc, longDesc, howItWorks (numerado), forWhom, note.

---

## Fase 4 — Páginas de Módulos

### `/modulos/:id` (ModuleDetail)

Página genérica para os três módulos (volunteer-pro, kids-pro, financeiro-pro).

Seções: Para quem · Problemas que resolve · O que inclui (feature grid) · Agentes IA (incluso vs add-on).

CTA por tipo:
- **Normal** (Volunteer, Kids): botão "Contratar — Em breve" disabled + tooltip + "Falar com time Ekthos"
- **Consultivo** (Financeiro Pro): só "Falar com time Ekthos" (sem botão de compra)

---

## Fase 5 — Configurações reestruturadas

### `/configuracoes` → tabs verticais

| Tab | Rota | Componente |
|-----|------|------------|
| Dados | `/configuracoes/dados` | `Dados.tsx` (novo) |
| Identidade | `/configuracoes/identidade` | re-export de `settings/Branding` |
| Plano | `/configuracoes/plano` | re-export de `settings/Billing` |
| Usuários | `/configuracoes/usuarios` | re-export de `settings/Users` |
| Módulos | `/configuracoes/modulos` | `Modulos.tsx` → cards → /modulos/:id |

### `/configuracoes/dados`

Campos: nome, telefone, e-mail público, endereço, CEP, cidade, estado (select UF).  
Salva via `supabase.from('churches').update()`. Campos CNPJ e site não implementados (pendente migration).

---

## Sidebar — alterações

| Antes | Depois |
|-------|--------|
| "Agentes IA" era só label estático | "Agentes IA" é `NavLink` → `/agentes` |
| Módulos: `<div>` não-interativo | Módulos: `<NavLink>` → `/modulos/volunteer-pro` etc. |
| Configurações → `/settings/billing` | Configurações → `/configuracoes` |

---

## Regras respeitadas

| Regra | Status |
|-------|--------|
| "Testar 7 dias grátis" desabilitado | ✅ Não aparece em nenhuma tela |
| `agent-whatsapp` exclusivo Avivamento | ✅ Estado `unavailable` para outros planos |
| Financeiro Pro consultivo | ✅ Sem botão de compra, só "Falar com time" |
| Módulos sempre locked | ✅ Botões disabled + tooltip "Em breve" |
| `/settings/*` legado mantido | ✅ Backward compat preservado |

---

## Portões

| Portão | Status | Detalhe |
|--------|--------|---------|
| P1 — Build | ✅ | `✓ built in 8.24s` — 0 erros, 0 warnings |
| P2 — Validação | ⏳ | Aguarda Felipe validar em produção após deploy |
| P3 — Não-regressão | ✅ | Sidebar original preservada; /settings/* rotas mantidas |
| P4 — Relatório | ✅ | Este documento |

---

## TODOs deixados

| ID | Localização | Descrição |
|----|-------------|-----------|
| TODO-F4-MODULOS | `Sidebar.tsx`, `ModuleDetail.tsx` | Lógica de compra (Stripe) + sub-sidebar deslizante |
| TODO-F5-DADOS | `Dados.tsx` | Campos CNPJ/site quando migration `churches` for atualizada |
| TODO-F6-TRIAL | `AgentDetail.tsx`, `ModuleDetail.tsx` | Botão "Testar 7 dias grátis" — só ativar em Fase 6 |
| TODO-F5-MODULOS-TAB | `Modulos.tsx` | Lógica de acesso quando módulo estiver ativo (Fase 4) |

---

## Próximas fases

### Fase 6 — Trial e compra de agentes
- Habilitar botão "Contratar agente" com Stripe checkout
- Habilitar botão "Testar 7 dias grátis" para módulos
- Lógica de `access_grants` para módulos comprados

### Fase 4 complementar — Sub-sidebar de Módulos
- Sub-sidebar deslizante ao clicar no módulo ativo
- Acesso a conteúdo exclusivo do módulo (Voluntários, Kids, Fin.Pro)

### Fase 5 complementar — Dados da Igreja
- Migration para adicionar `cnpj`, `website` em `churches`
- Completar formulário Dados

---

## Validação em produção (Felipe)

Após merge + deploy no Vercel:

1. Login: `felipeabrantess@gmail.com`
2. Sidebar → "Agentes IA" agora é link → clica → `/agentes`
3. `/agentes` → deve mostrar seção ATIVOS (2 agentes no plano) + CONTRATAR AVULSO + VIA MÓDULO
4. Clica em agente ativo → `/agentes/agent-suporte` → estado "Agente ativo" (verde)
5. Clica em agente contratável → estado "Contratar — Em breve" (disabled)
6. Sidebar → "Volunteer" → `/modulos/volunteer-pro` → página com CTA bloqueado
7. Sidebar → "Financeiro Pro" → `/modulos/financeiro-pro` → CTA consultivo (sem preço)
8. Sidebar → Configurações → `/configuracoes` → tabs verticais (Dados / Identidade / Plano / Usuários / Módulos)
9. `/configuracoes/identidade` → logo + cores (= Branding existente)
10. `/configuracoes/plano` → assinatura (= Billing existente)
11. `/settings/billing` ainda funciona (backward compat)

---

## PR

https://github.com/felipeabrantess-jpg/ekthos-platform/compare/main...staging?expand=1
