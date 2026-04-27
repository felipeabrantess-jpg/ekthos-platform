import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import PasswordInput from '@/components/ui/PasswordInput'

// ── Helpers ─────────────────────────────────────────────────

/**
 * Verifica se o usuário se autenticou via OTP (invite ou magic-link).
 * Lê o campo amr do JWT (access_token) — NÃO de user.amr, que não
 * existe no objeto User retornado pelo Supabase JS.
 */
function hasOtpAmr(accessToken: string | undefined): boolean {
  if (!accessToken) return false
  try {
    const payload = JSON.parse(atob(accessToken.split('.')[1]))
    const amr: { method?: string }[] = payload.amr ?? []
    return Array.isArray(amr) && amr.some(m => m.method === 'otp')
  } catch {
    return false
  }
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
  const { user, session, loading } = useAuth()

  const [password,   setPassword]   = useState('')
  const [confirm,    setConfirm]    = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Aguarda AuthProvider resolver sessão
  if (loading) return null

  // Sem sessão → login
  if (!user) return <Navigate to="/login" replace />

  // Já tem senha definida (ou não veio de invite) → SmartRoot decide
  const needsSetup =
    hasOtpAmr(session?.access_token) && user.user_metadata?.password_set !== true
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
      // 1. Define senha + marca flag em UMA chamada atômica.
      //
      // IMPORTANTE: NÃO fazer 2 chamadas separadas (updateUser({ password })
      // seguido de updateUser({ data: ... })). Em sessões OTP recém-criadas
      // (invite/recovery), o GoTrue pode processar o segundo PATCH como
      // full-merge e sobrescrever encrypted_password com o valor anterior
      // — causando login inválido logo após set-password.
      //
      // Diagnóstico confirmado: auth logs mostraram 2× PUT /user em 18:16:41
      // seguido de 400 "Invalid login credentials" em 18:18:00.
      const { error: pwErr } = await supabase.auth.updateUser({
        password,
        data: { password_set: true },
      })
      if (pwErr) throw pwErr

      // 2. Força emissão de novo JWT com password_set=true no user_metadata
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
            <PasswordInput
              label="Nova senha"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              autoComplete="new-password"
              required
            />

            {/* Indicadores de força em tempo real */}
            {password.length > 0 && (
              <ul className="space-y-1 pl-1">
                {(Object.keys(checks) as (keyof PasswordChecks)[]).map(key => (
                  <Criterion key={key} ok={checks[key]} label={CHECK_LABELS[key]} />
                ))}
              </ul>
            )}

            {/* Campo: confirmar senha */}
            <PasswordInput
              label="Confirmar senha"
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
