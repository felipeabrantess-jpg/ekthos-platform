# Acolhimento IGV — runbook (estado funcional de 26/10/2026)

Validado em produção em 26/10/2026 17:57 BRT: cadastro pelo QR `igv-itaipu` → jornada → agente → fila → Meta
(wamid aceito) → **mensagem recebida no celular** (confirmado pelo Felipe).

## 1. Versão funcional (não alterar sem correção validada e autorização)
| Peça | Versão em produção | Origem |
|---|---|---|
| `agent-acolhimento` | **v58** (`verify_jwt=false`) | PR #482, commit `2e8bfc2` (merge `408420c`) |
| `channel-dispatcher` | v51 (`verify_jwt=false`) | publicado em 21/07 |
| `webhook-receiver` | v45 (`verify_jwt=false`) | publicado em 02/10 |
| `visitor-capture` | v56 (`verify_jwt=false`) | PR #479 |
| `dispatch-person-event` | v51 (`verify_jwt=false`) | publicado em 02/10 |
| cron `channel-dispatcher` | `*/1 * * * *`, ativo | — |
| cron `agent-acolhimento-fu` | `0 11 * * *` (08:00 BRT), ativo | — |
| Autorização `agent-acolhimento` IGV | `agent_grants` `33193c75-…` **ativa** desde 26/10 17:56 BRT | — |
| Canal IGV | `church_whatsapp_channels` `b8a61922-…`, `meta_cloud`, `+55 21 96619-7794`, Phone Number ID `1282611328279429`, **ativo** | — |
| Boas-vindas D+0 | template `acolhimento_boasvindas` com vídeo por link (`igv-media/acolhimento/boasvindas-igv.mp4`) | — |

Créditos do agente (IGV): 599 em 26/10 18:01 BRT (`church_agent_credits`).

## 2. Recuperação
- **Agente:** redeploy do commit `2e8bfc2` → `npx supabase functions deploy agent-acolhimento --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt --use-api`
  (executar no worktree com esse commit; o pacote inclui `_shared/agent-tools.ts`, `_shared/d0-welcome.ts`, `_shared/log-agent-execution.ts`).
- **Desligar o acolhimento sem perder nada (emergência):**
  `UPDATE agent_grants SET active=false WHERE id='33193c75-9b5b-425e-9bab-dd059189736c';` e/ou
  `UPDATE church_whatsapp_channels SET active=false WHERE id='b8a61922-7825-4a2c-8220-7e899a1f9484';`
  Com o canal inativo a v58 bloqueia (`blocked_no_active_channel`) e não registra contato fictício.
- **Nunca** retomar em lote as 378 jornadas canceladas.

## 3. Pendência prioritária de segurança — `WA_APP_SECRET`
- Situação: o secret **não existe** (`WA_APP_SECRET` e `META_APP_SECRET` ausentes em 26/10). O `webhook-receiver`
  aceita eventos sem validar a assinatura `x-hub-signature-256` (log: "WA_APP_SECRET ausente — … fail-open").
- O código **já valida** quando o secret existe (HMAC-SHA256 do corpo cru). Não precisa de deploy para ligar.
- Procedimento (Felipe): Meta for Developers → app **Ekthos IGV** (`1356690759261795`) → Configurações → Básico →
  "Chave secreta do app" → copiar → Supabase → Edge Functions → Secrets → `WA_APP_SECRET`.
- Risco: secret errado = todos os webhooks da Meta recebem 401 (respostas de pessoas e recibos deixam de entrar;
  **os envios não param**). Validar logo após: um evento real deve aparecer sem "signature mismatch"; se aparecer,
  apagar o secret (volta ao comportamento atual).

## 4. Recibos de entrega (alteração separada, não publicada)
Branch `fix/webhook-meta-assinatura-status`: o `webhook-receiver` grava `value.statuses[]` em
`whatsapp_message_statuses` e a view `whatsapp_dispatch_delivery` mostra, por envio:
**enfileirado → aceito pela API (fila `sent`) → enviado → entregue → lido**, ou **falhou** (com o código da Meta).
Publicação: migration `20261026150000` primeiro, depois o `webhook-receiver`. Rollback no arquivo correspondente.

## 5. Monitoramento proposto (somente leitura, nenhum envio)
Executar a cada 15 min (pg_cron gravando em uma tabela de alertas, ou consulta manual):
```sql
-- a) mensagens paradas na fila (> 5 min em pending/processing)
SELECT count(*) FROM channel_dispatch_queue WHERE status IN ('pending','processing') AND created_at < now() - interval '5 minutes';
-- b) envios recusados pela API nas últimas 24 h
SELECT count(*), max(error_message) FROM channel_dispatch_queue WHERE status = 'failed' AND created_at > now() - interval '24 hours';
-- c) falhas do agente nas últimas 24 h (IGV)
SELECT error, count(*) FROM agent_executions WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND NOT success
  AND created_at > now() - interval '24 hours' GROUP BY 1;
-- d) canal ou autorização desligados
SELECT (SELECT active FROM church_whatsapp_channels WHERE id = 'b8a61922-7825-4a2c-8220-7e899a1f9484') canal,
       (SELECT active FROM agent_grants WHERE id = '33193c75-9b5b-425e-9bab-dd059189736c') autorizacao;
-- e) cron com falha nas últimas 24 h
SELECT j.jobname, count(*) FROM cron.job_run_details d JOIN cron.job j USING (jobid)
 WHERE j.jobname IN ('channel-dispatcher','agent-acolhimento-fu') AND d.status <> 'succeeded' AND d.start_time > now() - interval '24 hours' GROUP BY 1;
-- f) cadastro novo sem jornada (> 10 min) — o acolhimento não iniciou
SELECT count(*) FROM people p WHERE p.church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND p.deleted_at IS NULL
  AND p.created_at > '2026-10-26 20:56:00+00' AND p.created_at < now() - interval '10 minutes'
  AND NOT EXISTS (SELECT 1 FROM acolhimento_journey j WHERE j.person_id = p.id);
-- g) créditos do agente abaixo de 50
SELECT cycle_credits + topup_credits FROM church_agent_credits WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND agent_scope = 'agent-acolhimento';
-- h) (após publicar os recibos) aceitos pela API sem "delivered" em 1 h
SELECT count(*) FROM whatsapp_dispatch_delivery WHERE status_fila = 'sent' AND entregue_em IS NULL AND processed_at < now() - interval '1 hour';
```
Alerta = qualquer valor fora do esperado (a, b, f, h > 0; d falso; g < 50; e > 0; c com erro novo).
