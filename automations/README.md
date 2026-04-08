# Automações — Ekthos Platform

## Visão Geral

Esta pasta contém a documentação e os arquivos de definição de todos os workflows de automação do Ekthos Platform. As automações são executadas pelo **n8n** (self-hosted ou cloud) e integram os diferentes sistemas da plataforma.

---

## Estrutura de Pastas

```
automations/
├── README.md                     # Este arquivo
├── workflows/                    # Definições JSON exportadas do n8n
│   └── {slug-da-igreja}/         # Pasta por tenant
│       └── {nome-workflow}.json  # Export JSON do workflow
└── triggers/                     # Documentação de triggers e webhooks
    └── {nome-do-trigger}.md
```

---

## Convenções de Nomenclatura

### Workflows
- **Formato**: `{slug-igreja}_{tipo}_{versao}.json`
- **Exemplos**:
  - `igreja-graca_boas-vindas_v1.json`
  - `comunidade-vida-nova_aniversario_v2.json`
  - `ekthos-platform_relatorio-semanal_v1.json` (workflow global da plataforma)

### Tipos de Workflow Reconhecidos

| Tipo | Descrição |
|------|-----------|
| `boas-vindas` | Série de boas-vindas para novos membros |
| `aniversario` | Parabéns automático por data de nascimento |
| `follow-up-visitante` | Acompanhamento de visitantes (D+1, D+7, D+30) |
| `confirmacao-doacao` | Confirmação de pagamento recebido |
| `comprovante-doacao` | Geração e envio de comprovante PDF |
| `lembrete-evento` | Lembretes de evento (D-7, D-1, dia do evento) |
| `relatorio-semanal` | Relatório semanal para admins |
| `campanha-{nome}` | Campanha de marketing específica |
| `onboarding-membro` | Fluxo de onboarding de novo membro |

---

## Como Criar um Novo Workflow

### Passo 1 — Descrever em linguagem natural

Documente o que o workflow deve fazer antes de criá-lo:

```markdown
## Workflow: Boas-Vindas para Novos Membros — Igreja da Graça

**Objetivo**: Automatizar o primeiro contato com pessoas que se cadastram como membros

**Trigger**: Inserção na tabela `people` com status = 'member'

**Passos**:
1. Aguardar 1 hora após o cadastro
2. Enviar mensagem de boas-vindas personalizada via WhatsApp
3. Aguardar 3 dias
4. Enviar convite para entrar em um GC
5. Aguardar 7 dias
6. Verificar se entrou em algum GC — se não, enviar lembrete

**Condições**:
- Apenas se `marketing_opt_out = false`
- Apenas em dias úteis (seg-sex)
- Apenas no horário de 8h às 20h
```

### Passo 2 — Usar a skill `n8n-orchestration`

No Claude Code:
```
/fix-issue "Criar workflow de boas-vindas para Igreja da Graça"
```

Ou diretamente usando a skill:
```
Skill n8n-orchestration:
  action: create_workflow
  churchId: {uuid}
  workflowDescription: "..."
```

### Passo 3 — Configurar no n8n

1. O sistema gera o JSON do workflow via API do n8n
2. Acesse o painel do n8n para revisar e ativar
3. Confirme que as credenciais estão corretas (tokens via Vault)
4. Execute um teste com dados reais antes de ativar em produção

### Passo 4 — Exportar e versionar

Após validar o workflow:
```bash
# Exportar via API do n8n
curl -H "X-N8N-API-KEY: {key}" \
  "https://n8n.ekthos.com.br/api/v1/workflows/{id}/export" \
  -o automations/workflows/{slug}/{nome}_v1.json
```

---

## Boas Práticas

### Segurança
- **Nunca** armazene tokens diretamente no workflow — use a integração do n8n com variáveis de ambiente ou o mecanismo de credenciais do n8n
- Todo workflow que acessa o Supabase usa a `SUPABASE_SERVICE_ROLE_KEY` armazenada nas credenciais do n8n
- Workflows de envio em massa devem ter um nó de validação de `marketing_opt_out`

### Tratamento de Erros
- Todo workflow deve ter um nó de **Error Handler** conectado
- Em caso de erro, notificar o responsável pelo tenant via e-mail ou WhatsApp
- Nunca deixar uma automação falhar silenciosamente

### Performance
- Workflows de envio em massa devem usar batching (máx. 50 mensagens por batch)
- Respeitar rate limits das APIs: WhatsApp (250 msg/s), Instagram (200 chamadas/hora)
- Usar nós de "Wait" para não sobrecarregar as APIs externas

### Idempotência
- Workflows acionados por webhooks devem verificar se já processaram o mesmo evento
- Use a tabela `audit_logs` para registrar execuções e evitar processamento duplo

---

## Monitoramento

Todos os workflows ativos devem ser monitorados. Verificar regularmente:

1. **Status dos workflows** — Acesse n8n → Workflows → verificar status
2. **Taxa de erros** — n8n → Execuções → filtrar por "Falhou"
3. **Relatório semanal** — O workflow `ekthos-platform_relatorio-semanal_v1` envia automaticamente um resumo
4. **Alertas críticos** — Configurados para disparar quando taxa de erro > 5% em 1 hora

---

## Integrações Disponíveis nos Workflows

| Integração | Tipo de Nó n8n | Uso Típico |
|------------|----------------|-----------|
| Supabase | HTTP Request / Supabase Node | Ler/escrever dados |
| WhatsApp Business | HTTP Request | Enviar mensagens |
| Instagram Graph API | HTTP Request | Publicar, responder DMs |
| PagSeguro | HTTP Request | Consultar transações |
| Stripe | Stripe Node (nativo n8n) | Webhook de pagamentos |
| Mercado Pago | HTTP Request | Consultar/processar pagamentos |
| Gmail/SMTP | Email Node | Enviar e-mails |
| Google Sheets | Google Sheets Node | Relatórios exportados |
