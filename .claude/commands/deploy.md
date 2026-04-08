# Command: /deploy

## Descrição

Executa o checklist completo de deploy para o Supabase, validando migrations, Edge Functions e variáveis de ambiente antes de qualquer execução. O deploy nunca acontece sem a conclusão bem-sucedida de todas as validações.

---

## Como Usar

```
/deploy                            # Deploy completo (migrations + functions + validação)
/deploy --only=migrations          # Apenas migrations
/deploy --only=functions           # Apenas Edge Functions
/deploy --only=functions --name=whatsapp-webhook  # Função específica
/deploy --dry-run                  # Simula o deploy sem executar
/deploy --env=staging              # Deploy para ambiente de staging
```

---

## Checklist Completo de Deploy

### Fase 1 — Validação de Ambiente (OBRIGATÓRIA)

```bash
# 1.1 Verificar versão do Supabase CLI
supabase --version
# Esperado: >= 1.150.0

# 1.2 Verificar login no Supabase
supabase projects list
# Deve listar os projetos sem erro

# 1.3 Verificar projeto linkado
supabase status
# Deve mostrar o projeto correto
```

### Fase 2 — Validação de Variáveis de Ambiente

Verificar obrigatoriamente a presença de:

```bash
# Supabase
SUPABASE_URL          # URL do projeto
SUPABASE_ANON_KEY     # Chave pública
SUPABASE_SERVICE_ROLE_KEY  # Chave de serviço (nunca exposta)

# Comunicação
WHATSAPP_BUSINESS_TOKEN   # Token do WhatsApp Business API
WHATSAPP_APP_SECRET       # Secret para validar webhooks
INSTAGRAM_ACCESS_TOKEN    # Token da Instagram Graph API
INSTAGRAM_APP_SECRET      # Secret para validar webhooks Instagram

# CORS
ALLOWED_ORIGIN            # Domínio principal permitido

# n8n
N8N_WEBHOOK_URL           # URL base do n8n
N8N_API_KEY               # Chave de API do n8n

# Pagamentos (se habilitado)
STRIPE_SECRET_KEY         # Chave secreta Stripe
STRIPE_WEBHOOK_SECRET     # Secret para webhooks Stripe
PAGSEGURO_TOKEN           # Token PagSeguro
```

```bash
# Script de verificação de variáveis
echo "Verificando variáveis de ambiente..."

REQUIRED_VARS=(
  "SUPABASE_URL"
  "SUPABASE_ANON_KEY"
  "SUPABASE_SERVICE_ROLE_KEY"
  "WHATSAPP_BUSINESS_TOKEN"
  "ALLOWED_ORIGIN"
)

MISSING=0
for VAR in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR}" ]; then
    echo "ERRO: Variável $VAR não definida"
    MISSING=$((MISSING + 1))
  else
    echo "OK: $VAR definida"
  fi
done

if [ $MISSING -gt 0 ]; then
  echo "Deploy CANCELADO: $MISSING variável(is) obrigatória(s) não definida(s)"
  exit 1
fi
```

### Fase 3 — Validação das Migrations

```bash
# 3.1 Listar migrations pendentes
supabase migration list

# 3.2 Verificar syntax SQL de cada migration pendente
for file in supabase/migrations/*.sql; do
  echo "Verificando: $file"
  # Validação de syntax (sem executar)
  psql --echo-errors --no-psqlrc -c "BEGIN; $(cat $file); ROLLBACK;" $DATABASE_URL 2>&1
  if [ $? -ne 0 ]; then
    echo "ERRO DE SYNTAX em $file"
    exit 1
  fi
done

# 3.3 Verificar que todas as migrations têm RLS
echo "Verificando RLS nas migrations..."
grep -L "ENABLE ROW LEVEL SECURITY" supabase/migrations/*.sql | while read file; do
  if grep -q "CREATE TABLE" "$file"; then
    echo "ALERTA: $file cria tabela mas não habilita RLS"
  fi
done
```

### Fase 4 — Validação das Edge Functions

```bash
# 4.1 Verificar syntax TypeScript
for dir in supabase/functions/*/; do
  if [ -f "$dir/index.ts" ]; then
    echo "Verificando: $dir"
    deno check "$dir/index.ts"
    if [ $? -ne 0 ]; then
      echo "ERRO DE TIPO em $dir/index.ts"
      exit 1
    fi
  fi
done

# 4.2 Verificar CORS nas Edge Functions
for file in supabase/functions/*/index.ts; do
  if grep -q "Access-Control-Allow-Origin.*\*" "$file"; then
    echo "ALERTA: CORS com * em $file — confirmar se é intencional"
  fi
done

# 4.3 Verificar autenticação nas funções
for file in supabase/functions/*/index.ts; do
  # Funções que não são webhooks devem ter verificação de auth
  if ! grep -q "webhook" "$file" && ! grep -q "auth.getUser" "$file"; then
    echo "ALERTA: $file pode estar sem verificação de autenticação"
  fi
done
```

### Fase 5 — Execução do Deploy

```bash
# 5.1 Aplicar migrations
echo "Aplicando migrations..."
supabase db push
if [ $? -ne 0 ]; then
  echo "ERRO: Falha ao aplicar migrations"
  exit 1
fi
echo "Migrations aplicadas com sucesso"

# 5.2 Deploy das Edge Functions
echo "Fazendo deploy das Edge Functions..."
supabase functions deploy
if [ $? -ne 0 ]; then
  echo "ERRO: Falha no deploy das Edge Functions"
  exit 1
fi
echo "Edge Functions deployadas com sucesso"

# 5.3 Atualizar secrets nas Edge Functions
echo "Atualizando secrets..."
supabase secrets set \
  WHATSAPP_BUSINESS_TOKEN="$WHATSAPP_BUSINESS_TOKEN" \
  ALLOWED_ORIGIN="$ALLOWED_ORIGIN"
# ... demais secrets
```

### Fase 6 — Validação Pós-Deploy

```bash
# 6.1 Verificar se Edge Functions estão respondendo
echo "Verificando Edge Functions..."

FUNCTION_URL="$SUPABASE_URL/functions/v1"

# Teste de healthcheck
STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$FUNCTION_URL/healthcheck")

if [ "$STATUS" != "200" ]; then
  echo "ALERTA: Healthcheck retornou $STATUS"
else
  echo "OK: Healthcheck respondendo corretamente"
fi

# 6.2 Verificar RLS ativado no banco
echo "Verificando RLS no banco..."
# Execute via Supabase SQL Editor ou CLI
```

---

## Processo de Rollback

Em caso de falha no deploy:

```bash
# Rollback de migrations (se necessário)
# ATENÇÃO: Apenas se a migration ainda não foi aplicada em produção
supabase db reset --local  # Apenas em ambiente local

# Para reverter migration em produção:
# 1. Criar nova migration de rollback
# 2. Aplicar com supabase db push
# 3. Nunca editar migration já aplicada
```

---

## Registro de Deploy

Após deploy bem-sucedido, registrar:

```
Data: {data}
Versão: {tag/commit}
Migrations aplicadas: {lista}
Functions deployadas: {lista}
Responsável: {nome}
Status: SUCESSO / FALHA
Observações: {se houver}
```
