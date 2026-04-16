// ============================================================
// AuthProvider — contexto global de autenticação
//
// Por que Context e não hook simples?
// Cada componente que chamava useAuth() como hook puro criava
// sua própria instância: refreshSession() + onAuthStateChange.
// Com 4-5 instâncias simultâneas, chamadas concorrentes de
// refreshSession() causavam race condition de SIGNED_OUT.
//
// Com Context: UMA subscription, UM refreshSession, estado
// compartilhado por toda a árvore de componentes.
// ============================================================

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { AppRole } from '@/hooks/useRole'

const SESSION_TOKEN_KEY = 'ekthos_session_token'

// ── Tipos públicos ──────────────────────────────────────────

export interface AuthState {
  user: User | null
  churchId: string | null
  churchStatus: string | null
  role: AppRole | null
  isEkthosAdmin: boolean
  loading: boolean
}

// ── Context ─────────────────────────────────────────────────

const AuthContext = createContext<AuthState>({
  user: null,
  churchId: null,
  churchStatus: null,
  role: null,
  isEkthosAdmin: false,
  loading: true,
})

// ── Helpers (idênticos à lógica anterior) ───────────────────

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

async function resolveAuthFromUser(user: User): Promise<AuthState> {
  const isEkthosAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true

  const rawChurchId =
    ((user.app_metadata?.church_id ?? user.user_metadata?.church_id) as string | undefined) ?? null

  // Impersonação: apenas Ekthos admins
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

  // Status da igreja (suspended / cancelled → StatusGuard faz redirect)
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

// ── Provider ────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    churchId: null,
    churchStatus: null,
    role: null,
    isEkthosAdmin: false,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false

    // UMA ÚNICA chamada refreshSession por ciclo de vida do Provider.
    // refreshSession() força JWT novo — garante que raw_app_meta_data
    // atualizado via SQL apareça imediatamente no app_metadata.
    void supabase.auth.refreshSession().then(async ({ data: { session } }) => {
      if (cancelled) return

      if (session?.user) {
        const resolved = await resolveAuthFromUser(session.user)
        if (!cancelled) setState(resolved)
      } else {
        // Sem sessão via refresh — tenta getSession como fallback (offline, etc.)
        const { data: { session: fallback } } = await supabase.auth.getSession()
        if (cancelled) return
        if (fallback?.user) {
          const resolved = await resolveAuthFromUser(fallback.user)
          if (!cancelled) setState(resolved)
        } else {
          setState({ user: null, churchId: null, churchStatus: null, role: null, isEkthosAdmin: false, loading: false })
        }
      }
    })

    // UMA ÚNICA subscription onAuthStateChange para toda a árvore.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      if (session?.user) {
        void resolveAuthFromUser(session.user).then(resolved => {
          if (!cancelled) setState(resolved)
        })
      } else {
        setState({ user: null, churchId: null, churchStatus: null, role: null, isEkthosAdmin: false, loading: false })
      }
    })

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}

// ── Hook público ─────────────────────────────────────────────
// Todos os componentes lêem do mesmo Context — zero instâncias extras.

export function useAuth(): AuthState {
  return useContext(AuthContext)
}

// ── Hook de logout ───────────────────────────────────────────

export function useLogout() {
  return useCallback(async () => {
    localStorage.removeItem(SESSION_TOKEN_KEY)
    localStorage.removeItem('impersonating')
    await supabase.auth.signOut()
  }, [])
}
