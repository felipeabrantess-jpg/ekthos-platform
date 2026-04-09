import { useEffect, useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ──────────────────────────────────────────────────────────────────────
// Tipos — notifications não está no Database type ainda (migration 00010)
// ──────────────────────────────────────────────────────────────────────
export type NotificationType = 'alert' | 'info' | 'warning' | 'success'

export interface AppNotification {
  id: string
  church_id: string
  user_id: string
  title: string
  body: string | null
  type: NotificationType
  read: boolean
  link: string | null
  automation_name: string | null
  person_id: string | null
  created_at: string
}

// ──────────────────────────────────────────────────────────────────────
// Hook principal — lista + Realtime
// ──────────────────────────────────────────────────────────────────────
export function useNotifications(userId: string | null | undefined) {
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch inicial
  const fetchAll = useCallback(async () => {
    if (!userId) { setLoading(false); return }
    setLoading(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30) as { data: AppNotification[] | null; error: { message: string } | null }

      if (!error && data) setNotifications(data)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  // Realtime: adiciona nova notificação no topo sem refetch total
  useEffect(() => {
    if (!userId) return

    const channel = supabase
      .channel(`notifications:${userId}`)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any, {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload: { new: AppNotification }) => {
        setNotifications((prev) => [payload.new, ...prev].slice(0, 30))
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on('postgres_changes' as any, {
        event: 'UPDATE',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload: { new: AppNotification }) => {
        setNotifications((prev) =>
          prev.map((n) => (n.id === payload.new.id ? payload.new : n))
        )
      })
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [userId])

  const unreadCount = notifications.filter((n) => !n.read).length

  return { notifications, loading, unreadCount, refetch: fetchAll }
}

// ──────────────────────────────────────────────────────────────────────
// Mutation: marcar uma notificação como lida
// ──────────────────────────────────────────────────────────────────────
export function useMarkNotificationRead() {
  return useMutation({
    mutationFn: async (notificationId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)
      if (error) throw new Error(error.message)
    },
  })
}

// ──────────────────────────────────────────────────────────────────────
// Mutation: marcar todas como lidas
// ──────────────────────────────────────────────────────────────────────
export function useMarkAllRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (userId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ read: true })
        .eq('user_id', userId)
        .eq('read', false)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

// ──────────────────────────────────────────────────────────────────────
// Helper: ícone e cor por tipo
// ──────────────────────────────────────────────────────────────────────
export const NOTIFICATION_STYLE: Record<
  NotificationType,
  { dot: string; icon: string }
> = {
  success: { dot: 'bg-green-500', icon: 'text-green-600' },
  info:    { dot: 'bg-blue-500',  icon: 'text-blue-600'  },
  warning: { dot: 'bg-amber-500', icon: 'text-amber-600' },
  alert:   { dot: 'bg-red-500',   icon: 'text-red-600'   },
}
