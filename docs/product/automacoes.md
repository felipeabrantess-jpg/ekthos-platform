# Automações — Vertical Igrejas

> 17 automações classificadas por prioridade, com trigger, ação, responsável e
> template de mensagem associado.
> Referência para: Edge Functions de cron, sistema de alertas, tabela `automations`.
> **Nenhuma dessas automações existe no produto atual — é roadmap.**

---

## Visão geral por prioridade

| Prioridade | Qtd | Descrição |
|-----------|-----|-----------|
| CRÍTICA | 4 | Ação imediata — falha causa perda direta de membro |
| ALTA | 7 | Importante — falha causa degradação da operação pastoral |
| MÉDIA | 6 | Qualidade de vida — comunicação e relatórios |

---

## Prioridade CRÍTICA

### 1. Boas-vindas ao visitante
| Campo | Valor |
|-------|-------|
| Trigger | `stage_enter` → `"Visitante"` |
| Ação | `send_whatsapp` |
| Delay | 2 horas após registro |
| Template | `boas_vindas_visitante` |
| Responsável | Sistema |
| Nota | Primeiro contato automatizado — humaniza a chegada antes do consolidador |

### 2. Alerta ao consolidador
| Campo | Valor |
|-------|-------|
| Trigger | `stage_enter` → `"Visitante"` |
| Ação | `notify_users` (role: consolidador) |
| Canal | Push + WhatsApp |
| Template | `novo_visitante_consolidar` |
| Responsável | Sistema → Consolidador |
| Nota | Imediato — consolidador tem 24h para agir |

### 3. SLA de consolidação (24h)
| Campo | Valor |
|-------|-------|
| Trigger | `sla_breach` → stage `"Contato de boas-vindas"`, SLA: 24h |
| Ação | `escalate` |
| Escalada | Consolidador → Supervisor → Pastor de células |
| Template | `consolidacao_atrasada` |
| Responsável | Sistema |
| Nota | Mais crítico do sistema — 70% da perda acontece aqui |

### 4. Membro ausente 30 dias → pastor
| Campo | Valor |
|-------|-------|
| Trigger | `days_inactive` → 30 dias, `min_stage: "Membro ativo"` |
| Ação | `notify_users` (role: pastor_geral) |
| Canal | WhatsApp |
| Template | `membro_ausente_30dias_pastor` |
| Responsável | Sistema → Pastor |
| Nota | Aplica apenas a membros ativos — não dispara para visitantes sumidos |

---

## Prioridade ALTA

### 5. Convite para célula
| Campo | Valor |
|-------|-------|
| Trigger | `stage_enter` → `"Convidado para célula"` |
| Ação | `send_whatsapp` |
| Template | `convite_celula_proxima` |
| Dados incluídos | Nome do líder, dia da semana, horário, bairro da célula |

### 6. Membro ausente 14 dias → líder de célula
| Campo | Valor |
|-------|-------|
| Trigger | `days_inactive` → 14 dias, stage >= `"Frequentando célula"` |
| Ação | `notify_users` (role: lider_celula da célula do membro) |
| Template | `membro_ausente_lider` |

### 7. Membro ausente 14 dias → supervisor
| Campo | Valor |
|-------|-------|
| Trigger | `days_inactive` → 14 dias |
| Ação | `notify_users` (role: supervisor da área) |
| Template | `membro_ausente_supervisor` |
| Nota | Paralela à #6 — líder e supervisor recebem ao mesmo tempo |

### 8. Célula sem reunião há 14 dias
| Campo | Valor |
|-------|-------|
| Trigger | `cell_no_report` → 14 dias sem registrar reunião |
| Ação | `notify_users` (role: supervisor) |
| Template | `celula_sem_reuniao` |

### 9. Convite para Escola da Fé
| Campo | Valor |
|-------|-------|
| Trigger | `school_enrollment_open` (turma aberta) |
| Filtro | Membros em `"Frequentando célula"` com `min_attendance: 4` encontros |
| Ação | `send_whatsapp` |
| Template | `convite_escola_fe` |
| Turmas | Fevereiro, junho, setembro |

### 10. Lembrete de batismo
| Campo | Valor |
|-------|-------|
| Trigger | `stage_enter` → `"Formado Escola da Fé"` |
| Delay | 48 horas |
| Ação | `send_whatsapp` |
| Template | `convite_batismo` |

### 11. Queda de frequência em departamento
| Campo | Valor |
|-------|-------|
| Trigger | `department_attendance_drop` → queda de 20% em 2 semanas |
| Ação | `notify_users` (role: pastor_departamentos) |
| Template | `queda_departamento` |

---

## Prioridade MÉDIA

### 12. Aniversário do membro
| Campo | Valor |
|-------|-------|
| Trigger | `date_anniversary` → campo `data_nascimento` |
| Ação | `send_whatsapp` |
| Template | `feliz_aniversario` |

### 13. Aniversário de conversão
| Campo | Valor |
|-------|-------|
| Trigger | `date_anniversary` → campo `data_conversao` |
| Ação | `send_whatsapp` |
| Template | `aniversario_conversao` |

### 14. Convite para evento por departamento
| Campo | Valor |
|-------|-------|
| Trigger | `event_upcoming` → 5 dias antes do evento |
| Segmentação | Por departamento |
| Ação | `send_whatsapp` segmentado |
| Template | `convite_evento` |

### 15. Direcionamento para departamento
| Campo | Valor |
|-------|-------|
| Trigger | `stage_enter` → `"Membro ativo"` |
| Ação | `notify_users` (role: admin) |
| Dados incluídos | Dons e talentos do membro |
| Template | `direcionar_departamento` |
| Nota | Ajuda o pastor a alocar o membro no departamento certo |

### 16. Resumo semanal pastoral
| Campo | Valor |
|-------|-------|
| Trigger | `schedule` → toda segunda-feira às 07:00 |
| Ação | `send_report` |
| Destinatário | `pastor_geral` |
| Canal | WhatsApp |
| Conteúdo | Visitantes, consolidação, células, batismos, dízimos, metas |

### 17. Relatório mensal para o conselho
| Campo | Valor |
|-------|-------|
| Trigger | `schedule` → primeira segunda do mês às 08:00 |
| Ação | `send_report` |
| Destinatário | `pastor_geral` |
| Canal | Email |
| Formato | PDF |
| Conteúdo | Comparativo trimestral, metas vs. realizado, gráficos |

---

## Templates de mensagem referenciados

| Slug | Automação | Canal |
|------|-----------|-------|
| `boas_vindas_visitante` | #1 | WhatsApp |
| `novo_visitante_consolidar` | #2 | WhatsApp + Push |
| `consolidacao_atrasada` | #3 | WhatsApp + Push |
| `membro_ausente_30dias_pastor` | #4 | WhatsApp |
| `convite_celula_proxima` | #5 | WhatsApp |
| `membro_ausente_lider` | #6 | WhatsApp |
| `membro_ausente_supervisor` | #7 | WhatsApp |
| `celula_sem_reuniao` | #8 | Push |
| `convite_escola_fe` | #9 | WhatsApp |
| `convite_batismo` | #10 | WhatsApp |
| `queda_departamento` | #11 | WhatsApp |
| `feliz_aniversario` | #12 | WhatsApp |
| `aniversario_conversao` | #13 | WhatsApp |
| `convite_evento` | #14 | WhatsApp |
| `direcionar_departamento` | #15 | WhatsApp (interno) |

> Os templates completos com variáveis estão em `docs/future-features/mensageria-whatsapp.md`

---

## Dependências de infraestrutura

| Automação | Depende de |
|-----------|-----------|
| #1–5, #9–15 | WhatsApp Business API (inexistente) |
| #16–17 | Report engine + cron job |
| #6–8 | Cron job + registro de presença em células |
| #3 | Sistema de SLA tracking por stage |
| #11 | Registro de frequência por departamento |

> **Prioridade de implementação sem WhatsApp:** começar por #16 (resumo semanal) e
> #8 (célula sem reunião) via notificação in-app antes de integrar WhatsApp API.
