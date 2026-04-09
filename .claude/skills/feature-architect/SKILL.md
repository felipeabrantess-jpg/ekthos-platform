# Skill: feature-architect

## Quando usar
Ao criar qualquer feature nova do zero.

## Checklist de criação

### 1. Hook de dados (`src/features/<modulo>/hooks/use<Feature>.ts`)
- [ ] `useQuery` com `queryKey: ['<tabela>', churchId]`
- [ ] `enabled: Boolean(churchId)`
- [ ] `.eq('church_id', churchId)` na queryFn
- [ ] `.is('deleted_at', null)` se tabela tem soft delete
- [ ] `throw new Error(error.message)` no error handling
- [ ] Tipo de retorno explícito: `Promise<MinhaInterface[]>`
- [ ] `useMutation` com `onSuccess` invalidando todas queryKeys afetadas
- [ ] Inserts e updates usam `as any` com comentário `eslint-disable`

### 2. Página (`src/pages/<Modulo>.tsx`)
- [ ] Importa apenas: `useAuth()` + hook do módulo + UI state
- [ ] Estado loading → `<Spinner size="lg" />`
- [ ] Estado error → `<ErrorState onRetry={refetch} />`
- [ ] Estado vazio → `<EmptyState title description action />`
- [ ] Ações destrutivas precedidas de `confirm()` antes da mutation

### 3. Rota (`src/App.tsx`)
- [ ] Rota registrada dentro do layout autenticado
- [ ] Path segue convenção dos módulos existentes

### 4. Navegação (`src/components/Sidebar.tsx`)
- [ ] Item adicionado na seção correta
- [ ] Ícone da biblioteca já usada no projeto (Lucide)

### 5. Tipos (`src/lib/database.types.ts`)
- [ ] Tabela nova tem entrada em `Database.Tables`
- [ ] Todos os campos da tabela estão na interface
- [ ] `Relationships: []` presente

## Output esperado
Arquivos criados/editados com conteúdo completo, na ordem acima.
Após criar, listar todos os arquivos tocados.
