# Skill: frontend-qa

## Quando usar
Ao revisar qualquer página em src/pages/ ou componente em src/features/*/components/.

## Checklist — Página (src/pages/<Modulo>.tsx)

### Imports permitidos
- [ ] Importa apenas: useAuth() + hook do módulo + componentes UI + useState
- [ ] Sem lógica de negócio diretamente na página
- [ ] Sem imports de hooks de outros módulos de feature
- [ ] Helpers puros de formatação/exibição (formatPhone, formatDate, etc.)
  são permitidos no mesmo arquivo se usados apenas localmente

### Guarda de churchId
- [ ] Se churchId pode ser null, tem guard explícito antes do render principal
  Padrão real: if (!churchId) return <ErrorState message="..." />

### Estados obrigatórios
- [ ] Loading: <Spinner size="lg" /> — dentro de container com padding
  Padrão real: <div className="flex items-center justify-center py-16"><Spinner size="lg" /></div>
- [ ] Error: <ErrorState onRetry={() => void refetch()} />
- [ ] Empty (sem dados): <EmptyState title description action? />
  title muda conforme contexto (ex: filtro ativo vs sem dados)

### Ações destrutivas
- [ ] Toda ação de delete/remover é precedida de confirm()
  Padrão real: if (!confirm(`Remover ${nome}? ...`)) return
- [ ] Estado de loading local durante a mutation (ex: deletingId)
  para evitar double-click e dar feedback visual imediato

### Modal
- [ ] Recebe open + onClose + churchId + entidade (null = criação, preenchido = edição)
- [ ] onClose reseta o estado de edição: setModalOpen(false); setEditingPerson(null)

### Componentes de linha/card (sub-componentes)
- [ ] Recebem apenas dados já processados via props — sem lógica de query
- [ ] Props tipadas com interface explícita
- [ ] Não fazem chamada direta ao Supabase

## Output esperado
Lista de itens ✅ aprovado ou ❌ com linha do problema e sugestão de correção.
Ao final: "Página aprovada" ou "X itens a corrigir".
