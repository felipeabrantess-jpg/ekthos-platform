// Hook de autenticação — retorna user, churchId e loading
// churchId é extraído do metadata do usuário após login
// Em produção: church_id vem do perfil no banco

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

interface AuthState {
  user: User | null
  churchId: string | null
  loading: boolean
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null,
    churchId: null,
    loading: true,
  })

  useEffect(() => {
    // Verifica sessão atual
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        // church_id armazenado no user_metadata pelo onboarding
        const churchId = (session.user.user_metadata?.church_id as string) ?? null
        setState({ user: session.user, churchId, loading: false })
      } else {
        setState({ user: null, churchId: null, loading: false })
      }
    })

    // Escuta mudanças de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const churchId = (session.user.user_metadata?.church_id as string) ?? null
        setState({ user: session.user, churchId, loading: false })
      } else {
        setState({ user: null, churchId: null, loading: false })
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
