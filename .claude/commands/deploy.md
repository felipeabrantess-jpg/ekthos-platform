# Command: /deploy

Checklist de pré-deploy para o Ekthos Platform (Supabase).

## Uso
/deploy               # Checklist completo
/deploy --migrations  # Apenas migrations
/deploy --functions   # Apenas Edge Functions

## Fase 1 — Migrations pendentes
Aciona: migration-auditor + supabase-rls-guard

- [ ] Listar migrations não aplicadas
- [ ] Cada migration nova tem os 6 elementos obrigatórios
- [ ] Nenhuma migration existente foi editada
- [ ] Nomes de arquivo seguem padrão sequencial

## Fase 2 — Sincronização de tipos
Aciona: doc-sync

- [ ] Toda tabela nova tem entrada em database.types.ts
- [ ] Nenhum campo novo sem interface correspondente
- [ ] Relationships: [] em todas as entradas novas

## Fase 3 — Edge Functions
Aciona: (checklist manual, regra 07)

- [ ] Runtime Deno — sem imports npm
- [ ] Variáveis via Deno.env.get() — nunca process.env
- [ ] HMAC validado antes de processar payload (webhooks)
- [ ] Resposta 200 imediata em webhooks
- [ ] AbortSignal.timeout(30_000) em fetches internos
- [ ] service_role key não aparece em logs

## Fase 4 — Verificação de segurança
- [ ] Nenhum secret hardcoded em código versionado
- [ ] .env não commitado (verificar .gitignore)
- [ ] Secrets configurados no Supabase Dashboard

## Fase 5 — Execução
```bash
# Aplicar migrations
supabase db push

# Deploy de todas as Edge Functions
supabase functions deploy

# Deploy de função específica
supabase functions deploy <nome-da-funcao>
```

## Fase 6 — Validação pós-deploy
- [ ] Edge Functions retornam 200 em health check
- [ ] Webhook de teste recebe e processa mensagem
- [ ] Dashboard carrega sem erros de query

## Em caso de falha
Nunca editar migration já aplicada.
Criar nova migration de rollback com próximo prefixo sequencial.
