import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useMarkNotificationRead,
  useMarkAllRead,
  NOTIFICATION_STYLE,
  type AppNotification,
} from '../hooks/useNotifications'
import { useAuth } from '@/hooks/useAuth'

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (diff < 60)    return 'agora'
  if (diff < 3600)  return `${Math.floor(diff / 60)}min atrás`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`
  return `${Math.floor(diff / 86400)}d atrás`
}

function NotificationItem({ notification: n, onClose }: { notification: AppNotification; onClose: () => void }) {
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
      className="w-full text-left px-4 py-3 flex gap-3 transition-colors"
      style={{
        opacity: n.read ? 0.6 : 1,
        background: 'transparent',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div className="mt-1.5 shrink-0">
        <span className={`block h-2 w-2 rounded-full ${n.read ? '' : style.dot}`}
          style={n.read ? { background: 'var(--border-default)' } : undefined}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug" style={{ color: 'var(--text-primary)', fontWeight: n.read ? 400 : 600 }}>
          {n.title}
        </p>
        {n.body && (
          <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{n.body}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{timeAgo(n.created_at)}</span>
          {n.automation_name && (
            <>
              <span style={{ color: 'var(--border-default)' }}>·</span>
              <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{n.automation_name}</span>
            </>
          )}
        </div>
      </div>
    </button>
  )
}

interface NotificationPanelProps {
  notifications: AppNotification[]
  loading: boolean
  onClose: () => void
}

export default function NotificationPanel({ notifications, loading, onClose }: NotificationPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const { user } = useAuth()
  const markAll = useMarkAllRead()
  const hasUnread = notifications.some((n) => !n.read)

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [onClose])

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  return (
    <div
      ref={panelRef}
      className="absolute top-full right-0 z-50 w-80 rounded-xl overflow-hidden"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-lg)',
        maxHeight: '80vh',
        marginTop: 8,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-default)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Notificações</h3>
        {hasUnread && user && (
          <button
            type="button"
            onClick={() => markAll.mutate(user.id)}
            disabled={markAll.isPending}
            className="text-xs font-medium disabled:opacity-50 transition-colors"
            style={{ color: 'var(--color-primary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-primary-hover)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-primary)')}
          >
            Marcar todas como lidas
          </button>
        )}
      </div>

      {/* Lista */}
      <div
        className="overflow-y-auto divide-y"
        style={{ maxHeight: 'calc(80vh - 52px)', borderColor: 'var(--border-default)' }}
      >
        {loading ? (
          <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Carregando...
          </div>
        ) : notifications.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <div className="mx-auto mb-3 w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'var(--bg-hover)' }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                style={{ color: 'var(--text-tertiary)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Nenhuma notificação</p>
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
