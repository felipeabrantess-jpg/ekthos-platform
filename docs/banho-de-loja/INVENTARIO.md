# INVENTÁRIO — Banho de Loja Ekthos Church
> Fase 0 · Auditoria automatizada · Branch: feat/banho-de-loja-fase-0 · 29/04/2026

---

## 1. Resumo Executivo

| Métrica | Valor |
|---|---|
| Arquivos `.tsx` | 83 |
| Arquivos `.ts` | 35 |
| **Total frontend** | **118 arquivos** |
| Ocorrências de cor hex hardcoded | **638 linhas** |
| Ocorrências de tokens antigos (cream/brand/wine) | **358 linhas** |
| Rotas registradas | **66 rotas** |
| Email templates HTML | 2 (`invite.html`, `recovery.html`) |
| CSS vars declaradas (index.css) | 22 vars — paleta antiga, reescrever inteira |
| Animações Tailwind custom | 3 (`fadeInUp`, `shimmer`, `bellRing`) — manter |

---

## 2. Páginas e Rotas Mapeadas

### Públicas (sem auth)
| Rota | Arquivo |
|---|---|
| `/landing` | `pages/Landing.tsx` ⚠️ 132 hardcodes |
| `/login` | `pages/Login.tsx` |
| `/signup` | `pages/Signup.tsx` |
| `/auth/set-password` | `pages/SetPassword.tsx` |
| `/auth/forgot-password` | `pages/ForgotPassword.tsx` |
| `/auth/reset-password` | `pages/ResetPassword.tsx` |
| `/choose-plan` | `pages/ChoosePlan.tsx` |
| `/onboarding` | `pages/Onboarding.tsx` ⚠️ 46 hardcodes |
| `/onboarding/configuring` | `pages/onboarding/Configuring.tsx` ⚠️ 35 hardcodes |
| `/checkout/sucesso` | `pages/checkout/Sucesso.tsx` |
| `/checkout/cancelado` | `pages/checkout/Cancelado.tsx` |
| `/visitor/:churchSlug` | `pages/VisitorLanding.tsx` |

### App Autenticado (Layout + Sidebar)
| Rota | Arquivo |
|---|---|
| `/dashboard` | `pages/Dashboard.tsx` (16 hardcodes) |
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
| `/modulos/:id` | `pages/modules/ModuleDetail.tsx` |

### Configurações
| Rota | Arquivo |
|---|---|
| `/configuracoes/dados` | `pages/configuracoes/Dados.tsx` |
| `/configuracoes/identidade` | `pages/configuracoes/Identidade.tsx` |
| `/configuracoes/plano` | `pages/configuracoes/Plano.tsx` |
| `/configuracoes/usuarios` | `pages/configuracoes/Usuarios.tsx` |
| `/configuracoes/modulos` | `pages/configuracoes/Modulos.tsx` |
| `/configuracoes/discipulado` | `pages/configuracoes/DiscipleshipSettings.tsx` (10 hardcodes) |
| `/configuracoes/qr-visitante` | `pages/configuracoes/QrVisitor.tsx` |
| `/settings/billing` | `pages/settings/Billing.tsx` |
| `/settings/users` | `pages/settings/Users.tsx` |
| `/settings/branding` | `pages/settings/Branding.tsx` |

### Admin Cockpit (`/admin/*`)
| Rota | Arquivo |
|---|---|
| `/admin/cockpit` | `pages/admin/Cockpit.tsx` ⚠️ Recharts (14 hardcodes) |
| `/admin/churches` | `pages/admin/Churches.tsx` (19 hardcodes) |
| `/admin/churches/:id` | `pages/admin/Church.tsx` (29 hardcodes) |
| `/admin/onboardings` | `pages/admin/Onboardings.tsx` |
| `/admin/leads` | `pages/admin/Leads.tsx` ⚠️ (41 hardcodes) |
| `/admin/tasks` | `pages/admin/Tasks.tsx` (17 hardcodes) |
| `/admin/revenue` | `pages/admin/Revenue.tsx` ⚠️ Recharts (18 hardcodes) |
| `/admin/pricing` | `pages/admin/Pricing.tsx` (21 hardcodes) |
| `/admin/afiliados` | `pages/admin/Affiliates.tsx` (22 hardcodes) |
| `/admin/afiliados/:id` | `pages/admin/AffiliateDetail.tsx` (20 hardcodes) |
| `/admin/comunicacao` | `pages/admin/AdminComunicacao.tsx` |

---

## 3. Componentes Globais

### Layout
- `components/Layout.tsx` — wrapper principal (Sidebar + MobileHeader + main)
- `components/AdminLayout.tsx` — wrapper admin
- `components/Sidebar.tsx` — rail 64px + sub-painel 240px (14 hardcodes)
- `components/MobileHeader.tsx` — header mobile fixo
- `components/AgentChatWidget.tsx` — widget flutuante (14 hardcodes)

### UI Primitivos (`components/ui/`)
`Badge`, `Button`, `EmptyState`, `ErrorState`, `Input`, `Modal`, `PasswordInput`, `Select`, `Spinner`

### Feature Components
- `features/notifications/` — `NotificationBell` + `NotificationPanel` → reimplementar Fase 2
- `features/people/` — `PersonDetailPanel`, `PersonModal`
- `features/qr-visitor/` — `QrCodeModal`

---

## 4. Cores Hardcoded a Substituir

### Top 20 por frequência
| Cor hex | Ocorrências | Token atual | Novo token |
|---|---|---|---|
| `#e13500` / `#E13500` | 244 | Primária Ekthos (vermelho) | `var(--color-primary)` → `#29B6FF` |
| `#161616` | 71 | Preto sidebar/texto | `var(--color-text)` / `var(--color-sidebar)` |
| `#2D7A4F` | 62 | Success | `var(--color-success)` — manter semântica |
| `#f9eedc` / `#F9EEDC` | 57 | Cream fundo | `var(--color-bg)` → `#F5FAFF` / `#07131F` |
| `#C4841D` | 38 | Warning | `var(--color-warning)` — manter semântica |
| `#670000` | 34 | Wine secondary | `var(--color-secondary)` → `#185FA5` / `#7BE7FF` |
| `#8A8A8A` | 22 | Texto terciário | `var(--color-text-tertiary)` → `#4A5F75` / `#A9BED3` |
| `#5A5A5A` | 19 | Texto secundário | `var(--color-text-secondary)` → `#6E8398` / `#A9BED3` |
| `#25D366` | 9 | WhatsApp verde | Manter (cor de marca externa) |
| `#4F6EE1` | 9 | Azul info | `var(--color-primary)` |
| `#7C3AED` | 8 | Roxo (agentes?) | Avaliar por contexto — `var(--color-accent-purple)` |
| `#16a34a` | 8 | Verde success | `var(--color-success)` |
| `#1a1a1a` | 7 | Quase-preto | `var(--color-surface-dark)` → `#0A1827` |
| `#ffffff` / `#FFFFFF` | 16 | Branco puro | `var(--color-card)` → `#FFFFFF` / `#0C1B2B` |
| `#dc2626` | 3 | Erro | `var(--color-danger)` |
| `#3b5bdb` | 3 | Azul info | `var(--color-primary)` |

### CSS vars atuais em `index.css` (22 vars — todas a reescrever)
```
--church-primary, --church-secondary  → PRESERVAR (multi-tenant branding)
--ekthos-cream*, --ekthos-red*, --ekthos-wine*, --ekthos-black*  → REMOVER
--surface-*, --text-*, --success*, --warning*  → RECRIAR com novos valores
```

---

## 5. Bibliotecas Externas a Tematizar

| Biblioteca | Versão | Complexidade | Estratégia |
|---|---|---|---|
| **FullCalendar** (6 pacotes) | ^6.1.20 | 🔴 ALTA | CSS overrides em `src/styles/fullcalendar-theme.css` + `.dark` scoping |
| **Recharts** | ^3.8.1 | 🟡 MÉDIA | Extrair `CHART_COLORS` constant por modo, passar via props |
| **tailwindcss** | ^3.4.4 | 🟡 MÉDIA | Reescrever config com `darkMode: 'class'` + novos tokens CSS vars |
| **lucide-react** | ^1.8.0 | 🟢 BAIXA | Herda `currentColor` — sem trabalho adicional |
| **shadcn/ui** (Radix) | — | 🟡 MÉDIA | Usa CSS vars nativamente — atualizar vars → segue automaticamente |
| **dnd-kit** (Pipeline) | — | 🟢 BAIXA | Overlays de drag precisam de `bg` e `border` variáveis |

---

## 6. Email Templates a Atualizar (Fase 7)

| Arquivo | Uso | Ação |
|---|---|---|
| `supabase/templates/invite.html` | Convite de usuário | Substituir vermelho → azul `#29B6FF` |
| `supabase/templates/recovery.html` | Recuperação de senha | Substituir vermelho → azul `#29B6FF` |

---

## 7. Bibliotecas de UI já em uso

| Lib | Uso atual |
|---|---|
| Tailwind CSS 3.4 | Utilitários — config requer `darkMode: 'class'` |
| shadcn/ui + Radix | Modais, dropdowns, selects — baseado em CSS vars |
| lucide-react 1.8 | Ícones — currentColor, sem customização necessária |
| Recharts 3.8 | Gráficos em 4 arquivos — cores via props |
| FullCalendar 6.1 | Agenda — CSS profundo |
| dnd-kit | Pipeline kanban — overlays |

---

## 8. Estimativa por Fase

| Fase | Descrição | Horas |
|---|---|---|
| 0 | Auditoria ✅ | ~1h |
| 1 | CSS Vars + Tailwind + ThemeProvider + Toggle | 3–4h |
| 2 | Componentes globais (Sidebar, AppHeader, Button, Card, Input, Modal, Bell) | 6–8h |
| 3 | CRM principal (12 páginas app) | 8–10h |
| 4 | Config + Cockpit admin (16 telas) | 6–8h |
| 5 | Auth + Onboarding (10 páginas) | 3–4h |
| 6 | Landing + públicas + vídeo + 9 ícones + logo | 6–8h |
| 7 | Email templates (2 arquivos) | 1–2h |
| 8 | Validação E2E + correções finais | 3–4h |
| **TOTAL** | | **~37–49h** |

---

## 9. Riscos Identificados

### 🔴 Alto
- **FullCalendar** (`Agenda.tsx`) — CSS proprietário com seletores aninhados profundos. Dark mode requer ~50 overrides. Risco de quebra em mobile se override incompleto.
- **638 cores hardcoded** — risco de regressão visual se substituição for parcial. Exige busca sistemática arquivo a arquivo.
- **ThemeProvider position** — deve wrappear o `<App>` antes de qualquer componente. Posição errada ou race condition quebra tudo ao carregar.
- **CSS vars `--church-primary/secondary`** — injetadas dinamicamente em `Layout.tsx` via `useEffect`. Devem coexistir com os novos tokens dark/light sem conflito.

### 🟡 Médio
- **Recharts** (4 arquivos: Dashboard, Cockpit, Revenue, AgentChatWidget) — cores inline como `fill="#e13500"`. Exige constante `CHART_COLORS` por modo e hook para ler tema atual.
- **Pipeline DnD** (`Pipeline.tsx`) — drag overlay usa `position:absolute` com bg hardcoded. Z-index issues possíveis no dark mode com backdrop.
- **Landing.tsx** (132 cores) — arquivo mais denso do projeto. Risco de regressão no flow de checkout público se tocado com descuido.

### 🟢 Baixo
- **Sidebar rail** — já é dark por padrão (`#0f0f0f`). Adaptar para variável é simples.
- **shadcn/ui** — usa CSS vars nativamente. Basta mapear as vars novas.
- **Lucide icons** — `currentColor`, zero trabalho.

---

## 10. Skills Aplicadas — Fase 0

### executing-plans
- Step 1 aplicado: verificação crítica do estado existente antes de re-executar (branch vazia, arquivos ausentes — confirmados via `ls`)
- Step 2 aplicado: cada audit command executado com verificação de output (contagem de linhas)
- Nenhum commit realizado antes de validação do Felipe
- Reporte estruturado neste documento ao completar

---

*Fase 0 concluída · Skills: executing-plans · Aguardando validação do Felipe para Fase 1.*
