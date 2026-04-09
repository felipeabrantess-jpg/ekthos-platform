# Regras de Estrutura do Projeto — Ekthos Platform

> Uma estrutura consistente reduz a fricção cognitiva. Todo desenvolvedor e todo agente deve saber exatamente onde cada coisa vive.

---

## 1. Cada Skill em Arquivo Separado

Skills são módulos de competência e devem ter isolamento claro.

### Estrutura de uma Skill

```
.claude/skills/
  nome-da-skill.md
```

Todo arquivo de skill deve conter as seções:
1. **Descrição** — O que essa skill faz
2. **Quando Usar** — Casos de uso e triggers de ativação
3. **Inputs** — O que ela recebe (com tipos)
4. **Outputs** — O que ela produz (com tipos)
5. **Regras** — Restrições e comportamentos obrigatórios
6. **Dependências** — Outras skills ou serviços que usa
7. **Exemplos** — Casos de uso concretos

### Exemplo de Estrutura de Arquivo de Skill

```markdown
# Skill: nome-da-skill

## Descrição
[Descrição clara do propósito desta skill]

## Quando Usar
- [Trigger 1]
- [Trigger 2]

## Inputs
| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| churchId | string | Sim | UUID do tenant |
| ... | ... | ... | ... |

## Outputs
| Campo | Tipo | Descrição |
|-------|------|-----------|
| success | boolean | Se a operação foi bem-sucedida |
| ... | ... | ... |

## Regras
1. [Regra obrigatória 1]
2. [Regra obrigatória 2]

## Dependências
- [Skill ou serviço dependente]

## Exemplos
[Exemplos de uso concretos]
```

---

## 2. Cada Agente Documentado Individualmente

```
.claude/agents/
  nome-do-agente.md
```

Todo arquivo de agente deve conter:
1. **Descrição** — Propósito e canal de atuação
2. **Escopo** — O que pode e o que não pode fazer
3. **Skills Utilizadas** — Lista das skills que o agente usa
4. **Fluxo de Decisão** — Diagrama ou descrição do processo
5. **Quando Escalar** — Critérios de escalada obrigatória
6. **Integração com o Banco** — Tabelas que lê e escreve
7. **Configurações do Tenant** — Campos de `church_settings` usados
8. **Exemplos de Interação** — Fluxos de conversa reais

---

## 3. Contextos de Tenant em `context/tenants/{slug}.md`

### Estrutura do Arquivo de Contexto de Tenant

```markdown
# Contexto: {Nome da Igreja}

## Identificação
- **church_id**: {uuid}
- **slug**: {slug}
- **Nome**: {nome completo}
- **Cidade/Estado**: {cidade} / {estado}
- **Fuso Horário**: America/Sao_Paulo

## Terminologia Própria
- **Grupos**: [células / GCs / casas / grupos de vida / etc.]
- **Membros**: [membros / irmãos / familiares / congregados]
- **Líder Principal**: [pastor / apóstolo / presbítero]
- **Reunião Semanal**: [culto / reunião / encontro / serviço]
- **Grupos de Jovens**: [jovens / JA / next / geração / etc.]

## Tom e Linguagem
- **Tom**: [formal / informal / carinhoso / jovem]
- **Uso de Emojis**: [sim / não / moderado]
- **Formatos de Saudação**: [...]
- **Evitar**: [palavras ou expressões que a igreja não usa]

## Canais Ativos
- [ ] WhatsApp Business
- [ ] Instagram
- [ ] E-mail
- [ ] Site próprio

## Módulos Habilitados
- [ ] Atendimento via DM
- [ ] Marketing e Campanhas
- [ ] Gestão de Doações
- [ ] Pipeline de Membros
- [ ] Onboarding de Visitantes

## Estrutura Organizacional
- **Ministérios Ativos**: [lista]
- **Grupos Ativos**: [número e tipos]
- **Departamentos**: [lista]

## Horários de Atendimento
- Seg-Sex: 09:00–18:00
- Sab: 09:00–13:00
- Dom: Não disponível (dia de culto)

## Contato para Escalada
- **WhatsApp**: {número}
- **E-mail**: {email}
- **Responsável**: {nome}

## Configurações Especiais
[Quaisquer configurações específicas desta igreja]
```

### Regras para Arquivos de Contexto de Tenant

```
NUNCA commitar dados reais de membros em arquivos de contexto
NUNCA incluir tokens, senhas ou secrets em arquivos .md
SEMPRE incluir church_id e slug para identificação correta
SEMPRE manter o arquivo atualizado quando as configurações mudarem
```

---

## 4. Migrations Numeradas Sequencialmente

```
supabase/migrations/
  00001_initial_schema.sql
  00002_rls_policies.sql
  00003_add_campaigns_table.sql
  00004_add_pipeline_stages.sql
  00005_add_audit_logs_indexes.sql
```

### Regras para Migrations

```
NUNCA alterar uma migration já executada em produção
SEMPRE criar uma nova migration para qualquer alteração no schema
SEMPRE incluir comentários explicativos nas migrations
SEMPRE testar a migration em ambiente local antes de produção
SEMPRE incluir a migration reversa (rollback) quando possível
Nomenclatura: {número}_{descrição_em_snake_case}.sql
```

### Template de Migration

```sql
-- Migration: 00003_add_campaigns_table.sql
-- Descrição: Adiciona tabela de campanhas de marketing por tenant
-- Criado em: 2026-04-07
-- Reversível: Sim (ver comentário ao final)

-- ============================================================
-- FORWARD MIGRATION
-- ============================================================

CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  -- ... colunas da tabela
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Habilitar RLS (OBRIGATÓRIO)
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- Comentário explicativo
COMMENT ON TABLE campaigns IS 'Campanhas de marketing por tenant. Isolamento via church_id + RLS.';

-- ============================================================
-- ROLLBACK (documentado como comentário)
-- Para reverter: DROP TABLE campaigns;
-- ============================================================
```

---

## 5. Nenhum Dado Hardcoded

### O que nunca pode ser hardcoded

```typescript
// ERRADO: IDs de produção no código
const SUPER_ADMIN_CHURCH_ID = '550e8400-e29b-41d4-a716-446655440000'; // JAMAIS

// ERRADO: Configurações de ambiente no código
const SUPABASE_URL = 'https://xxxxxx.supabase.co'; // JAMAIS

// ERRADO: Tokens de integração
const WHATSAPP_TOKEN = 'EAABwzLixnjYBO...'; // JAMAIS

// ERRADO: Terminologia específica de um tenant no código
const greeting = 'Bem-vindo à Igreja da Graça!'; // JAMAIS — vem do contexto do tenant

// CORRETO: Sempre via variável de ambiente ou configuração
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const greeting = context.terminology.greeting; // Vem do contexto do tenant
```

### Fontes de Configuração Aceitas

| Tipo de Dado | Fonte |
|--------------|-------|
| URLs e chaves de API da plataforma | Variáveis de ambiente |
| Tokens de integração de cada tenant | Supabase Vault |
| Terminologia e tom de cada tenant | `church_settings` + `context/tenants/{slug}.md` |
| Limites e quotas por tenant | Tabela `church_settings` |
| Feature flags | Tabela `church_settings.enabled_modules` |

---

## 6. Estrutura de Automações

```
automations/
  workflows/
    {tenant-slug}/
      {nome-do-workflow}.json    # Export do n8n
  triggers/
    {nome-do-trigger}.md         # Documentação do trigger
```

---

## 7. Estrutura de Integrações

```
integrations/
  whatsapp/
    setup-guide.md               # Guia de configuração
    webhook-handler.md           # Documentação do handler
  instagram/
    setup-guide.md
    permissions-required.md
  n8n/
    connection-guide.md
    available-nodes.md
  payment/
    stripe/
      setup-guide.md
    pagseguro/
      setup-guide.md
    mercadopago/
      setup-guide.md
```

---

## 8. Checklist de Conformidade de Estrutura

Ao adicionar qualquer novo componente ao sistema:

- [ ] Arquivo está na pasta correta conforme convenção
- [ ] Nomenclatura segue o padrão (kebab-case para arquivos, PascalCase para componentes)
- [ ] Skills têm todas as 7 seções obrigatórias
- [ ] Agentes têm todas as 8 seções obrigatórias
- [ ] Migrations são numeradas sequencialmente
- [ ] Nenhum dado hardcoded foi introduzido
- [ ] Contextos de tenant estão em `context/tenants/`
- [ ] Documentação foi atualizada se necessário
