# Como conectar o n8n ao Ekthos

## Passo 1 — Importar os workflows no n8n

1. Acesse https://ekthosai.app.n8n.cloud
2. Menu lateral → **Workflows** → botão **Import from file**
3. Importe `workflow-pipeline.json`
4. Importe `workflow-people.json`
5. **Ative cada workflow** (toggle no canto superior direito de cada um)

## Passo 2 — Pegar as URLs dos webhooks gerados

Depois de ativar cada workflow, copie as URLs de produção:

- Workflow Pipeline → nó "Webhook — Pipeline Event" → aba **Production URL**
  - Formato: `https://ekthosai.app.n8n.cloud/webhook/ekthos-pipeline`
- Workflow People → nó "Webhook — People Event" → aba **Production URL**
  - Formato: `https://ekthosai.app.n8n.cloud/webhook/ekthos-people`

## Passo 3 — Ativar no Supabase

Execute este SQL no Supabase (SQL Editor), substituindo as URLs pelos valores reais:

```sql
INSERT INTO n8n_webhooks (church_id, pipeline_url, people_url, is_active, secret_token)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  'https://ekthosai.app.n8n.cloud/webhook/ekthos-pipeline',
  'https://ekthosai.app.n8n.cloud/webhook/ekthos-people',
  true,
  'e23e1e092e60b7ac6a641903e397f04a8d7c7bf493e01d7852a6d0dcba9b53c2'
)
ON CONFLICT (church_id) DO UPDATE SET
  pipeline_url  = EXCLUDED.pipeline_url,
  people_url    = EXCLUDED.people_url,
  is_active     = true,
  secret_token  = EXCLUDED.secret_token,
  updated_at    = NOW();
```

## Passo 4 — Testar

1. Vá em **Pessoas** → crie um novo membro
2. O trigger `trg_n8n_people_insert` dispara → chama o n8n via pg_net
3. n8n recebe → chama a Edge Function `n8n-notify`
4. `n8n-notify` insere na tabela `notifications` para usuários com role `admin` / `secretary`
5. O sino de notificações no Sidebar atualiza em tempo real via Supabase Realtime

## Arquitetura

```
Supabase DB trigger (pg_net)
    └─► n8n Webhook URL (ekthosai.app.n8n.cloud)
            └─► HTTP Request → Edge Function n8n-notify
                    └─► INSERT notifications (Realtime → frontend bell)
                    └─► INSERT automation_logs
```

## Secret Token

O token `e23e1e092e60b7ac6a641903e397f04a8d7c7bf493e01d7852a6d0dcba9b53c2` está embutido
nos workflows e validado pela Edge Function. Não expor publicamente.
