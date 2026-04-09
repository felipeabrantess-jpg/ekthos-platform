# Command: /create-feature

Cria o scaffold completo de uma feature nova seguindo o padrão do Ekthos.

## Uso
/create-feature <nome-do-modulo>
Exemplo: /create-feature celulas

## O que cria (nesta ordem)

### 1. Hook de dados
Arquivo: src/features/<modulo>/hooks/use<Feature>.ts
Aciona: feature-architect (checklist de hook)

Inclui:
- useQuery com queryKey: ['<tabela>', churchId]
- enabled: Boolean(churchId)
- .eq('church_id', churchId)
- .is('deleted_at', null) se tabela tem soft delete
- throw new Error(error.message) no error handler
- Tipo de retorno explícito: Promise<MinhaInterface[]>
- useMutation com onSuccess invalidando queryKeys afetadas
- Inserts/updates com cast as any + eslint-disable

### 2. Página
Arquivo: src/pages/<Modulo>.tsx
Aciona: frontend-qa (checklist de página)

Inclui:
- Guard: if (!churchId) return <ErrorState message="..." />
- Estados: Spinner / ErrorState / EmptyState
- confirm() antes de ações destrutivas
- Estado local de loading durante mutations

### 3. Rota
Arquivo: src/App.tsx (edição)
Adiciona rota dentro do layout autenticado.

### 4. Navegação
Arquivo: src/components/Sidebar.tsx (edição)
Adiciona item de navegação com ícone Lucide.

### 5. Tipos
Arquivo: src/lib/database.types.ts (edição)
Aciona: doc-sync (checklist de tipos)

Adiciona entrada em Database.Tables com Relationships: [].

## Pré-requisito
Informar: nome do módulo, nome da tabela no banco,
campos principais da interface, se tem soft delete.

## Output
Lista dos arquivos criados/editados com conteúdo completo.
Ao final: checklist de verificação pós-criação.
