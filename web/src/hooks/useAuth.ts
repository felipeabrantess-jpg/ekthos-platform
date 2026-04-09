// Hook de autenticação — retorna user, churchId, role e loading
// churchId extraído do user_metadata após login
// role buscado em user_roles (migration 00008)

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { AppRole } from '@/hooks/useRole'

interface AuthState {
  user: User | null
  churchId: string | null
  role: AppRole | null
  loading: boolean
}

// Busca o role do usuário em user_roles.
// Usa `as any` porque user_roles é adicionado pela migration 00008
// e não estava no schema gerado.
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

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    churchId: null,
    role: null,
    loading: true,
  })

  useEffect(() => {
    // Verifica sessão atual
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const churchId = (session.user.user_metadata?.church_id as string) ?? null
        const role = churchId ? await fetchRole(session.user.id, churchId) : null
        setState({ user: session.user, churchId, role, loading: false })
      } else {
        setState({ user: null, churchId: null, role: null, loading: false })
      }
    })

    // Escuta mudanças de auth (login / logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const churchId = (session.user.user_metadata?.church_id as string) ?? null
        void fetchRole(session.user.id, churchId ?? '').then((role) => {
          setState({ user: session.user!, churchId, role, loading: false })
        })
      } else {
        setState({ user: null, churchId: null, role: null, loading: false })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  return state
}

// Hook de logout
export function useLogout() {
  return async () => {
    await supabase.auth.signOut()
  }
}
