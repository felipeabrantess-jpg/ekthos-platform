import { useState, useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { defaultRoute, type AppRole } from '@/hooks/useRole'
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
        ? <Check size={14} className="shrink-0" style={{ color: 'var(--color-success)' }} />
        : <X     size={14} className="shrink-0 text-gray-300" />
      }
      <span style={{ color: ok ? '#16a34a' : '#9ca3af' }}>{label}</span>
    </li>
  )
}

// ── Componente principal ─────────────────────────────────────

export default function SetPassword() {
  const navigate = useNavigate()
  const { user, session, role, loading } = useAuth()

  // Indica que o processamento do token do hash ainda está pendente.
  // Começa true para evitar flash de conteúdo com sessão errada (ex: admin logado).
  const [processing, setProcessing] = useState(true)

  const [password,   setPassword]   = useState('')
  const [confirm,    setConfirm]    = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => {
    async function processInviteToken() {
      // Detecta token no hash da URL (invite ou magiclink).
      // Necessário porque o SDK Supabase só processa o hash automaticamente
      // durante a inicialização — se o admin já estava logado na mesma aba
      // quando o link foi aberto, o hash pode não ter sido re-processado.
      const hash = window.location.hash.substring(1)
      const params = new URLSearchParams(hash)
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')

      if (accessToken && refreshToken) {
        // Deslogar sessão existente localmente (admin pode estar logado).
        // scope:'local' não invalida outros dispositivos nem faz chamada à API.
        await supabase.auth.signOut({ scope: 'local' })
        // Ativar a sessão do convidado com os tokens do link.
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        // Limpar hash da URL para evitar re-processamento ao navegar.
        window.history.replaceState(null, '', window.location.pathname)
      }

      setProcessing(false)
    }

    processInviteToken()
  }, [])

  // Aguarda processamento do token E resolução do AuthProvider
  if (processing || loading) return null

  // Sem sessão após processamento → link expirado ou inválido
  if (!user) return <Navigate to="/login" replace />

  const needsSetup =
    hasOtpAmr(session?.access_token) && user.user_metadata?.password_set !== true

  // ── Usuário existente: acesso ativado via magiclink ──────────────────
  // Já tem senha — não precisa criar. Mostra confirmação e redireciona.
  if (!needsSetup) {
    const dest = defaultRoute(role as AppRole | null)
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: 'var(--bg-primary)' }}
      >
        <div className="w-full max-w-[480px] animate-fade-in-up">

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

          <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-8 text-center">
            <div className="flex items-center justify-center mb-4">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center"
                style={{ background: '#e8f5e9' }}
              >
                <Check size={28} style={{ color: '#16a34a' }} />
              </div>
            </div>
            <h1 className="font-display text-2xl font-bold text-ekthos-black mb-2">
              Acesso ativado!
            </h1>
            <p className="text-sm text-gray-500 font-body mb-8">
              Seu acesso foi confirmado. Você pode entrar no sistema agora.
            </p>
            <Button
              size="lg"
              className="w-full"
              onClick={() => navigate(dest, { replace: true })}
            >
              Entrar no sistema
            </Button>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6 font-body">
            Acesso configurado pelo administrador da sua organização.
          </p>
        </div>
      </div>
    )
  }

  // ── Usuário novo: criar senha ─────────────────────────────

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
      // Define senha + marca flag em UMA chamada atômica.
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

      // Força emissão de novo JWT com password_set=true no user_metadata
      await supabase.auth.refreshSession()

      // SmartRoot decide o destino: churchId → /dashboard via StatusGuard;
      // sem churchId (invite manual) → /onboarding
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
      style={{ background: 'var(--bg-primary)' }}
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
              disabled={submitting}
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
