import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Eye, EyeOff, Loader } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export default function Signup() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [show, setShow] = useState({ password: false, confirm: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function field(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.name.trim()) return setError('Informe seu nome completo.')
    if (!form.email.trim()) return setError('Informe seu email.')
    if (form.password.length < 8) return setError('A senha deve ter pelo menos 8 caracteres.')
    if (form.password !== form.confirm) return setError('As senhas não conferem.')

    setLoading(true)
    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email:    form.email.trim(),
        password: form.password,
        options:  { data: { full_name: form.name.trim() } },
      })
      if (signUpError) throw signUpError
      navigate('/choose-plan')
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Erro ao criar conta. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#f9eedc' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-bold" style={{ color: '#e13500' }}>Ekthos</h1>
          <p className="text-sm text-gray-500 mt-1">CRM Pastoral Inteligente</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-8">
          <h2 className="font-display text-2xl font-semibold text-gray-900 mb-1">Crie sua conta</h2>
          <p className="text-sm text-gray-500 mb-6">Comece agora — grátis por 7 dias.</p>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nome */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nome completo</label>
              <input
                type="text"
                value={form.name}
                onChange={field('name')}
                placeholder="Pastor João Silva"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                style={{ '--tw-ring-color': '#e13500' } as React.CSSProperties}
                autoComplete="name"
                required
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={field('email')}
                placeholder="pastor@igrejagrace.com.br"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                autoComplete="email"
                required
              />
            </div>

            {/* Senha */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Senha</label>
              <div className="relative">
                <input
                  type={show.password ? 'text' : 'password'}
                  value={form.password}
                  onChange={field('password')}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow(s => ({ ...s, password: !s.password }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {show.password
                    ? <EyeOff size={16} strokeWidth={1.75} />
                    : <Eye     size={16} strokeWidth={1.75} />}
                </button>
              </div>
            </div>

            {/* Confirmar senha */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Confirmar senha</label>
              <div className="relative">
                <input
                  type={show.confirm ? 'text' : 'password'}
                  value={form.confirm}
                  onChange={field('confirm')}
                  placeholder="Repita a senha"
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow(s => ({ ...s, confirm: !s.confirm }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {show.confirm
                    ? <EyeOff size={16} strokeWidth={1.75} />
                    : <Eye     size={16} strokeWidth={1.75} />}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
              style={{ background: '#e13500' }}
            >
              {loading && <Loader size={16} strokeWidth={1.75} className="animate-spin" />}
              {loading ? 'Criando conta...' : 'Criar conta'}
            </button>
          </form>

          <p className="text-xs text-gray-400 text-center mt-6">
            Ao criar sua conta você concorda com os{' '}
            <a href="#" className="underline" style={{ color: '#e13500' }}>Termos de Uso</a>
            {' '}e a{' '}
            <a href="#" className="underline" style={{ color: '#e13500' }}>Política de Privacidade</a>.
          </p>
        </div>

        <p className="text-center text-sm text-gray-500 mt-6">
          Já tem conta?{' '}
          <Link to="/login" className="font-semibold" style={{ color: '#e13500' }}>
            Entrar
          </Link>
        </p>
      </div>
    </div>
  )
}
