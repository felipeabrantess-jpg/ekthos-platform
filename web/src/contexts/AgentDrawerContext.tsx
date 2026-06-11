import { createContext, useContext, useState, type ReactNode } from 'react'

interface AgentDrawerContextValue {
  isOpen: boolean
  open:   () => void
  close:  () => void
  toggle: () => void
}

const AgentDrawerContext = createContext<AgentDrawerContextValue | null>(null)

export function AgentDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  return (
    <AgentDrawerContext.Provider value={{
      isOpen,
      open:   () => setIsOpen(true),
      close:  () => setIsOpen(false),
      toggle: () => setIsOpen(v => !v),
    }}>
      {children}
    </AgentDrawerContext.Provider>
  )
}

export function useAgentDrawer() {
  const ctx = useContext(AgentDrawerContext)
  if (!ctx) throw new Error('useAgentDrawer must be used within AgentDrawerProvider')
  return ctx
}
