import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useMarkNotificationRead,
  useMarkAllRead,
  NOTIFICATION_STYLE,
  type AppNotification,
} from '../hooks/useNotifications'

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60)    return 'agora'
  if (diff < 3600)  return `${Math.floor(diff / 60)}min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`
  return `${Math.floor(diff / 86400)}d atrás`
}

// ──────────────────────────────────────────────────────────────────────
// NotificationItem
// ──────────────────────────────────────────────────────────────────────
interface NotificationItemProps {
  notification: AppNotification
  onClose: () => void
}

function NotificationItem({ notification: n, onClose }: NotificationItemProps) {
  const navigate = useNavigate()
  const markRead = useMarkNotificationRead()
  const style = NOTIFICATION_STYLE[n.type]

  async function handleClick() {
    if (!n.read) await markRead.mutateAsync(n.id)
    if (n.link) navigate(n.link)
    onClose()
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-gray-50 transition-colors ${
        n.read ? 'opacity-60' : ''
      }`}
    >
      {/* Dot indicador */}
      <div className="mt-1.5 shrink-0">
        <span className={`block h-2 w-2 rounded-full ${n.read ? 'bg-gray-200' : style.dot}`} />
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium text-gray-900 leading-snug ${n.read ? '' : 'font-semibold'}`}>
          {n.title}
        </p>
        {n.body && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-400">{timeAgo(n.created_at)}</span>
          {n.automation_name && (
            <>
              <span className="text-gray-200">·</span>
              <span className="text-xs text-gray-400">{n.automation_name}</span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

// ──────────────────────────────────────────────────────────────────────
// NotificationPanel
// ──────────────────────────────────────────────────────────────────────
interface NotificationPanelProps {
  notifications: AppNotification[]
  loading: boolean
  userId: string
  onClose: () => void
}

export default function NotificationPanel({
  notifications,
  loading,
  userId,
  onClose,
}: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const markAll = useMarkAllRead()
  const hasUnread = notifications.some((n) => !n.read)

  // Fecha ao clicar fora
  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [onClose])

  // Fecha com ESC
  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  async function handleMarkAll() {
    await markAll.mutateAsync(userId)
  }

  return (
    <div
      ref={panelRef}
      className="fixed left-60 top-0 z-50 w-80 bg-white border border-gray-100 shadow-xl rounded-xl overflow-hidden"
      style={{ maxHeight: '80vh' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Notificações</h3>
        {hasUnread && (
          <button
            type="button"
            onClick={handleMarkAll}
            disabled={markAll.isPending}
            className="text-xs text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
          >
            Marcar todas como lidas
          </button>
        )}
      </div>

      {/* Lista */}
      <div className="overflow-y-auto divide-y divide-gray-50" style={{ maxHeight: 'calc(80vh - 52px)' }}>
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-gray-400">Carregando...</div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <svg className="h-8 w-8 text-gray-200 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-sm text-gray-400">Nenhuma notificação</p>
          </div>
        ) : (
          notifications.map((n) => (
            <NotificationItem key={n.id} notification={n} onClose={onClose} />
          ))
        )}
      </div>
    </div>
  )
}
