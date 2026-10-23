# Journey Unification — Fase 1

> Estado em: 2026-07-29  
> Branch: `feat/journey-unification-fase-1`  
> Projeto Supabase: `mlqjywqnchilvgkbvicd`

---

## O que existe em produção hoje

### Tabelas (2)

**`person_journey`** — espinha canônica de jornada pastoral  
Uma jornada ativa por pessoa por church (UNIQUE parcial em `closed_at IS NULL`).  
Lock otimista via campo `version` (incrementado a cada mutação RPC).

| Campo | Tipo | Observação |
|---|---|---|
| `id` | UUID PK | |
| `church_id` | UUID NOT NULL | FK churches |
| `person_id` | UUID NOT NULL | FK people |
| `stage_id` | UUID NOT NULL | FK pipeline_stages ON DELETE RESTRICT |
| `pipeline_id` | UUID nullable | FK pipelines ON DELETE SET NULL — nullable para IGV legado |
| `owner_id` | UUID nullable | Responsável pastoral |
| `ministry_id` | UUID nullable | |
| `version` | INTEGER DEFAULT 1 | Lock otimista |
| `agent_locked_at` | TIMESTAMPTZ nullable | Prevenção de corrida agent-acolhimento |
| `confidentiality` | TEXT DEFAULT 'normal' | 'normal' \| 'restricted' \| 'sealed' |
| `opened_at` | TIMESTAMPTZ | |
| `closed_at` | TIMESTAMPTZ nullable | NULL = ativa |
| `outcome` | TEXT nullable | Obrigatório quando closed_at IS NOT NULL |
| `next_step` | TEXT nullable | |
| `next_step_due_at` | DATE nullable | |
| `notes` | TEXT nullable | |

RLS ativa. Policies: `pj_select/pj_insert/pj_update` para `authenticated` via `auth_church_id()`, `pj_service` para `service_role`.

---

**`journey_events`** — log append-only de cada mutação  
`authenticated` e `anon` não podem fazer UPDATE/DELETE (sem policy + REVOKE explícito).  
`actor_type` derivado internamente do banco — o cliente nunca passa actor.

| Campo | Tipo | Observação |
|---|---|---|
| `id` | UUID PK | |
| `journey_id` | UUID NOT NULL | FK person_journey ON DELETE CASCADE |
| `church_id` | UUID NOT NULL | FK churches |
| `event_type` | TEXT NOT NULL | 'stage_advance', 'owner_assigned', etc. |
| `actor_id` | UUID nullable | auth.uid() — NULL para system/cron |
| `actor_type` | TEXT NOT NULL | 'human' \| 'agent' \| 'system' |
| `payload` | JSONB DEFAULT '{}' | Dados específicos do evento |
| `created_at` | TIMESTAMPTZ | |

Constraint: `chk_je_human_has_actor` — `actor_type = 'human'` exige `actor_id IS NOT NULL`.

---

### RPCs (6 + 1 helper)

Todas `SECURITY DEFINER`, `GRANT` apenas para `authenticated`, `REVOKE` de `anon`/`public`.  
`actor_id` nunca é parâmetro — sempre derivado de `auth.uid()` internamente.

| RPC | Parâmetros | O que faz |
|---|---|---|
| `journey_advance` | `journey_id, expected_version, new_stage_id, note?` | Avança stage no funil |
| `journey_assign` | `journey_id, expected_version, owner_id` | Atribui responsável pastoral |
| `journey_register_touch` | `journey_id, touch_type, payload?` | Registra toque sem mutar stage |
| `journey_transfer` | `journey_id, expected_version, new_owner_id, new_ministry_id?, note?` | Transfere para outro ministério |
| `journey_update_next_step` | `journey_id, expected_version, next_step, due_date?` | Atualiza próximo passo |
| `journey_close` | `journey_id, expected_version, outcome, note?` | Encerra jornada (outcome obrigatório) |
| `_journey_fetch_and_lock` | `journey_id, expected_version` | Helper interno — verifica tenant, versão, retorna row |

Lock otimista: se versão divergir, RPCs lançam `JOURNEY_VERSION_CONFLICT` (SQLSTATE P0001).

---

### Feature Flag (1 tabela)

**`church_feature_flags`** — flag `journey_unification = false` para todas as 8 igrejas.  
Para ativar em uma igreja: `UPDATE church_feature_flags SET enabled = true WHERE church_id = '<id>' AND flag_key = 'journey_unification';`

---

### Views de auditoria (4)

| View | O que mostra |
|---|---|
| `journey_audit_missing_spine` | Pessoas com `person_pipeline` mas sem `person_journey` ativa |
| `journey_audit_orphan_spine` | Pessoas com `person_journey` ativa mas sem `person_pipeline` |
| `journey_audit_stage_conflicts` | `people.pipeline_stage_id` ≠ `person_pipeline.stage_id` |
| `journey_audit_reconciliation` | Resumo por church: total, pipeline legado, espinha ativa, flag |

---

## Estado atual

- **Inerte**: feature flag `off` nas 8 igrejas. Nenhum código de frontend lê/escreve essas tabelas.
- **0 linhas** em `person_journey` e `journey_events` (verificado 2026-07-29).
- **IGV** (`6c127559-874a-4748-8fce-55d4079613a5`): 5.968 pessoas ativas, 0 jornadas.
- Migrations rastreadas em `supabase_migrations.schema_migrations` (versões 000001–000005).

---

## Regra de desempate do backfill

Projeção: **481 jornadas** a criar (todas as igrejas exceto IGV, que não tem pipeline configurado).

Prioridade para definir `stage_id` ao criar `person_journey`:

1. **`person_pipeline` existe** → usar `person_pipeline.stage_id`
2. **Sem `person_pipeline`, mas `people.pipeline_stage_id IS NOT NULL`** → usar esse
3. **`acolhimento_journey` ativa** → usar stage_id do entry point do pipeline (IGV: 0 casos)
4. **Nenhuma das anteriores** → **NÃO criar jornada** (pessoa sem stage conhecido)

`pipeline_id` é preenchido com o pipeline que originou o stage (via `pipeline_stages.pipeline_id`). Nullable para igrejas legado onde stages não têm pipeline associado.

---

## O que a Fase 2 precisa fazer (em ordem)

1. **Backfill controlado** — rodar script dry-run em staging, validar 481 projetadas vs. reais, aplicar por church com flag `off` (sem ativar).
2. **Ativar flag em 1 igreja piloto** — preferencialmente uma igreja de teste, não IGV.
3. **Ligar frontend ao read** — hook `usePersonJourney` lendo de `person_journey` quando flag `on`.
4. **Dual-write** — ao mutar via legado (`person_pipeline`), espelhar em `person_journey` via RPC.
5. **Smoke test por igreja** — validar reconciliação via `journey_audit_reconciliation`.
6. **Rollout gradual** — ativar flag church a church após validação.
7. **Fase sunset** — quando todas as igrejas estiverem na espinha, remover dual-write e leitura do legado.

---

## Decisões pendentes para a Fase 2

### `care_contacts` como fonte concorrente de estado
`care_contacts` é atualizada via UPSERT em `useCareContacts.ts` (único escritor, nenhuma EF). Ainda não está integrada ao journey. Decisão necessária: espelhar eventos de cuidado em `journey_events`, ou manter separado?

### `pipeline_id` nullable — IGV legado
A IGV não tem linha em `pipelines` e todos os stages têm `pipeline_stages.pipeline_id = NULL`. O campo `pipeline_id` em `person_journey` foi deixado nullable por isso. Quando/se a IGV migrar para pipeline explícito, backfill da coluna será necessário.

### As 5.487 pessoas sem jornada (projeção)
Regra 4 do backfill (sem stage → não criar jornada) deixa ~5.487 pessoas sem `person_journey`. Decisão necessária: criar jornada em stage padrão? Ignorar? Notificar líder? Definir antes da Fase 2.

### `generate_recurring_occurrences` exposta
Função sem guard de auth identificada na E19.5 — opera em eventos de todas as igrejas sem filtro de tenant. Deve ser corrigida em frente dedicada de segurança, antes do go-live da Fase 2.

---

## Rollback

Ver [`docs/journey-unification-rollback.sql`](./journey-unification-rollback.sql).  
Pré-condição: `person_journey` com 0 linhas.  
Ordem: migration 5 → 4 → 3 → 2 → 1 → tracking.
