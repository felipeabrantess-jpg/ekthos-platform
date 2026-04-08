# Skill: Marketing Core (Marketing Operacional)

## Descrição

Gerencia todas as operações de marketing digital da igreja: criação de campanhas, segmentação de público, geração de copy para diferentes canais, calendário de conteúdo e análise de performance. A skill conhece profundamente o contexto comunicacional de cada tenant e gera conteúdo que soa autêntico, não como marketing genérico.

O marketing de uma igreja não é como o marketing de uma empresa — ele precisa ser pastoral, acolhedor e alinhado com os valores da comunidade. Esta skill entende essa diferença.

---

## Quando Usar

- Usuário autenticado como `church_admin` ou `church_manager` solicita criação de campanha
- Necessidade de geração de copy para posts no Instagram ou mensagens em massa no WhatsApp
- Agendamento de conteúdo recorrente (série de mensagens, campanhas sazonais)
- Solicitação de relatório de performance de campanhas anteriores
- Segmentação de público para envio direcionado

---

## Inputs

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `churchId` | `string` | Sim | UUID do tenant |
| `action` | `MarketingAction` | Sim | Tipo de ação: `create_campaign`, `generate_copy`, `segment_audience`, `schedule_content`, `analyze_performance` |
| `context` | `TenantContext` | Sim | Contexto do tenant |
| `requestedBy` | `string` | Sim | ID do usuário administrador |
| `campaignBrief` | `CampaignBrief \| null` | Depende | Brief da campanha (obrigatório para create_campaign) |
| `copyRequest` | `CopyRequest \| null` | Depende | Solicitação de copy (para generate_copy) |
| `audienceFilters` | `AudienceFilters \| null` | Depende | Filtros de segmentação (para segment_audience) |
| `dateRange` | `DateRange \| null` | Depende | Período para análise (para analyze_performance) |

---

## Outputs

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `action` | `string` | Ação executada |
| `campaignId` | `string \| null` | ID da campanha criada (se aplicável) |
| `generatedCopy` | `GeneratedCopy \| null` | Textos gerados para cada canal |
| `audienceSize` | `number \| null` | Tamanho do segmento de público |
| `audienceIds` | `string[] \| null` | IDs dos membros no segmento |
| `scheduledItems` | `ScheduledItem[] \| null` | Itens agendados no calendário |
| `performanceReport` | `PerformanceReport \| null` | Relatório de performance |
| `recommendations` | `string[]` | Recomendações estratégicas |

---

## Regras

1. **Apenas usuários autorizados** — Somente `church_admin` e `church_manager` podem usar esta skill. Nunca um membro comum ou agente de canal.
2. **Conteúdo alinhado ao tenant** — Todo copy gerado deve refletir o tom, linguagem e valores da igreja específica.
3. **Sem conteúdo genérico** — Textos "para qualquer igreja" são proibidos. Sempre personalizar.
4. **Aprovação antes de envio em massa** — Nenhuma campanha de envio em massa é disparada sem confirmação explícita do usuário.
5. **Segmentação sempre por church_id** — A audience nunca inclui pessoas de outros tenants.
6. **Respeito à frequência** — Verificar intervalo mínimo entre mensagens para o mesmo segmento (evitar spam).
7. **Opt-out respeitado** — Pessoas com `marketing_opt_out = true` são automaticamente excluídas de campanhas.
8. **Registro de campanha** — Toda campanha criada gera registro na tabela `campaigns`.

---

## Dependências

- Tabelas: `campaigns`, `people`, `interactions`, `church_settings`
- n8n para agendamento e execução de envios
- WhatsApp Business API para envios em massa
- Instagram Graph API para publicações
- `n8n-orchestration` skill para criação de workflows automáticos

---

## Tipos de Campanha Suportados

```typescript
type CampaignType =
  | 'announcement'          // Anúncio de evento ou novidade
  | 'seasonal'              // Campanha sazonal (Natal, Páscoa, Dia das Mães)
  | 'evangelism'            // Campanha evangelística (Conheça a Igreja)
  | 'fundraising'           // Arrecadação para projeto específico
  | 'follow_up'             // Follow-up de visitantes
  | 'welcome_series'        // Série de boas-vindas para novos membros
  | 'birthday_wish'         // Parabéns automático por aniversário
  | 'event_reminder'        // Lembretes de evento
  | 'weekly_devotional';    // Devocional semanal automatizado
```

---

## Exemplos

### Exemplo 1 — Criação de Campanha para o Dia das Mães

```
Input:
  action: 'create_campaign'
  context.churchName: 'Igreja da Graça'
  context.tone: 'carinhoso'
  campaignBrief: {
    type: 'seasonal',
    theme: 'Dia das Mães',
    targetDate: '2026-05-10',
    channels: ['whatsapp', 'instagram'],
    callToAction: 'Convidar para o culto especial'
  }

Output:
  campaignId: 'camp-uuid-xxx'
  generatedCopy: {
    whatsapp: "Mamãe, você é a maior bênção da nossa família! 💐 A Igreja da Graça preparou um culto muito especial para celebrar você neste Dia das Mães, dia 10/05 às 10h. Traga sua mãe e venha sentir o amor de Deus juntos. Te esperamos com muito carinho! 🙏",
    instagram_caption: "Mãe: a palavra mais bonita do mundo. 💕\n\nNeste Dia das Mães, queremos celebrar com você! Nosso culto especial acontece no dia 10/05 às 10h.\n\nVenha trazer sua mãe e seja abençoada!\n\n#DiaDasMães #IgrejaDaGraça #Família #Culto",
    instagram_stories: "💐 CULTO ESPECIAL DAS MÃES\n📅 10 de maio\n⏰ 10h\n📍 Igreja da Graça\n\nSwipe up para mais info!"
  }
  scheduledItems: [
    { channel: 'instagram', type: 'post', scheduledFor: '2026-05-07T10:00:00', content: '...' },
    { channel: 'whatsapp', type: 'broadcast', scheduledFor: '2026-05-09T09:00:00', content: '...' }
  ]
  recommendations: [
    "Enviar o WhatsApp na sexta à noite (2 dias antes) para maior alcance",
    "Publicar stories no Instagram nos 3 dias anteriores",
    "Considerar criar uma lista segmentada apenas para mulheres/mães"
  ]
```

### Exemplo 2 — Segmentação de Público

```
Input:
  action: 'segment_audience'
  audienceFilters: {
    tags: ['visitante'],
    lastInteractionDays: 30,
    hasCompletedRegistration: false
  }

Output:
  audienceSize: 47
  audienceIds: ['uuid1', 'uuid2', ...] // 47 IDs
  recommendations: [
    "47 visitantes dos últimos 30 dias que ainda não completaram o cadastro",
    "Boa oportunidade para enviar série de boas-vindas (welcome_series)",
    "Taxa de conversão esperada para membros: ~30% com follow-up em 3 etapas"
  ]
```

### Exemplo 3 — Relatório de Performance

```
Input:
  action: 'analyze_performance'
  dateRange: { start: '2026-03-01', end: '2026-03-31' }

Output:
  performanceReport: {
    period: 'Março 2026',
    campaignsSent: 4,
    totalReach: 1250,
    responseRate: 0.23,
    escalatedToHuman: 18,
    newLeadsGenerated: 34,
    topIntent: 'service_hours',
    bestPerformingDay: 'Quinta-feira',
    bestPerformingTime: '19:00-21:00'
  }
  recommendations: [
    "Quinta-feira às 19h é o melhor horário para envios",
    "34 novos leads gerados — considerar campanha de follow-up",
    "Taxa de resposta de 23% é acima da média do setor (15%)"
  ]
```
