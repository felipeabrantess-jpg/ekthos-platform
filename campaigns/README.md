# Campanhas — Ekthos Platform

## Visão Geral

Esta pasta documenta como criar, estruturar e executar campanhas de marketing e comunicação no Ekthos Platform. As campanhas são gerenciadas pela skill `marketing-core` e executadas via workflows no n8n.

---

## O que é uma Campanha no Ekthos

Uma campanha é uma iniciativa de comunicação planejada, direcionada a um segmento específico de pessoas, com objetivo definido, conteúdo personalizado por canal e métricas de acompanhamento.

**Diferente de uma mensagem avulsa**, uma campanha tem:
- Público-alvo segmentado (por tags, status, GC, período de cadastro, etc.)
- Conteúdo adaptado por canal (WhatsApp, Instagram, e-mail)
- Agendamento ou calendário de envios
- Métricas de desempenho rastreadas

---

## Tipos de Campanha

### 1. Anúncio de Evento
**Objetivo**: Comunicar um evento e gerar confirmações de presença
**Canais típicos**: WhatsApp (alta abertura) + Instagram (alcance)
**Sequência recomendada**:
- D-14: Post no Instagram anunciando
- D-7: WhatsApp para membros ativos
- D-3: Lembrete no Instagram (Stories)
- D-1: WhatsApp para quem confirmou
- D0: Mensagem de "hoje é o dia!"

### 2. Campanha Sazonal (Natal, Páscoa, Dia das Mães)
**Objetivo**: Aproveitar datas especiais para alcançar novos e reconectar afastados
**Canais típicos**: Instagram (alcance orgânico) + WhatsApp (membros)
**Segmentação recomendada**: Todos os membros + leads dos últimos 3 meses

### 3. Follow-up de Visitantes
**Objetivo**: Reconectar visitantes que não retornaram
**Canal**: WhatsApp (pessoal e direto)
**Sequência**:
- D+1: Mensagem de "foi muito bom te conhecer"
- D+7: Convite para próximo culto ou evento
- D+30: Convite para grupo (GC, células)
**Regra**: Tom deve ser acolhedor, nunca cobrante

### 4. Campanha de Arrecadação
**Objetivo**: Mobilizar membros para projeto específico (obra, missões, ação social)
**Canais**: WhatsApp + Instagram + Culto (não automático)
**Cuidado**: Comunicação sobre dinheiro requer aprovação pastoral antes de disparar

### 5. Série de Boas-Vindas (Welcome Series)
**Objetivo**: Integrar novo membro à comunidade de forma progressiva
**Canal**: WhatsApp (série de 4–6 mensagens ao longo de 30 dias)
**Automação**: Completamente automática via workflow n8n

### 6. Devocional Recorrente
**Objetivo**: Nutrição espiritual e engajamento constante
**Canal**: WhatsApp (opt-in explícito)
**Frequência**: Diário ou semanal, conforme configurado pelo tenant

---

## Estrutura de uma Campanha no Banco

```sql
-- Exemplo de inserção de campanha
INSERT INTO campaigns (
  church_id,
  name,
  type,
  description,
  channels,
  status,
  audience_filters,
  content,
  scheduled_for
)
VALUES (
  '{church_uuid}',
  'Culto Especial Dia das Mães 2026',
  'seasonal',
  'Campanha para o culto especial do Dia das Mães, convidando membros e seus familiares',
  ARRAY['whatsapp', 'instagram'],
  'draft',
  '{"status": ["member", "frequenter"], "tags": []}'::JSONB,
  '{
    "whatsapp": "Mamãe, você é especial! 💐 Te esperamos no culto especial do Dia das Mães...",
    "instagram_caption": "Mãe: a palavra mais bonita do mundo. 💕\n\nCulto especial...",
    "instagram_stories": "CULTO ESPECIAL DAS MÃES\n📅 10 de maio\n⏰ 10h"
  }'::JSONB,
  '2026-05-09T09:00:00+03:00'
);
```

---

## Como Criar uma Campanha (Fluxo no Sistema)

### Via Claude Code / Skill marketing-core
```
Descreva o que você quer fazer:
"Quero criar uma campanha para o Dia das Mães, dia 10 de maio.
 Quero convidar todos os membros ativos e frequentadores para o culto especial.
 Enviar pelo WhatsApp na sexta e postar no Instagram na quinta."
```

A skill `marketing-core` irá:
1. Classificar o tipo de campanha
2. Propor a segmentação de público
3. Gerar copy para cada canal
4. Sugerir o calendário de envio
5. Criar o workflow no n8n
6. Aguardar aprovação do admin antes de ativar

### Via Interface Admin (futuro)
Painel Ekthos → Marketing → Nova Campanha → Wizard guiado

---

## Segmentação de Público

A segmentação usa os campos da tabela `people` como filtros:

```typescript
interface AudienceFilters {
  status?: ('lead' | 'visitor' | 'attendee' | 'member_candidate' | 'member')[];
  tags?: string[];            // Ex: ['gc_ativo', 'diezmista']
  excludeTags?: string[];     // Ex: ['marketing_opt_out']
  registeredAfter?: Date;     // Pessoas cadastradas após esta data
  registeredBefore?: Date;
  lastContactDays?: number;   // Último contato nos últimos N dias
  noContactDays?: number;     // Sem contato nos últimos N dias
  hasPhone?: boolean;         // Para campanhas WhatsApp
  hasEmail?: boolean;         // Para campanhas e-mail
  city?: string[];
  assignedTo?: string[];      // UUID do líder responsável
}

// Exemplo de segmentação: visitantes dos últimos 30 dias sem GC
const filters: AudienceFilters = {
  status: ['visitor', 'attendee'],
  registeredAfter: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  excludeTags: ['gc_ativo', 'marketing_opt_out'],
  hasPhone: true,
};
```

---

## Métricas e Análise

Após a execução de uma campanha, o sistema coleta:

| Métrica | Como é Medida |
|---------|---------------|
| Alcance | Total de pessoas no público (audience_size) |
| Enviadas | Mensagens efetivamente enviadas (sent_count) |
| Entregues | Confirmação de entrega (delivered_count) |
| Respostas | Respostas registradas em interactions (response_count) |
| Taxa de Resposta | response_count / sent_count |
| Conversões | Ações realizadas após a campanha (visita ao culto, doação, inscrição) |

---

## Boas Práticas de Campanhas

### O que funciona
- **Personalização**: Use o nome da pessoa quando possível
- **Timing**: Quinta e sexta à noite têm as maiores taxas de abertura no WhatsApp
- **Tom autêntico**: Escreva como a igreja fala, não como "marketing"
- **CTA claro**: Uma ação por mensagem, no máximo
- **Imagens**: Posts do Instagram com pessoa real têm mais alcance que artes genéricas

### O que evitar
- **Excesso de mensagens**: Máximo de 1–2 por semana para o mesmo segmento
- **Tom de cobrança**: Nunca sobre dízimo ou ausências
- **Assunto sensacional**: "URGENTE", "ÚLTIMA CHANCE" — causa rejeição no contexto ministerial
- **Copy genérico**: Mensagens que poderiam ser de qualquer igreja perdem impacto
- **Ignorar opt-out**: `marketing_opt_out = true` é lei (LGPD) — respeitar sempre

### Limites por Plano

| Plano | Mensagens/mês | Máx. Público por Campanha |
|-------|---------------|--------------------------|
| Starter | 1.000 | 200 |
| Growth | 10.000 | 1.000 |
| Enterprise | Ilimitado | Ilimitado |
