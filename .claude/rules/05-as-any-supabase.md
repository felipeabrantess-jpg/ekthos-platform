# Regra: Padrão as any no Supabase

## O padrão obrigatório
Todo insert e todo update usa:
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .insert(dados as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .update(dados as any)

## Por que existe
Limitação do Supabase JS v2.43: sem Relationships: [] em Database.Tables,
os tipos de insert/update resolvem para never.
Com Relationships: [], resolvem para any — o cast é necessário.

## O que nunca fazer
- Nunca remover o cast as any tentando "corrigir tipagem"
- Nunca substituir por outro cast (ex: as TablesInsert<'people'>)
- Nunca remover o comentário eslint-disable da linha anterior
- Nunca rodar tsc no build — o script é vite build sem tsc

## database.types.ts
- Todo Database.Tables entry tem Relationships: []
- Campo novo no banco → atualizar interface correspondente antes de usar
- Tabela nova → adicionar entrada completa em Database.Tables
