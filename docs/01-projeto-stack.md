# Ekthos Church — Stack e Design System
> Documento canônico · Atualizado 29/04/2026

---

## STACK TÉCNICA

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + TypeScript 5 + Vite 5 (SWC) |
| Estilização | Tailwind CSS 3 + shadcn/ui (Radix) |
| Queries | TanStack Query v5 |
| Routing | React Router v6 |
| Backend | Supabase (Auth, Postgres, Storage, Edge Functions) |
| Runtime EF | Deno (nunca Node.js) |
| Deploy | Vercel (frontend) + Supabase (backend) |
| Pagamentos | Stripe (checkout público + assinaturas) |
| Mensageria | WhatsApp Business API via n8n webhooks |

---

## DESIGN SYSTEM EKTHOS CHURCH — DUAL MODE
> Decisão aprovada por Felipe em 29/04/2026
> Substitui paleta anterior (cream/brand laranja/wine)

### LIGHT MODE (DEFAULT)
> Usuário-alvo: pastor brasileiro 40+ em escritório iluminado

| Token | Valor | Uso |
|---|---|---|
| Background principal | `#F5FAFF` | `<body>`, `<main>` |
| Surface/card | `#FFFFFF` | Cards, modais, drawers |
| Sidebar | `#FFFFFF` border `#DCE7F4` | Sidebar desktop |
| Hover/ativo | `#E6F1FB` | Nav items hover, row hover |
| Borda | `#DCE7F4` | Borders de cards e inputs |
| Primária | `#29B6FF` | Botões CTA, links, badges ativo |
| Primária escura | `#185FA5` | Texto em fundo branco, destaque |
| Texto principal | `#07131F` | Headings, body |
| Texto secundário | `#6E8398` | Subtítulos, labels |
| Texto terciário | `#4A5F75` | Placeholders, metadata |

### DARK MODE (toggle via topbar, persistente em localStorage)

| Token | Valor | Uso |
|---|---|---|
| Background principal | `#07131F` | `<body>`, `<main>` |
| Sidebar escura | `#0A1827` | Sidebar desktop |
| Surface/card | `#0C1B2B` | Cards, modais |
| Hover/ativo | `#10253A` | Nav items hover |
| Borda | `#1E3953` | Borders |
| Primária | `#29B6FF` | Botões CTA (mesma do light) |
| Secundária | `#7BE7FF` | Links, ícones secundários |
| Aurora teal | `#4CEAD8` | Accent espiritual, badges frequentador |
| Dourado | `#F2C96B` | Accent espiritual, ícone ponto dourado |
| Branco nuvem | `#EEF7FF` | Texto em fundo dark primário |
| Texto principal | `#F5FAFF` | Headings, body |
| Texto secundário | `#A9BED3` | Subtítulos, labels |

### BADGES SEMÂNTICOS — LIGHT MODE

| Estado | Texto | Fundo |
|---|---|---|
| Visitante | `#185FA5` | `#E6F1FB` |
| Frequentador | `#0F6E56` | `#E1F5EE` |
| Em Risco | `#854F0B` | `#FAEEDA` |
| Erro | `#A32D2D` | `#FCEBEB` |

### BADGES SEMÂNTICOS — DARK MODE

| Estado | Texto | Fundo |
|---|---|---|
| Visitante | `#29B6FF` | `rgba(41,182,255,0.12)` |
| Frequentador | `#4CEAD8` | `rgba(76,234,216,0.12)` |
| Em Risco | `#F2C96B` | `rgba(242,201,107,0.12)` |
| Erro | `#E24B4A` | `rgba(226,75,74,0.12)` |

---

## TIPOGRAFIA (mantida da versão anterior)

| Uso | Fonte | Peso | Detalhes |
|---|---|---|---|
| Títulos h1/h2 | Playfair Display | 400–500 | letter-spacing: -0.5px |
| Body, labels | DM Sans | 400–500 | — |
| Seções/tags | DM Sans | 600 | caixa alta + letter-spacing 2-3px |
| Métricas/dados | JetBrains Mono | 500 | tabular-nums |

---

## ÍCONES — ESTILO GLASS OUTLINE

Definição visual aprovada 29/04/2026 para uso na landing e sidebar.

- Vidro fosco: `backdrop-filter: blur(12px)`
- Traços vetoriais finos: 1.2–1.5px em `#29B6FF`
- 1 ponto dourado `#F2C96B` sutil por ícone (acento espiritual)
- Linhas de luz Apple Vision Pro (topo + lateral)
- Auroras de fundo discretas (4–6% opacity)
- Sem brilhos/scintilas decorativas
- Monocromático azul + 1 acento dourado MUITO sutil

**9 ícones definidos:**

| # | Nome | Contexto |
|---|---|---|
| 1 | Pessoas | CRM, módulo /pessoas |
| 2 | Discipulado | Pipeline |
| 3 | Eventos | Calendário |
| 4 | Células | Casa + conexões |
| 5 | Voluntários | Mãos + chama dourada |
| 6 | Notificações | Sino |
| 7 | QR de Entrada | QR + scan |
| 8 | Mensageria IA | Chat + estrela |
| 9 | Cockpit Pastoral | Dashboard mini |

SVGs disponíveis no histórico do chat de 29/04/2026. Felipe fornece ao Code no início da Fase 6.

---

## LOGO

- Identidade visual: `†Ekthos` + `CHURCH` — símbolo de cruz integrado à tipografia
- Status: nova logo definida 29/04 — re-export pendente (PNG transparente)
- Será aplicada na Fase 6 do banho de loja
- Pontos de uso: sidebar, AppHeader, landing, emails, Stripe checkout, favicons

---

## PRICING (referência rápida)

Ver `docs/commercial/planos-pricing.md` para detalhes completos.

| Plano | Público-alvo |
|---|---|
| Chamado | Igrejas pequenas |
| Missão | Igrejas médias |
| Avivamento | Igrejas grandes |

- `churches.subscription_plan` está DEPRECADO — não usar para lógica
- Fonte de verdade: tabela `subscriptions` via `usePlan()`
