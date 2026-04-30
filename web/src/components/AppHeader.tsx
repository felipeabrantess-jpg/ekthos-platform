import { useAuth } from '@/hooks/useAuth'
import NotificationBell from '@/features/notifications/components/NotificationBell'

export default function AppHeader() {
  const { user } = useAuth()

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email?.split('@')[0] ?? 'U'

  const userInitial = displayName.charAt(0).toUpperCase()

  return (
    <header
      className="hidden md:flex items-center justify-between px-6 h-14 shrink-0"
      style={{
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-default)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Futuro: breadcrumb */}
      <div />

      <div className="flex items-center gap-3">
        <NotificationBell />
        <div
          className="flex items-center justify-center rounded-full text-xs font-bold text-white shrink-0 select-none"
          style={{ width: 32, height: 32, background: 'var(--church-primary, #e13500)' }}
          title={displayName}
        >
          {userInitial}
        </div>
      </div>
    </header>
  )
}
