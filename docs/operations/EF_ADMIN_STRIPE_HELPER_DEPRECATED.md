# EF Tombstone: admin-stripe-helper & admin-stripe-ops

## Status

**TOMBSTONED** — retornam HTTP 410 Gone para qualquer request.  
Não deletadas via MCP (ferramenta `delete_edge_function` não disponível no MCP Supabase).

## Identificação

| Campo | admin-stripe-helper | admin-stripe-ops |
|---|---|---|
| Slug | `admin-stripe-helper` | `admin-stripe-ops` |
| Versão | v3 | v2 |
| ID | `41ab132e-2eb3-42b6-bf2c-100fb10d60ee` | — |
| verify_jwt | false | false |
| Status atual | ACTIVE (stub 410) | ACTIVE (stub 410) |

## Data do tombstone

2026-05-31

## Razão

EFs temporárias criadas para operações Stripe LIVE durante:

- **MEGA-ONDA TRIPARTITE CURTA** (2026-05-30)
- **MEGA-ONDA B**

Missão cumprida. Operações concluídas. As EFs não têm mais utilidade operacional.

## Comportamento atual

Ambas respondem:

```json
{ "error": "gone", "message": "Esta EF temporária foi desativada. Delete via Dashboard." }
```

HTTP 410 — qualquer método, qualquer payload.

## Acao necessaria

**Felipe deve deletar manualmente:**

1. Acessar [Supabase Dashboard → Edge Functions](https://supabase.com/dashboard/project/mlqjywqnchilvgkbvicd/functions)
2. Localizar `admin-stripe-helper` → Menu → Delete
3. Localizar `admin-stripe-ops` → Menu → Delete

Não há risco de breaking change — ambas já retornam 410 e nenhum fluxo ativo as consome.

## Audit log

Registro inserido em `audit_logs`:

- `action`: `ef_tombstone_admin_stripe_helper`
- `actor_id`: `579d0f7b-9b8b-4c20-94c5-513b4a424642` (Felipe / system)
- `entity_type`: `system`
- `payload`: inclui ambas as EFs, versões e `action_needed`

## Seguranca

- `verify_jwt: false` nas duas — qualquer chamada recebe 410 imediatamente, sem processar body ou headers
- Nenhum dado sensível (Stripe keys, church_id, subscription) é processado ou logado
