# Spec: People Pipeline & Journey UX Improvements

**Autor:** SA-A9 — MEGA-ONDA SEGURANÇA AMPLA (Lane A: Investigate/Spec Only)
**Data:** 2026-05-30
**Status:** DRAFT para revisão pastoral

---

## 1. Estado Atual

### 1.1 Estágios do Pipeline (por tenant)

O sistema usa a tabela `pipeline_stages` com suporte a múltiplos templates.
O template em uso em produção (genérico — 4 estágios) e os templates disponíveis:

| order_index | Slug | SLA configurado |
|---|---|---|
| 0 | Visitante | 48h |
| 1 | Frequentador | 168h (7 dias) |
| 2 | Discípulo | 336h (14 dias) |
| 3 | Membro | terminal |

Templates disponíveis em `discipleship_templates`: Genérico, Batista Tradicional (+ Líder), G12 (Ganhar/Consolidar/Discipular/Enviar), Assembleia de Deus (6 estágios), Presbiteriano, Células Puro (5 estágios).

**Problema detectado:** A cor de todos os estágios em produção está fixada em `#e13500` (vermelho Ekthos), independentemente do estágio. Perda de diferenciação visual crítica para o pastor.

### 1.2 Distribuição de Pessoas no Pipeline (produção)

| Estágio | Pessoas |
|---|---|
| Visitante | 9 |
| Frequentador | 1 |
| Discípulo | 0 |
| Membro | 0 |

**Observação crítica:** 6 das 9 pessoas em Visitante estão sem `acolhimento_journey` associada (sem jornada de acompanhamento ativa). 4 pessoas em Visitante estão há mais de 30 dias no mesmo estágio sem nenhuma atividade registrada.

### 1.3 Estado das Jornadas de Acolhimento

| Status | Quantidade |
|---|---|
| pending | 5 |
| active | 0 |
| completed | 0 |
| paused | 0 |
| cancelled | 0 |

**Observações:**
- Todas as 5 jornadas ativas estão em `status=pending` e `current_touchpoint=D+0` (exceto 1 em D+30)
- 3 jornadas criadas em 2026-05-22 ainda não enviaram nenhum touchpoint após 8 dias
- 6 pessoas no pipeline NÃO têm jornada criada — pipeline e journey estão desacoplados
- A jornada mais antiga (criada 2026-05-01) enviou 4 touchpoints mas recebeu 0 respostas

### 1.4 Infraestrutura de Journey

- `church_followup_config`: touchpoints configurados em `[D+0, D+3, D+7, D+14, D+30]`, janela `08:00–20:00`
- `acolhimento_journey.touchpoints_sent`: array JSONB (sem schema padronizado de item)
- `acolhimento_journey.responses_received`: array JSONB (idem)
- `pipeline_history`: log imutável de mudanças de estágio, com `moved_by` (NULL em todos os registros — indica apenas movimentações automáticas)
- `person_pipeline.notes`: campo existe mas NULL em todos os registros (feature não usada)
- `conversations` + `conversation_messages`: histórico WhatsApp existe (191 mensagens), mas sem FK direta para `acolhimento_journey` ou `person_pipeline`

---

## 2. Pain Points Identificados (da investigação)

### P1 — CRÍTICO: Desacoplamento Pipeline ↔ Journey

**Problema:** 6 das 10 pessoas no pipeline não têm `acolhimento_journey`. O estágio no pipeline existe, mas o agente não está acompanhando. Não há mecanismo de alerta para o pastor quando isso ocorre.

**Impacto:** O pastor vê a pessoa no pipeline Kanban, acredita que o agente está cuidando, mas não há acompanhamento real.

**Root cause:** A criação de `acolhimento_journey` não é automática ao inserir em `person_pipeline`. São processos separados sem trigger de sincronização.

---

### P2 — CRÍTICO: Ausência de indicador de "tempo no estágio" e "SLA vencido"

**Problema:** A UI não mostra há quantos dias a pessoa está no estágio atual. `person_pipeline.entered_at` existe mas provavelmente não é exibido.

**Dados reais:**
- 4 pessoas estão em Visitante há mais de 30 dias (SLA configurado: 48h)
- 1 pessoa está em Frequentador há 32 dias (SLA: 168h)
- `last_activity_at` = `entered_at` em todos os casos (nunca atualizado após entrada)

**Impacto:** Pastor não sabe quem está estagnado. O pipeline parece "ativo" visualmente mas as pessoas estão paradas.

---

### P3 — ALTO: Sem visibilidade da conversa do agente para o pastor

**Problema:** O agente envia mensagens WhatsApp via `conversation_messages`, mas não há link direto entre o card de pessoa no pipeline e o histórico de conversa. O pastor não tem como ver o que o agente já disse à pessoa.

**Dados reais:** 191 mensagens em `conversation_messages`, `conversations` tem `person_id` e `agent_slug`, mas a tela do pipeline não expõe isso.

**Impacto:** O pastor não tem contexto para fazer um acompanhamento humano adequado quando quiser assumir a conversa.

---

### P4 — ALTO: Ausência de avanço/retrocesso manual de estágio com nota

**Problema:** `pipeline_history.moved_by` é NULL em todos os 3 registros históricos — todas as movimentações foram automáticas (sistema). Não há UI para o pastor mover manualmente uma pessoa de estágio e registrar o motivo.

**Impacto:** O pastor testemunha um progresso real (pessoa foi batizada, tornou-se membro) mas não consegue refletir isso no pipeline sem contato com suporte.

---

### P5 — MÉDIO: Sem filtro "precisa de atenção"

**Problema:** Não há filtro rápido para identificar: (a) pessoas paradas há mais de X dias, (b) pessoas sem jornada, (c) jornadas sem resposta.

**Impacto:** O pastor precisa varrer manualmente todos os cards para identificar quem precisa de intervenção pastoral humana.

---

### P6 — MÉDIO: Sem preview da "próxima ação do agente"

**Problema:** `acolhimento_journey.next_touchpoint_at` e `current_touchpoint` existem no banco, mas provavelmente não são exibidos no card do pipeline. O pastor não sabe o que o agente vai fazer a seguir.

**Impacto:** Risco de o pastor fazer contato humano ao mesmo tempo que o agente dispara uma mensagem automatizada — experiência incoerente para o visitante.

---

### P7 — MÉDIO: Cor dos estágios sem diferenciação

**Problema:** Todos os `pipeline_stages` em produção têm `color=#e13500`. As cores distintas nos templates (`#94a3b8` cinza para Visitante, `#f59e0b` âmbar para Frequentador, `#3b82f6` azul para Discípulo) não foram aplicadas aos registros criados via onboarding.

**Impacto:** O Kanban é visualmente indistinguível entre colunas — loss de hierarquia visual.

---

## 3. Proposta: Pipeline Card Aprimorado

### Card de Pessoa (por coluna do Kanban)

```
┌─────────────────────────────────────────┐
│  João Silva                       [32d] │  ← dias no estágio (vermelho se > SLA)
│  📱 (11) 99999-9999                     │
│  ─────────────────────────────────────  │
│  Agente: D+14 enviado ✓                 │  ← current_touchpoint
│  Próximo: D+30 em 5 dias               │  ← next_touchpoint_at
│  Respostas: 0                           │  ← responses_received count
│  ─────────────────────────────────────  │
│  ⚠ SEM JORNADA ATIVA                   │  ← se journey não existe
│  ─────────────────────────────────────  │
│  [Ver conversa] [Avançar] [Nota]        │
└─────────────────────────────────────────┘
```

**Campos novos a exibir (já existem no DB):**
- `NOW() - person_pipeline.entered_at` → dias no estágio
- Badge vermelho/laranja se ultrapassou `pipeline_stages.sla_hours`
- `acolhimento_journey.current_touchpoint` e `next_touchpoint_at`
- `jsonb_array_length(touchpoints_sent)` e `jsonb_array_length(responses_received)`
- Alert banner se `acolhimento_journey` não existe para a pessoa

---

## 4. Proposta: Avanço/Retrocesso Manual de Estágio

### UX

- Botão "Avançar" (→ próximo estágio) e "Retroceder" (← estágio anterior) no card
- Dialog de confirmação com campo de nota obrigatória
- Ao confirmar:
  1. UPDATE `person_pipeline.stage_id` para novo estágio
  2. UPDATE `person_pipeline.entered_at = NOW()` e `last_activity_at = NOW()`
  3. INSERT em `pipeline_history` com `moved_by = auth.uid()` e a nota

### DB (sem mudanças — infraestrutura já existe)

- `pipeline_history.moved_by` → campo já existe, só precisa ser populado
- `pipeline_history.notes` → campo já existe
- A lógica atual de auditoria está pronta; falta apenas a UI de disparo manual

### Edge Function necessária

```
POST /functions/v1/pipeline-move-person
Body: { person_id, to_stage_id, notes, church_id }
```

Valida: stage pertence ao mesmo pipeline, auth ativa, church_id match.

---

## 5. Proposta: Timeline da Jornada (Journey View)

### Acesso

Ao clicar em "Ver conversa" no card → Sheet lateral com timeline cronológica:

```
Timeline da Jornada — João Silva
─────────────────────────────────
2026-04-28  Visitou a igreja (QR Code)
2026-05-01  D+0: Agente enviou boas-vindas        [WhatsApp ↗]
2026-05-04  D+3: Agente enviou mensagem de check   [WhatsApp ↗]
2026-05-08  D+7: Agente enviou convite para célula [WhatsApp ↗]
2026-05-15  D+14: Agente enviou convite para EBD   [WhatsApp ↗]
            (Sem resposta registrada)
─────────────────────────────────
Próxima ação: D+30 em 2026-06-24 17:00
[Pausar jornada] [Assumir conversa] [Adicionar nota pastoral]
```

### Join necessário

```sql
SELECT cm.content, cm.direction, cm.created_at, cm.sender_type
FROM conversation_messages cm
JOIN conversations c ON cm.conversation_id = c.id
WHERE c.person_id = :person_id
  AND c.church_id = :church_id
ORDER BY cm.created_at;
```

O join já é possível via `conversations.person_id` — só falta a UI.

---

## 6. Proposta: Filtro "Precisa de Atenção"

### Filtros rápidos (chips no topo do Kanban)

| Chip | Critério SQL |
|---|---|
| "Parados > 7 dias" | `NOW() - pp.last_activity_at > interval '7 days'` |
| "Sem jornada" | `NOT EXISTS (SELECT 1 FROM acolhimento_journey aj WHERE aj.person_id = pp.person_id)` |
| "SLA vencido" | `NOW() - pp.entered_at > make_interval(hours => ps.sla_hours)` |
| "Sem resposta" | `aj.responses_received = '[]'::jsonb AND jsonb_array_length(aj.touchpoints_sent) > 0` |
| "Jornada pausada" | `aj.status = 'paused'` |

### View sugerida (para performance)

```sql
CREATE VIEW pipeline_attention_flags AS
SELECT 
  pp.person_id,
  pp.church_id,
  ps.name AS stage_name,
  ps.sla_hours,
  pp.entered_at,
  pp.last_activity_at,
  EXTRACT(EPOCH FROM (NOW() - pp.entered_at))/3600 AS hours_in_stage,
  CASE WHEN ps.sla_hours IS NOT NULL AND 
       EXTRACT(EPOCH FROM (NOW() - pp.entered_at))/3600 > ps.sla_hours 
       THEN true ELSE false END AS sla_breached,
  CASE WHEN aj.id IS NULL THEN true ELSE false END AS no_journey,
  aj.status AS journey_status,
  aj.next_touchpoint_at,
  aj.current_touchpoint,
  jsonb_array_length(COALESCE(aj.touchpoints_sent, '[]')) AS touchpoints_sent,
  jsonb_array_length(COALESCE(aj.responses_received, '[]')) AS responses_received
FROM person_pipeline pp
JOIN pipeline_stages ps ON pp.stage_id = ps.id
LEFT JOIN acolhimento_journey aj ON aj.person_id = pp.person_id;
```

---

## 7. Proposta: Ações em Lote (Bulk Actions)

Para quando o pastor seleciona múltiplas pessoas:

- Avançar todos para o próximo estágio
- Adicionar nota coletiva ("Participaram do retiro de 2026-05-25")
- Pausar/retomar jornada do agente para o grupo
- Exportar lista para WhatsApp/email pastoral

---

## 8. DB Changes Necessárias

| Prioridade | Mudança | Justificativa |
|---|---|---|
| P1 | Corrigir cores dos `pipeline_stages` em produção | Todos estão `#e13500`; usar cores dos templates |
| P1 | Criar view `pipeline_attention_flags` | Base de todos os filtros de atenção |
| P2 | Edge Function `pipeline-move-person` | Permite avanço manual com auditoria |
| P2 | Trigger/Edge Function: ao INSERT em `person_pipeline`, criar `acolhimento_journey` automaticamente se `church_followup_config.followup_enabled = true` | Elimina o desacoplamento atual |
| P3 | Adicionar campo `paused_at` e `pause_reason` em `acolhimento_journey` | Permite pastor pausar manualmente |
| P3 | Atualizar `person_pipeline.last_activity_at` sempre que houver mensagem na `channel_dispatch_queue` para a pessoa | Hoje `last_activity_at` nunca é atualizado |

---

## 9. Componentes Frontend Necessários

| Componente | Arquivo sugerido | Prioridade |
|---|---|---|
| `PipelineKanban.tsx` | `src/pages/Pipeline.tsx` (existente, aprimorar) | P1 |
| `PipelineCard.tsx` | `src/components/pipeline/PipelineCard.tsx` | P1 |
| `JourneyTimeline.tsx` | `src/components/pipeline/JourneyTimeline.tsx` | P1 |
| `StageMovementDialog.tsx` | `src/components/pipeline/StageMovementDialog.tsx` | P2 |
| `AttentionFilters.tsx` | `src/components/pipeline/AttentionFilters.tsx` | P2 |
| `BulkActionsBar.tsx` | `src/components/pipeline/BulkActionsBar.tsx` | P3 |
| Hook `usePipelineAttention` | `src/hooks/usePipelineAttention.ts` | P1 |
| Hook `usePipelineMove` | `src/hooks/usePipelineMove.ts` | P2 |

---

## 10. Priorização

### P1 — Crítico (impacto imediato na retenção pastoral)
1. Exibir dias no estágio + badge de SLA vencido no card
2. Exibir status da jornada no card (com alerta "SEM JORNADA")
3. Link para timeline da conversa (join conversations → messages)
4. Corrigir cores dos estágios em produção

### P2 — Alto (melhoria de operação pastoral)
5. Avanço/retrocesso manual com nota e auditoria
6. Filtros "Precisa de Atenção" (sem jornada, SLA vencido, parados)
7. Automação: criar journey automaticamente ao entrar no pipeline

### P3 — Médio (eficiência em escala)
8. Ações em lote
9. Preview da próxima ação do agente no card
10. Campo "pausar jornada" com motivo

---

## 11. Questões em Aberto para o Pastor

1. **Filtro "parados":** Qual o threshold correto — 7 dias ou o próprio SLA do estágio?
2. **Journey automática:** Ao mover pessoa manualmente para um novo estágio, o agente deve reiniciar a jornada (D+0 novamente) ou continuar de onde parou?
3. **Conversa compartilhada:** Ao clicar em "Assumir conversa", isso transfere o `ownership` da `conversations` para o pastor e pausa o agente? Confirmar comportamento desejado.
4. **Cor dos estágios:** Usar as cores dos templates (cinza/âmbar/azul/verde) ou deixar o pastor configurar por tenant?

---

## Anexo: Queries de Diagnóstico Prontas

```sql
-- Pessoas paradas (para dashboard pastoral)
SELECT p.name, ps.name as stage, 
       NOW() - pp.entered_at as time_in_stage,
       CASE WHEN aj.id IS NULL THEN 'SEM JORNADA' ELSE aj.status END as journey
FROM person_pipeline pp
JOIN pipeline_stages ps ON pp.stage_id = ps.id
JOIN people p ON pp.person_id = p.id
LEFT JOIN acolhimento_journey aj ON aj.person_id = pp.person_id
WHERE pp.church_id = :church_id
ORDER BY pp.entered_at;

-- Jornadas sem resposta (alto risco de churn pastoral)
SELECT p.name, aj.current_touchpoint, 
       jsonb_array_length(aj.touchpoints_sent) as sent,
       aj.started_at
FROM acolhimento_journey aj
JOIN people p ON aj.person_id = p.id
WHERE aj.responses_received = '[]'::jsonb
  AND jsonb_array_length(aj.touchpoints_sent) > 0
  AND aj.church_id = :church_id;
```
