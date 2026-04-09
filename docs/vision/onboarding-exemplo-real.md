# Exemplo Real de Onboarding — Igreja Comunidade da Graça

> Arquivo de visão / referência de produto.
> Conversa completa do onboarding + JSON gerado.
> Serve como fixture de teste quando o onboarding automatizado for implementado.

---

## Cliente
**Igreja Comunidade da Graça** — Plano Business
Pastor Carlos | 4 sedes | 45 células | 58 usuários

---

## Resumo do resultado do onboarding

| Item | Configurado |
|------|------------|
| Sedes | 4 (Niterói sede + 3 congregações: São Gonçalo, Itaboraí, Maricá) |
| Departamentos | 12 |
| Células | 45 |
| Hierarquia | 4 níveis (pastor geral → pastor células → 8 supervisores → 45 líderes) |
| Usuários | 58 (5 liderança + 8 supervisores + 45 líderes) |
| Campos | 17 customizados |
| Pipeline | 11 etapas |
| Agentes | WhatsApp + Métricas (inclusos) + Funil (trial 7d) |
| Automações | 17 |
| Dashboard | 15 widgets |
| Templates | 13 mensagens |
| Relatórios | Semanal WhatsApp + mensal PDF |

---

## Maiores problemas relatados pelo pastor
1. Perda de visitantes na consolidação (consolidador não liga rápido)
2. Falta de controle de frequência (membro some, só percebem 2 meses depois)

---

## Agentes recomendados pelo sistema
- WhatsApp pastoral (R$479,90) → resolve o problema #1
- Métricas pastorais (R$279,90) → resolve o problema #2
- Funil e consolidação (R$379,90, trial 7d) → amplifica a solução do #1

---

## JSON completo de configuração

> Este JSON é o output do prompt builder após as 25 perguntas.
> É o input para o agente engenheiro executar os 23 steps.

```json
{
  "action": "configure_tenant_full",
  "version": "2.0",
  "tenant": {
    "name": "Igreja Comunidade da Graça",
    "slug": "comunidade-da-graca",
    "niche": "igrejas",
    "city": "Niterói",
    "state": "RJ",
    "timezone": "America/Sao_Paulo",
    "multi_site": true,
    "sites": [
      {"name": "Sede Niterói", "slug": "sede-niteroi", "type": "sede"},
      {"name": "Congregação São Gonçalo", "slug": "cong-sao-goncalo", "type": "congregacao"},
      {"name": "Congregação Itaboraí", "slug": "cong-itaborai", "type": "congregacao"},
      {"name": "Congregação Maricá", "slug": "cong-marica", "type": "congregacao"}
    ],
    "branding": {
      "primary_color": "#C9A83C",
      "secondary_color": "#1B3A5C"
    }
  },
  "subscription": {
    "plan": "business",
    "price_monthly": 250000,
    "max_users": 10,
    "included_agents": 2,
    "free_agents": ["agent-suporte"]
  },
  "pipeline": {
    "stages": [
      {"name": "Visitante", "sla_hours": null, "type": "entry"},
      {"name": "Contato de boas-vindas", "sla_hours": 24, "type": "automated"},
      {"name": "Convidado para célula", "sla_hours": 72, "type": "manual"},
      {"name": "Frequentando célula", "sla_hours": null, "type": "manual"},
      {"name": "Escola da Fé", "sla_hours": null, "type": "manual"},
      {"name": "Formado Escola da Fé", "sla_hours": null, "type": "manual"},
      {"name": "Batismo", "sla_hours": null, "type": "manual"},
      {"name": "Membro ativo", "sla_hours": null, "type": "manual"},
      {"name": "Servindo em departamento", "sla_hours": null, "type": "manual"},
      {"name": "Líder em treinamento", "sla_hours": null, "type": "manual"},
      {"name": "Líder de célula", "sla_hours": null, "type": "manual"}
    ]
  }
}
```

> JSON completo disponível no documento original `VERTICAL-IGREJAS-COMPLETA.md` (seção 6).
