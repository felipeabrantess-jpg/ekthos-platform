import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

// ── Helpers ─────────────────────────────────────────────────

type AmrEntry = { method: string; timestamp?: number }

/** Verifica se o usuário se autenticou via OTP (invite ou magic-link). */
function hasOtpAmr(user: unknown): boolean {
  const amr = (user as { amr?: AmrEntry[] })?.amr
  return Array.isArray(amr) && amr.some(m => m.method === 'otp')
}

interface PasswordChecks {
  length: boolean
  upper:  boolean
  number: boolean
}

function checkPassword(pw: string): PasswordChecks {
  return {
    length: pw.length >= 8,
    upper:  /[A-Z]/.test(pw),
    number: /[0-9]/.test(pw),
  }
}

const CHECK_LABELS: Record<keyof PasswordChecks, string> = {
  length: 'Mínimo 8 caracteres',
  upper:  'Pelo menos 1 letra maiúscula',
  number: 'Pelo menos 1 número',
}

// ── Indicador de critério ────────────────────────────────────

function Criterion({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok
        ? <Check size={14} className="shrink-0" style={{ color: '#16a34a' }} />
        : <X     size={14} className="shrink-0 text-gray-300" />
      }
      <span style={{ color: ok ? '#16a34a' : '#9ca3af' }}>{label}</span>
    </li>
  )
}

// ── Componente principal ─────────────────────────────────────

export default function SetPassword() {
  const navigate   = useNavigate()
  const { user, loading } = useAuth()

  const [password,    setPassword]    = useState('')
  const [confirm,     setConfirm]     = useState('')
  const [showPw,      setShowPw]      = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting,  setSubmitting]  = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // Aguarda AuthProvider resolver sessão
  if (loading) return null

  // Sem sessão → login
  if (!user) return <Navigate to="/login" replace />

  // Já tem senha definida (ou não veio de invite) → SmartRoot decide
  const needsSetup =
    hasOtpAmr(user) && user.user_metadata?.password_set !== true
  if (!needsSetup) return <Navigate to="/" replace />

  const checks   = checkPassword(password)
  const allValid = checks.length && checks.upper && checks.number

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!allValid) {
      setError('A senha não atende aos critérios mínimos.')
      return
    }
    if (password !== confirm) {
      setError('As senhas não conferem.')
      return
    }

    setSubmitting(true)
    try {
      // 1. Define a senha na conta Supabase
      const { error: pwErr } = await supabase.auth.updateUser({ password })
      if (pwErr) throw pwErr

      // 2. Marca flag no user_metadata para SmartRoot não redirecionar aqui de novo
      const { error: metaErr } = await supabase.auth.updateUser({
        data: { password_set: true },
      })
      if (metaErr) {
        // Não fatal — só loga; senha foi criada com sucesso
        console.warn('[set-password] metadata update failed:', metaErr.message)
      }

      // 3. Força emissão de novo JWT com password_set=true no user_metadata
      await supabase.auth.refreshSession()

      // 4. SmartRoot decide o destino: churchId → /dashboard via StatusGuard;
      //    sem churchId (invite manual) → /onboarding
      navigate('/', { replace: true })
    } catch (err: unknown) {
      setError(
        (err as { message?: string }).message ?? 'Erro ao criar senha. Tente novamente.',
      )
      setSubmitting(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#f9eedc' }}
    >
      <div className="w-full max-w-[480px] animate-fade-in-up">

        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/logo-ekthos-200.png"
            alt="Ekthos Church"
            width={52}
            height={52}
            className="mx-auto mb-3"
          />
          <p className="text-sm text-gray-500 font-body">
            Plataforma operacional para igrejas
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-8">

          {/* Cabeçalho */}
          <h1 className="font-display text-2xl font-bold text-ekthos-black mb-1">
            Crie sua senha para acessar o Ekthos
          </h1>
          <p className="text-sm text-gray-500 font-body mb-6">
            Você está a um passo de configurar sua igreja
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Campo: senha */}
            <div className="relative">
              <Input
                label="Nova senha"
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-[38px] text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Indicadores de força em tempo real */}
            {password.length > 0 && (
              <ul className="space-y-1 pl-1">
                {(Object.keys(checks) as (keyof PasswordChecks)[]).map(key => (
                  <Criterion key={key} ok={checks[key]} label={CHECK_LABELS[key]} />
                ))}
              </ul>
            )}

            {/* Campo: confirmar senha */}
            <div className="relative">
              <Input
                label="Confirmar senha"
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repita a senha"
                autoComplete="new-password"
                error={
                  confirm.length > 0 && confirm !== password
                    ? 'As senhas não conferem'
                    : undefined
                }
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-[38px] text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Erro geral */}
            {error && (
              <p className="text-sm font-medium bg-brand-50 text-brand-600 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            {/* Submit */}
            <Button
              type="submit"
              loading={submitting}
              disabled={!allValid || confirm !== password}
              className="w-full mt-2"
              size="lg"
            >
              Criar senha e continuar
            </Button>

          </form>
        </div>

        {/* Rodapé de segurança */}
        <p className="text-center text-xs text-gray-400 mt-6 font-body">
          Sua senha é criptografada e nunca é armazenada em texto plano.
        </p>

      </div>
    </div>
  )
}
