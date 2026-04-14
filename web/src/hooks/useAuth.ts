// Hook de autenticação — retorna user, churchId, churchStatus, role e loading
// churchId: app_metadata tem prioridade sobre user_metadata (segurança)
// Impersonação: só disponível para is_ekthos_admin, lida de localStorage
// Session token: upsertado após login (fire-and-forget)

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { AppRole } from '@/hooks/useRole'

const SESSION_TOKEN_KEY = 'ekthos_session_token'

export interface AuthState {
  user: User | null
  churchId: string | null
  churchStatus: string | null
  role: AppRole | null
  loading: boolean
}

// Busca o role do usuário em user_roles.
async function fetchRole(userId: string, churchId: string): Promise<AppRole | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('church_id', churchId)
      .maybeSingle() as { data: { role: AppRole } | null }
    return data?.role ?? null
  } catch {
    return null
  }
}

// Resolve todo o estado de auth a partir de um User do Supabase.
// Aplica prioridade app_metadata > user_metadata para church_id.
// Impersonação gated por is_ekthos_admin.
async function resolveAuthFromUser(user: User): Promise<AuthState> {
  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true

  const rawChurchId =
    ((user.app_metadata?.church_id ?? user.user_metadata?.church_id) as string | undefined) ?? null

  // Impersonação: apenas admins Ekthos podem ler
  let impersonatedChurchId: string | null = null
  if (isAdmin) {
    try {
      const raw = localStorage.getItem('impersonating')
      if (raw) {
        const parsed = JSON.parse(raw) as { church_id: string }
        impersonatedChurchId = parsed.church_id ?? null
      }
    } catch {
      impersonatedChurchId = null
    }
  }

  const churchId = impersonatedChurchId ?? rawChurchId

  // Busca status da igreja (suspended / cancelled → redirect no StatusGuard)
  let churchStatus: string | null = null
  if (churchId) {
    try {
      const { data } = await supabase
        .from('churches')
        .select('status')
        .eq('id', churchId)
        .maybeSingle()
      churchStatus = (data as { status: string } | null)?.status ?? null
    } catch {
      // Falha silenciosa — status null não bloqueia login
    }
  }

  const role = churchId ? await fetchRole(user.id, churchId) : null

  // Upsert session token — fire-and-forget, não bloqueia renderização
  if (churchId) {
    void supabase
      .rpc('upsert_session_token', { p_church_id: churchId })
      .then(
        ({ data }) => { if (data) localStorage.setItem(SESSION_TOKEN_KEY, data as string) },
        console.error,
      )
  }

  return { user, churchId, churchStatus, role, loading: false }
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    churchId: null,
    churchStatus: null,
    role: null,
    loading: true,
  })

  useEffect(() => {
    // Verifica sessão atual
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const resolved = await resolveAuthFromUser(session.user)
        setState(resolved)
      } else {
        setState({ user: null, churchId: null, churchStatus: null, role: null, loading: false })
      }
    })

    // Escuta mudanças de auth (login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void resolveAuthFromUser(session.user).then(setState)
      } else {
        setState({ user: null, churchId: null, churchStatus: null, role: null, loading: false })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return state
}

// Hook de logout
export function useLogout() {
  return async () => {
    localStorage.removeItem(SESSION_TOKEN_KEY)
    localStorage.removeItem('impersonating')
    await supabase.auth.signOut()
  }
}
