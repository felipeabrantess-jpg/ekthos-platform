# Lote A Z1+Z2 — Módulos 100% Consultivos (Venda Honesta)
**Data:** 2026-04-27  
**Branch:** `staging`

---

## Contexto

Felipe identificou furo conceitual: módulos tinham "Adicionar ao plano" funcional,
mas sem telas operacionais. Pastor poderia pagar sem ter onde acessar o produto.

**Decisão:** Módulos passam a ser 100% consultivos enquanto o MVO não existe.
Agentes avulsos (sem módulo) mantêm self-service intacto.

---

## Z1 — Remover "Adicionar ao plano" dos módulos

### Regra
- **Módulos** = consultivos (Volunteer Pro, Kids Pro, Financeiro Pro)
- **Agentes avulsos** = self-service continua (agent-reengajamento, agent-agenda, etc.)
- **Agentes de módulo** = levam para `/modulos/:id` (sem self-service)

### Arquivos alterados

**`web/src/lib/modules-content.ts`**
- Interface `ModuleContent` agora tem `consultive: true` (obrigatório, não opcional)
- Novos campos: `aquisicao: 'consultivo'`, `cta_principal: 'consultor'`, `implementacaoDesc: string`
- Todos os 3 módulos preenchem esses campos com microcopy específica

**`web/src/pages/modules/ModuleDetail.tsx`**
- `ModuleCTA` simplificado: removido o bloco não-consultivo por completo
- Apenas "Falar com consultor" como CTA primário
- Microcopy `implementacaoDesc` exibida no card de CTA
- Botão "Adicionar ao meu plano" e Trial "7 dias" removidos completamente

**`web/src/components/Sidebar.tsx`**
- Sub-painel MÓDULOS: linha extra "Implementação acompanhada" sob o preço
- `title="Fale com consultor para ativar"` no link de cada módulo

---

## Z2 — Mensagem honesta após contact_request

### Toast de sucesso — contexto 'module'
```
"Recebemos sua mensagem! Nosso time vai contatar em até 24h
para apresentar o módulo e fazer a ativação."
```

### Toast de sucesso — contextos 'agent' / 'plan' (inalterado)
```
"Recebemos sua mensagem! Entraremos em contato em breve."
```

**Arquivo:** `web/src/hooks/useAddonActions.ts` — `falarComConsultor()` agora é context-aware.

### Card "Como funciona a contratação"

Novo componente `ComoFuncionaCard` adicionado em `/modulos/:id`,
posicionado dentro do card de conteúdo, antes da seção "Para quem":

1. Você fala com nosso time
2. Apresentamos o módulo em uma demo curta
3. Configuramos o ambiente da sua igreja
4. Treinamos sua equipe
5. Ativamos o módulo no seu plano

*Tudo isso sem você precisar mexer em nada.*

### Microcopy por módulo

| Módulo | implementacaoDesc |
|--------|------------------|
| Volunteer Pro | Implementação acompanhada pelo time Ekthos. Inclui demo, configuração inicial e suporte na ativação. |
| Kids Pro | Implementação acompanhada com cuidado especial: cadastro seguro de crianças, treinamento da equipe infantil e configuração de salas. |
| Financeiro Pro | Implementação técnica acompanhada. Inclui setup contábil, importação inicial de funcionários e treinamento da tesouraria. |

---

## Portões

| Portão | Status | Detalhe |
|--------|--------|---------|
| P1 — Build | ✅ | `✓ 6.85s` — 0 erros, 0 warnings |
| P2 — Validação visual | ⏳ | Aguarda Felipe validar após deploy Vercel |
| P3 — Não-regressão | ✅ | addon-request para agentes intacto; contact-consultant intacto; sidebar premium intacta |
| P4 — Relatório | ✅ | Este documento |

---

## Validação esperada (Felipe)

1. `/modulos/volunteer-pro` → SOMENTE "Falar com consultor" (sem "Adicionar ao plano")
2. `/modulos/kids-pro` → SOMENTE "Falar com consultor"
3. `/modulos/financeiro-pro` → SOMENTE "Falar com consultor"
4. Card "Como funciona a contratação" aparece em todos os 3
5. Microcopy específica de cada módulo no card de CTA
6. Clicar "Falar com consultor" → toast com mensagem de 24h
7. `/agentes/agent-reengajamento` → AINDA tem "Adicionar ao meu plano" + "Falar com consultor"
8. Sidebar: módulos mostram "Implementação acompanhada" sob o preço

---

## PR

https://github.com/felipeabrantess-jpg/ekthos-platform/compare/main...staging?expand=1
