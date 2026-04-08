import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import Layout from '@/components/Layout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import People from '@/pages/People'
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
          {/* Rotas futuras — adicionar sem reescrever */}
          <Route path="pipeline" element={<PlaceholderPage title="Pipeline" />} />
          <Route path="ministerios" element={<PlaceholderPage title="Ministérios" />} />
          <Route path="voluntarios" element={<PlaceholderPage title="Voluntários" />} />
          <Route path="escalas" element={<PlaceholderPage title="Escalas" />} />
          <Route path="financeiro" element={<PlaceholderPage title="Financeiro" />} />
          <Route path="agenda" element={<PlaceholderPage title="Agenda" />} />
          <Route path="gabinete" element={<PlaceholderPage title="Gabinete Pastoral" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

// Placeholder para rotas ainda não implementadas
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <p className="text-2xl font-semibold text-gray-400">{title}</p>
        <p className="text-sm text-gray-400 mt-1">Em construção</p>
      </div>
    </div>
  )
}
