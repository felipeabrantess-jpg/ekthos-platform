# Regra: Soft Delete

## Tabelas com soft delete
people · ministries · volunteers · leaders

## Como deletar (único padrão aceito)
.update({ deleted_at: new Date().toISOString() } as any)
  .eq('id', id)
  .eq('church_id', churchId)

## Proibido
- Nunca usar .delete() nas tabelas listadas acima
- Nunca omitir .is('deleted_at', null) em leituras dessas tabelas

## Invalidação obrigatória no onSuccess
- Soft delete em people invalida:
  ['people', churchId], ['people-count', churchId], ['dashboard-stats', churchId]
- Soft delete em ministries invalida: ['ministerios', churchId]
- Soft delete em volunteers invalida: ['voluntarios', churchId]

## Novas tabelas
Se uma nova tabela receber coluna deleted_at, adicionar à lista acima
e atualizar esta regra.
