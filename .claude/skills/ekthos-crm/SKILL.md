---
name: ekthos-crm
description: |
  Contexto completo do CRM Ekthos para vertical de igrejas evangélicas.
  Use esta skill em QUALQUER tarefa relacionada ao projeto Ekthos: código
  frontend (React/TypeScript), migrations Supabase, Edge Functions, n8n,
  deploy, arquitetura, regras de negócio, vocabulário eclesiástico ou pricing.
  Sempre que a conversa mencionar Ekthos, igrejas, células, membros, pipeline
  de discipulado, ou qualquer arquivo do repositório felipeabrantess-jpg/ekthos-platform,
  esta skill deve estar ativa para garantir vocabulário, convenções e decisões corretas.
---

# Ekthos CRM — Contexto do Projeto

## Stack

- **Frontend:** React 18 + TypeScript + Vite (SWC) + Tailwind CSS + shadcn/ui (Radix)
- **Backend:** Supabase (PostgreSQL + Auth + Realtime + Storage + Edge Functions)
- **Automações:** n8n Cloud (`ekthosai.app.n8n.cloud`)
- **Deploy:** Vercel via GitHub Actions
- **Repositório:** `felipeabrantess-jpg/ekthos-platform`
- **Branch de trabalho:** `staging`

---

## Vertical ativa: Igrejas Evangélicas

### Vocabulário obrigatório

Usar sempre a linguagem eclesiástica — nunca vocabulário corporativo genérico:

| ✅ Correto | ❌ Errado |
|---|---|
| membro | lead |
| visitante | prospect |
| célula | grupo |
| consolidação | follow-up |
| sede | filial |
| culto | reunião |
| discipulado | funil |
| dizimista | pagador |
| pastor | CEO |

---

## Estrutura do banco (migrations 00001–00010)

- **Multi-tenant** por `church_id` em todas as tabelas
- **7 roles:** `admin`, `admin_departments`, `pastor_celulas`, `supervisor`, `cell_leader`, `secretary`, `treasurer`
- **Pipeline de discipulado:** 11 etapas com SLAs definidos (tabela `pipeline_stages`)
- **17 campos do membro** organizados em 5 grupos:
  - `pessoal` — dados básicos, endereço, família
  - `eclesiástico` — batismo, célula, liderança
  - `formação` — escola da fé, discipulado
  - `financeiro` — dizimista (role-gated: admin + treasurer)
  - `acompanhamento` — observações pastorais (role-gated: admin)
- **Notificações in-app** via Supabase Realtime (`notifications` table)
- **Webhooks:** `pg_net` → n8n → Edge Function `n8n-notify`

---

## Regras de negócio críticas

- **Dados de dízimo:** visíveis apenas para `admin` + `treasurer` — RLS `RESTRICTIVE` na tabela `donations` e `financial_campaigns`
- **Observações pastorais:** campo `observacoes_pastorais` apenas para `admin` (confidencial)
- **Campo `data_batismo`:** renderizar somente quando `batismo_status = 'sim'`
- **Suporte 24h:** gratuito em todos os planos (diferencial de produto)
- **Bloqueio de login simultâneo:** um usuário, uma sessão ativa

---

## Pricing

| Plano | Preço/mês | Users | Agentes IA |
|---|---|---|---|
| Professional | R$ 389,00 | 2 | 0 |
| Business | R$ 698,00 | 3 | 0 |
| Enterprise | R$ 1.015,67 | 4 | 0 |
| Usuário extra | R$ 69,90 | +1 | — |
| Agente IA | R$ 97,89 | — | +1 (catálogo de 15) |

---

## Convenções de código

- **Componentes React:** PascalCase
- **Hooks:** prefixo `use` (`useAuth`, `usePastoralDashboard`, etc.)
- **Migrations:** nomeadas `00XXX_descricao.sql` (sequencial)
- **RLS:** obrigatório em toda nova tabela
- **Tipos TypeScript:** gerados via `supabase gen types typescript` (nunca manuais)
- **Commits:** Conventional Commits — `feat:`, `fix:`, `chore:`, `refactor:`
- **Queries Supabase:** `(supabase as any)` apenas para tabelas não-tipadas; preferir regenerar tipos
- **Edge Functions:** Deno, autenticação via `secret_token` no body (não JWT) quando chamadas pelo n8n

---

## Conexões ativas (produção)

- **Supabase URL:** `https://mlqjywqnchilvgkbvicd.supabase.co`
- **n8n webhook pipeline:** `https://ekthosai.app.n8n.cloud/webhook/ekthos-pipeline`
- **n8n webhook people:** `https://ekthosai.app.n8n.cloud/webhook/ekthos-people`
- **Edge Function n8n-notify:** `https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/n8n-notify`
- **Church ID (demo):** `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
