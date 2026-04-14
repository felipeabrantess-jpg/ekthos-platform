# Aplicando as Migrations no Supabase Dashboard

Este guia descreve como aplicar as migrations 00011 a 00013 manualmente no Supabase Dashboard.

## Pré-requisitos
- Acesso ao Supabase Dashboard do projeto Ekthos
- Role de `service_role` ou acesso de admin ao banco

## Migrations a Aplicar

### 00011_billing.sql
Cria as tabelas de billing (plans, subscriptions, church_agents, agent_marketplace).

### 00012_onboarding.sql
Cria as tabelas de onboarding (onboarding_sessions, onboarding_steps, church_sites, pastoral_goals, message_templates).
Inclui políticas RLS para isolamento multi-tenant.

### 00013_admin_cockpit.sql
Cria as tabelas do painel administrativo (health_scores, impersonate_sessions).
Cria a view `admin_churches_overview`.
Adiciona políticas RLS para acesso admin only.

## Como Aplicar

1. Acesse o [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecione o projeto Ekthos
3. Vá em **SQL Editor** → **New Query**
4. Copie o conteúdo de cada arquivo de migration (em ordem numérica)
5. Execute cada migration individualmente, verificando que não há erros antes de prosseguir

## Ordem de Execução
Execute SEMPRE na ordem numérica:
1. `supabase/migrations/00011_billing.sql`
2. `supabase/migrations/00012_onboarding.sql`
3. `supabase/migrations/00013_admin_cockpit.sql`

## Verificação Pós-Aplicação
Após cada migration, verifique no **Table Editor** que as tabelas foram criadas corretamente.

Para 00013, verifique também que a view `admin_churches_overview` existe em **Database → Views**.
