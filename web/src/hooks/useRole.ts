// ──────────────────────────────────────────────────────────────────────
// Roles e helpers de permissão — Ekthos Platform
// ──────────────────────────────────────────────────────────────────────

export type AppRole =
  | 'admin'
  | 'admin_departments'
  | 'pastor_celulas'
  | 'supervisor'
  | 'cell_leader'
  | 'secretary'
  | 'treasurer'

// Rótulos em português para exibição no frontend
export const ROLE_LABELS: Record<AppRole, string> = {
  admin:             'Admin',
  admin_departments: 'Gest. Departamentos',
  pastor_celulas:    'Pastor de Células',
  supervisor:        'Supervisor',
  cell_leader:       'Líder de Célula',
  secretary:         'Secretária',
  treasurer:         'Tesoureiro',
}

// Quais roles têm acesso a cada rota
export const ROUTE_PERMISSIONS: Record<string, AppRole[]> = {
  '/dashboard':   ['admin', 'admin_departments', 'pastor_celulas', 'supervisor', 'cell_leader', 'secretary', 'treasurer'],
  '/pessoas':     ['admin', 'admin_departments', 'pastor_celulas', 'supervisor', 'cell_leader', 'secretary'],
  '/pipeline':    ['admin', 'pastor_celulas', 'supervisor', 'cell_leader'],
  '/ministerios': ['admin', 'admin_departments'],
  '/voluntarios': ['admin', 'admin_departments'],
  '/escalas':     ['admin', 'admin_departments'],
  '/financeiro':  ['admin', 'treasurer'],
  '/agenda':      ['admin', 'admin_departments', 'pastor_celulas', 'supervisor', 'cell_leader', 'secretary', 'treasurer'],
  '/gabinete':    ['admin'],
  '/celulas':     ['admin', 'pastor_celulas', 'supervisor', 'cell_leader'],
}

// Verifica se um role tem acesso a uma rota
export function canAccess(role: AppRole | null, path: string): boolean {
  if (!role) return false
  const allowed = ROUTE_PERMISSIONS[path]
  if (!allowed) return true // rotas desconhecidas: libera (proteção por ProtectedRoute base)
  return allowed.includes(role)
}

// Helpers de capacidade — usados em componentes para mostrar/esconder ações

export function canManageFinancial(role: AppRole | null): boolean {
  return role === 'admin' || role === 'treasurer'
}

export function canManageDepartments(role: AppRole | null): boolean {
  return role === 'admin' || role === 'admin_departments'
}

export function canManageCells(role: AppRole | null): boolean {
  return role === 'admin' || role === 'pastor_celulas' || role === 'supervisor'
}

export function canEditMembers(role: AppRole | null): boolean {
  return (
    role === 'admin' ||
    role === 'admin_departments' ||
    role === 'pastor_celulas' ||
    role === 'secretary'
  )
}

export function isAdminLevel(role: AppRole | null): boolean {
  return role === 'admin'
}

// Retorna a primeira rota acessível (para redirect pós-login)
export function defaultRoute(role: AppRole | null): string {
  if (!role) return '/login'
  if (role === 'treasurer') return '/financeiro'
  return '/dashboard'
}
