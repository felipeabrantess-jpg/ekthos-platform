# Dashboard Pastoral — 15 Widgets

> Define os 15 widgets do dashboard principal, com tipo, query de referência,
> visibilidade por role, metas embutidas e prioridade de alerta.
> Referência para: `Dashboard.tsx`, queries no Supabase, componentes de métricas.

---

## Visão geral

O dashboard pastoral usa linguagem eclesiástica, não corporativa.
Metas são exibidas como "80% de consolidação" — não como "KPI atingido".
Widgets de alerta (críticos) aparecem em destaque visual independente de posição.

---

## Tabela dos 15 widgets

| # | Widget | Tipo | Query de referência | Visibilidade | Meta / Alerta |
|---|--------|------|---------------------|-------------|---------------|
| 1 | Visitantes esta semana | Metric card | `COUNT` stage=Visitante, período=semana | Todos admin | — |
| 2 | Taxa de consolidação | Metric card | `%` visitante→célula / total visitantes | Todos admin | Meta: 80% / Alerta abaixo de 50% |
| 3 | Membros ativos | Metric card | `COUNT` is_ativo=true | Todos admin | — |
| 4 | Células ativas | Metric card | `COUNT` células com reunião ≤ 14 dias | Todos admin | Meta: total cadastrado |
| 5 | Caminho de discipulado | Pipeline chart | `COUNT` por stage, todos os membros | Todos admin | — |
| 6 | Frequência por sede | Breakdown chart | Presenças agrupadas por `sede_id` | Todos admin | — |
| 7 | Crescimento de células | Growth chart | `COUNT` células, comparativo trimestral | Todos admin | Meta: +10%/trimestre |
| 8 | Voluntários por departamento | Breakdown chart | `COUNT` membros servindo por departamento | admin + pastor_departamentos | — |
| 9 | Batismos no trimestre | Metric card | `COUNT` data_batismo no trimestre atual | Todos admin | Meta: 15/trimestre |
| 10 | Dízimos e ofertas (mês) | Metric card | `SUM` valor, período=mês atual | **Apenas** pastor_geral + tesoureiro | — |
| 11 | Membros ausentes > 14 dias | Tabela de alerta | `LIST` último_registro < agora-14d, stage >= Frequentando célula | Todos admin + supervisores | Alerta passivo |
| 12 | Células que diminuíram | Tabela de alerta | Células com queda de membros vs. período anterior | admin + pastor_celulas | Alerta passivo |
| 13 | Visitantes sem consolidação | Tabela de alerta | Visitantes no stage Visitante há > 24h | Todos admin | **Alerta crítico (vermelho)** |
| 14 | Evolução de membros (12 meses) | Line chart | `COUNT` membros ativos por mês, últimos 12 | Todos admin | — |
| 15 | Alunos na Escola da Fé | Metric card | `COUNT` stage=Escola da Fé, ativo | Todos admin | Meta: 30/turma |

---

## Widgets por prioridade de exibição

### Alertas críticos (topo do dashboard)
- **#13 — Visitantes sem consolidação:** aparece como banner de alerta no topo se > 0 registros. Vermelho. Sem consolidação após 24h = perda quase certa.

### Métricas de saúde pastoral (segunda linha)
- **#2** Taxa de consolidação
- **#1** Visitantes esta semana
- **#3** Membros ativos
- **#4** Células ativas
- **#9** Batismos no trimestre

### Visualizações de tendência (terceira linha)
- **#5** Caminho de discipulado (pipeline chart)
- **#14** Evolução de membros 12 meses
- **#7** Crescimento de células

### Alertas operacionais (tabelas)
- **#11** Membros ausentes > 14 dias
- **#12** Células que diminuíram

### Distribuição e voluntariado
- **#6** Frequência por sede
- **#8** Voluntários por departamento
- **#15** Alunos Escola da Fé

### Financeiro (restrito)
- **#10** Dízimos e ofertas — exibido apenas para roles autorizados

---

## Notas de implementação

### Filtros de contexto por role

```typescript
// Supervisor vê apenas os widgets da sua área
// Usar church_id + area_id na query antes de renderizar

const dashboardScope = {
  pastor_geral:         { scope: 'all' },
  pastor_celulas:       { scope: 'all_cells' },
  supervisor:           { scope: 'own_area', area_id: user.area_id },
  // secretaria e tesoureiro não acessam o dashboard
}
```

### Widget #13 — lógica de alerta crítico

```sql
-- Visitantes sem consolidação após 24h
SELECT COUNT(*)
FROM members
WHERE church_id = $1
  AND status_pipeline = 'Visitante'
  AND created_at < NOW() - INTERVAL '24 hours'
  AND deleted_at IS NULL
```

### Widget #2 — taxa de consolidação

```sql
-- % de visitantes que chegaram a "Frequentando célula" nos últimos 30 dias
SELECT
  COUNT(*) FILTER (WHERE reached_celula) * 100.0 / NULLIF(COUNT(*), 0) AS taxa
FROM (
  SELECT
    id,
    EXISTS (
      SELECT 1 FROM pipeline_history
      WHERE member_id = m.id
        AND stage = 'Frequentando célula'
    ) AS reached_celula
  FROM members m
  WHERE church_id = $1
    AND data_entrada >= NOW() - INTERVAL '30 days'
    AND deleted_at IS NULL
) sub
```

### Campos que não existem ainda no banco

Os seguintes campos são necessários para os widgets mas ainda não estão nas migrations:
- `ultimo_registro` (timestamp de última presença)
- `data_entrada` (data da primeira visita)
- `pipeline_history` (tabela de movimentações de stage com timestamp)
- `cell_reports` (tabela de registros de reunião de célula)
- `financial_records` (tabela de dízimos/ofertas)

> Criar migrations incrementais — não alterar tabelas existentes de forma destrutiva.
