// JourneyProvider — contexto único de jornada pastoral
//
// FASE 1: Provider criado mas NÃO montado em nenhuma tela ainda.
// Fase 2 vai ligar este provider no topo do layout e conectar
// Kanban, Consolidação e Pessoas como consumidores.
//
// ARMADILHA #39: dois channels com o mesmo nome derrubam o
// Supabase Realtime. UM provider no topo, três consumidores.
// NUNCA criar channel por tela.

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../../../lib/supabase'
import { createJourneyApi } from '../api/journeyApi'
import type { PersonJourney, JourneyEvent } from '../types/journey'
import { JourneyVersionConflictError } from '../types/journey'

interface JourneyContextValue {
  // Jornada ativa da pessoa em foco (null se não há pessoa selecionada)
  activeJourney: PersonJourney | null
  journeyEvents: JourneyEvent[]
  isLoading: boolean
  error: Error | null

  // Setters — chamados pelo consumidor para indicar pessoa em foco
  setFocusedPersonId: (personId: string | null) => void

  // API — os hooks consumidores chamam estas funções
  api: ReturnType<typeof createJourneyApi>

  // Flag: journey_unification está ativa para esta church?
  isJourneyEnabled: boolean
}

const JourneyContext = createContext<JourneyContextValue | null>(null)

interface JourneyProviderProps {
  churchId: string
  children: React.ReactNode
}

export function JourneyProvider({ churchId, children }: JourneyProviderProps) {
  const [focusedPersonId, setFocusedPersonIdState] = useState<string | null>(null)
  const [activeJourney, setActiveJourney] = useState<PersonJourney | null>(null)
  const [journeyEvents, setJourneyEvents] = useState<JourneyEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [isJourneyEnabled, setIsJourneyEnabled] = useState(false)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const api = React.useMemo(() => createJourneyApi(supabase), [])

  // Verificar feature flag ao montar
  useEffect(() => {
    supabase
      .from('church_feature_flags')
      .select('enabled')
      .eq('church_id', churchId)
      .eq('flag_key', 'journey_unification')
      .maybeSingle()
      .then(({ data }) => {
        setIsJourneyEnabled(data?.enabled ?? false)
      })
  }, [churchId])

  // Carregar jornada ativa quando muda a pessoa em foco
  useEffect(() => {
    if (!focusedPersonId || !isJourneyEnabled) {
      setActiveJourney(null)
      setJourneyEvents([])
      return
    }

    setIsLoading(true)
    setError(null)

    api.getActiveJourney(churchId, focusedPersonId)
      .then(journey => {
        setActiveJourney(journey)
        if (journey) {
          return api.getJourneyEvents(journey.id)
        }
        return []
      })
      .then(events => setJourneyEvents(events))
      .catch(err => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false))
  }, [focusedPersonId, churchId, isJourneyEnabled, api])

  // Realtime — um único channel por church (NUNCA por pessoa/tela)
  // Nomenclatura: 'journey:{churchId}' — única por church, nunca duplica
  useEffect(() => {
    if (!isJourneyEnabled) return

    // Limpar channel anterior se existir
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channel = supabase
      .channel(`journey:${churchId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'person_journey',
          filter: `church_id=eq.${churchId}`,
        },
        (payload) => {
          // Atualiza apenas a jornada da pessoa em foco
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const updated = payload.new as PersonJourney
            if (updated.person_id === focusedPersonId) {
              setActiveJourney(updated)
            }
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'journey_events',
          filter: `church_id=eq.${churchId}`,
        },
        (payload) => {
          const newEvent = payload.new as JourneyEvent
          if (activeJourney && newEvent.journey_id === activeJourney.id) {
            setJourneyEvents(prev => [...prev, newEvent])
          }
        },
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [churchId, isJourneyEnabled]) // focusedPersonId e activeJourney intencionalmente fora

  const setFocusedPersonId = useCallback((personId: string | null) => {
    setFocusedPersonIdState(personId)
  }, [])

  const value: JourneyContextValue = {
    activeJourney,
    journeyEvents,
    isLoading,
    error,
    setFocusedPersonId,
    api,
    isJourneyEnabled,
  }

  return (
    <JourneyContext.Provider value={value}>
      {children}
    </JourneyContext.Provider>
  )
}

export function useJourney(): JourneyContextValue {
  const ctx = useContext(JourneyContext)
  if (!ctx) {
    throw new Error('useJourney deve ser usado dentro de JourneyProvider')
  }
  return ctx
}

// Re-export do erro para consumidores tratarem conflitos
export { JourneyVersionConflictError }
