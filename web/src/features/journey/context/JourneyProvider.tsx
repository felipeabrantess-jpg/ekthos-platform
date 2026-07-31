import { createContext, useContext, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface JourneyContextValue {
  churchId: string | null | undefined
}

const JourneyContext = createContext<JourneyContextValue | null>(null)

export function useJourneyContext() {
  const ctx = useContext(JourneyContext)
  if (!ctx) throw new Error('useJourneyContext must be used inside JourneyProvider')
  return ctx
}

interface Props {
  children: React.ReactNode
}

export function JourneyProvider({ children }: Props) {
  const { churchId } = useAuth()
  const queryClient  = useQueryClient()

  useEffect(() => {
    if (!churchId) return

    // Canal único por church — evita Armadilha #39 (canais duplicados)
    const channel = supabase
      .channel(`journey-queue:${churchId}`)
      .on(
        'postgres_changes' as any,
        { event: '*', schema: 'public', table: 'person_journey', filter: `church_id=eq.${churchId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['care-queue', churchId] })
        },
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [churchId, queryClient])

  return (
    <JourneyContext.Provider value={{ churchId }}>
      {children}
    </JourneyContext.Provider>
  )
}
