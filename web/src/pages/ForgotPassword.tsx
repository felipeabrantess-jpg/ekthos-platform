import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

// ─────────────────────────────────────────────────────────────
// ForgotPassword — /auth/forgot-password
//
// Anti-enumeration: a mensagem de sucesso é propositalmente
// ambígua ("se o email estiver cadastrado...") para não revelar
// se o endereço existe na base.
// ─────────────────────────────────────────────────────────────

export default function ForgotPassword() {
  const [email,      setEmail]      = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent,       setSent]       = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: 'https://ekthos-platform.vercel.app/auth/reset-password',
    })

    // Sempre exibir mensagem de sucesso — não revelar se email existe.
    if (error) {
      console.warn('[forgot-password] resetPasswordForEmail:', error.message)
    }

    setSubmitting(false)
    setSent(true)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div className="w-full max-w-sm animate-fade-in-up">

        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-bold" style={{ color: 'var(--color-primary)' }}>
            Ekthos
          </h1>
          <p className="text-sm text-gray-500 mt-2 font-body">
            Plataforma operacional para igrejas
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-8">

          <h2 className="font-display text-xl font-semibold text-ekthos-black mb-1">
            Esqueceu sua senha?
          </h2>
          <p className="text-sm text-gray-500 font-body mb-6">
            Digite o email cadastrado e enviaremos um link para criar uma nova senha.
          </p>

          {sent ? (
            /* ── Estado pós-envio ── */
            <div className="space-y-4">
              <p className="text-sm bg-green-50 text-green-700 rounded-xl px-4 py-3 leading-relaxed">
                Se o email estiver cadastrado, enviamos o link de recuperação.
                Confira sua caixa de entrada (e spam).
              </p>
              <div className="text-center pt-1">
                <Link to="/login" className="text-sm text-brand-700 hover:underline">
                  Voltar para o login
                </Link>
              </div>
            </div>
          ) : (
            /* ── Formulário ── */
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="E-mail"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                autoComplete="email"
              />

              <Button type="submit" loading={submitting} className="w-full mt-2">
                Enviar link de recuperação
              </Button>

              <div className="text-center">
                <Link to="/login" className="text-sm text-brand-700 hover:underline">
                  Voltar para o login
                </Link>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  )
}
