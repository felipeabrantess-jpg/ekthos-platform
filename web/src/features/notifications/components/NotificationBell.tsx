import { useState } from 'react'
import { Bell } from 'lucide-react'
import { useNotifications } from '../hooks/useNotifications'
import NotificationPanel from './NotificationPanel'
import { useAuth } from '@/hooks/useAuth'

export default function NotificationBell() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const { notifications, loading, unreadCount } = useNotifications(user?.id)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notificacoes${unreadCount > 0 ? ` - ${unreadCount} nao lidas` : ''}`}
        className={`relative p-1.5 rounded-lg transition-colors ${
          open
            ? 'bg-white/10 text-white'
            : 'text-white/40 hover:text-white/70 hover:bg-white/5'
        }`}
      >
        <Bell size={18} strokeWidth={1.75} className={open ? 'animate-bell-ring' : ''} />

        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold text-white leading-none"
            style={{ background: '#e13500' }}
            aria-hidden="true"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && user && (
        <NotificationPanel
          notifications={notifications}
          loading={loading}
          userId={user.id}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
