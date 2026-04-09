# Pipeline: Caminho de Discipulado

> Define as 11 etapas do pipeline pastoral — a jornada do visitante até se tornar
> líder de célula. É a coluna vertebral do CRM de igrejas.
> Referência para: tabela `pipeline_stages`, `Pipeline.tsx`, automações de SLA.

---

## Visão geral do fluxo

```
Visitante
    ↓ [SLA: 24h para primeiro contato]
Contato de boas-vindas
    ↓ [SLA: 72h para convite]
Convidado para célula
    ↓ [mínimo 4 encontros]
Frequentando célula
    ↓ [inscrição aberta na turma]
Escola da Fé (3 meses)
    ↓ [conclusão do programa]
Formado Escola da Fé
    ↓ [agendamento do batismo]
Batismo
    ↓
Membro ativo
    ↓ [conforme dons e talentos identificados]
Servindo em departamento
    ↓ [período de treinamento com líder]
Líder em treinamento
    ↓ [aprovação pela liderança]
Líder de célula
```

---

## Tabela completa das 11 etapas

| # | Stage | Tipo | SLA | Responsável | Automação associada |
|---|-------|------|-----|-------------|---------------------|
| 1 | Visitante | `entry` | — | Consolidador designado | Boas-vindas WhatsApp 2h + alerta consolidador |
| 2 | Contato de boas-vindas | `automated` | **24h** | Consolidador | SLA: escala para supervisor se não agir |
| 3 | Convidado para célula | `manual` | 72h | Consolidador | Envia info da célula mais próxima |
| 4 | Frequentando célula | `manual` | — | Líder de célula | Alerta de ausência após 14 dias |
| 5 | Escola da Fé | `manual` | — | Coordenação Escola da Fé | Convite automático após 4 encontros na célula |
| 6 | Formado Escola da Fé | `manual` | — | Pastor / admin | Convite para batismo 48h após formatura |
| 7 | Batismo | `manual` | — | Pastor | — |
| 8 | Membro ativo | `manual` | — | Admin / pastor | Alerta admin com dons do membro para direcionamento |
| 9 | Servindo em departamento | `manual` | — | Líder do departamento | — |
| 10 | Líder em treinamento | `manual` | — | Supervisor | — |
| 11 | Líder de célula | `manual` | — | Pastor de células | — |

---

## Regras de SLA

### Stage 2 — Contato de boas-vindas (SLA: 24h)

```
Visitante registrado
    → [0h] Alerta push + WhatsApp para o consolidador
    → [24h sem ação] Escala para supervisor da área
    → [24h sem ação do supervisor] Escala para pastor de células
```

### Stage 4 — Frequentando célula (inatividade)

```
Membro não registra presença por 14 dias
    → Alerta para líder de célula
    → Alerta paralelo para supervisor da área
Membro não registra presença por 30 dias (status >= Membro ativo)
    → Alerta direto para o pastor (admin)
```

### Stage 8 — Matrícula Escola da Fé

```
Quando turma abrir:
    → Convidar automaticamente quem está em "Frequentando célula" há 4+ encontros
    → Turmas: fevereiro, junho, setembro
```

---

## Motivos de perda (loss reasons)

Quando um membro sai do caminho de discipulado, o motivo deve ser registrado:

| # | Motivo | Quando ocorre tipicamente |
|---|--------|--------------------------|
| 1 | Não atendeu após visita (consolidação falhou) | Entre Visitante e Contato |
| 2 | Não se adaptou à célula | Entre Convidado e Frequentando |
| 3 | Desistiu da Escola da Fé | No stage Escola da Fé |
| 4 | Mudou de cidade | Qualquer stage |
| 5 | Mudou de igreja | Qualquer stage |
| 6 | Problemas pessoais/familiares | Qualquer stage |
| 7 | Não informou motivo (sumiu) | Qualquer stage |

> **Implementação:** campo `loss_reason` na tabela de movimentação do pipeline,
> obrigatório quando o membro é movido para status inativo/perdido.

---

## Notas de implementação

- `pipeline_stages` já existe no banco (`00005_seed_default_stages.sql`) — verificar se os nomes batem com este spec antes de exibir em `Pipeline.tsx`
- SLA de 24h deve ser controlado por job agendado (Edge Function com cron), não no frontend
- "Frequentando célula" é o stage crítico: é onde a maioria das igrejas perde membros
- O campo `min_stage` em automações de inatividade evita alertar sobre visitantes que sumiram antes de chegar à célula
- Dashboard deve destacar "Visitantes sem consolidação > 24h" como alerta crítico (vermelho)
