# Sidebar Redesign — Fase 1 + 2
**Data:** 2026-04-27  
**Commit:** `f164566`  
**Branch:** `staging`

---

## Resumo

Reorganização completa da sidebar do CRM Pastoral em 4 categorias hierárquicas (Fase 1) e implementação de tabs de categorias nas páginas Pessoas, Células e Eventos (Fase 2).

---

## Antes × Depois

### ANTES — sidebar flat sem categorias

```
Dashboard
Pessoas
Aniversários
Discipulado
Células
Ministérios
Voluntários
Escalas
Financeiro
Agenda
Gabinete
Agentes IA
[seção Assistentes: lista de agentes]
[footer: avatar + Configurações + Sair]
```

### DEPOIS — 4 camadas semânticas

```
┌─ IGREJA ────────────────────────────────────┐
│ Painel      · Pessoas    · Discipulado      │
│ Células     · Ministérios · Eventos         │
│ Gabinete    · Financeiro                    │
└─────────────────────────────────────────────┘

┌─ AGENTES IA ─────────────────────────────── [N/total]
│ [lista linear de agentes ativos]            │
└─────────────────────────────────────────────┘

┌─ MÓDULOS ───────────────────────────────────┐
│ 🔒 Volunteer       R$ 289,90               │
│ 🔒 Kids            R$ 349,90               │
│ 🔒 Financeiro Pro  R$ 489,90               │
└─────────────────────────────────────────────┘

┌─ CONTA ─────────────────────────────────────┐
│ [👤 Pastor Nome · Role]                     │
│ Configurações · Sair                        │
└─────────────────────────────────────────────┘
```

---

## Decisões de design

| Decisão | Motivo |
|---------|--------|
| Aniversários removido do 1º nível | Vira tab em Pessoas |
| Voluntários/Escalas → MÓDULOS | São add-ons pagos (Volunteer R$289,90) |
| /agenda renomeado "Eventos" na sidebar | Semântica correta para o pastor |
| Módulos sempre locked | Fase 4 implementa compra; por ora tooltip "Em breve" |
| Contador `[N/total]` nos agentes | Transparência sobre quantos agentes o plano tem |
| navigation.ts como fonte única | Evita divergência entre App.tsx e Sidebar |

---

## Arquivos modificados

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `web/src/lib/navigation.ts` | NOVO | Config centralizada: `IGREJA_NAV`, `MODULE_ADDONS` |
| `web/src/components/Sidebar.tsx` | REWRITE | 4 categorias + módulos com tooltip |
| `web/src/pages/People.tsx` | MODIFY | Tabs: Visão geral, Aniversários, Novos Convertidos, Líderes, Em Risco |
| `web/src/pages/Celulas.tsx` | MODIFY | Tabs: Visão geral, Lista (tabela), Relatórios (placeholder) |
| `web/src/pages/Agenda.tsx` | MODIFY | Renomeado "Eventos" + tabs: Calendário, Lista, Inscrições (placeholder) |

---

## Portões

| Portão | Status | Detalhe |
|--------|--------|---------|
| P1 — Build | ✅ | `✓ built in 6.79s` — 0 erros, 0 warnings |
| P2 — Validação | ⏳ | Aguarda Felipe validar em produção após deploy |
| P3 — Não-regressão | ✅ | DB intacto: "Nossa Igreja" chamado/2 agentes, "Church demo" avivamento/6 agentes |
| P4 — Relatório | ✅ | Este documento |

---

## TODOs deixados (com referência no código)

| ID | Localização | Descrição |
|----|-------------|-----------|
| TODO-F3-RELATORIOS | `Celulas.tsx: RelatoriosTab()` | Relatórios de presença, crescimento e reuniões |
| TODO-F3-INSCRICOES | `Agenda.tsx: InscricoesTab()` | Formulário público + lista de inscritos |
| TODO-F4-MODULOS | `Sidebar.tsx: MODULE_ADDONS` | Lógica de compra (Stripe) + sub-sidebar |
| TODO-ANIV-BIRTHDAY | `People.tsx: filterBirthdayThisMonth()` | Confirmar existência do campo `birthday` no tipo `Person` |

---

## Próximas fases

### Fase 3 — Conteúdo dos placeholders
- Relatórios de Células (frequência, crescimento, top células)
- Inscrições de Eventos (formulário público + controle de presença)
- Sub-rota `/celulas/relatorios` e `/eventos/inscricoes`

### Fase 4 — Módulos pagos (sub-sidebar)
- Compra de Volunteer, Kids, Financeiro Pro via Stripe
- Sub-sidebar deslizante ao clicar no módulo
- Lógica de `access_grants` ou `churches.paid_modules`

### Fase 5 — Sub-sidebar de Agentes IA
- "Meus Agentes" abre painel lateral com cards de agentes
- Botão "Adicionar Agente" (dentro do slot disponível)
- Integração com marketplace de agentes

### Fase 6 — Notificações e atalhos
- Contadores de badge nos itens (ex: Pessoas com stage Em Risco)
- Atalhos de teclado para navegação
- Modo colapsado (sidebar icon-only)

---

## Validação em produção (Felipe)

Após merge + deploy no Vercel:

1. Login: `felipeabrantess@gmail.com` / `Pedrolucca1981@`
2. Sidebar deve mostrar:
   - Categoria **IGREJA**: Painel, Pessoas, Discipulado, Células, Ministérios, Eventos, Gabinete, Financeiro
   - Categoria **AGENTES IA**: 2 agentes + contador `[2/N]`
   - Categoria **MÓDULOS**: Volunteer 🔒, Kids 🔒, Financeiro Pro 🔒 (hover = tooltip "Em breve")
   - Categoria **CONTA**: avatar + Configurações + Sair
3. `/pessoas` → 5 tabs (Visão geral, Aniversários, Novos Convertidos, Líderes, Em Risco)
4. `/celulas` → 3 tabs (Visão geral, Lista, Relatórios)
5. `/agenda` → 3 tabs (Calendário, Lista, Inscrições), header "Eventos"
6. Gabinete sem cadeado (módulo CORE)
7. Rotas /aniversarios e /voluntarios continuam funcionando direto na URL

---

## PR

https://github.com/felipeabrantess-jpg/ekthos-platform/compare/main...staging?expand=1
