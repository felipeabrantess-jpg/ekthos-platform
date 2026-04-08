# Skill: Church Onboarding (Onboarding Inteligente de Igrejas)

## Descrição

Conduz o processo completo de cadastro e configuração de uma nova igreja (tenant) no Ekthos Platform. A skill realiza uma entrevista estratégica guiada para mapear toda a identidade, terminologia, tom de comunicação e necessidades operacionais da igreja. Ao final, gera automaticamente todos os artefatos necessários para que o tenant esteja operacional.

Esta skill não é apenas um formulário — é uma conversa inteligente que adapta as perguntas com base nas respostas anteriores, detecta padrões comuns de igrejas brasileiras e configura o sistema de forma personalizada.

---

## Quando Usar

- Ativada pelo comando `/onboard-church`
- Quando o `demand-router` recebe uma solicitação de nova parceria
- Quando o `church-onboarding-agent` é invocado diretamente
- Durante demos e apresentações do produto para novos clientes

---

## Inputs

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `sessionId` | `string` | Sim | ID da sessão de onboarding (persistente) |
| `step` | `number` | Sim | Etapa atual do fluxo (1-8) |
| `previousAnswers` | `OnboardingAnswers` | Não | Respostas coletadas nas etapas anteriores |
| `rawInput` | `string` | Não | Resposta bruta do usuário na etapa atual |
| `operatorId` | `string` | Sim | ID do operador Ekthos conduzindo o onboarding |

---

## Outputs

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `nextQuestion` | `string \| null` | Próxima pergunta a fazer (null = concluído) |
| `currentStep` | `number` | Etapa atual após processamento |
| `totalSteps` | `number` | Total de etapas (pode variar por módulos) |
| `extractedData` | `Partial<ChurchProfile>` | Dados extraídos da resposta atual |
| `suggestions` | `string[]` | Sugestões baseadas no padrão detectado |
| `isComplete` | `boolean` | Se toda a coleta foi concluída |
| `generatedArtifacts` | `GeneratedArtifacts \| null` | Artefatos gerados (apenas quando isComplete) |

---

## Regras

1. **Uma pergunta por vez** — Nunca faz múltiplas perguntas numa única mensagem.
2. **Adaptação por contexto** — Se a igreja menciona "células", a skill assume modelo de pequenos grupos e adapta perguntas futuras.
3. **Nenhuma suposição sem confirmação** — Mesmo que o padrão seja óbvio, confirmar antes de aplicar.
4. **Persistência de sessão** — Se o onboarding for interrompido, pode ser retomado do ponto onde parou.
5. **Detecção de denominação** — Tenta identificar a denominação para usar terminologia adequada nas sugestões.
6. **Sem acesso a dados de outros tenants** — Pode usar padrões gerais aprendidos, nunca dados específicos de outras igrejas.
7. **Validação de slug** — O slug gerado deve ser único, em lowercase, sem acentos e sem espaços.
8. **Confirmação obrigatória** — O usuário deve confirmar explicitamente antes de criar qualquer registro no banco.

---

## Dependências

- Supabase (tabelas: `churches`, `church_settings`, `integrations`, `profiles`)
- Sistema de arquivos para geração de `context/tenants/{slug}.md`
- Edge Function `onboard-church` para operações privilegiadas
- n8n para disparo de workflow de boas-vindas ao time Ekthos

---

## Fluxo de Detecção de Terminologia

```typescript
interface ChurchTerminologyPattern {
  pattern: string[];
  type: 'baptist' | 'pentecostal' | 'presbyterian' | 'catholic' | 'generic';
  suggestedTerminology: Terminology;
}

const TERMINOLOGY_PATTERNS: ChurchTerminologyPattern[] = [
  {
    pattern: ['batista', 'primeira igr', 'convenção'],
    type: 'baptist',
    suggestedTerminology: {
      groups: 'grupos de estudo',
      members: 'membros',
      leader: 'pastor',
      meeting: 'culto',
    }
  },
  {
    pattern: ['células', 'célula', 'gc', 'casas', 'g12'],
    type: 'pentecostal',
    suggestedTerminology: {
      groups: 'células',
      members: 'membros',
      leader: 'pastor',
      meeting: 'culto',
    }
  },
  {
    pattern: ['presbiteriana', 'presbitério', 'sessão'],
    type: 'presbyterian',
    suggestedTerminology: {
      groups: 'círculos',
      members: 'membros',
      leader: 'pastor',
      meeting: 'culto',
    }
  },
];
```

---

## Exemplos

### Exemplo 1 — Início do Onboarding

```
Input:
  step: 1
  rawInput: (vazio — primeira mensagem)

Output:
  nextQuestion: "Olá! Seja muito bem-vindo ao Ekthos Platform. Vou te guiar pelo processo de configuração da sua igreja. Para começar: qual é o nome oficial da sua igreja?"
  currentStep: 1
  totalSteps: 8
  isComplete: false
```

### Exemplo 2 — Detecção de Padrão de Terminologia

```
Input:
  step: 4
  previousAnswers: { name: "Igreja da Graça", pastor: "João Silva" }
  rawInput: "Usamos células, e chamamos de GCs mesmo"

Output:
  nextQuestion: "Ótimo! Detectei que vocês usam GCs (grupos de conexão). Como vocês chamam os membros? Irmãos, familiares, membros, ou outro termo?"
  extractedData: {
    terminology: {
      groups: 'GCs',
      groupAlias: 'grupos de conexão'
    }
  }
  suggestions: [
    "Igrejas com GCs geralmente usam 'membros' ou 'familiares'",
    "O módulo de gestão de grupos já está pré-configurado para GCs"
  ]
  isComplete: false
```

### Exemplo 3 — Geração de Artefatos

```
Input:
  step: 8
  isConfirmed: true
  previousAnswers: { ... todas as respostas ... }

Output:
  isComplete: true
  generatedArtifacts: {
    churchId: 'uuid-gerado',
    slug: 'igreja-da-graca',
    contextFilePath: 'context/tenants/igreja-da-graca.md',
    settingsCreated: true,
    adminInviteEmailSent: true,
    n8nWorkflowTriggered: true
  }
  nextQuestion: null
```
