import { useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

const SESSION_TOKEN_KEY = 'ekthos_session_token'

export function useSessionToken() {
  const { user, churchId } = useAuth()

  const getStoredToken = useCallback((): string | null => {
    return localStorage.getItem(SESSION_TOKEN_KEY)
  }, [])

  const upsertToken = useCallback(async (): Promise<string | null> => {
    if (!churchId) return null
    try {
      const { data, error } = await supabase.rpc('upsert_session_token', {
        p_church_id: churchId,
      })
      if (error) throw error
      const token = data as string
      localStorage.setItem(SESSION_TOKEN_KEY, token)
      return token
    } catch (err) {
      console.error('[useSessionToken] upsert failed:', err)
      return null
    }
  }, [churchId])

  const validateToken = useCallback(async (): Promise<boolean> => {
    const token = getStoredToken()
    if (!token) return false
    try {
      const { data, error } = await supabase.rpc('validate_session_token', {
        p_token: token,
      })
      if (error) throw error
      return !!data
    } catch {
      return false
    }
  }, [getStoredToken])

  const clearToken = useCallback(() => {
    localStorage.removeItem(SESSION_TOKEN_KEY)
  }, [])

  // Validate token on window focus
  useEffect(() => {
    if (!user) return

    const handleFocus = async () => {
      const valid = await validateToken()
      if (!valid) {
        // Token invalid — another session replaced this one
        clearToken()
        await supabase.auth.signOut()
        window.location.href = '/login?reason=session_replaced'
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [user, validateToken, clearToken])

  return { upsertToken, validateToken, clearToken, getStoredToken }
}
