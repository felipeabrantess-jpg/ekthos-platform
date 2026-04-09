# docs/ — Documentação do Produto Ekthos

> Esta pasta contém documentação de produto, comercial e roadmap.
> **Não confundir com `.claude/`** — que é a estrutura operacional do Claude Code
> (rules, skills, commands) usada durante o desenvolvimento.

---

## Estrutura

```
docs/
├── product/            Spec funcional implementável — referência para código
├── commercial/         Produto comercial e precificação — não entra no codebase
├── future-features/    Roadmap técnico — features a implementar futuramente
└── vision/             Visão arquivada — referência apenas, não implementar
```

---

## product/ — Implementável agora ou em breve

| Arquivo | Conteúdo | Uso |
|---------|----------|-----|
| `vocabulario-vertical.md` | Glossário canônico da vertical igrejas | Nomenclatura em código, labels, prompts |
| `pipeline-discipulado.md` | 11 etapas, SLAs, motivos de perda | `Pipeline.tsx`, tabela `pipeline_stages` |
| `roles-permissoes.md` | 7 roles com hierarquia e matriz de acesso | Migrations de auth, RLS policies |
| `campos-membros.md` | 17 campos com lógica condicional e visibilidade | `People.tsx`, formulário de cadastro |
| `automacoes.md` | 17 automações com trigger, ação e prioridade | Edge Functions, sistema de alertas |
| `dashboard-widgets.md` | 15 widgets com queries e visibilidade por role | `Dashboard.tsx` |

---

## commercial/ — Não entra no codebase

| Arquivo | Conteúdo |
|---------|----------|
| `planos-pricing.md` | 3 planos (Professional/Business/Enterprise) |
| `catalogo-agentes-ia.md` | 9 agentes com preços e descrições |
| `upsell-in-app.md` | 7 pontos de upsell posicionados no CRM |
| `simulacao-receita.md` | Projeção financeira para 5–50 igrejas |

---

## future-features/ — Roadmap técnico

| Arquivo | Conteúdo | Pré-requisito |
|---------|----------|---------------|
| `onboarding-automatizado.md` | 25 perguntas → JSON → 23 steps em 28s | Runtime de agente IA |
| `mensageria-whatsapp.md` | 13 templates + integração WhatsApp Business API | WhatsApp Business API aprovada |
| `metas-pastorais.md` | 7 metas com baseline e acompanhamento | Tabela `church_goals` |

---

## vision/ — Arquivado

| Arquivo | Conteúdo |
|---------|----------|
| `agentes-ia-visao.md` | Arquitetura e spec dos 9 agentes IA |
| `onboarding-exemplo-real.md` | Conversa completa de onboarding + JSON gerado |
