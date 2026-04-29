import { useState, useRef } from 'react'
import { Bell } from 'lucide-react'
import { useNotificationsContext } from '../context/NotificationsContext'
import NotificationPanel from './NotificationPanel'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)
  const { notifications, loading, unreadCount } = useNotificationsContext()

  return (
    <div ref={bellRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notificações${unreadCount > 0 ? ` — ${unreadCount} não lidas` : ''}`}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg transition-all"
        style={{
          background: open ? 'var(--bg-hover)' : 'transparent',
          color: open ? 'var(--color-primary)' : 'var(--text-secondary)',
        }}
        onMouseEnter={e => {
          if (!open) {
            e.currentTarget.style.background = 'var(--bg-hover)'
            e.currentTarget.style.color = 'var(--text-primary)'
          }
        }}
        onMouseLeave={e => {
          if (!open) {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }
        }}
      >
        <Bell size={18} strokeWidth={1.75} className={open ? 'animate-bell-ring' : ''} />

        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white leading-none"
            style={{ background: 'var(--color-primary)' }}
            aria-hidden="true"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <NotificationPanel
          notifications={notifications}
          loading={loading}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
