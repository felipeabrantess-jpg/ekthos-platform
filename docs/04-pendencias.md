# Ekthos Church — Pendências e Débitos
> Documento canônico · Atualizado 29/04/2026

---

## FRENTE POLISH — BANHO DE LOJA EKTHOS CHURCH
**Status:** ATIVA · **Prioridade:** MÁXIMA · **Início:** aprox. 30/04/2026  
**Branch:** `feat/banho-de-loja-fase-0` (auditoria) → branches por fase

### Escopo total
1. Páginas públicas (Landing, Stripe checkout, página QR de visitante)
2. Auth (Login, Cadastro, Recuperação de senha, Confirmação)
3. Onboarding (Welcome, Tour, Primeiros passos, Setup inicial)
4. CRM principal (12 páginas: Dashboard, /pessoas, /lideres, /voluntarios,
   /consolidacao, /discipulado, /celulas, /ministerios, /calendario,
   /eventos, /gabinete, /financeiro)
5. Configurações (Perfil, igreja, branding multi-tenant, equipe, integrações, planos)
6. Cockpit Admin (10 telas administrativas)
7. Email templates (invite, notificações, transacionais)
8. Modais e drawers globais

### Plano em 8 fases
| Fase | Descrição | Status |
|---|---|---|
| 0 | Auditoria automatizada | ✅ Concluída |
| 1 | Infra (CSS Vars + Tailwind + ThemeProvider + Toggle dark mode) | ⏳ Pendente |
| 2 | Componentes globais (Sidebar, AppHeader, Modal, Button, Card, Input, NotificationBell) | ⏳ Pendente |
| 3 | CRM principal (12 páginas) | ⏳ Pendente |
| 4 | Configurações + Cockpit Admin | ⏳ Pendente |
| 5 | Auth + Onboarding | ⏳ Pendente |
| 6 | Landing + páginas públicas (+ bloco de vídeo + 9 ícones Glass Outline) | ⏳ Pendente |
| 7 | Email templates | ⏳ Pendente |
| 8 | Validação E2E + correções finais | ⏳ Pendente |

### Regras de ouro inegociáveis
1. ZERO alteração estrutural ou de copy
2. ZERO colisão visual em qualquer breakpoint (375 / 768 / 1280 / 1920px)
3. Validação visual obrigatória por fase (prints para Felipe antes de avançar)
4. Skills Superpowers obrigatórias por cenário (ver CLAUDE.md `[SUPERPOWERS SKILLS]`)
5. Dual mode obrigatório em todo componente
6. Preservar 100% das frentes funcionais em produção

### Pendências herdadas para o banho
- **Logo nova:** re-export PNG transparente pendente — Code solicita ao Felipe no início da Fase 6
- **Frente N v3:** sino topbar reimplementado do zero na Fase 2 com paleta nova
- **Staging com PR #91 buggada:** Felipe assumiu risco, será limpo no banho
- **Bloco de vídeo premium:** implementar na landing na Fase 6
- **9 ícones Glass Outline:** Felipe fornece SVGs no início da Fase 6

---

## TEST-DEBT-004 — Worker para coupon_sync_jobs
**Status:** ABERTO · **Bloqueia:** F9 (Stripe live com cupons)

Ver `docs/debts.md` para detalhes completos.

---

## TEST-DEBT-001 a TEST-DEBT-003
Ver `docs/debts.md` para detalhes.

---

*Atualizar este arquivo ao iniciar/concluir cada fase do banho de loja.*
