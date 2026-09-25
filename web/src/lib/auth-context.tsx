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
//
// TENANT EFETIVO (ETAPA 2):
// A fonte de verdade do tenant atual é a RPC get_my_tenant_context(),
// calculada no banco a partir do JWT + impersonate_sessions. O frontend
// NUNCA decide o tenant: localStorage.impersonating é apenas um cache
// visual (banner) e um hint para headers de auditoria — alterá-lo não
// concede acesso, não muda o tenant nem inicia impersonação.
// ============================================================

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { supabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'
import type { AppRole } from '@/hooks/useRole'

const SESSION_TOKEN_KEY = 'ekthos_session_token'
const IMPERSONATING_CACHE_KEY = 'impersonating'

// ── Tipos públicos ──────────────────────────────────────────

export interface BrandingChurch {
  name: string
  logo_url: string | null
}

/** Estado de impersonação vindo do backend (impersonate_sessions). */
export interface ImpersonationState {
  session_id: string
  church_id: string
  church_name: string
  started_at: string | null
}

/** Retorno da RPC get_my_tenant_context() — calculado server-side. */
export interface TenantContext {
  user_id: string
  effective_church_id: string | null
  church_name: string | null
  church_status: string | null
  jwt_church_id: string | null
  is_impersonating: boolean
  impersonation_session_id: string | null
  impersonation_started_at: string | null
  role: AppRole | null
  is_ekthos_admin: boolean
}

export interface AuthState {
  user: User | null
  /** Sessão completa com access_token — necessário para decodificar claims JWT (ex: amr). */
  session: Session | null
  /** Tenant EFETIVO (igreja do JWT ou igreja impersonada, decidido no banco). */
  churchId: string | null
  churchStatus: string | null
  /** Role efetiva na igreja atual (durante impersonação válida o Ekthos admin opera como 'admin'). */
  role: AppRole | null
  /** Identidade de plataforma — não muda com impersonação. */
  isEkthosAdmin: boolean
  /** Sessão de impersonação ativa segundo o backend; null quando não impersonando. */
  impersonation: ImpersonationState | null
  loading: boolean
  /** Branding da igreja identificada pelo subdomínio — só para exibição na tela de login.
   *  NUNCA usar como church_id, NUNCA passar para queries de dados. */
  brandingChurch: BrandingChurch | null
  /** Recalcula o tenant a partir do backend (após iniciar/encerrar impersonação). */
  refreshTenant: () => Promise<void>
}

// ── Context ─────────────────────────────────────────────────

const EMPTY_STATE: Omit<AuthState, 'brandingChurch' | 'refreshTenant'> = {
  user: null,
  session: null,
  churchId: null,
  churchStatus: null,
  role: null,
  isEkthosAdmin: false,
  impersonation: null,
  loading: true,
}

const AuthContext = createContext<AuthState>({
  ...EMPTY_STATE,
  brandingChurch: null,
  refreshTenant: async () => {},
})

// ── Helpers ─────────────────────────────────────────────────

async function fetchTenantContext(): Promise<TenantContext | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_my_tenant_context') as {
      data: TenantContext | null
      error: { message: string } | null
    }
    if (error) {
      console.error('[auth] get_my_tenant_context falhou:', error.message)
      return null
    }
    return data ?? null
  } catch (err) {
    console.error('[auth] get_my_tenant_context erro:', err)
    return null
  }
}

/** Fallback (RPC indisponível): tenant do JWT, sem impersonação. */
async function fetchRoleFallback(userId: string, churchId: string): Promise<AppRole | null> {
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

function writeImpersonationCache(imp: ImpersonationState | null) {
  try {
    if (imp) {
      localStorage.setItem(IMPERSONATING_CACHE_KEY, JSON.stringify({
        church_id:   imp.church_id,
        church_name: imp.church_name,
        session_id:  imp.session_id,
      }))
    } else {
      localStorage.removeItem(IMPERSONATING_CACHE_KEY)
    }
  } catch { /* storage indisponível */ }
}

async function resolveAuthFromUser(
  user: User,
  session: Session,
): Promise<Omit<AuthState, 'brandingChurch' | 'refreshTenant'>> {
  const jwtIsEkthosAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    (user.app_metadata?.ekthos_roles as string[] | undefined)?.includes('ekthos_admin') === true ||
    user.user_metadata?.is_ekthos_admin === true

  const rawChurchId =
    ((user.app_metadata?.church_id ?? user.user_metadata?.church_id) as string | undefined) ?? null

  // ── Tenant efetivo: decidido no banco ──────────────────────
  const ctx = await fetchTenantContext()

  let churchId: string | null
  let churchStatus: string | null
  let role: AppRole | null
  let isEkthosAdmin: boolean
  let impersonation: ImpersonationState | null = null

  if (ctx) {
    churchId      = ctx.effective_church_id ?? null
    churchStatus  = ctx.church_status ?? null
    role          = ctx.role ?? null
    isEkthosAdmin = ctx.is_ekthos_admin || jwtIsEkthosAdmin
    if (ctx.is_impersonating && ctx.impersonation_session_id && ctx.effective_church_id) {
      impersonation = {
        session_id:  ctx.impersonation_session_id,
        church_id:   ctx.effective_church_id,
        church_name: ctx.church_name ?? '',
        started_at:  ctx.impersonation_started_at ?? null,
      }
    }
  } else {
    // RPC indisponível: comportamento de usuário comum (JWT), nunca impersonação
    churchId      = rawChurchId
    isEkthosAdmin = jwtIsEkthosAdmin
    churchStatus  = null
    if (churchId) {
      try {
        const { data } = await supabase
          .from('churches')
          .select('status')
          .eq('id', churchId)
          .maybeSingle()
        churchStatus = (data as { status: string } | null)?.status ?? null
      } catch { /* status null não bloqueia login */ }
    }
    role = churchId ? await fetchRoleFallback(user.id, churchId) : null
  }

  // Cache visual — reflete o backend, nunca o contrário
  writeImpersonationCache(impersonation)

  // Upsert session token — fire-and-forget, não bloqueia renderização
  if (churchId) {
    void supabase
      .rpc('upsert_session_token', { p_church_id: churchId })
      .then(
        ({ data }) => { if (data) localStorage.setItem(SESSION_TOKEN_KEY, data as string) },
        console.error,
      )
  }

  return { user, session, churchId, churchStatus, role, isEkthosAdmin, impersonation, loading: false }
}

// ── Provider ────────────────────────────────────────────────

// Slugs genéricos que NÃO representam uma igreja específica
const GENERIC_SLUGS = new Set(['localhost', 'www', 'app', 'ekthos-platform', ''])

function resolveSubdomainSlug(): string | null {
  const hostname = window.location.hostname
  // Sem ponto = hostname raiz (ex: "localhost", "vercel.app") — não é subdomínio
  if (!hostname.includes('.')) return null
  const candidate = hostname.split('.')[0]
  if (GENERIC_SLUGS.has(candidate)) return null
  return candidate
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<AuthState, 'brandingChurch' | 'refreshTenant'>>(EMPTY_STATE)
  const [brandingChurch, setBrandingChurch] = useState<BrandingChurch | null>(null)
  const mountedRef = useRef(true)

  // Resolução de branding por subdomínio — INDEPENDENTE do fluxo de auth.
  // Lê apenas churches_public (view com 4 campos). Nunca toca em church_id nem JWT.
  useEffect(() => {
    const slug = resolveSubdomainSlug()
    if (!slug) return

    void (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data } = await (supabase as any)
          .from('churches_public')
          .select('name, logo_url')
          .eq('slug', slug)
          .maybeSingle() as { data: BrandingChurch | null }
        setBrandingChurch(data ?? null)
      } catch {
        // Falha silenciosa — visual padrão do Ekthos
      }
    })()
  }, [])

  useEffect(() => {
    mountedRef.current = true
    let cancelled = false

    // UMA ÚNICA chamada refreshSession por ciclo de vida do Provider.
    // refreshSession() força JWT novo — garante que raw_app_meta_data
    // atualizado via SQL apareça imediatamente no app_metadata.
    void supabase.auth.refreshSession().then(async ({ data: { session } }) => {
      if (cancelled) return

      if (session?.user) {
        const resolved = await resolveAuthFromUser(session.user, session)
        if (!cancelled) setState(resolved)
      } else {
        // Sem sessão via refresh — tenta getSession como fallback (offline, etc.)
        const { data: { session: fallback } } = await supabase.auth.getSession()
        if (cancelled) return
        if (fallback?.user) {
          const resolved = await resolveAuthFromUser(fallback.user, fallback)
          if (!cancelled) setState(resolved)
        } else {
          setState({ ...EMPTY_STATE, loading: false })
        }
      }
    })

    // UMA ÚNICA subscription onAuthStateChange para toda a árvore.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return
      if (session?.user) {
        void resolveAuthFromUser(session.user, session).then(resolved => {
          if (!cancelled) setState(resolved)
        })
      } else {
        setState({ ...EMPTY_STATE, loading: false })
      }
    })

    return () => {
      cancelled = true
      mountedRef.current = false
      subscription.unsubscribe()
    }
  }, [])

  // Recalcula o tenant a partir do backend (após impersonation_start/end).
  const refreshTenant = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      if (mountedRef.current) setState({ ...EMPTY_STATE, loading: false })
      return
    }
    const resolved = await resolveAuthFromUser(session.user, session)
    if (mountedRef.current) setState(resolved)
  }, [])

  return (
    <AuthContext.Provider value={{ ...state, brandingChurch, refreshTenant }}>
      {children}
    </AuthContext.Provider>
  )
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
    localStorage.removeItem(IMPERSONATING_CACHE_KEY)
    await supabase.auth.signOut()
  }, [])
}

// ── Helper: headers de impersonation ─────────────────────────
// Retorna { 'x-impersonation-session-id': session_id } se admin está
// impersonando uma igreja. Spread este objeto em qualquer fetch para
// EFs que precisam auditar a ação com contexto de impersonation.
// É apenas um HINT de auditoria: o tenant efetivo é resolvido no banco.

export function getImpersonationHeaders(): Record<string, string> {
  try {
    const raw = localStorage.getItem(IMPERSONATING_CACHE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { church_id?: string; session_id?: string }
      if (parsed.session_id) {
        return { 'x-impersonation-session-id': parsed.session_id }
      }
    }
  } catch { /* ignore */ }
  return {}
}
