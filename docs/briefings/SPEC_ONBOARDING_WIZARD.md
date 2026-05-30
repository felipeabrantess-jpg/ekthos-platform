# SPEC — Onboarding Wizard (SA-A4)

> **Sprint:** MEGA-ONDA SEGURANÇA AMPLA  
> **Data:** 2026-05-30  
> **Status:** Spec pronto — aguardando sprint de implementação  
> **Prioridade:** ALTO

---

## Objetivo

Garantir que 80% dos novos clientes cheguem ao first-value (agente respondendo uma mensagem real) em menos de 48 horas, sem precisar de intervenção do CS.

**Problema atual:** Novo usuário cria conta → abre o dashboard vazio → não sabe por onde começar → churn no onboarding.

---

## Fluxo do Wizard

O wizard é uma sequência de 5 passos obrigatórios na primeira abertura do app. Pode ser pausada e retomada. Progresso salvo em `onboarding_progress` (tabela a criar).

### Passo 1 — Perfil da Igreja

Campos:
- Nome da igreja (obrigatório)
- Endereço completo com CEP (obrigatório)
- Foto de perfil (opcional)
- Horários dos cultos (obrigatório, ao menos 1)
- Denominação (opcional, lista pré-definida + "outra")

**Salvar em:** `churches` (atualizar campos existentes)

**Skip:** não permitido

---

### Passo 2 — Conectar WhatsApp

Instrução passo-a-passo para escanear QR Code Z-API.

**Status de conclusão:** `integrations.whatsapp_connected = true`

**Se pular:** pode continuar o wizard, mas badge amarelo persiste até conectar.

**Ajuda inline:** vídeo 90s embutido no passo.

---

### Passo 3 — Importar ou cadastrar primeiros membros

Opção A: Upload de CSV (template fornecido)  
Opção B: Cadastrar 3 membros manualmente no formulário inline  
Opção C: Pular (mínimo: 0 membros — wizard continua, mas dashboard vazio)

**Meta:** pelo menos 1 pessoa cadastrada para o wizard considerar concluído.

---

### Passo 4 — Configurar Agente de Acolhimento

Mini-formulário inline:
- Janela de atendimento (início e fim)
- Tom de voz (3 opções com preview de mensagem)
- Nome do assistente

**Preview ao vivo:** caixa de chat simulada mostra como o agente responderia "Oi, boa tarde!"

**Salvar em:** `church_agent_config` para `agent_scope = 'acolhimento'`

---

### Passo 5 — Convidar primeiro líder (opcional)

Campo de email para convidar um líder ou administrador. Pode pular.

**Trigger:** envia invite via `church-invite-user` EF existente.

---

## Checklist pós-wizard

Após completar os 5 passos, o usuário vê uma tela de "Pronto para começar" com:

```
✅ Perfil da igreja configurado
✅ WhatsApp conectado (ou: ⚠️ WhatsApp pendente)
✅ Primeiros membros cadastrados (N pessoas)
✅ Agente de Acolhimento ativo
✅ Liderança convidada (ou: — Pular por agora)

[Ir para o Dashboard]
```

---

## Persistência do progresso

```sql
CREATE TABLE onboarding_progress (
  church_id       uuid PRIMARY KEY REFERENCES churches(id),
  step_completed  integer DEFAULT 0,  -- 0-5
  wizard_done     boolean DEFAULT false,
  skipped_steps   text[],  -- ex: ['whatsapp', 'invite']
  completed_at    timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
```

---

## Regras de exibição

- Wizard exibido **apenas na primeira sessão** após cadastro (ou se `wizard_done = false`)
- Pastor pode acessar novamente via **Configurações → Refazer onboarding**
- Dashboard mostra banner "Complete seu onboarding" enquanto `wizard_done = false`

---

## Componente React

**Path:** `web/src/components/onboarding/OnboardingWizard.tsx`

**Subcomponentes:**
- `OnboardingStep1Church.tsx`
- `OnboardingStep2WhatsApp.tsx`
- `OnboardingStep3Members.tsx`
- `OnboardingStep4Agent.tsx`
- `OnboardingStep5Invite.tsx`
- `OnboardingComplete.tsx`

**Estado:** Zustand store ou React Context para manter progresso entre steps.

---

## Critérios de aceite

- [ ] Wizard abre automaticamente na primeira sessão do admin
- [ ] Progresso é salvo — fechar e reabrir mantém o passo atual
- [ ] Passo 4 mostra preview da mensagem do agente em tempo real
- [ ] WhatsApp conectado no passo 2 ativa imediatamente o agente no passo 4
- [ ] Após completar, dashboard mostra dados (não está mais vazio)
- [ ] Banner "Complete seu onboarding" desaparece quando `wizard_done = true`
- [ ] CS pode ver status de onboarding no cockpit admin (`onboarding_progress`)
