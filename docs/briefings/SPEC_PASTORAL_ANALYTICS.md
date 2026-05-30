# SPEC — Analytics Pastoral (SA-A6)

> **Sprint:** MEGA-ONDA SEGURANÇA AMPLA  
> **Data:** 2026-05-30  
> **Status:** Spec pronto — aguardando sprint de implementação  
> **Prioridade:** MÉDIO

---

## Objetivo

Transformar dados do CRM em insights pastorais acionáveis, apresentados na linguagem do pastor — não de analista. O dashboard deve responder perguntas como "Quem sumiu essa semana?" e "Nossa igreja está crescendo?", não "Qual é o CAC?"

---

## Widgets do Dashboard Pastoral

### Bloco 1 — Saúde da comunidade (tempo real)

| Métrica | Fonte | Cálculo |
|---|---|---|
| Membros ativos | `people` | `status = 'active'` |
| Novos esse mês | `people` | `created_at >= início_do_mês` |
| Visitantes sem follow-up | `acolhimento_journey` | `status = 'visitante'` AND `days_in_stage > 3` |
| Ausentes > 14 dias | `conversations` | última interação > 14 dias atrás |

### Bloco 2 — Pipeline de discipulado

Funil visual por etapa com contagem e tempo médio em cada etapa.

| Dado | Fonte |
|---|---|
| Pessoas por etapa | `acolhimento_journey.status` |
| Tempo médio em cada etapa | `datediff(now(), updated_at)` agrupado por status |
| SLA estourado | `days_in_stage > sla_days` (definido por etapa) |

### Bloco 3 — Células

| Métrica | Fonte |
|---|---|
| Total de células ativas | `groups WHERE type='celula' AND active=true` |
| Frequência média/célula | `cell_members` + `attendance` (se implementado) |
| Células em alerta | frequência < 50% nas últimas 2 semanas |

### Bloco 4 — Comunicação (agentes IA)

| Métrica | Fonte |
|---|---|
| Mensagens respondidas essa semana | `conversation_messages WHERE role='assistant'` |
| Tempo médio de resposta | `created_at(assistant) - created_at(user)` por conversa |
| Conversas escaladas para humano | `conversations WHERE handoff_at IS NOT NULL` |
| Créditos restantes | `church_agent_credits.remaining_credits` |

---

## Relatório semanal automático

Enviado toda segunda-feira às 7h para o WhatsApp pessoal do pastor (configurável).

**Formato da mensagem:**

```
📊 Resumo Pastoral — {{nome_da_igreja}}
Semana de {{data_inicio}} a {{data_fim}}

👥 Comunidade
• {{novos}} novos membros
• {{ausentes}} ausentes > 14 dias (↑ ou ↓ X vs semana anterior)
• {{visitantes_sem_followup}} visitantes aguardando follow-up

📈 Discipulado
• {{em_consolidacao}} em consolidação ativa
• {{stagnados}} travados há mais de 7 dias

🤖 IA pastoral
• {{mensagens_auto}} mensagens respondidas pelo agente
• {{escalados}} escalados para você

Para ver detalhes: app.ekthosai.com
```

---

## Relatório mensal para conselho

PDF gerado automaticamente no início de cada mês, incluindo:

1. Sumário executivo em linguagem pastoral
2. Gráfico de crescimento (12 meses)
3. Análise de pipeline por etapa
4. Top 5 células por engajamento
5. Movimentação financeira (dizimistas ativos, total arrecadado — se módulo financeiro ativo)
6. Alertas e recomendações

**Geração:** Edge Function `generate-monthly-report` → PDF via jsPDF ou pdfmake → Storage → email/WhatsApp para o pastor

---

## Edge Functions necessárias

| EF | Função |
|---|---|
| `dashboard-metrics` | Agrega métricas para o dashboard em tempo real |
| `generate-weekly-report` | Compila e envia relatório semanal (via cron) |
| `generate-monthly-report` | Gera PDF mensal (via cron no dia 1 às 8h) |

---

## Schema de suporte

```sql
-- Snapshot de métricas históricas (performance)
CREATE TABLE metric_snapshots (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  church_id     uuid NOT NULL REFERENCES churches(id),
  snapshot_date date NOT NULL,
  metrics       jsonb NOT NULL,  -- { members_active, new_this_week, ... }
  created_at    timestamptz DEFAULT now(),
  UNIQUE (church_id, snapshot_date)
);

-- RLS: church_id = auth_church_id()
ALTER TABLE metric_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Church sees own snapshots" ON metric_snapshots
  FOR ALL USING (church_id = auth_church_id());
```

---

## Critérios de aceite

- [ ] Dashboard mostra 4 blocos de métricas atualizados em tempo real
- [ ] Relatório semanal enviado automaticamente às 7h de segunda
- [ ] Relatório mensal em PDF gerado no dia 1 de cada mês
- [ ] Métricas históricas salvas em `metric_snapshots` para gráficos de tendência
- [ ] Todas as métricas filtradas por `church_id` (RLS respeitado)
- [ ] Sem dados de outra igreja expostos (audit multi-tenant)
