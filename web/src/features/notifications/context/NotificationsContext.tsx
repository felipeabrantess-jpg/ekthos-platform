import { createContext, useContext, type ReactNode } from 'react'
import { useNotifications, type AppNotification } from '../hooks/useNotifications'
import { useAuth } from '@/hooks/useAuth'

interface NotificationsContextValue {
  notifications: AppNotification[]
  loading: boolean
  unreadCount: number
  refetch: () => void
}

const NotificationsContext = createContext<NotificationsContextValue>({
  notifications: [],
  loading: true,
  unreadCount: 0,
  refetch: () => {},
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
