import { useState } from 'react'
import { useNotifications } from '../hooks/useNotifications'
import NotificationPanel from './NotificationPanel'
import { useAuth } from '@/hooks/useAuth'

export default function NotificationBell() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const { notifications, loading, unreadCount } = useNotifications(user?.id)

  return (
    <div className="relative">
      {/* Botão sino */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notificações${unreadCount > 0 ? ` — ${unreadCount} não lidas` : ''}`}
        className={`relative p-1.5 rounded-lg transition-colors ${
          open
            ? 'bg-brand-50 text-brand-700'
            : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
        }`}
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>

        {/* Badge de não lidas */}
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none"
            aria-hidden="true"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Painel de notificações */}
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
