import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/lib/auth-context'
import { useAuth } from '@/hooks/useAuth'
import { canAccess, defaultRoute, type AppRole } from '@/hooks/useRole'
import ErrorBoundary from '@/components/ErrorBoundary'
import Layout from '@/components/Layout'
import AdminLayout from '@/components/AdminLayout'
import Spinner from '@/components/ui/Spinner'

// ── Lazy page imports ───────────────────────────────────────
// Landing + Checkout (públicas, sem auth)
const Landing           = lazy(() => import('@/pages/Landing'))
const CheckoutSucesso   = lazy(() => import('@/pages/checkout/Sucesso'))
const CheckoutCancelado = lazy(() => import('@/pages/checkout/Cancelado'))

// Públicas
const Login                 = lazy(() => import('@/pages/Login'))
const Signup                = lazy(() => import('@/pages/Signup'))
const ChoosePlan            = lazy(() => import('@/pages/ChoosePlan'))
const Onboarding            = lazy(() => import('@/pages/Onboarding'))
const OnboardingConfiguring = lazy(() => import('@/pages/onboarding/Configuring'))
const Blocked               = lazy(() => import('@/pages/Blocked'))
const Cancelled             = lazy(() => import('@/pages/Cancelled'))
const PaymentPending        = lazy(() => import('@/pages/PaymentPending'))

// CRM
const Dashboard   = lazy(() => import('@/pages/Dashboard'))
const People      = lazy(() => import('@/pages/People'))
const Pipeline    = lazy(() => import('@/pages/Pipeline'))
const Ministerios = lazy(() => import('@/pages/Ministerios'))
const Voluntarios = lazy(() => import('@/pages/Voluntarios'))
const Escalas     = lazy(() => import('@/pages/Escalas'))
const Financeiro  = lazy(() => import('@/pages/Financeiro'))
const Agenda      = lazy(() => import('@/pages/Agenda'))
const Gabinete    = lazy(() => import('@/pages/Gabinete'))
const Celulas        = lazy(() => import('@/pages/Celulas'))
const Aniversarios   = lazy(() => import('@/pages/Aniversarios'))
const Agents         = lazy(() => import('@/pages/Agents').then(m => ({ default: m.Agents })))

// Settings — named exports → wrap para default
const SettingsLayoutPage = lazy(() =>
  import('@/pages/settings/Layout').then(m => ({ default: m.SettingsLayout }))
)
const BillingPage = lazy(() =>
  import('@/pages/settings/Billing').then(m => ({ default: m.Billing }))
)
const UsersPage = lazy(() =>
  import('@/pages/settings/Users').then(m => ({ default: m.Users }))
)
const BrandingPage = lazy(() =>
  import('@/pages/settings/Branding').then(m => ({ default: m.Branding }))
)

// Admin cockpit
const AdminCockpit  = lazy(() => import('@/pages/admin/Cockpit'))
const AdminChurches = lazy(() => import('@/pages/admin/Churches'))
const AdminChurch   = lazy(() => import('@/pages/admin/Church'))
const AdminRevenue     = lazy(() => import('@/pages/admin/Revenue'))
const AdminOnboardings = lazy(() => import('@/pages/admin/Onboardings'))
const AdminTasks       = lazy(() => import('@/pages/admin/Tasks'))
const AdminLeads       = lazy(() => import('@/pages/admin/Leads'))
const AdminPricing     = lazy(() => import('@/pages/admin/Pricing'))
const AdminAffiliates  = lazy(() => import('@/pages/admin/Affiliates'))
const AffiliateDetail  = lazy(() => import('@/pages/admin/AffiliateDetail'))

// ── Loaders ────────────────────────────────────────────────

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Spinner size="lg" />
    </div>
  )
}

function FullScreenSpinner() {
  return (
    <div className="h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  )
}

// ── Guards ─────────────────────────────────────────────────

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

// Redireciona conforme status da igreja
function StatusGuard({ children }: { children: React.ReactNode }) {
  const { churchStatus, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (churchStatus === 'onboarding')      return <Navigate to="/onboarding" replace />
  if (churchStatus === 'pending_payment') return <Navigate to="/payment-pending" replace />
  if (churchStatus === 'suspended')       return <Navigate to="/blocked" replace />
  if (churchStatus === 'cancelled')       return <Navigate to="/cancelled" replace />
  return <>{children}</>
}

// Rota protegida por role
function RoleRoute({ children, path }: { children: React.ReactNode; path: string }) {
  const { role, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!canAccess(role as AppRole | null, `/${path}`)) {
    return <Navigate to={defaultRoute(role as AppRole | null)} replace />
  }
  return <>{children}</>
}

// Guard para rotas do cockpit admin
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isEkthosAdmin, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (!isEkthosAdmin) return <Navigate to="/dashboard" replace />
  return <>{children}</>
}

// ── App ────────────────────────────────────────────────────

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
      <Suspense fallback={<FullScreenSpinner />}>
        <Routes>
          {/* ── Raiz inteligente: Landing (não auth) ou dashboard (auth) ── */}
          <Route index element={<SmartRoot />} />

          {/* ── Landing page + checkout (totalmente públicos, sem auth) ── */}
          <Route path="/landing"             element={<ErrorBoundary><Suspense fallback={<FullScreenSpinner />}><Landing /></Suspense></ErrorBoundary>} />
          <Route path="/checkout/sucesso"    element={<ErrorBoundary><Suspense fallback={<FullScreenSpinner />}><CheckoutSucesso /></Suspense></ErrorBoundary>} />
          <Route path="/checkout/cancelado"  element={<ErrorBoundary><Suspense fallback={<FullScreenSpinner />}><CheckoutCancelado /></Suspense></ErrorBoundary>} />

          {/* ── Rotas públicas ── */}
          <Route path="/login"    element={<ErrorBoundary><Login /></ErrorBoundary>} />
          <Route path="/signup"   element={<ErrorBoundary><Signup /></ErrorBoundary>} />
          <Route path="/choose-plan" element={<ErrorBoundary><ChoosePlan /></ErrorBoundary>} />
          <Route path="/onboarding" element={<ErrorBoundary><Onboarding /></ErrorBoundary>} />
          <Route path="/onboarding/configuring" element={<ErrorBoundary><OnboardingConfiguring /></ErrorBoundary>} />

          {/* ── Páginas de status de conta ── */}
          <Route
            path="/payment-pending"
            element={
              <ErrorBoundary>
                <ProtectedRoute>
                  <Suspense fallback={<FullScreenSpinner />}>
                    <PaymentPending />
                  </Suspense>
                </ProtectedRoute>
              </ErrorBoundary>
            }
          />
          <Route
            path="/blocked"
            element={
              <ErrorBoundary>
                <ProtectedRoute>
                  <Suspense fallback={<FullScreenSpinner />}>
                    <Blocked />
                  </Suspense>
                </ProtectedRoute>
              </ErrorBoundary>
            }
          />
          <Route
            path="/cancelled"
            element={
              <ErrorBoundary>
                <ProtectedRoute>
                  <Suspense fallback={<FullScreenSpinner />}>
                    <Cancelled />
                  </Suspense>
                </ProtectedRoute>
              </ErrorBoundary>
            }
          />

          {/* ── CRM — Layout + sidebar ── */}
          <Route
            path="/"
            element={
              <ErrorBoundary>
                <ProtectedRoute>
                  <StatusGuard>
                    <Layout />
                  </StatusGuard>
                </ProtectedRoute>
              </ErrorBoundary>
            }
          >
            <Route path="dashboard" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Dashboard /></Suspense></ErrorBoundary>} />
            <Route path="agenda"    element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Agenda /></Suspense></ErrorBoundary>} />

            <Route path="pessoas"        element={<ErrorBoundary><RoleRoute path="pessoas"><Suspense fallback={<PageLoader />}><People /></Suspense></RoleRoute></ErrorBoundary>} />
            <Route path="aniversarios"   element={<ErrorBoundary><RoleRoute path="aniversarios"><Suspense fallback={<PageLoader />}><Aniversarios /></Suspense></RoleRoute></ErrorBoundary>} />
            <Route path="pipeline"       element={<ErrorBoundary><RoleRoute path="pipeline"><Suspense fallback={<PageLoader />}><Pipeline /></Suspense></RoleRoute></ErrorBoundary>} />
            <Route path="celulas"     element={<ErrorBoundary><RoleRoute path="celulas"><Suspense fallback={<PageLoader />}><Celulas /></Suspense></RoleRoute></ErrorBoundary>} />
            <Route path="ministerios" element={<ErrorBoundary><RoleRoute path="ministerios"><Suspense fallback={<PageLoader />}><Ministerios /></Suspense></RoleRoute></ErrorBoundary>} />
            <Route path="voluntarios" element={<ErrorBoundary><RoleRoute path="voluntarios"><Suspense fallback={<PageLoader />}><Voluntarios /></Suspense></RoleRoute></ErrorBoundary>} />
            <Route path="escalas"     element={<ErrorBoundary><RoleRoute path="escalas"><Suspense fallback={<PageLoader />}><Escalas /></Suspense></RoleRoute></ErrorBoundary>} />
            <Route path="financeiro"  element={<ErrorBoundary><RoleRoute path="financeiro"><Suspense fallback={<PageLoader />}><Financeiro /></Suspense></RoleRoute></ErrorBoundary>} />
            <Route path="gabinete"    element={<ErrorBoundary><RoleRoute path="gabinete"><Suspense fallback={<PageLoader />}><Gabinete /></Suspense></RoleRoute></ErrorBoundary>} />

            <Route path="agents" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><Agents /></Suspense></ErrorBoundary>} />

            <Route path="settings" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><SettingsLayoutPage /></Suspense></ErrorBoundary>}>
              <Route index element={<Navigate to="billing" replace />} />
              <Route path="billing"  element={<ErrorBoundary><Suspense fallback={<PageLoader />}><BillingPage /></Suspense></ErrorBoundary>} />
              <Route path="users"    element={<ErrorBoundary><Suspense fallback={<PageLoader />}><UsersPage /></Suspense></ErrorBoundary>} />
              <Route path="branding" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><BrandingPage /></Suspense></ErrorBoundary>} />
            </Route>
          </Route>

          {/* ── Cockpit Admin ── */}
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
            <Route path="cockpit"      element={<ErrorBoundary><Suspense fallback={<PageLoader />}><AdminCockpit /></Suspense></ErrorBoundary>} />
            <Route path="churches"     element={<ErrorBoundary><Suspense fallback={<PageLoader />}><AdminChurches /></Suspense></ErrorBoundary>} />
            <Route path="churches/:id" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><AdminChurch /></Suspense></ErrorBoundary>} />
            <Route path="onboardings" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><AdminOnboardings /></Suspense></ErrorBoundary>} />
            <Route path="leads"       element={<ErrorBoundary><Suspense fallback={<PageLoader />}><AdminLeads /></Suspense></ErrorBoundary>} />
            <Route path="tasks"       element={<ErrorBoundary><Suspense fallback={<PageLoader />}><AdminTasks /></Suspense></ErrorBoundary>} />
            <Route path="revenue"      element={<ErrorBoundary><Suspense fallback={<PageLoader />}><AdminRevenue /></Suspense></ErrorBoundary>} />
            <Route path="pricing"      element={<ErrorBoundary><Suspense fallback={<PageLoader />}><AdminPricing /></Suspense></ErrorBoundary>} />
            <Route path="afiliados"    element={<ErrorBoundary><Suspense fallback={<PageLoader />}><AdminAffiliates /></Suspense></ErrorBoundary>} />
            <Route path="afiliados/:id" element={<ErrorBoundary><Suspense fallback={<PageLoader />}><AffiliateDetail /></Suspense></ErrorBoundary>} />
          </Route>
        </Routes>
      </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}

// Rota raiz inteligente: Landing (não autenticado) | Dashboard (autenticado)
function SmartRoot() {
  const { user, role, isEkthosAdmin, loading } = useAuth()
  if (loading) return <FullScreenSpinner />
  if (!user) return <Navigate to="/landing" replace />
  if (isEkthosAdmin) return <Navigate to="/admin/cockpit" replace />
  return <Navigate to={defaultRoute(role as AppRole | null)} replace />
}
