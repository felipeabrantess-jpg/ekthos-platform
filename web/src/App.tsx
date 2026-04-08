import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
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
import Spinner from '@/components/ui/Spinner'

// Rota protegida — redireciona para /login se não autenticado
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="pessoas" element={<People />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="ministerios" element={<Ministerios />} />
          <Route path="voluntarios" element={<Voluntarios />} />
          <Route path="escalas" element={<Escalas />} />
          <Route path="financeiro" element={<Financeiro />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="gabinete" element={<Gabinete />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
