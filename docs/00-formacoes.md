# Ekthos Church — Decisões Permanentes (Formações)
> Documento canônico · Atualizado 29/04/2026
>
> Registro de decisões estratégicas e arquiteturais que NÃO devem ser revertidas
> sem deliberação explícita com Felipe. Cada item tem data e motivo.

---

## ITEM 1 — MODELO DE NEGÓCIO

**Decisão:** SaaS multi-tenant por `church_id`. Cada operação de banco é escopada ao tenant via RLS.  
**Data:** início do projeto  
**Imutável:** sim — reverter quebraria todo o isolamento de dados

---

## ITEM 2 — STACK TÉCNICA

**Decisão:** React 18 + Vite (SWC) + Supabase + Vercel. Edge Functions em Deno.  
**Data:** início do projeto  
**Imutável:** sim

Build usa `vite build` sem `tsc` — intencional. Não alterar.

---

## ITEM 3 — AUTENTICAÇÃO

**Decisão:** Supabase Auth com `app_metadata.church_id`. Função `auth_church_id()` lê SOMENTE de `app_metadata`, sem fallback `user_metadata`.  
**Data:** Frente 1  
**Imutável:** sim — fallback `user_metadata` já causou bug de segurança

Criação de usuários SEMPRE via Dashboard Supabase ou Admin API. NUNCA INSERT direto em `auth.users`.

---

## ITEM 4 — EDGE FUNCTIONS

**Decisão:** `verify_jwt: false` em TODAS as EFs. ES256 incompatível com HS256 padrão.  
**Data:** Frente 2  
**Imutável:** sim

Deploy obrigatório: `supabase functions deploy NOME --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt`

---

## ITEM 5 — PLANOS E PRICING

**Decisão:** `plans.slug` é PK (não `plans.id`). FKs sempre `plan_slug text REFERENCES plans(slug)`.  
**Data:** Frente F (billing)  
**Imutável:** sim

`churches.subscription_plan` DEPRECADO. Fonte de verdade: tabela `subscriptions`.

---

## ITEM 6 — DESIGN SYSTEM EKTHOS CHURCH
> Atualizado 29/04/2026 — paleta antiga (cream/brand/wine) substituída

**Decisão:** Paleta dual mode (azul noite + azul céu + aurora teal + dourado discreto).  
**Data:** 29/04/2026  
**Motivo:** Paleta cream renderizava como marrom escuro em produção (bug dark mode). Felipe optou por direção visual nova: premium, séria, espiritual, sofisticada.  
**Referências:** Linear, Vercel, Apple Vision Pro adaptados ao contexto pastoral.

### Dual Mode obrigatório
- Light mode: DEFAULT (pastor brasileiro 40+ em escritório iluminado)
- Dark mode: toggle no topbar, persistente em `localStorage`, respeita `prefers-color-scheme`
- Implementação: classe `.dark` no `<html>` via ThemeProvider

**Paleta completa:** ver `docs/01-projeto-stack.md`

### Estilo dos ícones: Glass Outline
9 ícones SVG inline. Vidro fosco + traços azuis finos + 1 ponto dourado sutil.  
SVGs disponíveis no histórico do chat de 29/04/2026.

### Bloco de vídeo premium na landing
- Posição: hero centrado + vídeo logo abaixo (Opção 2 — aprovada)
- Implementação: thumbnail estática + modal (não embed direto)
- Tag "VEJA EM 90 SEGUNDOS" antes do bloco
- Caption editorial após
- Container com fundo aurora discreta + botão play azul com ring

---

## ITEM 7 — AFILIADOS

**Decisão:** Modelo manual CSV/PIX — sem Stripe Connect.  
**Data:** sessão F (afiliados)  
**Imutável:** sim — Stripe Connect foi descartado deliberadamente

`affiliates.status` aceita SOMENTE: `active`, `paused`, `banned` (CHECK constraint).

---

## ITEM 8 — PIPELINE DE DISCIPULADO

**Decisão:** 11 etapas configuráveis pelo pastor via `/configuracoes/discipulado`. Ordem e nomes editáveis. SLA configurável.  
**Data:** Frente A  
**Imutável:** estrutura sim, conteúdo (nomes de etapas) é multi-tenant

---

## ITEM 9 — AGENTES IA

**Decisão:** Modelo `claude-haiku-4-5-20251001` para agentes operacionais. `claude-3-5-haiku-20241022` DESCONTINUADO (retorna 404).  
**Data:** 27/04/2026  
**Imutável:** enquanto não houver versão nova do Haiku

---

## ITEM 10 — SEPARAÇÃO COCKPIT / CRM

**Decisão:** `/admin/*` é SOMENTE LEITURA sobre dados das igrejas. Qualquer escrita via Edge Function dedicada com auditoria.  
**Data:** Frente cockpit  
**Imutável:** sim — misturar quebra isolamento multi-tenant

---

## ITEM 11 — FRENTE N (NOTIFICAÇÕES)

**Decisão:** Canal Supabase Realtime único via `NotificationsProvider` (Context). `useNotifications()` nunca chamado diretamente em componentes — apenas via `useNotificationsContext()`.  
**Data:** 29/04/2026  
**Motivo:** Dupla instância causou crash com erro `cannot add postgres_changes callbacks after subscribe()`.

Sino visual reimplementado do zero na Fase 2 do banho de loja com paleta nova.

---

*Toda decisão nova deve ser adicionada aqui com: motivo + data + imutabilidade.*
