# EKTHOS CHURCH — Stack & Arquitetura

## Identidade do produto
SaaS pastoral multi-tenant para igrejas evangélicas brasileiras.
Planos: Chamado (5 admins) | Missão (8 admins) | Avivamento (10 admins).
Público: pastores e equipe pastoral — linguagem eclesiástica, sem termos técnicos.

## Stack completa
- **Frontend**: React 18 + TypeScript + Vite (SWC) + Tailwind CSS
- **UI**: shadcn/ui (Radix primitives) + Lucide icons
- **Estado/Data**: TanStack Query v5 + React Router v6
- **Forms**: react-hook-form + Zod
- **Backend**: Supabase (Auth, Postgres 17, RLS, Edge Functions Deno)
- **Pagamentos**: Stripe (Checkout Sessions, Webhooks, Subscriptions)
- **Automação**: n8n webhooks (pipeline de discipulado)
- **AI**: Anthropic Claude (Haiku para onboarding, agents pastorais)
- **Deploy**: Vercel (frontend) + Supabase Cloud (backend)
- **Repo**: https://github.com/felipeabrantess-jpg/ekthos-platform
- **Branches**: `main` (produção Vercel) ← PR ← `staging` (desenvolvimento)

## Estrutura de pastas críticas
```
web/src/
  pages/          Landing.tsx, Dashboard.tsx, checkout/Sucesso.tsx
  components/     dashboard/, works/, shared/
  hooks/          useAuth, useProfileCompletion, use-mobile, use-toast
  lib/            supabase.ts, database.types.ts
  integrations/supabase/  client.ts, types.ts

supabase/
  functions/      ~40 Edge Functions em Deno
  functions/_shared/  agent-guard.ts, anthropic-client.ts, supabase-client.ts,
                      tenant-loader.ts, whatsapp-api.ts
  migrations/     23 arquivos .sql (00001 → 20260423000032)

web/
  .env.production VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_WHATSAPP_NUMBER
  vercel.json     rewrites: /* → /index.html (SPA)
```

## Variáveis de ambiente críticas
```
# Frontend (Vite — bundled no build, público)
VITE_SUPABASE_URL=https://mlqjywqnchilvgkbvicd.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...  ← ROTACIONAR (SEC-002 pendente)
VITE_WHATSAPP_NUMBER=5521999999999
VITE_META_PIXEL_ID=   ← vazio, não implementado
VITE_GTM_ID=          ← vazio, não implementado

# Edge Functions (Supabase secrets — nunca no frontend)
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
ALLOWED_ORIGIN=https://ekthos-platform.vercel.app
```

## Padrão de autenticação frontend
```ts
// web/src/lib/supabase.ts
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
// Auth via magic-link (inviteUserByEmail) — sem senha
// JWT carrega: app_metadata.church_id, app_metadata.role
```

## Roles do sistema
| Role | Acesso |
|---|---|
| `admin` | Tudo no tenant |
| `admin_departments` | Departamentos e voluntários |
| `pastor_celulas` | Todas as células |
| `supervisor` | Células da sua área |
| `cell_leader` | Apenas sua célula |
| `secretary` | Cadastro/edição de membros |
| `treasurer` | Apenas financeiro |

## IDs de projeto
- Supabase project ref: `mlqjywqnchilvgkbvicd`
- GitHub repo: `felipeabrantess-jpg/ekthos-platform`
- Vercel: conectado ao GitHub, auto-deploy em push para `main`
