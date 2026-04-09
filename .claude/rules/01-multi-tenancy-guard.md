# Regra: Multi-Tenancy Guard

Toda query ao Supabase deve garantir isolamento por tenant.

## Leituras (useQuery / select)
- Primeira cláusula após .from() é sempre .eq('church_id', churchId)
- Tabelas com soft delete incluem .is('deleted_at', null)
- Todo useQuery tem enabled: Boolean(churchId) — sem exceção
- churchId vem sempre de useAuth() — nunca hardcoded, nunca via prop

## Escritas (update / delete)
- Todo update e delete usa duplo filtro:
  .eq('id', id).eq('church_id', church_id)
- Nunca filtrar apenas por id sem o church_id

## Exceções documentadas
- Tabela roles: leitura pública, sem filtro church_id (design intencional)

## Violação desta regra
Vaza dados entre igrejas — o risco mais grave do produto.
Qualquer query sem filtro church_id deve ser bloqueada imediatamente.
