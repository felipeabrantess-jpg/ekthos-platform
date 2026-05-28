import { useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Bell } from 'lucide-react'
import { useNotificationsContext } from '../context/NotificationsContext'
import NotificationPanel from './NotificationPanel'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)
  const { notifications, loading, unreadCount } = useNotificationsContext()

  // Calcula posição do painel relativa ao viewport (necessário para position:fixed no portal).
  // Calculado no render com open=true — bellRef está montado e getBoundingClientRect() é fresco.
  function getPanelPosition() {
    if (!bellRef.current) return { top: 0, right: 8 }
    const rect = bellRef.current.getBoundingClientRect()
    return {
      top:   rect.bottom + 8,
      // Math.max garante margem mínima de 8px da borda direita em viewports estreitos
      right: Math.max(8, window.innerWidth - rect.right),
    }
  }

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

      {/* Portal → renderiza fora do AppHeader, escapando do stacking context
          criado por backdropFilter:blur(8px). Sem portal, z-50 fica preso
          dentro do contexto do header e aparece atrás dos cards do dashboard. */}
      {open && createPortal(
        <NotificationPanel
          notifications={notifications}
          loading={loading}
          onClose={() => setOpen(false)}
          position={getPanelPosition()}
        />,
        document.body
      )}
    </div>
  )
}
