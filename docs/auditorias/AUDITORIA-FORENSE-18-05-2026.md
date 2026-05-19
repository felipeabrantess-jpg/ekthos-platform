# AUDITORIA FORENSE — Ekthos Church
**Data de execução:** 18/05/2026  
**Executor:** Claude Code (sessão H6 Frente 6.1)  
**Método:** SQL direto via Supabase MCP + `list_edge_functions`  
**Scope:** Inventário completo do estado real do banco de dados e infraestrutura em produção

---

## SUMÁRIO EXECUTIVO

| Dimensão | Contagem |
|---|---|
| Tabelas (total, todos os schemas) | **152** |
| Tabelas public | **117** |
| Funções SQL (public) | **63** |
| Edge Functions deployed | **75** |
| Jobs pg_cron | **7** (1 stub, 1 sem execução real) |
| Triggers (public) | **44** eventos em 30 tabelas |
| Migrations aplicadas | **145** (v00001 → 20260508213352) |
| Igrejas cadastradas | **6** |
| Subscriptions ativas | **2** (Stripe real) |
| Agent grants ativos | **2** (courtesy, Igreja de Teste) |
| Canais WhatsApp | **5** (1 ativo+funcional, 1 disconnected, 3 problemáticos) |
| Planos | **3** (chamado / missão / avivamento) |
| Agentes no catálogo | **7** (5 ativos, 2 inativos) |
| Items `channel_dispatch_queue` | **88** total (81 sent, 7 failed) |

---

## BLOCO 1 — TABELAS (schema public — 117 tabelas)

### Tabelas de CRM pastoral
| Tabela | Colunas | Observação |
|---|---|---|
| `people` | 74 | Entidade central. Mais colunas do sistema. |
| `person_pipeline` | 10 | Pipeline de discipulado |
| `pipeline_stages` | 16 | Etapas configuráveis |
| `pipeline_history` | 9 | Histórico de movimentações |
| `pipelines` | 4 | Templates de pipeline |
| `person_events` | 6 | Eventos por pessoa |
| `person_roles` | 5 | Papéis pastorais |
| `person_tags` | 5 | Tags livres |
| `member_profiles` | 10 | Perfil expandido de membro |
| `interactions` | 11 | Registro de interações |
| `pastoral_cabinet` | 10 | Gabinete pastoral |
| `pastoral_goals` | 7 | Metas pastorais |
| `leaders` | 8 | Liderança |
| `supervisor_areas` | 5 | Áreas de supervisão |
| `volunteers` | 11 | Voluntários |
| `ministry_members` | 6 | Membros por ministério |
| `ministries` | 9 | Ministérios |

### Tabelas de células e grupos
| Tabela | Colunas |
|---|---|
| `groups` | 13 |
| `cell_members` | 6 |
| `cell_meetings` | 10 |
| `cell_reports` | 17 |
| `cell_report_people` | 6 |
| `cell_attendance` | 3 |
| `cell_leader_assignments` | 4 |

### Tabelas de eventos e agenda
| Tabela | Colunas |
|---|---|
| `church_events` | 27 |
| `event_templates` | 9 |
| `event_occurrences` | 12 |
| `service_schedules` | 12 |
| `service_schedule_assignments` | 9 |

### Tabelas de agentes IA
| Tabela | Colunas | Observação |
|---|---|---|
| `agents_catalog` | 16 | Catálogo de agentes disponíveis |
| `agent_grants` | 14 | Grants ativos por igreja |
| `agent_executions` | 15 | Log de execuções (ver BLOCO 8) |
| `agent_conversations` | 9 | Conversas por agente |
| `agent_chat_sessions` | 8 | Sessões de chat |
| `agent_pending_messages` | 9 | Mensagens pendentes de envio |
| `agent_prompt_templates` | 9 | Templates de prompt |
| `agent_channel_routing` | 3 | Roteamento legado |
| `agent_credit_alerts` | 6 | Alertas de crédito |
| `agent_credit_plans` | 8 | Planos de crédito |
| `agent_credit_usage` | 9 | Uso de crédito |
| `church_agent_config` | 21 | Config por igreja/agente |
| `church_agent_config_history` | 7 | Histórico de config |
| `church_agent_credits` | 7 | Créditos por igreja |
| `church_agent_subscriptions` | 10 | Subscriptions de agentes |
| `church_agent_channel_routing` | 6 | Roteamento por canal |
| `subscription_agents` | 11 | Fila de ativação manual |

### Tabelas de WhatsApp e mensageria
| Tabela | Colunas | Observação |
|---|---|---|
| `church_whatsapp_channels` | 26 | Canais WhatsApp (ver BLOCO 5) |
| `church_channels` | 15 | Canais genéricos (legado) |
| `channel_dispatch_queue` | 15 | Fila de envio (ver BLOCO 7) |
| `conversations` | 21 | Conversas multi-canal |
| `conversation_messages` | 13 | Mensagens |
| `conversation_events` | 10 | Eventos de conversa |
| `conversation_ownership_log` | 8 | Log de handoff |
| `message_outbox` | 26 | Outbox de mensagens |
| `message_templates` | 6 | Templates de mensagem |
| `messaging_config` | 9 | Config de mensageria |
| `n8n_webhooks` | 9 | Webhooks n8n por igreja |

### Tabelas de jornada pastoral
| Tabela | Colunas | Observação |
|---|---|---|
| `acolhimento_journey` | 14 | Jornada de acolhimento |
| `reengagement_journey` | 17 | Jornada de reengajamento |
| `church_followup_config` | 14 | Config de follow-up |

### Tabelas comerciais e financeiras
| Tabela | Colunas |
|---|---|
| `subscriptions` | 25 |
| `plans` | 13 |
| `addons` | 6 |
| `addon_prices` | 6 |
| `pending_addons` | 11 |
| `invoices` | 10 |
| `donations` | 17 |
| `contributions` | 9 |
| `financial_campaigns` | 10 |
| `stripe_prices` | 11 |
| `credit_packages` | 9 |
| `credit_topup_purchases` | 10 |

### Tabelas de afiliados e cupons
| Tabela | Colunas |
|---|---|
| `affiliates` | 14 |
| `affiliate_coupons` | 18 |
| `affiliate_commissions` | 14 |
| `affiliate_conversions` | 10 |
| `affiliate_payment_batches` | 8 |
| `coupons` | 28 |
| `coupon_redemptions` | 24 |
| `coupon_sync_jobs` | 12 |
| `coupon_validate_rate_limits` | 8 |

### Tabelas de cockpit admin (Ekthos-internal)
| Tabela | Colunas | Propósito |
|---|---|---|
| `admin_events` | 20 | Auditoria de ações admin |
| `admin_tasks` | 11 | Tarefas internas Ekthos |
| `church_notes` | 7 | Notas sobre contas |
| `health_scores` | 5 | Score de saúde por conta |
| `impersonate_sessions` | 8 | Auditoria de impersonações |

### Tabelas de onboarding, auth, config
| Tabela | Colunas |
|---|---|
| `churches` | 35 |
| `profiles` | 8 |
| `user_roles` | 5 |
| `roles` | 3 |
| `church_settings` | 14 |
| `church_pastoral_profile` | 8 |
| `church_sites` | 8 |
| `onboarding_sessions` | 13 |
| `onboarding_steps` | 11 |
| `contractors` | 16 |
| `access_grants` | 19 |
| `session_tokens` | 7 |
| `integrations` | 6 |

### Tabelas de captação e leads
| Tabela | Colunas |
|---|---|
| `leads` | 15 |
| `contact_requests` | 17 |
| `qr_codes` | 7 |
| `lead_capture_rate_limits` | 8 |
| `visitor_capture_rate_limits` | 8 |

### Outras
| Tabela | Colunas |
|---|---|
| `tags` | 4 |
| `tasks` | 10 |
| `notifications` | 11 |
| `internal_notifications` | 14 |
| `audit_logs` | 11 |
| `automation_logs` | 10 |
| `discipleship_templates` | 5 |

---

## BLOCO 2 — EDGE FUNCTIONS (75 deployed, todas ACTIVE, todas `verify_jwt: false`)

### Cluster: Agentes IA operacionais
| Slug | Versão | Observação |
|---|---|---|
| `agent-acolhimento` | v18 | ✅ Produção. Cron 30min + inbound. Modelo sonnet. |
| `agent-haiku-triagem` | v3 | ✅ Produção. Classifica inbound. Modelo haiku. |
| `agent-reengajamento` | v14 | ⚠️ Chat SSE only. Cron = STUB. |
| `agent-suporte` | v17 | Agente interno suporte Ekthos |
| `agent-onboarding` | v17 | Agente interno onboarding |
| `agent-cadastro` | v15 | Agente interno cadastro |
| `agent-whatsapp` | v15 | Legado. Substituído por agent-acolhimento |
| `agent-agenda` | v15 | Execuções: 2 (abr/26) |
| `agent-cuidado` | v12 | Deployed, sem execuções registradas |

### Cluster: Agentes "vitrine" (deployed, nunca executados em produção)
| Slug | Versão |
|---|---|
| `agent-funil` | v16 |
| `agent-metricas` | v17 |
| `agent-relatorios` | v16 |
| `agent-financeiro` | v15 |
| `agent-escalas` | v15 |
| `agent-conteudo` | v17 |
| `agent-proposta` | v16 |
| `agent-formacao` | v16 |
| `agent-missoes` | v16 |

### Cluster: Delivery e mensageria
| Slug | Versão | Observação |
|---|---|---|
| `channel-dispatcher` | v24 | ✅ Cron 1min. ZApi+N8n adapter. CRÍTICO. |
| `webhook-receiver` | v17 | ✅ Recebe webhooks inbound WhatsApp |
| `dispatch-person-event` | v21 | Dispara eventos de pessoa para n8n |
| `dispatch-message` | v18 | Dispatcher legado |
| `message-enqueue` | v12 | Enfileira mensagens |
| `message-dispatch` | v12 | Despacha mensagens (legado, coexiste com channel-dispatcher) |
| `zapi-send` | v11 | Sender Z-API dedicado |
| `chatpro-send` | v9 | Sender ChatPro dedicado |
| `test-whatsapp-message` | v18 | Tab Testes do cockpit |
| `conversation-router` | v12 | Roteamento de conversas |
| `conversation-handoff` | v12 | Handoff para humano |
| `conversation-send-message` | v12 | Envio dentro de conversa |
| `agent-outbound-retry` | v12 | Retry de envios falhos |

### Cluster: Stripe e comercial
| Slug | Versão |
|---|---|
| `stripe-checkout` | v20 |
| `stripe-checkout-public` | v16 |
| `stripe-webhook` | v28 |
| `stripe-bootstrap` | v16 |
| `plans-update` | v16 |
| `addon-prices-update` | v16 |
| `addon-request` | v12 |
| `coupons-stripe-sync` | v15 |
| `coupon-validate` | v15 |
| `credit-topup` | — |

### Cluster: Afiliados
| Slug | Versão |
|---|---|
| `affiliate-crud` | v16 |
| `affiliate-coupon-create` | v16 |
| `affiliate-coupon-toggle` | v16 |
| `affiliate-commissions-approve` | v16 |
| `affiliate-commissions-export-csv` | v16 |
| `affiliate-commissions-mark-paid` | v16 |

### Cluster: Cockpit admin
| Slug | Versão | Observação |
|---|---|---|
| `admin-church-create` | v20 | Cria igrejas (Cockpit) |
| `admin-church-detail` | v6 | Detalhe por igreja |
| `admin-churches-list` | v9 | Lista igrejas |
| `admin-church-pricing` | v16 | Pricing por igreja |
| `admin-cockpit-metrics` | v2 | Métricas dashboard |
| `admin-revenue-metrics` | v2 | Métricas de receita |
| `admin-notes-crud` | v9 | Notas sobre contas |
| `admin-events-list` | v9 | Log de admin_events |
| `admin-tasks-crud` | v9 | Tarefas internas |
| `admin-agent-grant` | v3 | Concede agente a igreja |
| `admin-update-contractor` | v2 | Atualiza contratante |
| `admin-update-pastoral-profile` | v2 | Atualiza perfil pastoral |
| `admin-set-ekthos-roles` | v1 | Define roles Ekthos |
| `admin-start-impersonation` | v1 | Inicia impersonação |
| `admin-end-impersonation` | v1 | Encerra impersonação |

### Cluster: Captação e onboarding
| Slug | Versão |
|---|---|
| `visitor-capture` | v20 |
| `lead-capture` | v15 |
| `church-public` | v13 |
| `contact-consultant` | v13 |
| `onboarding-consultant` | v25 |
| `onboarding-engineer` | v23 |

### Cluster: Canais / provisioning
| Slug | Versão |
|---|---|
| `provision-channel` | v10 |
| `provision-whatsapp-channel` | v7 |

### Cluster: n8n
| Slug | Versão | Observação |
|---|---|---|
| `n8n-notify` | v19 | Envia notificações via n8n |
| `n8n-workflow-setup` | v12 | Setup de workflows |
| `n8n-setup-credentials` | v6 | Setup de credenciais |
| `n8n-diagnostic` | v11 | Diagnóstico de integração |

### Cluster: Utilitários e setup
| Slug | Versão | Observação |
|---|---|---|
| `agents-catalog-update` | v17 | Atualiza catálogo |
| `notification-create` | v13 | Cria notificações |
| `setup-playwright-user` | v3 | Apenas para testes E2E |
| `set-test-pastor-password` | v5 | Apenas para testes E2E |
| `test-r23` | v2 | Teste pontual (pode ser removido) |

---

## BLOCO 3 — FUNÇÕES SQL (63 em public)

### Funções de auth e controle de acesso
| Função | Propósito |
|---|---|
| `auth_church_id()` | Lê church_id de app_metadata. CRÍTICA. |
| `auth_user_role()` | Retorna role do usuário |
| `auth_can_all_people()` | Checa permissão people |
| `auth_can_financial()` | Checa permissão financeiro |
| `is_ekthos_admin()` | Checa se é admin Ekthos |
| `_is_ekthos_admin()` | Versão interna (sem RLS) |
| `has_ekthos_role()` | Checa role Ekthos |
| `church_has_access()` | Checa acesso a feature |

### Funções de agentes IA
| Função | Propósito |
|---|---|
| `get_agent_prompt_resolved()` | Prompt resolvido com overrides |
| `get_church_agent_config()` | Config por igreja/agente |
| `get_church_agent_full_config()` | Full config (cockpit) |
| `upsert_church_agent_config()` | Salva config do agente |
| `upsert_church_agent_config_admin()` | Admin override de config |
| `upsert_church_followup_config_admin()` | Admin override follow-up |
| `reset_church_agent_config()` | Reset para defaults |
| `debit_agent_credits()` | Debita créditos de IA |
| `check_credit_thresholds()` | Verifica limites de crédito |
| `renew_agent_credit_cycles()` | Renova ciclos mensais |
| `pause_agents_at_zero()` | Pausa agentes sem crédito |
| `activate_agent()` | Ativa agente para igreja |
| `cancel_agent()` | Cancela agente |
| `pause_agent()` | Pausa agente |
| `start_agent_setup()` | Inicia setup de agente |
| `admin_grant_agent()` | Grant admin de agente |
| `admin_revoke_agent()` | Revoga grant |
| `admin_list_grantable_agents()` | Lista agentes grantáveis |
| `apply_credit_topup()` | Aplica top-up de crédito |

### Funções de Stripe e comercial
| Função | Propósito |
|---|---|
| `process_stripe_checkout_completed()` | Processa checkout Stripe |
| `process_subscription_updated()` | Processa update de sub |
| `process_subscription_deleted()` | Processa cancelamento |
| `process_invoice_payment_failed()` | Processa falha de pagamento |
| `queue_coupon_sync()` | Enfileira sync de cupom |
| `prevent_immutable_coupon_changes()` | Guard de cupom |

### Funções de CRM e pipeline
| Função | Propósito |
|---|---|
| `capture_visitor_to_pipeline()` | Captura visitante no pipeline |
| `create_default_pipeline_stages()` | Cria etapas padrão |
| `apply_discipleship_template()` | Aplica template de discipulado |
| `grant_access()` | Concede acesso a feature |
| `count_remaining_admins()` | Conta admins restantes |
| `trigger_n8n_pipeline()` | Trigger de pipeline para n8n |
| `get_church_onboarding_state()` | Estado de onboarding |
| `increment_qr_scanned_count()` | Incrementa scans de QR |

### Funções de canais e WhatsApp
| Função | Propósito |
|---|---|
| `upsert_church_channel()` | Upsert de canal |
| `upsert_church_whatsapp_channel()` | Upsert de canal WhatsApp |
| `list_church_channels()` | Lista canais |
| `list_church_whatsapp_channels()` | Lista canais WhatsApp |

### Funções de cadastro e perfil
| Função | Propósito |
|---|---|
| `upsert_church_cadastro_cristalino()` | Cadastro cristalino (Frente 3B) |
| `upsert_church_onboarding_pastoral()` | Onboarding pastoral |
| `upsert_session_token()` | Token de sessão |
| `validate_session_token()` | Valida token |

### Triggers (como funções)
| Função | Acionada por |
|---|---|
| `set_updated_at()` | UPDATE em múltiplas tabelas |
| `trigger_set_updated_at()` | Alias para set_updated_at |
| `set_updated_at_church_channels()` | church_channels UPDATE |
| `set_updated_at_church_whatsapp_channels()` | church_whatsapp_channels UPDATE |
| `update_agent_prompt_templates_updated_at()` | agent_prompt_templates UPDATE |
| `update_cell_reports_updated_at()` | cell_reports UPDATE |
| `update_leads_updated_at()` | leads UPDATE |
| `update_updated_at()` | Genérico |
| `trg_regenerate_event_occurrences()` | church_events I/U |
| `fn_distressed_alert()` | conversation_messages UPDATE |
| `sync_is_volunteer_flag()` | volunteers I/U/D |
| `record_audit_event()` | Múltiplas tabelas |

### Funções de gestão (cockpit)
| Função | Propósito |
|---|---|
| `list_pending_activations()` | Lista ativações pendentes |
| `generate_event_occurrences()` | Gera ocorrências de eventos |

---

## BLOCO 4 — pg_cron (7 jobs)

| jobid | jobname | Schedule | Status | Observação |
|---|---|---|---|---|
| 6 | `agent-cycle-renew` | `0 0 1 * *` | ✅ Ativo | Renova ciclos de crédito mensal |
| 7 | `agent-quota-check` | `0 * * * *` | ✅ Ativo | Checa limites de crédito por hora |
| 8 | `agent-auto-pause` | `*/5 * * * *` | ✅ Ativo | Pausa agentes sem crédito a cada 5min |
| 10 | `agent-reengajamento-scan` | `0 9 * * *` | ⚠️ STUB | `SELECT 1; /* Sprint 3 */` — nunca executado realmente |
| 13 | `agent-acolhimento-fu` | `*/30 * * * *` | ✅ Ativo | HTTP POST para agent-acolhimento com `trigger_type: cron` |
| 15 | `channel-dispatcher` | `*/1 * * * *` | ✅ Ativo | HTTP POST para channel-dispatcher a cada minuto |
| 16 | `expire-agent-grants` | `0 * * * *` | ✅ Ativo | Expira grants com `ends_at <= now()` |

**Diagnóstico:**
- 5 jobs operacionais e corretos
- 1 stub (`agent-reengajamento-scan`) — implementação pendente (Frente 5)
- Não existe pg_cron para `coupon-sync-worker` (TEST-DEBT-004)

---

## BLOCO 5 — CANAIS WHATSAPP (5 registros)

| id | church_id | phone | session_status | active | provider | instance_id | Diagnóstico |
|---|---|---|---|---|---|---|---|
| `e2397078` | `62e473b8` (Mock) | +5511900000001 | testing | ❌ false | Canal Mock | null | Mock/desativado |
| `4c98c87a` | `62e473b8` (Mock) | +5521993092146 | active | ❌ false | null | null | Órfão (active=false) |
| `4fea2161` | `62e473b8` (Mock) | +5521993092146 | active | ✅ true | Z-API Ekthos Church | `3F28840B...` | ✅ CANAL FUNCIONAL — 81 sent |
| `e938a04a` | `184fd750` (Church demo) | +5521993092146 | disconnected | ✅ true | null | `3F28840B...` | ⛔ Mesmo número, instância duplicada, disconnected |
| `13a7c7dc` | `62e473b8` (Mock) | +5521993092146 | active | ✅ true | null | null | ⚠️ Tipo n8n, sem instance_id — causa falhas "n8n 200: {}" |

**Diagnóstico crítico:**
- O mesmo número físico (+5521993092146) aparece em 4 de 5 canais
- A mesma instância Z-API (`3F28840B...`) está duplicada em `4fea2161` (ativo) e `e938a04a` (disconnected, outra igreja)
- Canal `13a7c7dc` (n8n, sem instance_id): 3 falhas "n8n 200: {}" por auth failure (`EKTHOS_N8N_OUTBOUND_SECRET` vazia)
- Canal `4fea2161` é o único operacional — gerou as 81 mensagens enviadas com sucesso

---

## BLOCO 6 — TRIGGERS (44 eventos em 30 tabelas)

### Triggers `updated_at` (BEFORE UPDATE) — 29 tabelas
Padrão uniforme: `BEFORE UPDATE → set_updated_at()`. Tabelas: access_grants, acolhimento_journey, agent_grants, agent_prompt_templates, cell_reports, church_channels, church_events, church_followup_config, church_pastoral_profile, church_settings, church_whatsapp_channels, churches, contractors, conversations, coupons, donations, financial_campaigns, leaders, leads, message_outbox, messaging_config, ministries, onboarding_sessions, onboarding_steps, pastoral_cabinet, people, person_pipeline, qr_codes, reengagement_journey, service_schedules, subscriptions, volunteers.

### Triggers com lógica de negócio (AFTER)
| Trigger | Tabela | Evento | Função | Propósito |
|---|---|---|---|---|
| `after_church_event_upsert` | `church_events` | I + U | `trg_regenerate_event_occurrences` | Regenera ocorrências de eventos |
| `trg_distressed_alert` | `conversation_messages` | UPDATE | `fn_distressed_alert` | Detecta mensagem em sofrimento |
| `trg_coupon_sync_queue` | `coupons` | I + U | `queue_coupon_sync` | Enfileira sync com Stripe |
| `trg_prevent_immutable_coupon_changes` | `coupons` | UPDATE (BEFORE) | `prevent_immutable_coupon_changes` | Bloqueia campos imutáveis |
| `trg_n8n_pipeline_insert` | `person_pipeline` | INSERT | `trigger_n8n_pipeline` | Notifica n8n de novo membro no pipeline |
| `trg_n8n_pipeline_update` | `person_pipeline` | UPDATE | `trigger_n8n_pipeline` | Notifica n8n de mudança de etapa |
| `trg_volunteer_sync` | `volunteers` | I + U + D | `sync_is_volunteer_flag` | Sincroniza flag `is_volunteer` em people |

**Observação sobre `trg_n8n_pipeline_*`:** Esses triggers chamam `trigger_n8n_pipeline()` que lê `n8n_webhooks`. O único registro em `n8n_webhooks` tem `people_url = 'https://httpbin.org/post'` — **dado zumbi**. Toda notificação de pipeline está sendo enviada para httpbin.org.

---

## BLOCO 7 — FILA DE ENTREGA (`channel_dispatch_queue`)

| Status | Total | Última criação |
|---|---|---|
| `sent` | 81 | 18/05/2026 14:41 |
| `failed` | 7 | 05/05/2026 01:35 |
| **Total** | **88** | — |

**Diagnóstico:**
- 81 mensagens enviadas com sucesso via canal `4fea2161` (Z-API)
- 7 falhas concentradas em 05/05/2026 (mesma data das primeiras tentativas com canal n8n)
- Canal `13a7c7dc` (n8n): 3 falhas confirmadas por "n8n 200: {}" (auth failure)
- Canal `e938a04a` (disconnected): 1 falha "Canal em estado inválido"
- Root cause das falhas: `ZAPI_CLIENT_TOKEN` e `EKTHOS_N8N_OUTBOUND_SECRET` ausentes/incorretos nas env vars do channel-dispatcher

---

## BLOCO 8 — EXECUÇÕES DE AGENTES (`agent_executions`)

| agent_slug | success | Total | Última run | Input tokens | Output tokens |
|---|---|---|---|---|---|
| `agent-agenda` | true | 2 | 27/04/2026 | 752 | 470 |
| `agent-onboarding` | true | 3 | 05/05/2026 | 1.425 | 939 |
| `agent-suporte` | true | 3 | 05/05/2026 | 1.728 | 804 |
| `agent-whatsapp` | true | 1 | 28/04/2026 | 402 | 327 |

**Diagnóstico crítico:**
- **`agent-acolhimento` NÃO aparece** em `agent_executions`
- **`agent-haiku-triagem` NÃO aparece** em `agent_executions`
- Isso confirma o problema de observabilidade da Frente 6.3: esses agentes não registram execuções na tabela
- Os 4 agentes com registros são agentes internos/legados que usam fluxo diferente
- `agent-acolhimento` está claramente executando (há 81 mensagens enviadas) mas não logueia em `agent_executions`

---

## BLOCO 9 — CATÁLOGO DE AGENTES (7 no catálogo)

| slug | name | pricing_tier | price_cents | active | categoria | modelo |
|---|---|---|---|---|---|---|
| `agent-acolhimento` | Agente Acolhimento Pastoral | always_paid | R$ 290,00 | ✅ | premium | sonnet |
| `agent-suporte` | Agente Suporte | free | R$ 0 | ✅ | interno | haiku |
| `agent-onboarding` | Agente Onboarding | free | R$ 0 | ✅ | interno | haiku |
| `agent-cadastro` | Agente Cadastro | free | R$ 0 | ✅ | interno | haiku |
| `agent-config` | Agente Config | free | R$ 0 | ❌ inativo | interno | haiku |
| `agent-reengajamento` | Agente Reengajamento Pastoral | always_paid | R$ 290,00 | ✅ | premium | sonnet |
| `agent-operacao` | Agente Operação Pastoral | always_paid | R$ 390,00 | ❌ inativo | premium | sonnet |

---

## BLOCO 10 — IGREJAS E SUBSCRIPTIONS

### Igrejas cadastradas (6)
| id | name | city | subscription_plan | status | is_active | created_at |
|---|---|---|---|---|---|---|
| `184fd750` | Church demo | Niterói - RJ | free | configured | ✅ | 27/04/2026 |
| `6743b72b` | Nossa Igreja | Barra da Tijuca - RJ | chamado | configured | ✅ | 27/04/2026 |
| `a07a054b` | Bola de Neve | Niterói | free | configured | ❌ | 27/04/2026 |
| `62e473b8` | Igreja de Teste — Mock | — | free | configured | ✅ | 01/05/2026 |
| `89c7d9de` | Meu Avivamento | Niteró | chamado | configured | ✅ | 05/05/2026 |
| `b8653e1e` | Igreja Teste Frente 3B (Playwright) | — | free | onboarding | ✅ | 07/05/2026 |

**Nota:** `subscription_plan` em `churches` está **deprecado** (armadilha #19 do CLAUDE.md). O dado de plano real está em `subscriptions`.

### Subscriptions reais (4 registros)
| church | plan_slug | status | stripe_subscription_id |
|---|---|---|---|
| Church demo | avivamento | trialing | null (sem Stripe) |
| Nossa Igreja | chamado | active | `sub_1TQve1...` ✅ |
| Bola de Neve | missao | canceled | null |
| Meu Avivamento | chamado | active | `sub_1TTo5x...` ✅ |

**Contas pagas reais:** 2 igrejas com Stripe ativo (Nossa Igreja + Meu Avivamento, ambas plano Chamado).

---

## BLOCO 11 — PLANOS COMERCIAIS (3 planos ativos)

| slug | name | price_cents | max_users | max_members | included_agents | max_agents |
|---|---|---|---|---|---|---|
| chamado | Chamado | R$ 689,90 | 5 | 500 | 0 | null |
| missao | Missão | R$ 1.639,90 | 8 | 1.000 | 0 | null |
| avivamento | Avivamento | R$ 2.469,90 | 10 | 10.000 | 0 | null |

**Observação:** `included_agents = 0` e `max_agents = null` em todos os planos. Agentes são 100% add-on, nunca inclusos no plano base.

---

## BLOCO 12 — AGENT GRANTS ATIVOS (2)

| agent_slug | church | grant_type | starts_at | ends_at |
|---|---|---|---|---|
| `agent-acolhimento` | Igreja de Teste — Mock | courtesy | 06/05/2026 | null (sem expiração) |
| `agent-cadastro` | Igreja de Teste — Mock | courtesy | 05/05/2026 | null (sem expiração) |

**Diagnóstico:** Apenas a Igreja de Teste tem agentes concedidos. Igrejas reais pagas (Nossa Igreja, Meu Avivamento) não têm nenhum agente ativo — nenhuma EF de agente operando em produção real.

---

## BLOCO 13 — n8n_WEBHOOKS (1 registro, zumbi)

| id | church_id | pipeline_url | people_url | acolhimento_url | is_active |
|---|---|---|---|---|---|
| `ad6fdf61` | `184fd750` (Church demo) | null | `https://httpbin.org/post` | null | true |

**Diagnóstico crítico:**
- 1 único registro
- `people_url = 'https://httpbin.org/post'` — endpoint de debug. Toda chamada de `trigger_n8n_pipeline()` via triggers de `person_pipeline` vai para httpbin.org
- `acolhimento_url = null` — o n8n outbound para acolhimento usa `channel_dispatch_queue` + `N8N_OUTBOUND_WEBHOOK_URL` env var, não essa tabela
- Ação pendente: `UPDATE n8n_webhooks SET people_url = NULL WHERE people_url = 'https://httpbin.org/post'` + guard no `dispatch-person-event`

---

## BLOCO 14 — RLS (Políticas por tabela — top 20)

| Tabela | Políticas |
|---|---|
| `cell_reports` | 5 |
| `contractors` | 4 |
| `agents_catalog` | 4 |
| `people` | 4 |
| `church_pastoral_profile` | 4 |
| `person_pipeline` | 4 |
| `churches` | 4 |
| `onboarding_sessions` | 3 |
| `church_followup_config` | 3 |
| `notifications` | 3 |
| `church_agent_config` | 3 |
| `messaging_config` | 3 |
| `financial_campaigns` | 3 |
| `health_scores` | 3 |
| `church_whatsapp_channels` | 3 |
| `acolhimento_journey` | 3 |
| `donations` | 3 |
| `message_outbox` | 3 |
| `admin_events` | 3 |
| `pipeline_history` | 3 |

---

## BLOCO 15 — MIGRATIONS

| Dimensão | Valor |
|---|---|
| Total de migrations | **145** |
| Mais antiga | `00001` |
| Mais recente | `20260508213352` (08/05/2026) |

**Timeline estimada:** Projeto iniciado com migrations sequenciais simples, migrou para timestamp-based por volta de Frente 2. Ritmo: ~10-15 migrations por frente implementada.

---

## ACHADOS CRÍTICOS — CONSOLIDADO

### 🔴 BLOQUEADORES (afetam operação em produção)
1. **`ZAPI_CLIENT_TOKEN` vazia** — canal `4fea2161` (único funcional) começou a falhar em 02/05; recuperado manualmente, mas env var continua sem set formal
2. **`EKTHOS_N8N_OUTBOUND_SECRET` ausente** — canal `13a7c7dc` (n8n) retorna "200: {}" sempre; nenhuma mensagem via n8n foi entregue alguma vez
3. **`agent-reengajamento` cron STUB** — pg_cron job ativo, mas executa `SELECT 1`; zero reengajamento autônomo operando

### 🟡 PROBLEMAS (afetam qualidade mas não bloqueiam)
4. **n8n_webhooks zumbi** — `people_url = 'https://httpbin.org/post'`; todo evento de pipeline vai para httpbin.org silenciosamente
5. **Canal `e938a04a` duplicado+disconnected** — mesma instância Z-API de `4fea2161` mas em outra igreja; gera erros de entrega periódicos
6. **Canal `4c98c87a` órfão** — mesmo número, `active=false`; pode causar confusão em queries
7. **`agent-acolhimento` sem observabilidade** — não registra em `agent_executions`; impossível auditar execuções, tokens, erros
8. **`agent-haiku-triagem` sem observabilidade** — idem

### 🔵 DÍVIDA TÉCNICA (não urgente)
9. **75 EFs deployed, ~15+ nunca executadas** — "agentes vitrine" ocupam espaço e geram ruído operacional
10. **`churches.subscription_plan` deprecado** — campo ainda existe, mas tem valor `'free'` para todas as igrejas (dado fantasma)
11. **`test-r23` em produção** — EF de teste pontual nunca removida
12. **Nenhum agente ativo em igrejas pagas** — 2 clientes reais (Chamado), zero agentes operando para eles

---

*Auditoria gerada automaticamente via queries SQL e Supabase MCP. Dados lidos diretamente do banco de produção `mlqjywqnchilvgkbvicd`. Nenhuma escrita realizada.*
