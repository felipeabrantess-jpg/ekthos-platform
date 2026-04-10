import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { canAccess, defaultRoute, type AppRole } from '@/hooks/useRole'
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
        <Route path="/login"        element={<Login />} />
        <Route path="/signup"       element={<Signup />} />
        <Route path="/choose-plan"  element={<ChoosePlan />} />
        <Route path="/onboarding"   element={<Onboarding />} />
        <Route path="/onboarding/configuring" element={<OnboardingConfiguring />} />

        {/* CRM — rotas protegidas com Layout + sidebar */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          {/* Redirect raiz para rota padrão do role */}
          <Route index element={<RootRedirect />} />

          {/* Rotas sem restrição de role além de estar autenticado */}
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="agenda"    element={<Agenda />} />

          {/* Rotas com restrição de role */}
          <Route path="pessoas"    element={<RoleRoute path="pessoas"><People /></RoleRoute>} />
          <Route path="pipeline"   element={<RoleRoute path="pipeline"><Pipeline /></RoleRoute>} />
          <Route path="celulas"    element={<RoleRoute path="celulas"><Celulas /></RoleRoute>} />
          <Route path="ministerios" element={<RoleRoute path="ministerios"><Ministerios /></RoleRoute>} />
          <Route path="voluntarios" element={<RoleRoute path="voluntarios"><Voluntarios /></RoleRoute>} />
          <Route path="escalas"    element={<RoleRoute path="escalas"><Escalas /></RoleRoute>} />
          <Route path="financeiro" element={<RoleRoute path="financeiro"><Financeiro /></RoleRoute>} />
          <Route path="gabinete"   element={<RoleRoute path="gabinete"><Gabinete /></RoleRoute>} />

          {/* Agentes IA */}
          <Route path="agents" element={<Agents />} />

          {/* Configurações */}
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="billing" replace />} />
            <Route path="billing" element={<Billing />} />
            <Route path="users"   element={<Users />} />
          </Route>
        </Route>

        {/* Cockpit Admin (/admin/*) — layout próprio, banner vinho */}
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminLayout />
            </AdminRoute>
          }
        >
          <Route index element={<Navigate to="cockpit" replace />} />
          <Route path="cockpit"      element={<AdminCockpit />} />
          <Route path="churches"     element={<AdminChurches />} />
          <Route path="churches/:id" element={<AdminChurch />} />
          <Route path="revenue"      element={<AdminRevenue />} />
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
