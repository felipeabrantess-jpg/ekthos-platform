# Ekthos Platform — Instruções para Claude

## [PRODUTO]
SaaS multi-tenant de gestão de igrejas.
Módulos: Dashboard · Pessoas · Pipeline · Ministérios · Voluntários
         Escalas · Financeiro · Agenda · Gabinete · Células
Isolamento de dados: por church_id — toda operação é escopada ao tenant.
Status: MVP em desenvolvimento ativo, banco em produção.

## [STACK]
Frontend: React 18 + TypeScript 5 + Vite 5 (SWC) + Tailwind CSS 3
Queries:  TanStack Query v5
Routing:  React Router v6
Backend:  Supabase — Auth, Postgres, Storage, Edge Functions
Runtime:  Edge Functions em Deno — nunca Node.js
Build:    vite build sem tsc — intencional, não alterar

## [ESTRUTURA DE FEATURE]
Toda feature segue este padrão exato:
  src/features/<modulo>/hooks/use<Feature>.ts   → lógica de dados
  src/features/<modulo>/components/             → componentes do módulo
  src/pages/<Modulo>.tsx                        → view pura, sem lógica
  + registrar rota em src/App.tsx
  + adicionar item em src/components/Sidebar.tsx

Componentes UI reutilizáveis em src/components/ui/:
  Button · Input · Modal · Badge · Spinner · EmptyState · ErrorState

Regras estruturais:
- Lógica de negócio nunca em páginas
- Hooks nunca importam de outros hooks de feature
- Páginas usam apenas: useAuth() + hook do módulo + UI state + render

## [REGRAS DE QUERY]
Todo useQuery:
  - enabled: Boolean(churchId) — sem exceção
  - .eq('church_id', churchId) como primeira cláusula após .from()
  - .is('deleted_at', null) nas tabelas com soft delete

Todo update e delete:
  - duplo filtro obrigatório: .eq('id', id).eq('church_id', church_id)

Todo insert que precisa do retorno:
  - encadear .select().single() após o insert

onSuccess das mutations:
  - invalidar todas as queryKeys afetadas, incluindo compostas
  - delete em people invalida: ['people'], ['people-count'], ['dashboard-stats']

churchId vem sempre de useAuth() — nunca hardcoded, nunca via props diretas.
Exceção documentada: tabela roles (leitura pública, sem filtro church_id).

## [PADRÃO AS ANY]
Inserts e updates usam cast obrigatório:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .insert(dados as any)
  .update(dados as any)

Limitação conhecida do Supabase JS v2.43 com Relationships: [].
NÃO é bug — NÃO remover — NÃO tentar corrigir com outro cast.
Build usa vite build sem tsc — erros de tipo em insert/update não
bloqueiam o build, mas o padrão deve ser mantido.

## [SOFT DELETE]
Tabelas com soft delete: people · ministries · volunteers · leaders

Delete sempre via:
  .update({ deleted_at: new Date().toISOString() } as any)
  + .eq('id', id).eq('church_id', churchId)

Nunca usar .delete() nessas tabelas.
Toda leitura filtra: .is('deleted_at', null).
Soft delete em people invalida também ['dashboard-stats'].

## [PADRÃO DE MIGRATION]
Arquivos em supabase/migrations/ são imutáveis após aplicação.
Toda mudança de schema = novo arquivo com próximo prefixo sequencial.

Toda nova tabela obrigatoriamente inclui:
  1. church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE
  2. created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  3. Trigger set_updated_at() se tiver coluna updated_at
  4. ALTER TABLE <nome> ENABLE ROW LEVEL SECURITY
  5. CREATE POLICY "<nome>_tenant_select" FOR SELECT
       USING (church_id = auth_church_id())
  6. CREATE POLICY "<nome>_service_all" FOR ALL
       USING (auth.role() = 'service_role')
  7. CREATE INDEX IF NOT EXISTS idx_<nome>_church_id ON <nome> (church_id)

Comentários das migrations em português.
Cabeçalho descritivo obrigatório em toda migration nova.

## [EDGE FUNCTIONS]
Runtime Deno — imports via path relativo (.ts) ou URL, nunca npm.
Utilitários compartilhados em supabase/functions/_shared/:
  supabase-client.ts → cliente service_role + writeAuditLog + respostas padrão
  tenant-loader.ts   → resolução de tenant por identificador externo
  whatsapp-api.ts    → integração WhatsApp Business API

Padrão para webhooks:
  1. Validar assinatura HMAC antes de processar qualquer dado
  2. Responder 200 imediatamente — processar de forma assíncrona
  3. Resolver churchId antes de qualquer operação de banco
  4. Usar service_role para bypass intencional de RLS

Deduplicação de interactions: capturar código de erro 23505.
Fetch interno: AbortSignal.timeout(30_000) obrigatório.
Variáveis de ambiente: Deno.env.get() — nunca process.env.

## [TIPOS]
Fonte de verdade: src/lib/database.types.ts
Campo novo no banco → atualizar interface correspondente.
Tabela nova → adicionar entrada em Database.Tables com Relationships: [].
Tipo composto (join) → criar interface separada estendendo a base.

## [PROBLEMAS CONHECIDOS DO MVP]
Não replicar estes comportamentos em código novo:

- usePeople: .limit(100) hardcoded — paginação não implementada ainda
- useDashboardStats: activeInteractions conta as últimas 8, não interações reais
- useDashboardStats: pipeline summary não filtra pessoas com deleted_at
- UpdatePersonInput em usePeople.ts não expõe os 35+ campos novos do merge
