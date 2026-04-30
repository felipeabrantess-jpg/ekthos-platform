import { useState } from 'react'
import LogoEkthos from '@/components/LogoEkthos'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import PasswordInput from '@/components/ui/PasswordInput'

export default function Login() {
  const { user, isEkthosAdmin, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (loading) return null
  // Ekthos admins → cockpit; usuários CRM → dashboard (RootRedirect cuida do resto)
  if (user) return <Navigate to={isEkthosAdmin ? '/admin/cockpit' : '/dashboard'} replace />

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('E-mail ou senha incorretos.')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-sm animate-fade-in-up">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <LogoEkthos height={40} variant="dark" showChurch={true} />
          <p className="text-sm text-gray-500 mt-3 font-body">
            Plataforma operacional para igrejas
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-8">
          <h2 className="font-display text-xl font-semibold text-ekthos-black mb-6">
            Entrar
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              required
              autoComplete="email"
            />

            <div>
              <PasswordInput
                label="Senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
              {/* T5 — link "Esqueci minha senha" abaixo do campo de senha */}
              <div className="flex justify-end mt-1.5">
                <Link
                  to="/auth/forgot-password"
                  className="text-sm text-brand-700 hover:underline"
                >
                  Esqueci minha senha
                </Link>
              </div>
            </div>

            {error && (
              <p className="text-sm text-brand-600 bg-brand-50 rounded-xl px-3 py-2 font-medium">
                {error}
              </p>
            )}

            <Button type="submit" loading={submitting} className="w-full mt-2">
              Entrar
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
