// Hook de autenticação — retorna user, churchId, churchStatus, role, isEkthosAdmin e loading
// churchId: app_metadata tem prioridade sobre user_metadata (segurança)
// isEkthosAdmin: lido de app_metadata OU user_metadata (fallback enquanto JWT não refresca)
// Impersonação: só disponível para isEkthosAdmin, lida de localStorage
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
  isEkthosAdmin: boolean
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
// Lê is_ekthos_admin de app_metadata (server-side) com fallback para user_metadata.
async function resolveAuthFromUser(user: User): Promise<AuthState> {
  // is_ekthos_admin: tenta app_metadata primeiro, depois user_metadata
  // (user_metadata como fallback cobre o período entre o UPDATE SQL e o refresh do JWT)
  const isEkthosAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true

  const rawChurchId =
    ((user.app_metadata?.church_id ?? user.user_metadata?.church_id) as string | undefined) ?? null

  // Impersonação: apenas Ekthos admins podem usar
  let impersonatedChurchId: string | null = null
  if (isEkthosAdmin) {
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

  return { user, churchId, churchStatus, role, isEkthosAdmin, loading: false }
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    churchId: null,
    churchStatus: null,
    role: null,
    isEkthosAdmin: false,
    loading: true,
  })

  useEffect(() => {
    // Verifica sessão atual.
    // refreshSession() força o Supabase a buscar um JWT novo, garantindo que
    // raw_app_meta_data atualizado via SQL já apareça no app_metadata do user.
    void supabase.auth.refreshSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const resolved = await resolveAuthFromUser(session.user)
        setState(resolved)
      } else {
        // Sem sessão ativa — tenta getSession como fallback (offline, etc.)
        const { data: { session: fallback } } = await supabase.auth.getSession()
        if (fallback?.user) {
          const resolved = await resolveAuthFromUser(fallback.user)
          setState(resolved)
        } else {
          setState({ user: null, churchId: null, churchStatus: null, role: null, isEkthosAdmin: false, loading: false })
        }
      }
    })

    // Escuta mudanças de auth (login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void resolveAuthFromUser(session.user).then(setState)
      } else {
        setState({ user: null, churchId: null, churchStatus: null, role: null, isEkthosAdmin: false, loading: false })
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
