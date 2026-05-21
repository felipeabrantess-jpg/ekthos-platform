# 00-formacoes.md — Decisões Permanentes da Plataforma Ekthos

> **FONTE AUTORITATIVA** — Este arquivo contém as decisões permanentes e inegociáveis da plataforma.
> Em caso de conflito com qualquer outro documento (especialmente `docs/commercial/`), este arquivo prevalece.
>
> ⚠️ `docs/commercial/` está desatualizado — OPS-DEBT-050. Não usar como referência de pricing ou catálogo.
>
> Atualizado: 2026-05-21

---

## PRODUTO E VISÃO

**Ekthos Church** — CRM SaaS multi-tenant para igrejas evangélicas brasileiras.

**Missão:** Plataforma pastoral completa operada com zero intervenção humana da equipe Ekthos no dia-a-dia das igrejas. Do primeiro contato ao discipulado avançado.

**Piloto interno:** Vanessa Abrantes (esposa de Felipe) — church_id `5156cc30-6d76-4487-99ba-fff8013b38d4`. NÃO é cliente externo. Bugs no onboarding dela são bugs sistêmicos.

---

## STACK TÉCNICA (INVIOLÁVEL)

| Camada | Tecnologia | Notas |
|---|---|---|
| Frontend | React 18 + TypeScript 5 + Vite 5 (SWC) + Tailwind CSS 3 | `vite build` sem tsc — intencional |
| Queries | TanStack Query v5 | |
| Routing | React Router v6 | |
| Backend | Supabase — Auth, Postgres, Storage, Edge Functions | Supabase-only — sem Firebase, sem outro BaaS |
| Runtime EF | Deno — NUNCA Node.js | |
| Deploy | Vercel (frontend) + Supabase (backend) | |

**Decisão permanente:** Supabase é o único BaaS permitido. Nenhuma migração para outro provider sem decisão explícita documentada aqui.

---

## PLANOS E PRICING (PRODUÇÃO — 2026-05-21)

> Fonte: tabela `plans` no banco. `plans.slug` é PK (text). FKs sempre `plan_slug text REFERENCES plans(slug)`.

| Plano | Slug | Preço/mês | Usuários inclusos | Agentes inclusos |
|---|---|---|---|---|
| Chamado | `chamado` | R$689,90 | 1 (pastor) | 0 (agent-suporte grátis separado) |
| Missão | `missao` | R$1.639,90 | até 3 | 0 (agent-suporte grátis separado) |
| Avivamento | `avivamento` | R$2.469,90 | até 10 | 0 (agent-suporte grátis separado) |

**Regras inegociáveis de pricing:**
- Preços NÃO são expostos na landing page para Missão e Avivamento
- `included_agents = 0` em todos os planos — agentes são add-ons pagos separados
- Colunas `discount_type`, `discount_value`, `duration` em cupons: NUNCA modificar em cupom já sincronizado com Stripe
- `final_price_cents` SEMPRE derivado por subtração de `discount` (não calculado independentemente) — `chk_prices_consistent`

**Addons:**
- Usuários extras: R$29,90/mês cada
- Agentes extras: preço por agente (ver catálogo)

---

## CATÁLOGO DE AGENTES (PRODUÇÃO — 2026-05-21)

### agent-suporte — GRATUITO em todos os planos

- **Modelo:** `claude-haiku-4-5-20251001`
- **Função:** Suporte ao membro via WhatsApp — FAQs, horários, endereço, informações gerais
- **Incluído:** automaticamente em toda nova church criada

### agent-acolhimento — R$290/mês

- **Modelo:** `claude-sonnet-4-6` — INTENCIONAL, NÃO regredir (Sprint 2, 01/05/2026)
- **Função:** Acolhimento de visitantes e novos membros — primeira experiência pastoral

### agent-reengajamento — R$290/mês

- **Modelo:** `claude-sonnet-4-6` — INTENCIONAL, NÃO regredir (Sprint 2, 01/05/2026)
- **Função:** Reengajamento de membros ausentes >14 dias

### Agentes operacionais — preços variáveis

| Slug | Modelo | Função |
|---|---|---|
| `agent-haiku-triagem` | Haiku | Triagem e classificação de intenção |
| `agent-onboarding` | Haiku | Guia onboarding da nova church via WhatsApp |
| `agent-cadastro` | Haiku | Assistência ao cadastro de membros |
| `agent-escalas` | Haiku | Gestão de escalas de serviço |
| `agent-financeiro` | Haiku | Assistência financeira operacional |

**Plano Missão:** `agent-whatsapp` NÃO está disponível — EXCLUSIVO Avivamento.
**Plano Volunteer/Kids:** máximo 1 agente incluso.

---

## MODELOS DE IA — DECISÃO PERMANENTE

| Categoria | Modelo | Model ID canônico |
|---|---|---|
| Agentes operacionais/internos | Haiku | `claude-haiku-4-5-20251001` |
| Agentes pastorais premium | Sonnet | `claude-sonnet-4-6` |
| **NUNCA usar** | — | `claude-3-5-haiku-20241022` (descontinuado, retorna 404) |
| **NUNCA usar** | — | Aliases curtos como `claude-haiku-3-5` |

**Critério "pastoral premium":** agente (a) responde diretamente ao membro, (b) tem valência espiritual/emocional alta, (c) erro de geração tem impacto pastoral real.

**Padrão centralizado:** `supabase/functions/_shared/anthropic-client.ts` → `MODELS.haiku` / `MODELS.sonnet`. Sempre importar daqui, nunca hardcodar string de modelo.

---

## DESIGN SYSTEM (INVIOLÁVEL)

### Paleta

| Variável | Hex | Uso |
|---|---|---|
| `--ekthos-cream` | `#f9eedc` | Fundo geral, superfícies claras |
| `--ekthos-red` | `#e13500` | CTA, botões primários, links, destaques |
| `--ekthos-wine` | `#670000` | Badges premium, sidebar accent |
| `--ekthos-black` | `#161616` | Sidebar, textos principais |

**Regras:** NUNCA gray-50/100/200 (usar cream-*). NUNCA blue-* como primário (usar brand-*/red).

### Tipografia

- **Títulos:** Playfair Display (elegância pastoral)
- **Corpo:** DM Sans (moderno, legível, profissional)
- **Métricas/dados:** JetBrains Mono

**Regra:** NUNCA Inter, Roboto, Arial como fonte principal.

### Sidebar

- Fundo: `#161616` (preto)
- Logo Ekthos: `#e13500` (vermelho) — SEMPRE
- Fundo geral da página: `#f9eedc` (creme) — NUNCA branco puro

---

## MULTI-TENANCY (MT-01 a MT-06)

| ID | Invariante |
|---|---|
| MT-01 | Toda tabela de dados pastorais tem `church_id UUID NOT NULL REFERENCES churches(id)` |
| MT-02 | Todo SELECT tem `.eq('church_id', churchId)` como primeira cláusula após `.from()` |
| MT-03 | Todo UPDATE/DELETE tem duplo filtro: `.eq('id', id).eq('church_id', churchId)` |
| MT-04 | `churchId` vem sempre de `useAuth()` — nunca hardcoded, nunca via props diretas |
| MT-05 | RLS habilitada em toda nova tabela com policies `_tenant_select` e `_service_all` |
| MT-06 | `auth_church_id()` lê APENAS de `app_metadata` — sem fallback `user_metadata` |

---

## EDGE FUNCTIONS — PADRÕES PERMANENTES

- `verify_jwt: false` em TODAS as EFs — ES256 incompatível com HS256 padrão do Supabase
- Validação manual de JWT dentro do código quando necessário
- `supabaseAdmin` (service_role) SEPARADO de `supabaseAuth` (getUser) — sempre instâncias separadas
- Streaming SSE é o padrão para agentes pastorais
- Deploy: `supabase functions deploy NOME --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt`
- Imports: `Deno.serve(...)` nativo, `import Stripe from 'npm:stripe'`, `import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'`
- Variáveis de ambiente: `Deno.env.get()` — NUNCA `process.env`

---

## AUTH E CRIAÇÃO DE USUÁRIOS

**Método correto (nunca INSERT direto):**
1. Dashboard → Authentication → Users → Add user → Create new user (com Auto Confirm)
2. Copiar UUID gerado
3. `UPDATE auth.users SET raw_app_meta_data = ... WHERE id = UUID`
4. INSERT em `profiles` (id, user_id, church_id, name, display_name)
5. INSERT em `user_roles` (user_id, church_id, role)

**NUNCA:**
- INSERT direto em `auth.users` sem criar `auth.identities`
- `crypt()` SQL para senha — usar Admin API
- `navigate()` quando precisa recarregar contexto auth — usar `window.location.href`

---

## COMERCIAL — AFILIADOS

- Modelo: CSV/PIX — pagamento manual
- **NUNCA** Stripe Connect para afiliados (decisão final, não negociável)
- `affiliates.status` aceita apenas: `active`, `paused`, `banned` (CHECK constraint)

---

## GIT E DEPLOY

| Item | Regra |
|---|---|
| Branch de trabalho | `staging` |
| Fluxo | `staging` → PR manual → `main` → Vercel deploya |
| `main` | Branch protection ativa — push direto bloqueado, PR obrigatório |
| gh CLI | NÃO instalado — PR sempre via URL manual |
| PR URL | `https://github.com/felipeabrantess-jpg/ekthos-platform/compare/main...staging?expand=1` |
| Commits | `feat(escopo)`, `fix(escopo)`, `chore(db)`, `design(ui)` |

---

## SEPARAÇÃO COCKPIT / CRM (DECISÃO ARQUITETURAL PERMANENTE)

O cockpit admin (`/admin/*`) é **SOMENTE LEITURA** sobre dados de igrejas.

- EFs admin: apenas SELECT — NUNCA INSERT/UPDATE/DELETE em tabelas CRM
- Toda ação admin que altera dados de uma church: via EF dedicada + `is_ekthos_admin()` + log em `admin_events`

---

*Documento autoritativo — em caso de conflito com outros arquivos, este prevalece.*
*Próxima revisão sugerida: sempre que houver mudança de pricing, catálogo ou decisão arquitetural permanente.*
