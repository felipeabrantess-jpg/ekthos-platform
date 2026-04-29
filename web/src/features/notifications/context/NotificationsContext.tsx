import { createContext, useContext, type ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useNotifications, type AppNotification } from '../hooks/useNotifications'

interface NotificationsContextValue {
  notifications: AppNotification[]
  loading: boolean
  unreadCount: number
  refetch: () => Promise<void>
}

const NotificationsContext = createContext<NotificationsContextValue>({
  notifications: [],
  loading: false,
  unreadCount: 0,
  refetch: async () => {},
})

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const value = useNotifications(user?.id)

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotificationsContext(): NotificationsContextValue {
  return useContext(NotificationsContext)
}
