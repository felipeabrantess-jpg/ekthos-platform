# Roles e Permissões — Vertical Igrejas

> Define a hierarquia completa de acesso ao CRM pastoral.
> Referência para: tabela `user_roles`, RLS policies, componentes de visibilidade,
> qualquer nova migration que envolva acesso por role.

---

## Hierarquia pastoral

```
pastor_geral          → vê e faz tudo (todas as sedes)
    ↓
pastor_departamentos  → gerencia departamentos e voluntários (todas as sedes)
pastor_celulas        → gerencia toda a rede de células (todas as sedes)
    ↓
supervisor            → vê apenas as células da sua área (5-8 células)
    ↓
lider_celula          → vê apenas a própria célula
lider_treinamento     → auxiliar do líder, acesso de leitura à própria célula
    ↓
secretaria            → cadastro e dados de membros (todas as sedes, sem financeiro)
tesoureiro            → módulo financeiro apenas (sem acesso a membros em geral)
```

---

## Tabela de roles

| Role | Slug | Nível | Escopo padrão |
|------|------|-------|---------------|
| Pastor geral | `pastor_geral` | 1 — máximo | Todas as sedes |
| Pastor de departamentos | `pastor_departamentos` | 2 | Todas as sedes |
| Pastor de células | `pastor_celulas` | 2 | Todas as sedes |
| Supervisor de área | `supervisor` | 3 | Células da sua área |
| Líder de célula | `lider_celula` | 4 | Própria célula |
| Líder em treinamento | `lider_treinamento` | 4 | Própria célula (leitura) |
| Secretária | `secretaria` | 3 | Dados de membros, todas as sedes |
| Tesoureiro | `tesoureiro` | 3 | Módulo financeiro |

---

## Matriz de permissões por módulo

| Módulo | pastor_geral | pastor_celulas | supervisor | lider_celula | secretaria | tesoureiro |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|
| Dashboard geral | ✅ | ✅ | ✅ (área) | ❌ | ❌ | ❌ |
| Membros — leitura | ✅ | ✅ | ✅ (área) | ✅ (célula) | ✅ | ❌ |
| Membros — edição | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Membros — dados financeiros | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Observações pastorais | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Pipeline | ✅ | ✅ | ✅ (área) | ✅ (célula) | ✅ | ❌ |
| Células — gestão | ✅ | ✅ | ✅ (área) | ✅ (própria) | ❌ | ❌ |
| Departamentos | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Financeiro | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Alertas e automações | ✅ | ✅ | ✅ (área) | ✅ (célula) | ❌ | ❌ |
| Relatórios gerais | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ (fin.) |
| Configurações do tenant | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Usuários e permissões | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Regras de escopo

### church_id (multi-sede)
- Todos os roles têm acesso restrito ao `church_id` do próprio tenant
- `pastor_geral` vê todas as sedes do tenant
- `supervisor` e `lider_celula`: scope adicional por `area_id` / `celula_id`

### Campos com visibilidade restrita por role

| Campo | Visível para |
|-------|-------------|
| `is_dizimista` / `valor_dizimo` | `pastor_geral`, `tesoureiro` |
| `observacoes_pastorais` | `pastor_geral` apenas |
| `dados_bancarios` (se houver) | `pastor_geral`, `tesoureiro` |
| Histórico de aconselhamento | `pastor_geral` apenas |

> **RLS:** Esses campos devem ter policies separadas ou ser armazenados em tabela
> auxiliar com RLS própria, não como colunas na tabela principal de membros.

---

## Alertas por role

| Role | Alertas que recebe |
|------|-------------------|
| `pastor_geral` | Resumo semanal, meta em risco, membro sumido 30d, crescimento células |
| `pastor_departamentos` | Queda de frequência em departamento, voluntário ausente |
| `pastor_celulas` | Célula sem reunião 2 semanas, célula diminuindo, líder ausente |
| `supervisor` | Membro ausente 14d na área, célula sem relatório |
| `lider_celula` | Membro ausente na própria célula, novo membro adicionado |
| `secretaria` | Cadastro incompleto, visitante novo registrado |
| `tesoureiro` | Resumo de dízimos semanal, meta financeira |

---

## Estado atual vs. necessário

| Role necessário | Existe hoje (`user_roles`) | Status |
|---|---|---|
| `pastor_geral` | `admin` (parcial) | Adaptar |
| `pastor_departamentos` | ❌ | A criar |
| `pastor_celulas` | ❌ | A criar |
| `supervisor` | ❌ | A criar |
| `lider_celula` | `author` (inadequado) | Substituir |
| `lider_treinamento` | ❌ | A criar |
| `secretaria` | ❌ | A criar |
| `tesoureiro` | ❌ | A criar |

> **Nota:** A migration de roles é pré-requisito para implementar visibilidade
> correta em `People.tsx`, `Celulas.tsx` e `Financeiro.tsx`.
> Criar roles novos sem quebrar o auth existente (admin/author/curator/dev).
