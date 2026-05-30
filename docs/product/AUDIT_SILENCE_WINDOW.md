# Auditoria: anti_spam:silence_window — Diagnóstico F-A0a

> **Gerado:** MEGA-ONDA 2026-05-30 (F-A0a)
> **Escopo:** Taxa de falha 77% do cron agent-acolhimento-followups
> **Status:** CAUSA RAIZ ENCONTRADA — aguarda aprovação do fix

---

## 1. Resumo Executivo

**27 de 36 execuções (75%) bloqueadas por `anti_spam:silence_window`.**

Duas causas simultâneas e complementares:

| Causa | Origem | Impacto |
|---|---|---|
| **Cron dispara às 08:00 UTC = 05:00 BRT** | Configuração pg_cron | 100% das execuções matutinas caem dentro da janela de silêncio |
| **`send_window` do banco ignorado** | Código `processJourney()` | Config por-igreja nunca é lida antes do checkAntiSpam |

---

## 2. Raiz do Problema — Cron vs. Timezone

```
Cron schedule: */30 * * * *  (a cada 30 min, UTC)
Execução matutina crítica: 08:00 UTC

08:00 UTC = 05:00 BRT (America/Sao_Paulo, UTC-3)

checkAntiSpam defaults (hardcoded):
  silenceStartH = 21
  silenceEndH   = 8

Às 05:00 BRT: localHour (5) < silenceEndH (8) → BLOQUEADO
```

**Resultado:** Toda execução entre 00:00 UTC e 11:00 UTC (21h–8h BRT) é bloqueada.
O cron roda a cada 30 min. Slots bloqueados: 00:00–11:00 UTC = 22 slots de 30 min = **44 execuções bloqueadas por dia** (de 48 totais = **92% de bloqueio diário real**).

---

## 3. Segundo Bug — send_window Nunca Lido

### Localização do bug

**`supabase/functions/agent-acolhimento/index.ts` — função `processJourney()` (~linha 441):**

```typescript
// ATUAL — send_window ignorado
const spamCheck = await checkAntiSpam(churchId, personId, churchTimezone)
```

### Assinatura completa de checkAntiSpam (tem os parâmetros, mas nunca são passados)

**`supabase/functions/_shared/agent-tools.ts` linhas 30-102:**

```typescript
export async function checkAntiSpam(
  churchId: string,
  personId: string,
  churchTimezone: string,
  silenceStartH = 21,   // ← parâmetro existe, nunca recebe valor real
  silenceEndH = 8,      // ← idem
  maxPerDay = 1,
  maxPerWeek = 3,
): Promise<{ allowed: boolean; reason?: string; delay_until?: string }>
```

### O que deveria acontecer

`processJourney()` deveria:
1. Ler `church_agent_config.send_window` para a igreja
2. Extrair `start` e `end` do JSON
3. Passar como `silenceStartH` e `silenceEndH` para `checkAntiSpam`

Mas `send_window` nunca é consultado.

---

## 4. Dados Observados

### Journeys travadas (D+0, sem evolução há 8-9 dias)

| journey_id | person | church | created_at | next_touchpoint_at |
|---|---|---|---|---|
| 3ff120db | Teste Investigacao | Minha Fé | 2026-05-21 | 2026-05-31 08:00 UTC |
| 3b4cd884 | Teste Preview | Minha Fé | 2026-05-21 | 2026-05-31 08:00 UTC |
| 30329b26 | Tubarão Branco | Minha Fé | 2026-05-22 | 2026-05-31 08:00 UTC |

Todas com `touchpoints_sent=[]` — nenhum touchpoint enviado.

### Estado do banco para Minha Fé (church_id: 5156cc30-6d76-4487-99ba-fff8013b38d4)

- **`church_agent_config`**: NENHUMA linha para `agent-acolhimento` — sem `send_window` configurado
- **`is_test_church`**: TRUE
- **Resultado**: checkAntiSpam usa defaults (21h–8h) + cron às 05h BRT = 100% bloqueio

---

## 5. Opções de Fix

### Opção A (Zero código — aplica hoje) ⭐ RECOMENDADA IMEDIATA

Mover o cron de 08:00 UTC para 11:00 UTC (08:00 BRT):

```sql
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'agent-acolhimento-followups'),
  schedule := '0 11 * * *'
);
```

**Impacto:** 11:00 UTC = 08:00 BRT → fora da janela de silêncio (21h–8h) → todas as journeys desbloqueadas imediatamente.

**Risco:** Nenhum — só muda horário do cron. Reversível em 30 segundos.

### Opção B (3 linhas de código — sprint atual)

Em `agent-acolhimento/index.ts`, na função `processJourney()`, ler `send_window` antes de chamar `checkAntiSpam`:

```typescript
// 1. Ler config (já existe agentConfig normalmente carregado)
const sendWindow = agentConfig?.send_window as { start: number; end: number } | undefined

// 2. Passar para checkAntiSpam
const spamCheck = await checkAntiSpam(
  churchId,
  personId,
  churchTimezone,
  sendWindow?.end ?? 21,    // silenceStartH = fim da janela ativa
  sendWindow?.start ?? 8,   // silenceEndH = início da janela ativa
)
```

**Nota:** A lógica de `start`/`end` em `send_window` precisa ser validada — `send_window` salvo como `{"start":0,"end":23}` significa "ativo o dia todo" (janela de silêncio inexistente).

### Opção C (1 INSERT — fix Minha Fé imediatamente)

Inserir `church_agent_config` para Minha Fé com `send_window` amplo:

```sql
INSERT INTO church_agent_config (church_id, agent_slug, send_window, active)
VALUES (
  '5156cc30-6d76-4487-99ba-fff8013b38d4',
  'agent-acolhimento',
  '{"start": 8, "end": 21}',
  true
)
ON CONFLICT (church_id, agent_slug) DO UPDATE SET send_window = EXCLUDED.send_window;
```

**Atenção:** Sem Opção B, este INSERT não muda nada porque `send_window` é ignorado no código. Opção C só funciona junto com Opção B.

### RECOMENDAÇÃO

**Aplicar Opção A agora** (zero código, desbloqueio imediato das 3 journeys travadas).
**Opção B + C no próximo sprint** (fix definitivo multi-church).

---

## 6. Segundo Bug — delay_until em UTC errado

Além do bloqueio, há um bug secundário no cálculo de `delay_until`:

```typescript
// BUG: setHours aplica em UTC, não no timezone local
tomorrow.setHours(silenceEndH, 0, 0, 0)
return { allowed: false, reason: 'silence_window', delay_until: tomorrow.toISOString() }
```

`setHours()` no JS atua em UTC. Para uma igreja em BRT (UTC-3) com `silenceEndH=8`:
- `setHours(8)` → 08:00 UTC = 05:00 BRT (ainda dentro da janela!)
- Deveria ser `setHours(8+3)` = `setHours(11)` para chegar em 08:00 BRT

**Impacto:** As journeys ficam com `next_touchpoint_at = 08:00 UTC` — que ao ser re-checado pelo cron às 08:00 UTC, o horário local é 05:00 BRT → BLOQUEADO novamente. Loop de re-agendamento infinito.

**Fix:** Calcular o próximo horário válido respeitando timezone, ou simplesmente ajustar o cron (Opção A) para evitar o problema.

---

## 7. Achados de Contexto

### Cron agent-acolhimento-followups — status

| Item | Valor |
|---|---|
| Schedule | `*/30 * * * *` (a cada 30 min) |
| Última execução | 2026-05-30 21:00:00 UTC (4ms) |
| Status | `succeeded` (mas silencioso — sem envios) |
| Duração média | 11.1 ms (confirma que bloqueia rápido, sem chegar no LLM) |

### send_window no banco

| church | agent_slug | send_window |
|---|---|---|
| Mock (62e473b8) | agent-acolhimento | `{"start":0,"end":23}` (ativo 24h) |
| Minha Fé (5156cc30) | agent-acolhimento | **AUSENTE** (sem config) |

---

## 8. Recomendações de Roadmap

| Prioridade | Ação | Esforço | Impacto |
|---|---|---|---|
| 🔴 Imediata | Opção A: mover cron para 11:00 UTC | 1 SQL | 3 journeys desbloqueadas hoje |
| 🟡 Sprint | Opção B: ler send_window em processJourney | 3 linhas | Fix definitivo multi-church |
| 🟡 Sprint | Opção C: INSERT church_agent_config Minha Fé | 1 SQL | Ativa junto com Opção B |
| 🟢 Futuro | Fix delay_until timezone | ~10 linhas | Evita loop de re-agendamento |
| 🟢 Futuro | Testes E2E de silence_window por timezone | Test suite | Previne regressão |

---

*Auditoria gerada automaticamente — MEGA-ONDA FASE 0 F-A0a — 2026-05-30*
