/**
 * MobileHeader.tsx
 *
 * Header fixo no topo para mobile (<md).
 * Desktop (md+): hidden — a sidebar lateral assume o papel de navegação.
 *
 * Layout:
 *  ┌────────────────────────────────────┐
 *  │ ☰  [Logo/nome da Igreja]  [Avatar] │  h-14
 *  └────────────────────────────────────┘
 */

import { Menu } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useChurch } from '@/hooks/useChurch'

interface MobileHeaderProps {
  onMenuClick: () => void
}

export default function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  const { user } = useAuth()
  const { data: church } = useChurch()

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name  as string | undefined) ??
    user?.email?.split('@')[0] ?? 'U'

  const userInitial = displayName.charAt(0).toUpperCase()

  return (
    <header
      className="md:hidden fixed top-0 left-0 right-0 z-30 h-14 flex items-center justify-between px-4 shrink-0"
      style={{ background: '#0f0f0f', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Hamburguer — 44x44 touch target */}
      <button
        onClick={onMenuClick}
        className="flex items-center justify-center rounded-xl transition-colors active:bg-white/10"
        style={{ width: 44, height: 44, color: 'rgba(255,255,255,0.7)' }}
        aria-label="Abrir menu"
      >
        <Menu size={22} strokeWidth={1.75} />
      </button>

      {/* Igreja logo + nome (centro) */}
      <div className="flex items-center gap-2 absolute left-1/2 -translate-x-1/2">
        {church?.logo_url ? (
          <img
            src={church.logo_url}
            alt={church.name ?? 'Igreja'}
            className="h-7 w-7 rounded-lg object-contain"
          />
        ) : (
          <div
            className="h-7 w-7 rounded-lg flex items-center justify-center font-display font-bold text-xs text-white shrink-0"
            style={{ background: 'var(--church-primary, #e13500)' }}
          >
            {(church?.name ?? 'E').charAt(0).toUpperCase()}
          </div>
        )}
        <span
          className="text-sm font-semibold truncate max-w-[140px]"
          style={{ color: 'rgba(255,255,255,0.85)' }}
        >
          {church?.name ?? 'Ekthos'}
        </span>
      </div>

      {/* Avatar do usuário */}
      <div
        className="flex items-center justify-center rounded-full text-xs font-bold text-white shrink-0"
        style={{
          width: 36, height: 36,
          background: 'var(--church-primary, #e13500)',
        }}
        title={displayName}
      >
        {userInitial}
      </div>
    </header>
  )
}
