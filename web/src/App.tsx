import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { canAccess, defaultRoute, type AppRole } from '@/hooks/useRole'
import ErrorBoundary from '@/components/ErrorBoundary'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import People from '@/pages/People'
import Pipeline from '@/pages/Pipeline'
import Ministerios from '@/pages/Ministerios'
import Voluntarios from '@/pages/Voluntarios'
import Escalas from '@/pages/Escalas'
import Financeiro from '@/pages/Financeiro'
import Agenda from '@/pages/Agenda'
import Gabinete from '@/pages/Gabinete'
import Celulas from '@/pages/Celulas'
import Spinner from '@/components/ui/Spinner'
import { SettingsLayout } from '@/pages/settings/Layout'
import { Billing } from '@/pages/settings/Billing'
import { Users } from '@/pages/settings/Users'
import { Agents } from '@/pages/Agents'
// Onboarding self-service
import Signup from '@/pages/Signup'
import ChoosePlan from '@/pages/ChoosePlan'
import Onboarding from '@/pages/Onboarding'
import OnboardingConfiguring from '@/pages/onboarding/Configuring'
// Admin cockpit
import AdminLayout from '@/components/AdminLayout'
import AdminCockpit from '@/pages/admin/Cockpit'
import AdminChurches from '@/pages/admin/Churches'
import AdminChurch from '@/pages/admin/Church'
import AdminRevenue from '@/pages/admin/Revenue'

// ── Guards ─────────────────────────────────────────────────

function FullScreenSpinner() {
  return (
    <div className="h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

// Rota protegida por role — redireciona para rota padrão do role se sem permissão
function RoleRoute({
  children,
  path,
}: {
  children: React.ReactNode
  path: string
}) {
  const { role, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!canAccess(role as AppRole | null, `/${path}`)) {
    return <Navigate to={defaultRoute(role as AppRole | null)} replace />
  }
  return <>{children}</>
}

// Guard para rotas do cockpit — exige is_ekthos_admin no user_metadata
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!user) return <Navigate to="/login" replace />
  const isAdmin =
    user.user_metadata?.is_ekthos_admin === true ||
    user.app_metadata?.is_ekthos_admin === true
  if (!isAdmin) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

// ── App ────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Rotas públicas (sem sidebar) */}
        <Route path="/login"        element={<ErrorBoundary><Login /></ErrorBoundary>} />
        <Route path="/signup"       element={<ErrorBoundary><Signup /></ErrorBoundary>} />
        <Route path="/choose-plan"  element={<ErrorBoundary><ChoosePlan /></ErrorBoundary>} />
        <Route path="/onboarding"   element={<ErrorBoundary><Onboarding /></ErrorBoundary>} />
        <Route path="/onboarding/configuring" element={<ErrorBoundary><OnboardingConfiguring /></ErrorBoundary>} />

        {/* CRM — rotas protegidas com Layout + sidebar */}
        <Route
          path="/"
          element={
            <ErrorBoundary>
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            </ErrorBoundary>
          }
        >
          {/* Redirect raiz para rota padrão do role */}
          <Route index element={<RootRedirect />} />

          {/* Rotas sem restrição de role além de estar autenticado */}
          <Route path="dashboard" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
          <Route path="agenda"    element={<ErrorBoundary><Agenda /></ErrorBoundary>} />

          {/* Rotas com restrição de role */}
          <Route path="pessoas"    element={<ErrorBoundary><RoleRoute path="pessoas"><People /></RoleRoute></ErrorBoundary>} />
          <Route path="pipeline"   element={<ErrorBoundary><RoleRoute path="pipeline"><Pipeline /></RoleRoute></ErrorBoundary>} />
          <Route path="celulas"    element={<ErrorBoundary><RoleRoute path="celulas"><Celulas /></RoleRoute></ErrorBoundary>} />
          <Route path="ministerios" element={<ErrorBoundary><RoleRoute path="ministerios"><Ministerios /></RoleRoute></ErrorBoundary>} />
          <Route path="voluntarios" element={<ErrorBoundary><RoleRoute path="voluntarios"><Voluntarios /></RoleRoute></ErrorBoundary>} />
          <Route path="escalas"    element={<ErrorBoundary><RoleRoute path="escalas"><Escalas /></RoleRoute></ErrorBoundary>} />
          <Route path="financeiro" element={<ErrorBoundary><RoleRoute path="financeiro"><Financeiro /></RoleRoute></ErrorBoundary>} />
          <Route path="gabinete"   element={<ErrorBoundary><RoleRoute path="gabinete"><Gabinete /></RoleRoute></ErrorBoundary>} />

          {/* Agentes IA */}
          <Route path="agents" element={<ErrorBoundary><Agents /></ErrorBoundary>} />

          {/* Configurações */}
          <Route path="settings" element={<ErrorBoundary><SettingsLayout /></ErrorBoundary>}>
            <Route index element={<Navigate to="billing" replace />} />
            <Route path="billing" element={<ErrorBoundary><Billing /></ErrorBoundary>} />
            <Route path="users"   element={<ErrorBoundary><Users /></ErrorBoundary>} />
          </Route>
        </Route>

        {/* Cockpit Admin (/admin/*) — layout próprio, banner vinho */}
        <Route
          path="/admin"
          element={
            <ErrorBoundary>
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            </ErrorBoundary>
          }
        >
          <Route index element={<Navigate to="cockpit" replace />} />
          <Route path="cockpit"      element={<ErrorBoundary><AdminCockpit /></ErrorBoundary>} />
          <Route path="churches"     element={<ErrorBoundary><AdminChurches /></ErrorBoundary>} />
          <Route path="churches/:id" element={<ErrorBoundary><AdminChurch /></ErrorBoundary>} />
          <Route path="revenue"      element={<ErrorBoundary><AdminRevenue /></ErrorBoundary>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

// Redireciona para a rota padrão do role do usuário
function RootRedirect() {
  const { role, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  return <Navigate to={defaultRoute(role as AppRole | null)} replace />
}
