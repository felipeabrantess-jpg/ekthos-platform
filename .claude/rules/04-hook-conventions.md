# Regra: Convenções de Hooks

## Estrutura de todo useQuery
- queryKey: ['nome-da-tabela', churchId, ...filtros]
- enabled: Boolean(churchId) — sem exceção, mesmo quando parece desnecessário
- queryFn lança erro via: throw new Error(error.message)
- Tipo de retorno explícito: Promise<MinhaInterface[]>

## Estrutura de todo useMutation
- onSuccess invalida todas as queryKeys afetadas, incluindo queries compostas
- Nunca silenciar erros da mutation — sempre propagar via throw
- mutationFn com tipos explícitos no input

## Localização
- Hooks ficam em: src/features/<modulo>/hooks/use<Feature>.ts
- Nunca lógica de hook em páginas
- Nunca importar hook de feature A dentro de feature B

## Páginas
- Usam apenas: useAuth() + hook do módulo + useState + render
- Todo estado de loading mostra <Spinner size="lg" />
- Todo estado de erro mostra <ErrorState onRetry={...} />
- Todo estado vazio mostra <EmptyState title description action />
- Ações destrutivas precedidas de confirm() antes da mutation
