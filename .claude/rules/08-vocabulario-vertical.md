# Rule 08 — Vocabulário Canônico: Vertical Igrejas

Sempre usar os termos corretos do domínio eclesiástico em código, labels, tipos,
migrations e mensagens. Referência completa em `docs/product/vocabulario-vertical.md`.

## Termos obrigatórios

| Usar | Nunca usar |
|------|-----------|
| `membro` | lead, contato, cliente |
| `visitante` | prospect, novo lead |
| `célula` | grupo, squad, small group |
| `consolidação` | follow-up, nurturing |
| `sede` / `congregação` | filial, unidade, branch |
| `discipulado` | jornada, funil de crescimento |
| `culto` | reunião, evento principal |

## Nomenclatura em código

- Tabelas SQL: `membros`, `celulas`, `sedes`, `pipeline_stages`
- Pipeline stages: strings em português — `"Visitante"`, `"Frequentando célula"`, `"Membro ativo"`
- Roles: `pastor_geral`, `pastor_celulas`, `supervisor`, `lider_celula`
- Slugs de agente: `agent-suporte`, `agent-funil`, `agent-metricas`

## Tom em labels e UI

- Linguagem acolhedora, nunca corporativa
- "Membros ativos" — não "Registros ativos"
- "Caminho de discipulado" — não "Funil de vendas"
- "Taxa de consolidação" — não "Taxa de conversão"
