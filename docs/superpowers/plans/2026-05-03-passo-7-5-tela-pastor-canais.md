# PASSO 7.5 — Tela Read-Only de Canais para o Pastor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar rota `/configuracoes/canais` read-only ao painel do pastor para visualizar os canais configurados pela Ekthos, sem nenhum controle de edição.

**Architecture:** Thin hook `useChurchChannelsForPastor` wraps `useChurchChannels` (PASSO 7) com `useAuth().churchId` e polling 60s. Componente `CanaisIgrejaPastor` é puramente visual (zero mutations). Rota nova adicionada ao `SettingsLayout` (tab + route + sidebar).

**Tech Stack:** React + TypeScript + TanStack Query + Tailwind + lucide-react + Ekthos design system (cream/red/black/wine)

---

## Contexto de Auditoria (pré-requisito confirmado)

- **Estrutura `/configuracoes`:** `SettingsLayout.tsx` com `TABS` array + `ConfigSubPanel` em `Sidebar.tsx`
- **RPC `list_church_channels` permite pastor:** SIM — OR condition `profiles.church_id = p_church_id` + RLS `pastor_select_own_church`
- **Hook de church_id:** `useAuth()` → `const { churchId } = useAuth()` (de `@/hooks/useAuth`)
- **Padrão de páginas:** arquivo em `web/src/pages/configuracoes/`, lazy import em `App.tsx`, tab em `SettingsLayout.tsx`, ConfigLink em `Sidebar.tsx`

---

## Mapa de Arquivos

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `web/src/hooks/useChurchChannelsForPastor.ts` | **Criar** | Hook read-only com polling 60s, churchId via useAuth |
| `web/src/components/configuracoes/CanaisIgrejaPastor.tsx` | **Criar** | UI read-only: cards, badges, empty state |
| `web/src/pages/configuracoes/Canais.tsx` | **Criar** | Shell da página (header + componente) |
| `web/src/pages/configuracoes/SettingsLayout.tsx` | **Modificar** | Adicionar tab "Canais" ao TABS array |
| `web/src/App.tsx` | **Modificar** | Lazy import + route `/configuracoes/canais` |
| `web/src/components/Sidebar.tsx` | **Modificar** | ConfigLink "Canais" no ConfigSubPanel |

---

## Task 1: Hook `useChurchChannelsForPastor`

**Files:**
- Create: `web/src/hooks/useChurchChannelsForPastor.ts`

- [ ] **Step 1: Criar o hook**

```typescript
/**
 * useChurchChannelsForPastor
 *
 * Read-only hook para pastores/membros visualizarem os canais da sua igreja.
 * Reusa a RPC list_church_channels (PASSO 7) que já tem permissão para pastores
 * via SECURITY DEFINER + profiles.church_id check.
 *
 * Polling 60s — captura atualizações de status do n8n callback.
 */

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import type { ChurchChannel } from '@/hooks/useChurchChannels'

export function useChurchChannelsForPastor() {
  const { churchId } = useAuth()

  return useQuery({
    queryKey: ['pastor-channels', churchId],
    queryFn: async (): Promise<ChurchChannel[]> => {
      if (!churchId) return []
      const { data, error } = await supabase.rpc('list_church_channels', {
        p_church_id: churchId,
      })
      if (error) throw new Error(error.message)
      return (data ?? []) as ChurchChannel[]
    },
    enabled: !!churchId,
    staleTime: 30_000,
    refetchInterval: 60_000,  // polling mais lento que o cockpit admin
  })
}
```

- [ ] **Step 2: Confirmar que o tipo ChurchChannel está exportado em useChurchChannels.ts**

```bash
grep -n "export interface ChurchChannel" web/src/hooks/useChurchChannels.ts
```

Esperado: `export interface ChurchChannel {`

Se não estiver exportado, adicionar `export` na frente de `interface ChurchChannel` em `useChurchChannels.ts`.

- [ ] **Step 3: Commit**

```bash
git add web/src/hooks/useChurchChannelsForPastor.ts
git commit -m "feat(canais): hook useChurchChannelsForPastor read-only com polling 60s"
```

---

## Task 2: Componente `CanaisIgrejaPastor`

**Files:**
- Create: `web/src/components/configuracoes/CanaisIgrejaPastor.tsx`

- [ ] **Step 1: Criar o componente**

```typescript
/**
 * CanaisIgrejaPastor — read-only, para /configuracoes/canais
 *
 * Exibe os canais configurados pela Ekthos para a igreja.
 * Sem botões de edição, adição ou exclusão.
 * instance_id mascarado. error_message NÃO renderizado.
 */

import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import type { ChurchChannel } from '@/hooks/useChurchChannels'

// ── Config por provider ───────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  zapi:           'Z-API',
  meta_cloud:     'Meta Cloud API',
  instagram:      'Instagram',
  telegram:       'Telegram',
  whatsapp_cloud: 'WhatsApp Cloud',
}

const PROVIDER_ACCENT: Record<string, string> = {
  zapi:           '#EA580C',
  meta_cloud:     '#2563EB',
  instagram:      '#E1306C',
  telegram:       '#229ED9',
  whatsapp_cloud: '#25D366',
}

// ── Config por agent_slug ─────────────────────────────────────────────────────

const AGENT_LABELS: Record<string, string> = {
  'agent-acolhimento':   'Acolhimento',
  'agent-reengajamento': 'Reengajamento',
  'agent-operacao':      'Operação',
  'agent-suporte':       'Suporte',
  'agent-agenda':        'Agenda',
  'agent-financeiro':    'Financeiro',
  'agent-conteudo':      'Conteúdo',
  'agent-formacao':      'Formação',
  'agent-funil':         'Funil',
  'agent-cuidado':       'Cuidado',
}

function agentLabel(slug: string): string {
  return AGENT_LABELS[slug] ?? slug.replace('agent-', '')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskInstanceId(id: string | null): string {
  if (!id) return '—'
  if (id.length <= 3) return id
  return `${id.slice(0, 3)}…`
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)   return 'agora mesmo'
  if (mins  < 60)  return `há ${mins} min`
  if (hours < 24)  return `há ${hours}h`
  return `há ${days}d`
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ChurchChannel['status'] }) {
  const configs: Record<ChurchChannel['status'], { label: string; className: string; pulse?: boolean }> = {
    connected:    { label: 'Conectado',    className: 'bg-green-100 text-green-700 border-green-200' },
    provisioning: { label: 'Configurando', className: 'bg-amber-100 text-amber-700 border-amber-200', pulse: true },
    pending:      { label: 'Pendente',     className: 'bg-gray-100 text-gray-500 border-gray-200' },
    error:        { label: 'Erro',         className: 'bg-red-100 text-red-600 border-red-200' },
    disabled:     { label: 'Desativado',   className: 'bg-gray-200 text-gray-500 border-gray-300' },
  }
  const cfg = configs[status] ?? configs.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${
        status === 'connected'    ? 'bg-green-500' :
        status === 'provisioning' ? `bg-amber-500 ${cfg.pulse ? 'animate-pulse' : ''}` :
        status === 'error'        ? 'bg-red-500' :
        'bg-gray-400'
      }`} />
      {cfg.label}
    </span>
  )
}

// ── Provider badge ────────────────────────────────────────────────────────────

function ProviderBadge({ provider }: { provider: string }) {
  const accent = PROVIDER_ACCENT[provider] ?? '#6B7280'
  const label  = PROVIDER_LABELS[provider] ?? provider
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold text-white"
      style={{ backgroundColor: accent }}
    >
      {label}
    </span>
  )
}

// ── Agent chip ────────────────────────────────────────────────────────────────

function AgentChip({ slug }: { slug: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-ekthos-black/6 text-ekthos-black/60 border border-black/8">
      <span className="text-[9px]">⇉</span>
      {agentLabel(slug)}
    </span>
  )
}

// ── Canal card ────────────────────────────────────────────────────────────────

function CanalCard({ channel }: { channel: ChurchChannel }) {
  const accent = PROVIDER_ACCENT[channel.provider] ?? '#6B7280'
  return (
    <div
      className="bg-white rounded-2xl border border-black/6 overflow-hidden shadow-sm"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="p-4 space-y-3">
        {/* Header: provider + status */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <ProviderBadge provider={channel.provider} />
          <StatusBadge status={channel.status} />
        </div>

        {/* display_name */}
        {channel.display_name && (
          <p className="text-sm font-semibold text-ekthos-black leading-snug">
            {channel.display_name}
          </p>
        )}

        {/* Campos técnicos */}
        <div className="grid grid-cols-2 gap-2">
          {channel.phone_number && (
            <div className="p-2 bg-[#f9eedc] rounded-lg">
              <p className="text-[9px] font-bold uppercase tracking-wider text-ekthos-black/40 mb-0.5">Número</p>
              <p className="text-xs font-mono text-ekthos-black/70">{channel.phone_number}</p>
            </div>
          )}
          {channel.provider_instance_id && (
            <div className="p-2 bg-[#f9eedc] rounded-lg">
              <p className="text-[9px] font-bold uppercase tracking-wider text-ekthos-black/40 mb-0.5">Instance ID</p>
              <p className="text-xs font-mono text-ekthos-black/70">{maskInstanceId(channel.provider_instance_id)}</p>
            </div>
          )}
        </div>

        {/* Agent slugs */}
        {channel.agent_slugs.length > 0 && (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-ekthos-black/40 mb-1.5">Agentes roteados</p>
            <div className="flex flex-wrap gap-1">
              {channel.agent_slugs.map(slug => (
                <AgentChip key={slug} slug={slug} />
              ))}
            </div>
          </div>
        )}

        {/* updated_at */}
        <p className="text-[10px] text-ekthos-black/30">
          Atualizado {relativeTime(channel.updated_at)}
        </p>
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="h-14 w-14 rounded-2xl bg-ekthos-black/5 flex items-center justify-center mb-4">
        <WifiOff size={24} className="text-ekthos-black/25" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-semibold text-ekthos-black/60">Nenhum canal configurado ainda.</p>
      <p className="text-xs text-ekthos-black/35 mt-1 max-w-xs leading-relaxed">
        A equipe Ekthos configurará seus canais durante a ativação dos agentes.
      </p>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

interface CanaisIgrejaPastorProps {
  channels:    ChurchChannel[]
  isLoading:   boolean
  isError:     boolean
  refetch:     () => void
}

export default function CanaisIgrejaPastor({
  channels, isLoading, isError, refetch
}: CanaisIgrejaPastorProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => (
          <div key={i} className="h-36 rounded-2xl bg-gradient-to-r from-[#f9eedc] via-[#EDE0CC] to-[#f9eedc] bg-[length:200%_100%] animate-[shimmer_1.5s_infinite]" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
        <Wifi size={16} className="text-red-500 shrink-0" strokeWidth={2} />
        <p className="text-sm text-red-700 flex-1">Erro ao carregar canais.</p>
        <button
          onClick={refetch}
          className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 font-medium"
        >
          <RefreshCw size={12} strokeWidth={2} />
          Tentar novamente
        </button>
      </div>
    )
  }

  if (channels.length === 0) return <EmptyState />

  return (
    <div className="space-y-3">
      {channels.map(ch => (
        <CanalCard key={ch.id} channel={ch} />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Criar o diretório se não existir**

```bash
mkdir -p web/src/components/configuracoes
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/configuracoes/CanaisIgrejaPastor.tsx
git commit -m "feat(canais): componente CanaisIgrejaPastor read-only com provider badges e empty state"
```

---

## Task 3: Página `Canais.tsx`

**Files:**
- Create: `web/src/pages/configuracoes/Canais.tsx`

- [ ] **Step 1: Criar a página**

```typescript
/**
 * Canais.tsx — /configuracoes/canais
 *
 * Tela read-only do pastor para visualizar canais configurados pela Ekthos.
 * Sem controles de edição, criação ou exclusão.
 */

import CanaisIgrejaPastor from '@/components/configuracoes/CanaisIgrejaPastor'
import { useChurchChannelsForPastor } from '@/hooks/useChurchChannelsForPastor'

export function Canais() {
  const { data: channels = [], isLoading, isError, refetch } = useChurchChannelsForPastor()

  return (
    <div className="space-y-5 max-w-lg">
      {/* Header */}
      <div>
        <h2 className="font-display text-xl font-semibold text-ekthos-black">
          Canais de Comunicação
        </h2>
        <p className="text-sm text-ekthos-black/50 mt-1 leading-relaxed">
          Estes são os canais configurados pela equipe Ekthos para conectar
          os agentes da sua igreja aos meios de atendimento e automação.
        </p>
      </div>

      {/* Lista de canais */}
      <CanaisIgrejaPastor
        channels={channels}
        isLoading={isLoading}
        isError={isError}
        refetch={refetch}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/configuracoes/Canais.tsx
git commit -m "feat(canais): página Canais.tsx read-only para /configuracoes/canais"
```

---

## Task 4: Atualizar `SettingsLayout.tsx`

**Files:**
- Modify: `web/src/pages/configuracoes/SettingsLayout.tsx`

- [ ] **Step 1: Adicionar import do ícone Radio e tab Canais ao array TABS**

Adicionar `Radio` ao import de lucide-react (linha 15):

```typescript
import { Building2, Palette, CreditCard, Users, Package, GitBranch, QrCode, Radio } from 'lucide-react'
```

Adicionar item ao array TABS (após `qr-visitante`):

```typescript
  { path: 'canais', label: 'Canais', Icon: Radio, description: 'Canais de comunicação ativos' },
```

O array TABS completo fica:

```typescript
const TABS = [
  { path: 'dados',           label: 'Dados',           Icon: Building2,  description: 'Nome, endereço e CNPJ' },
  { path: 'identidade',      label: 'Identidade',      Icon: Palette,    description: 'Logo e cores da Igreja' },
  { path: 'plano',           label: 'Plano',           Icon: CreditCard, description: 'Assinatura e faturamento' },
  { path: 'usuarios',        label: 'Usuários',        Icon: Users,      description: 'Equipe com acesso ao sistema' },
  { path: 'modulos',         label: 'Módulos',         Icon: Package,    description: 'Add-ons pagos' },
  { path: 'discipulado',     label: 'Discipulado',     Icon: GitBranch,  description: 'Etapas da jornada espiritual' },
  { path: 'qr-visitante',    label: 'QR Visitante',    Icon: QrCode,     description: 'Captura de visitantes via QR' },
  { path: 'canais',          label: 'Canais',          Icon: Radio,      description: 'Canais de comunicação ativos' },
]
```

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/configuracoes/SettingsLayout.tsx
git commit -m "feat(canais): adicionar tab Canais ao SettingsLayout"
```

---

## Task 5: Atualizar `App.tsx`

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Adicionar lazy import para a página Canais**

Após a linha do `QrVisitorPage` (linha 85-86), adicionar:

```typescript
const CanaisPage = lazy(() =>
  import('@/pages/configuracoes/Canais').then(m => ({ default: m.Canais }))
)
```

- [ ] **Step 2: Adicionar a rota `/configuracoes/canais`**

Dentro do bloco `<Route path="configuracoes" ...>`, após a linha de `qr-visitante` (linha 306), adicionar:

```tsx
<Route path="canais" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><CanaisPage /></Suspense></ErrorBoundary>} />
```

- [ ] **Step 3: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat(canais): rota /configuracoes/canais com lazy loading"
```

---

## Task 6: Atualizar `Sidebar.tsx`

**Files:**
- Modify: `web/src/components/Sidebar.tsx`

- [ ] **Step 1: Adicionar link "Canais" ao ConfigSubPanel**

Localizar a seção "Integrações" (linhas 415-417) em `ConfigSubPanel`. Adicionar uma nova seção "Comunicação" com o link de Canais, **antes** da seção "Integrações":

```tsx
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-4"
        style={{ color: 'var(--text-tertiary)' }}>Comunicação</p>
      <ConfigLink to="/configuracoes/canais" label="Canais" />
```

O bloco completo do `ConfigSubPanel` return fica:

```tsx
  return (
    <div className="space-y-0.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-3"
        style={{ color: 'var(--text-tertiary)' }}>Identidade</p>
      <ConfigLink to="/configuracoes/dados"      label="Dados da Igreja" />
      <ConfigLink to="/configuracoes/identidade" label="Branding" />

      <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-4"
        style={{ color: 'var(--text-tertiary)' }}>Equipe</p>
      <ConfigLink to="/configuracoes/usuarios" label="Usuários e Permissões" />

      <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-4"
        style={{ color: 'var(--text-tertiary)' }}>Assinatura</p>
      <ConfigLink to="/configuracoes/plano"   label="Plano e Cobrança" />
      <ConfigLink to="/configuracoes/modulos" label="Módulos e Add-ons" />

      <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-4"
        style={{ color: 'var(--text-tertiary)' }}>Comunicação</p>
      <ConfigLink to="/configuracoes/canais" label="Canais" />

      <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-4"
        style={{ color: 'var(--text-tertiary)', opacity: 0.7 }}>Integrações</p>
      <InactiveLink label="Integrações" />

      <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-4"
        style={{ color: 'var(--text-tertiary)', opacity: 0.7 }}>Operacional</p>
      <InactiveLink label="Automações" />
    </div>
  )
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/Sidebar.tsx
git commit -m "feat(canais): link Canais na seção Comunicação do ConfigSubPanel"
```

---

## Task 7: Build e Validação C1-C6

**Files:**
- No files — verificação

- [ ] **Step 1: Rodar build**

```bash
cd web && npm run build
```

Esperado: `✓ built in X.XXs` — zero erros TypeScript.

Se houver erro de tipo em `CanaisIgrejaPastor`, verificar que `ChurchChannel` está exportado em `useChurchChannels.ts`.

- [ ] **Step 2: Verificar C2 — isolamento RLS via SQL**

```sql
-- Executar no MCP Supabase como query
-- Confirma que a policy existe
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'church_channels'
  AND policyname = 'pastor_select_own_church';
```

Esperado: 1 linha com `policyname = 'pastor_select_own_church'`, `cmd = 'SELECT'`.

- [ ] **Step 3: Verificar C4 — zero mutations na UI**

```bash
grep -rn "useMutation\|supabase.from.*update\|supabase.from.*insert\|supabase.from.*delete\|POST\|PUT\|DELETE" \
  web/src/components/configuracoes/CanaisIgrejaPastor.tsx \
  web/src/pages/configuracoes/Canais.tsx \
  web/src/hooks/useChurchChannelsForPastor.ts
```

Esperado: nenhum match.

- [ ] **Step 4: Verificar C5 — campos seguros na RPC**

```bash
grep -n "token\|secret\|api_key\|webhook\|metadata" \
  web/src/components/configuracoes/CanaisIgrejaPastor.tsx
```

Esperado: nenhum match (metadata não é renderizado, error_message não é renderizado).

- [ ] **Step 5: Commit de verificação**

```bash
git add -A  # Não deve ter nada novo
git commit --allow-empty -m "chore(canais): validação C1-C6 build verde"
```

---

## Task 8: Push e PR

- [ ] **Step 1: Push da branch**

```bash
git push origin feat/passo-7-5-tela-pastor-canais
```

- [ ] **Step 2: Abrir PR manual**

URL: `https://github.com/felipeabrantess-jpg/ekthos-platform/compare/main...feat/passo-7-5-tela-pastor-canais?expand=1`

---

## Self-Review

### Spec Coverage

| Requisito | Task que cobre |
|-----------|---------------|
| Rota `/configuracoes/canais` | Task 4, 5 |
| Item no menu lateral | Task 4, 6 |
| `useChurchChannelsForPastor` com polling 60s | Task 1 |
| churchId via useAuth() sem hardcode | Task 1 |
| Cards read-only com provider badge | Task 2 |
| instance_id mascarado | Task 2 (`maskInstanceId`) |
| agent_slugs como chips | Task 2 (`AgentChip`) |
| Status badge com pulse em provisioning | Task 2 (`StatusBadge`) |
| updated_at relativo | Task 2 (`relativeTime`) |
| Empty state com WifiOff | Task 2 (`EmptyState`) |
| NÃO exibir error_message | Task 2 (componente não renderiza `channel.error_message`) |
| NÃO exibir botões de edição | Task 2 (zero mutation calls) |
| Build verde | Task 7 |
| C2 isolamento RLS | Task 7, Step 2 |
| C4 read-only verificado | Task 7, Step 3 |
| C5 segurança verificada | Task 7, Step 4 |

### Placeholder Scan
- Nenhum "TBD", "TODO" ou "implement later" encontrado.
- Todos os steps têm código completo.

### Type Consistency
- `ChurchChannel` importado de `@/hooks/useChurchChannels` em Task 1 e Task 2 ✓
- `useChurchChannelsForPastor` retorna `ChurchChannel[]` consistente com `CanaisIgrejaPastorProps.channels: ChurchChannel[]` ✓
- `refetch: () => void` consistente com o retorno de `useQuery` ✓
