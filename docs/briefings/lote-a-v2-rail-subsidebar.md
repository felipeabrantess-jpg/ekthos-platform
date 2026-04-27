# Lote A v2 — Rail + Sub-sidebar Premium + CTAs Reais
**Data:** 2026-04-27  
**Commit:** `14b7748`  
**Branch:** `staging`

---

## Resumo

Refatoração completa da sidebar para arquitetura premium rail + sub-painel contextual,
inspirada em Linear / Notion / Stripe Dashboard. CTAs de contratação funcionando de verdade.

---

## Arquitetura Sidebar

```
┌──────┬──────────────────────────────────┐
│ RAIL │  SUB-PAINEL contextual           │
│ 64px │  240px                           │
│      │  (muda conforme categoria ativa) │
└──────┴──────────────────────────────────┘
```

### Rail (64px, `#0f0f0f`)
| Ícone | Categoria | Ativa sub-painel |
|-------|-----------|-----------------|
| LayoutGrid | Igreja | Nav operacional |
| Bot | Agentes IA | Ativos + Contratar + Módulo + Plano |
| Package | Módulos | Volunteer / Kids / Fin.Pro |
| Settings | Config. | Grupos de configurações |
| (rodapé) | Avatar + Notificação + Logout | — |

Estado ativo: `bg-white/8` + `border-r-2 brand`  
Tooltip ao hover: label da categoria  
Persistência: `localStorage['ekthos_sidebar_category']`  
Auto-sync: `useEffect` monitora `location.pathname` → infere categoria

### Sub-painel (240px, `#161616`)

**IGREJA** — Nav items filtrados por role + enabled_modules  
**AGENTES IA** — 4 seções:
- ATIVOS: `hasAgent(slug) === true` → ✓ verde
- CONTRATAR AVULSO: standalone sem moduleId, não ativo
- VIA MÓDULO: tem moduleId → cadeado + link para módulo
- PLANO SUPERIOR: badge "Exclusivo Avivamento" → Sparkles

**MÓDULOS** — Cards com preço + Lock → /modulos/:id  
**CONFIG** — Grupos: IDENTIDADE / EQUIPE / ASSINATURA / INTEGRAÇÕES* / OPERACIONAL*  
(*itens inativos com badge "Em breve")

---

## Backend — pending_addons

### Tabela `pending_addons`
```sql
id, church_id, user_id, addon_type, addon_slug,
price_cents, status, requested_at, charge_at, charged_at, notes
```
Workflow: `pending` → `confirmed` → `charged`  
RLS: pastor lê/insere apenas da sua igreja

### Edge Function: `addon-request`
`POST /functions/v1/addon-request`  
Body: `{ addon_type, addon_slug }`  
- Valida slug em ADDON_PRICES (map interno)
- Evita duplicatas (409 se pending/confirmed já existe)
- Evita duplicata em subscription_agents (agente já ativo)
- `charge_at` = `subscriptions.current_period_end`
- Retorna: `{ pending_addon_id, addon_slug, charge_at, price_cents }`

### Edge Function: `contact-consultant`
`POST /functions/v1/contact-consultant`  
Body: `{ context, target_slug }`  
- Envia email para `felipe@ekthosai.net` via Resend (se `RESEND_API_KEY` definida)
- Se sem chave: loga no console e retorna 200
- Email inclui: nome da igreja, nome do pastor, email, interesse, slug, data

---

## CTAs reais

### `/agentes/:slug`

| Estado | CTA principal | CTA secundário |
|--------|---------------|----------------|
| active | (badge verde, sem botão) | — |
| contractable | **Adicionar ao meu plano** → addon-request | **Falar com consultor** → contact-consultant |
| module-bound | **Conhecer módulo →** → /modulos/:id | — |
| unavailable | — | **Falar com consultor** → contact-consultant |

Feedback: Toast inline verde (✓) / vermelho (✗) com mensagem descritiva  
"Trial 7 dias" continua desabilitado (botão `disabled`, label "disponível em breve")

### `/modulos/:id`

| Módulo | CTAs |
|--------|------|
| Volunteer Pro | Adicionar ao meu plano + Falar com consultor |
| Kids Pro | Adicionar ao meu plano + Falar com consultor |
| Financeiro Pro | Falar com consultor (consultive mode) |

### Hook `useAddonActions`
```typescript
const { adicionarAoPlano, falarComConsultor, loadingAddon, loadingConsultor } = useAddonActions()
```
- Lê token com `supabase.auth.getSession()`
- Fetch para EFs com Bearer token
- Retorna `{ ok, message, chargeAt? }`
- Loading state individual por ação

---

## Portões

| Portão | Status | Detalhe |
|--------|--------|---------|
| P1 — Build | ✅ | `✓ 8.14s` — 0 erros, 0 warnings |
| P2 — Validação | ⏳ | Aguarda Felipe validar após deploy Vercel |
| P3 — Não-regressão | ✅ | Rotas /settings/* preservadas; usePlan intacto; subscription_agents intacto |
| P4 — Relatório | ✅ | Este documento |

---

## TODOs

| ID | Localização | Descrição |
|----|-------------|-----------|
| TODO-F6-TRIAL | AgentDetail + ModuleDetail | "Testar 7 dias grátis" — ativar em Fase 6 (trial-watcher) |
| TODO-F4-MODULOS | pending_addons | Admin confirma pedido + aciona Stripe para cobrar na fatura |
| TODO-RESEND | contact-consultant | Configurar `RESEND_API_KEY` no Supabase secrets |
| TODO-MOBILE | Sidebar | Rail vira hamburguer + sub-painel drawer em <768px |
| TODO-F4-AGENTES | pending_addons | Workflow: confirmed → subscription_agents.insert() |

---

## Validação em produção (Felipe)

1. Login: `felipeabrantess@gmail.com` / `Pedrolucca1981@`
2. Sidebar mostra **rail 64px** à esquerda + **sub-painel 240px**
3. Clicar em cada ícone do rail → sub-painel muda de conteúdo
4. Navegar para `/pessoas` → rail volta para IGREJA automaticamente
5. `/agentes/agent-reengajamento` → CTAs reais (Adicionar + Consultor)
6. Clicar "Adicionar ao meu plano" → toast verde com data da próxima fatura
7. `/modulos/volunteer-pro` → "Adicionar ao meu plano" funciona
8. `/modulos/financeiro-pro` → só "Falar com consultor" (sem preço de compra)
9. Verificar `pending_addons` no Supabase após clicar Adicionar
10. Configurações → link vai para `/configuracoes` com grupos

---

## PR

https://github.com/felipeabrantess-jpg/ekthos-platform/compare/main...staging?expand=1
