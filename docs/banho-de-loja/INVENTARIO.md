# INVENTÁRIO — Banho de Loja Ekthos Church
> Auditoria automatizada · Branch: feat/banho-de-loja-fase-0 · 2026-04-29

---

## 1. Resumo Executivo

| Métrica | Valor |
|---|---|
| Arquivos `.tsx` | 83 |
| Arquivos `.ts` | 35 |
| **Total frontend** | **118 arquivos** |
| Ocorrências de cor hex hardcoded | **638 linhas** |
| Ocorrências de tokens antigos (cream/brand/wine/hex Ekthos) | **682 linhas** |
| Rotas mapeadas | **62 rotas** |
| Email templates HTML | 2 (`invite.html`, `recovery.html`) |
| CSS vars existentes (`index.css`) | 22 vars (paleta antiga) |
| Animações Tailwind custom | 3 (`fadeInUp`, `shimmer`, `bellRing`) — manter |

---

## 2. Páginas e Rotas Mapeadas

### Públicas (sem auth)
| Rota | Arquivo |
|---|---|
| `/landing` | `pages/Landing.tsx` |
| `/login` | `pages/Login.tsx` |
| `/signup` | `pages/Signup.tsx` |
| `/auth/set-password` | `pages/SetPassword.tsx` |
| `/auth/forgot-password` | `pages/ForgotPassword.tsx` |
| `/auth/reset-password` | `pages/ResetPassword.tsx` |
| `/choose-plan` | `pages/ChoosePlan.tsx` |
| `/onboarding` | `pages/Onboarding.tsx` |
| `/onboarding/configuring` | `pages/onboarding/Configuring.tsx` |
| `/checkout/sucesso` | `pages/checkout/Sucesso.tsx` |
| `/checkout/cancelado` | `pages/checkout/Cancelado.tsx` |
| `/visitor/:churchSlug` | `pages/VisitorLanding.tsx` |

### App Autenticado (Layout principal)
| Rota | Arquivo |
|---|---|
| `/dashboard` | `pages/Dashboard.tsx` |
| `/agenda` | `pages/Agenda.tsx` ⚠️ FullCalendar |
| `/eventos` | `pages/events/EventsList.tsx` |
| `/eventos/novo` | `pages/events/EventForm.tsx` |
| `/pessoas` | `pages/People.tsx` |
| `/lideres` | `pages/people/Leaders.tsx` |
| `/consolidacao` | `pages/people/Consolidation.tsx` |
| `/aniversarios` | `pages/Aniversarios.tsx` |
| `/pipeline` | `pages/Pipeline.tsx` ⚠️ DnD Kit |
| `/celulas` | `pages/Celulas.tsx` |
| `/ministerios` | `pages/Ministerios.tsx` |
| `/voluntarios` | `pages/people/Volunteers.tsx` |
| `/escalas` | `pages/Escalas.tsx` |
| `/financeiro` | `pages/Financeiro.tsx` |
| `/gabinete` | `pages/Gabinete.tsx` |
| `/agentes` | `pages/agents/AgentsList.tsx` |
| `/agentes/:slug` | `pages/agents/AgentDetail.tsx` |
| `/agentes/:slug/conversar` | `pages/agents/AgentChat.tsx` |
| `/configuracoes/dados` | `pages/configuracoes/Dados.tsx` |
| `/configuracoes/identidade` | `pages/configuracoes/Identidade.tsx` |
| `/configuracoes/plano` | `pages/configuracoes/Plano.tsx` |
| `/configuracoes/usuarios` | `pages/configuracoes/Usuarios.tsx` |
| `/configuracoes/modulos` | `pages/configuracoes/Modulos.tsx` |
| `/configuracoes/discipulado` | `pages/configuracoes/DiscipleshipSettings.tsx` |
| `/configuracoes/qr-visitante` | `pages/configuracoes/QrVisitor.tsx` |
| `/settings/billing` | `pages/settings/Billing.tsx` |
| `/settings/users` | `pages/settings/Users.tsx` |
| `/settings/branding` | `pages/settings/Branding.tsx` |
| `/modulos/:id` | `pages/modules/ModuleDetail.tsx` |

### Admin Cockpit (`/admin/*`)
| Rota | Arquivo |
|---|---|
| `/admin/cockpit` | `pages/admin/Cockpit.tsx` ⚠️ Recharts |
| `/admin/churches` | `pages/admin/Churches.tsx` |
| `/admin/churches/:id` | `pages/admin/Church.tsx` |
| `/admin/onboardings` | `pages/admin/Onboardings.tsx` |
| `/admin/leads` | `pages/admin/Leads.tsx` |
| `/admin/tasks` | `pages/admin/Tasks.tsx` |
| `/admin/revenue` | `pages/admin/Revenue.tsx` ⚠️ Recharts |
| `/admin/pricing` | `pages/admin/Pricing.tsx` |
| `/admin/afiliados` | `pages/admin/Affiliates.tsx` |
| `/admin/afiliados/:id` | `pages/admin/AffiliateDetail.tsx` |
| `/admin/comunicacao` | `pages/admin/AdminComunicacao.tsx` |

---

## 3. Componentes Globais Identificados

### Layout
- `components/Layout.tsx` — wrapper principal (NotificationsProvider, Sidebar, AppHeader, main)
- `components/AdminLayout.tsx` — wrapper admin
- `components/Sidebar.tsx` — rail 64px + sub-painel 240px ⚠️ CORES HARDCODED (#0f0f0f, rgba cream)
- `components/MobileHeader.tsx` — header mobile fixo
- `components/AgentChatWidget.tsx` — widget de chat flutuante

### UI Primitivos (em `components/ui/`)
- `Badge.tsx`, `Button.tsx`, `EmptyState.tsx`, `ErrorState.tsx`
- `Input.tsx`, `Modal.tsx`, `PasswordInput.tsx`, `Select.tsx`, `Spinner.tsx`

### Feature Components
- `features/notifications/components/NotificationBell.tsx` — REIMPLEMENTAR na Fase 2
- `features/notifications/components/NotificationPanel.tsx` — REIMPLEMENTAR na Fase 2
- `features/people/components/PersonDetailPanel.tsx`
- `features/people/components/PersonModal.tsx`
- `features/qr-visitor/components/QrCodeModal.tsx`

---

## 4. Cores Hardcoded a Substituir

### Ranking por frequência (top 20)
| Cor | Ocorrências | Significado Atual | Novo Token |
|---|---|---|---|
| `#e13500` / `#E13500` | 244 | Primária Ekthos (vermelho) | `var(--primary)` → `#29B6FF` |
| `#161616` | 71 | Preto/sidebar/texto | `var(--text-primary)` / `var(--surface-sidebar)` |
| `#2D7A4F` | 62 | Success | `var(--success)` — manter semântica |
| `#f9eedc` / `#F9EEDC` | 57 | Cream (fundo) | `var(--bg-primary)` → `#F5FAFF` (light) / `#07131F` (dark) |
| `#C4841D` | 38 | Warning | `var(--warning)` — manter semântica |
| `#670000` | 34 | Wine (secondary) | `var(--secondary)` → `#185FA5` (light) / `#7BE7FF` (dark) |
| `#8A8A8A` | 22 | Texto terciário | `var(--text-tertiary)` → `#6E8398` (light) / `#A9BED3` (dark) |
| `#5A5A5A` | 19 | Texto secundário | `var(--text-secondary)` → `#4A5F75` (light) / `#A9BED3` (dark) |
| `#4F6EE1` | 9 | Azul (links/info?) | `var(--info)` → `#29B6FF` |
| `#25D366` | 9 | WhatsApp verde | Manter (cor de marca externa) |
| `#7C3AED` | 8 | Roxo | `var(--accent-purple)` — avaliar por contexto |
| `#16a34a` | 8 | Verde success | `var(--success)` |
| `#1a1a1a` | 7 | Quase-preto | `var(--surface-dark)` → `#0A1827` |
| `#ffffff` / `#FFFFFF` | 12 | Branco puro | `var(--surface-card)` |
| `#dc2626` | 3 | Erro/destrutivo | `var(--danger)` |
| `#3b5bdb` | 3 | Info azul | `var(--primary)` |
| `#1a1a2e` | 3 | Azul-noite | `var(--surface-sidebar-dark)` |

### Arquivo CSS Vars atual (`index.css`)
22 CSS vars declaradas com paleta antiga (cream, red, wine, black).
**Ação Fase 1:** reescrever completamente com dual mode (`:root` light + `.dark` dark).

---

## 5. Bibliotecas Externas a Tematizar

| Biblioteca | Versão | Complexidade | Estratégia |
|---|---|---|---|
| **FullCalendar** (6 pacotes) | ^6.1.20 | 🔴 ALTA | CSS overrides profundos em `index.css` + `.dark` scoping |
| **Recharts** | ^3.8.1 | 🟡 MÉDIA | Cores passadas como props — extrair para `CHART_COLORS` constant por modo |
| **tailwindcss** | ^3.4.4 | 🟡 MÉDIA | Reescrever `tailwind.config.ts` com novos tokens + `darkMode: 'class'` |
| **lucide-react** | ^1.8.0 | 🟢 BAIXA | Herda `currentColor` — funciona automaticamente |
| **shadcn/ui** (Radix) | - | 🟡 MÉDIA | Usa CSS vars — atualizar vars → componentes seguem |
| **dnd-kit** (Pipeline) | - | 🟢 BAIXA | Apenas overlays de arrastar — bg e border |

---

## 6. Email Templates a Atualizar (Fase 7)

| Arquivo | Uso |
|---|---|
| `supabase/templates/invite.html` | Convite de usuário |
| `supabase/templates/recovery.html` | Recuperação de senha |

Ambos usam paleta antiga (vermelho/cream). Atualizar para azul `#29B6FF` + fundo `#07131F` (dark email style).

---

## 7. Tailwind Config — Estado Atual vs Necessário

### Atual: tokens antigos
- `brand.*` (vermelho escala 50–900)
- `wine.*` (vinho escala)
- `cream.*` (creme escala)
- `ekthos.*` (preto escala)
- `success.*`, `warning.*`

### Necessário (Fase 1):
```js
// tailwind.config.ts
darkMode: 'class',  // ← ADICIONAR
theme.extend.colors: {
  primary: 'var(--primary)',
  secondary: 'var(--secondary)',
  'bg-base': 'var(--bg-base)',
  'bg-card': 'var(--bg-card)',
  'bg-sidebar': 'var(--bg-sidebar)',
  border: 'var(--border)',
  'text-base': 'var(--text-base)',
  'text-muted': 'var(--text-muted)',
  'text-subtle': 'var(--text-subtle)',
  'accent-teal': 'var(--accent-teal)',
  'accent-gold': 'var(--accent-gold)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  info: 'var(--info)',
}
```

---

## 8. Estimativa por Fase

| Fase | Descrição | Horas |
|---|---|---|
| 0 | Auditoria (este documento) | ~1h |
| 1 | CSS Vars + Tailwind + ThemeProvider + Toggle | 3–4h |
| 2 | Componentes globais (Button, Card, Input, Modal, Sidebar, AppHeader, Bell) | 6–8h |
| 3 | CRM principal (12 páginas app) | 8–10h |
| 4 | Config + Cockpit admin (10 telas) | 6–8h |
| 5 | Auth + Onboarding (7 páginas) | 3–4h |
| 6 | Landing + Páginas públicas + 9 ícones Glass Outline | 6–8h |
| 7 | Email templates (2 arquivos) | 1–2h |
| 8 | Validação E2E + correções finais | 3–4h |
| **TOTAL** | | **~37–49h** |

---

## 9. Riscos Identificados

### 🔴 Alto
- **FullCalendar** (`Agenda.tsx`) — CSS próprio, seletores aninhados profundos. Tema dark requer ~50 overrides. Risco de quebra em mobile.
- **638 cores hardcoded** — risco de regressão se feito manualmente. Usar search/replace sistemático + revisão por arquivo.
- **Dual mode em produção** — ThemeProvider precisa ser wrappar raiz antes de qualquer componente. Posição errada quebra tudo.

### 🟡 Médio
- **Recharts** (4 arquivos) — cores passadas inline como `fill="#e13500"`. Cada gráfico precisa receber as cores do tema via hook/constante.
- **Pipeline DnD** (`Pipeline.tsx`) — drag overlay usa posição absolute com bg hardcoded. Pode ter z-index issues no dark mode.
- **Landing.tsx** (132 cores) — arquivo mais denso. Risco de regredir o flow de checkout público.
- **CSS vars `--church-primary`/`--church-secondary`** — são injetadas dinamicamente em `Layout.tsx` via `useEffect`. No dark mode, precisam coexistir com os novos tokens.

### 🟢 Baixo
- **Sidebar rail** — estrutura já é dark por padrão (`#0f0f0f`). Adaptar para variável é simples.
- **shadcn/ui** — usa CSS vars nativamente. Basta mapear as vars novas.
- **Lucide icons** — herda `currentColor` automaticamente.

---

## 10. Decisões Pendentes para Fase 1

1. **ThemeProvider**: implementar como Context + `localStorage` + `prefers-color-scheme` → classe `.dark` no `<html>`
2. **Toggle de tema**: onde fica? Proposta: `AppHeader` (desktop) + `MobileHeader` (mobile)
3. **CSS vars multi-tenant**: `--church-primary` e `--church-secondary` devem ser preservadas e compostas sobre os tokens novos — não substituídas
4. **Recharts**: extrair constante `CHART_COLORS` por tema e passar via props — não usar CSS vars (Recharts não suporta)
5. **FullCalendar**: criar arquivo `src/styles/fullcalendar-theme.css` dedicado com overrides light + dark

---

## 11. Skills Aplicadas — Fase 0

### executing-plans
- Revisão crítica do plano antes de executar (Step 1 da skill)
- Identificação de estado existente (branch e arquivos da sessão anterior) antes de re-executar
- Verificação de cada arquivo gerado (contagem de linhas, conteúdo)
- Reporte estruturado ao completar a fase (este documento)
- Nenhum commit feito antes de validação do Felipe (regra da skill: não committar sem aprovação)

---

*Gerado automaticamente em Fase 0 · Skills: executing-plans · Não commitar até validação do Felipe.*
