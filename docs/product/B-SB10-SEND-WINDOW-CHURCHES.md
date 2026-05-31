# B-SB10 — send_window padrão para igrejas sem configuração

> **Data:** 2026-05-30  
> **Resultado:** 6 igrejas configuradas com {"start":7,"end":22}  
> **Migration:** 20260530120000_send_window_default_all_churches.sql

---

## Contexto

O `agent-acolhimento` respeita `send_window` para não enviar mensagens fora
do horário comercial. Igrejas sem essa configuração estavam sujeitas a envios
em qualquer hora (0-23h), incluindo madrugada.

## Descoberta técnica

A coluna é `church_agent_config.agent_slug` (não `agent_scope`).
O slug de produção é `'agent-acolhimento'`.

## Estado pré-ação

| Igreja | Situação |
|---|---|
| Minha Fé | `{"start":8,"end":21}` — já configurada, mantida |
| Igreja Mock | `{"start":0,"end":23}` — já configurada (range amplo), mantida |
| Church demo | Linha existia mas `send_window = NULL` → UPDATE |
| Nossa Igreja | Sem linha → INSERT |
| Bola de Neve | Sem linha → INSERT |
| Meu Avivamento | Sem linha → INSERT |
| Igreja Teste Frente 3B | Sem linha → INSERT |
| Igreja Smoke LIVE Caminho A | Sem linha → INSERT |

## Ações aplicadas

- **UPDATE** (1): Church demo — `send_window = {"start":7,"end":22}`
- **INSERT** (5): 5 igrejas sem configuração — `send_window = {"start":7,"end":22}`

## Verificação pós-ação

```sql
SELECT c.name, cac.send_window
FROM churches c
JOIN church_agent_config cac ON cac.church_id = c.id
WHERE cac.agent_slug = 'agent-acolhimento'
ORDER BY c.name;
-- Expected: 8 rows, todas com send_window não-nulo
```
