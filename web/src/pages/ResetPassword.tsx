import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Button from '@/components/ui/Button'
import PasswordInput from '@/components/ui/PasswordInput'

// ─────────────────────────────────────────────────────────────
// ResetPassword — /auth/reset-password
//
// Supabase envia o link de recovery com hash:
//   #access_token=...&refresh_token=...&type=recovery
//
// O Supabase JS v2 (detectSessionInUrl: true) troca o hash
// automaticamente ao montar a página e dispara o evento
// PASSWORD_RECOVERY no onAuthStateChange.
//
// Após updateUser({ password }):
//   → window.location.href = '/login'   (armadilha 8 — NUNCA navigate())
//     O reload força o AuthProvider a remontar e buscar a sessão
//     atualizada, evitando stale context.
// ─────────────────────────────────────────────────────────────

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

export default function ResetPassword() {
  const [sessionReady, setSessionReady] = useState(false)
  const [tokenError,   setTokenError]   = useState(false)
  const [password,     setPassword]     = useState('')
  const [confirm,      setConfirm]      = useState('')
  const [submitting,   setSubmitting]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [success,      setSuccess]      = useState(false)

  useEffect(() => {
    // Verifica presença do type=recovery no hash da URL
    if (!window.location.hash.includes('type=recovery')) {
      setTokenError(true)
      return
    }

    // Supabase processa o hash automaticamente; escuta o evento de recovery.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })

    // Fallback: pode já ter sessão se Supabase processou antes do listener montar.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionReady(true)
    })

    return () => subscription.unsubscribe()
  }, [])

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
      const { error: updateErr } = await supabase.auth.updateUser({ password })
      if (updateErr) throw updateErr

      setSuccess(true)
      // Armadilha 8: window.location.href força reload completo do AuthProvider.
      // navigate('/login') deixaria churchStatus em cache e poderia criar loop.
      setTimeout(() => { window.location.href = '/login' }, 2000)
    } catch (err: unknown) {
      setError(
        (err as { message?: string }).message ?? 'Erro ao atualizar senha. Tente novamente.',
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

        <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-8">

          {/* ── Token inválido ou expirado ── */}
          {tokenError && (
            <div className="text-center space-y-4">
              <h2 className="font-display text-xl font-semibold text-ekthos-black">
                Link inválido ou expirado
              </h2>
              <p className="text-sm text-gray-500">
                Este link de recuperação não é mais válido. Solicite um novo.
              </p>
              <Link
                to="/auth/forgot-password"
                className="inline-block text-sm font-medium text-brand-700 hover:underline"
              >
                Solicitar novo link
              </Link>
            </div>
          )}

          {/* ── Sucesso ── */}
          {success && (
            <div className="text-center space-y-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                style={{ background: '#F0FDF4' }}
              >
                <Check size={24} style={{ color: '#16a34a' }} />
              </div>
              <h2 className="font-display text-xl font-semibold text-ekthos-black">
                Senha atualizada!
              </h2>
              <p className="text-sm text-gray-500">
                Redirecionando para o login...
              </p>
            </div>
          )}

          {/* ── Formulário ── */}
          {!tokenError && !success && (
            <>
              <h1 className="font-display text-2xl font-bold text-ekthos-black mb-1">
                Criar nova senha
              </h1>
              <p className="text-sm text-gray-500 font-body mb-6">
                Digite uma senha forte para acessar o Ekthos.
              </p>

              <form onSubmit={handleSubmit} className="space-y-5">

                <PasswordInput
                  label="Nova senha"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  autoComplete="new-password"
                  required
                  disabled={!sessionReady}
                />

                {password.length > 0 && (
                  <ul className="space-y-1 pl-1">
                    {(Object.keys(checks) as (keyof PasswordChecks)[]).map(key => (
                      <Criterion key={key} ok={checks[key]} label={CHECK_LABELS[key]} />
                    ))}
                  </ul>
                )}

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
                  disabled={!sessionReady}
                />

                {!sessionReady && (
                  <p className="text-xs text-gray-400">
                    Verificando link de recuperação...
                  </p>
                )}

                {error && (
                  <p className="text-sm font-medium bg-brand-50 text-brand-600 rounded-xl px-3 py-2">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  loading={submitting}
                  disabled={!sessionReady || !allValid || confirm !== password}
                  className="w-full mt-2"
                  size="lg"
                >
                  Atualizar senha
                </Button>

              </form>
            </>
          )}

        </div>

        <p className="text-center text-xs text-gray-400 mt-6 font-body">
          Sua senha é criptografada e nunca é armazenada em texto plano.
        </p>

      </div>
    </div>
  )
}
