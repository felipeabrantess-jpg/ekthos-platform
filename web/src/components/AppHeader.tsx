import { useAuth } from '@/hooks/useAuth'
import ThemeToggle from './ThemeToggle'
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
      className="hidden md:flex items-center justify-end h-14 px-6 shrink-0"
      style={{
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-default)',
      }}
    >
      <div className="flex items-center gap-2">
        <ThemeToggle />
        <NotificationBell />
        <div
          className="ml-1 flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold text-white shrink-0"
          style={{ background: 'var(--color-primary)' }}
          title={displayName}
        >
          {userInitial}
        </div>
      </div>
    </header>
  )
}
