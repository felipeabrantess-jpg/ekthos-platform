# Diffs das EFs Blindadas — Fase 2 (Dual-Write)

**Status:** rascunho de análise. NÃO deployado. Requer CP1 + aprovação de Felipe.
**Escopo:** como cada EF precisaria mudar na Fase 2 para fazer dual-write em person_journey.

---

## 1. dispatch-person-event (v35 produção)

### Comportamento atual
- D3 GUARD: UPDATE condicional em `acolhimento_journey` para prevenir duplicatas
- Após guard, chama `agent-acolhimento` com `journey_id` do `acolhimento_journey`
- Não escreve em `person_journey` (não existe ainda)

### Mudança proposta (Fase 2)
Após o D3 GUARD passar (linha ~200 no v35), antes de invocar agent-acolhimento:

```typescript
// DUAL-WRITE — Fase 2
// Ponto de inserção: após `const journeyId = (d3LockResult as { id: string }).id`
// e ANTES de `fetch(...agent-acolhimento...)`
//
// Verificar feature flag antes de escrever
const { data: flag } = await sb
  .from('church_feature_flags')
  .select('enabled')
  .eq('church_id', churchId)
  .eq('flag_key', 'journey_unification')
  .maybeSingle()

if (flag?.enabled) {
  await sb.from('person_journey').insert({
    church_id:       churchId,
    person_id:       personId,
    trigger:         'person_created',
    entry_agent:     'agent-acolhimento',
    opened_at:       new Date().toISOString(),
  }).catch(() => {}) // ignora conflito de unicidade (idempotente)
}
```

**Risco:** BAIXO — é fire-and-forget com `.catch(() => {})`, não bloqueia o fluxo existente.
**Rollback:** remover o bloco if e deployar. Não há dado a desfazer (tabela permanece vazia).
**Teste:** após deploy, criar nova pessoa → verificar linha em `person_journey` com `trigger = 'person_created'`.

---

## 2. conversation-router (v21 produção)

### Comportamento atual
- Recebe `ownership` do payload
- AUTO-ASSIGN: se `ownership = 'unassigned'` → UPDATE conversations para `agent` + log
- Não escreve em `person_journey`

### Mudança proposta (Fase 2)
Após o auto-assign (UPDATE conversations + INSERT ownership_log), antes de retornar:

```typescript
// DUAL-WRITE — Fase 2
// Ponto: após INSERT conversation_ownership_log, antes de effectiveOwnership = 'agent'
//
// Registrar toque de inbound na jornada se habilitado
if (person_id && flag?.enabled) {
  // Buscar jornada ativa
  const { data: journey } = await sb
    .from('person_journey')
    .select('id')
    .eq('church_id', church_id)
    .eq('person_id', person_id)
    .is('closed_at', null)
    .maybeSingle()

  if (journey) {
    await sb.from('journey_events').insert({
      journey_id:  journey.id,
      church_id:   church_id,
      event_type:  'inbound_message',
      actor_id:    null, // sistema
      payload:     { conversation_id, ownership_before: 'unassigned' },
    }).catch(() => {})
  }
}
```

**Risco:** BAIXO — SELECT + INSERT opcional, `.catch(() => {})`, sem bloqueio.
**Rollback:** remover bloco if + deployar.
**Teste:** nova conversa inbound → verificar `journey_events` com `event_type = 'inbound_message'`.

---

## 3. agent-acolhimento (v52 produção — análise baseada em v22 local)

### Comportamento atual
- Lock atômico via UPDATE `status='processing'` em `acolhimento_journey`
- Loops de tools com LLM
- `forceCRMUpdate` atualiza `last_contact_at` e `people.pipeline_stage_id`
- Debit credits após execução

### Mudança proposta (Fase 2) — 2 pontos

**Ponto A — agent_locked_at (linha ~522, dentro de processJourney):**
```typescript
// Antes:
.update({ status: 'processing' })

// Depois:
.update({ status: 'processing', agent_locked_at: new Date().toISOString() })

// E nos reverts (linhas ~637 e ~682):
.update({ status: 'pending', agent_locked_at: null })
```

**Ponto B — journey_register_touch após execução bem-sucedida (linha ~640, após tool loop):**
```typescript
// Após executar as tools, se flag habilitada:
if (flag?.enabled && journeyId) {
  const { data: journey } = await sb
    .from('person_journey')
    .select('id')
    .eq('church_id', churchId)
    .eq('person_id', personId)
    .is('closed_at', null)
    .maybeSingle()

  if (journey) {
    await sb.from('journey_events').insert({
      journey_id: journey.id,
      church_id:  churchId,
      event_type: 'agent_touchpoint',
      actor_id:   null,
      payload: {
        acolhimento_touchpoint: currentTouchpoint,
        next_touchpoint:        nextTouchpoint,
        agent_version:          'v52',
      },
    }).catch(() => {})
  }
}
```

**Risco:** MÉDIO — agent-acolhimento está blindado. Qualquer mudança precisa de CP2 separado.
**Rollback:** remover blocos if + deployar v52+1.
**Teste:** executar cron de acolhimento → verificar `journey_events` com `event_type = 'agent_touchpoint'`.

---

## Ordem de deploy sugerida (Fase 2)

1. Aplicar migrations (E4/E5/E6) — cria tabelas vazias
2. Deploy `dispatch-person-event` (menor risco, primeiras jornadas criadas)
3. Monitorar 24h — `SELECT COUNT(*) FROM person_journey`
4. Deploy `conversation-router` (toque de inbound)
5. Monitorar 24h
6. CP2 com Felipe antes de qualquer mudança em `agent-acolhimento`

**Nada disso ocorre na Fase 1 atual.**
