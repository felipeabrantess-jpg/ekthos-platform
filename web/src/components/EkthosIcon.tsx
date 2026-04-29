/**
 * EkthosIcon — 9 ícones Glass Outline exclusivos Ekthos Church
 * Estética: stroke outline fino, sem fill, aurora/glass translúcido
 */

interface IconProps {
  size?: number
  className?: string
  strokeWidth?: number
}

export type EkthosIconName =
  | 'pessoas'
  | 'discipulado'
  | 'eventos'
  | 'celulas'
  | 'voluntarios'
  | 'notificacoes'
  | 'qr-entrada'
  | 'mensageria-ia'
  | 'cockpit'

function Pessoas({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="7" r="3.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"/>
      <path d="M2 20c0-3.866 3.134-7 7-7s7 3.134 7 7" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="17.5" cy="8" r="2.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.6"/>
      <path d="M20 20c0-2.761-1.79-5.12-4.333-5.82" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.6"/>
    </svg>
  )
}

function Discipulado({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 3L12 9M12 3L9 6M12 3L15 6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth={strokeWidth}/>
      <path d="M5 17c0-2.761 3.134-5 7-5s7 2.239 7 5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.5"/>
      <path d="M2 21c0-1.657 2.239-3 5-3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.35"/>
      <path d="M22 21c0-1.657-2.239-3-5-3" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.35"/>
    </svg>
  )
}

function Eventos({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="5" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth={strokeWidth}/>
      <path d="M3 10h18" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.5"/>
      <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"/>
      <rect x="7" y="14" width="3" height="3" rx="0.5" stroke="currentColor" strokeWidth={strokeWidth} opacity="0.7"/>
      <rect x="14" y="14" width="3" height="3" rx="0.5" stroke="currentColor" strokeWidth={strokeWidth} opacity="0.4"/>
    </svg>
  )
}

function Celulas({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth={strokeWidth}/>
      <circle cx="5" cy="8" r="2" stroke="currentColor" strokeWidth={strokeWidth} opacity="0.7"/>
      <circle cx="19" cy="8" r="2" stroke="currentColor" strokeWidth={strokeWidth} opacity="0.7"/>
      <circle cx="5" cy="16" r="2" stroke="currentColor" strokeWidth={strokeWidth} opacity="0.5"/>
      <circle cx="19" cy="16" r="2" stroke="currentColor" strokeWidth={strokeWidth} opacity="0.5"/>
      <path d="M7 8.5L10 11M14 11L17 8.5M10 13L7 15.5M17 15.5L14 13" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.4"/>
    </svg>
  )
}

function Voluntarios({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M12 21C12 21 4 16.5 4 10.5C4 7.462 6.462 5 9.5 5C10.754 5 11.907 5.427 12.8 6.15C13.693 5.427 14.846 5 16.1 5C18.985 5 21.2 7.215 21.2 10.1" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 14l2 2 4-4" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
    </svg>
  )
}

function Notificacoes({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M6 10C6 7.791 7.791 6 10 6H14C16.209 6 18 7.791 18 10V16H6V10Z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round"/>
      <path d="M4 16H20" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"/>
      <path d="M10 19.5C10 20.328 10.896 21 12 21C13.104 21 14 20.328 14 19.5" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"/>
      <path d="M12 3V6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"/>
      <circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth={strokeWidth} fill="var(--color-primary)" opacity="0.8"/>
    </svg>
  )
}

function QrEntrada({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth={strokeWidth}/>
      <rect x="5" y="5" width="3" height="3" rx="0.5" stroke="currentColor" strokeWidth={strokeWidth} opacity="0.6"/>
      <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth={strokeWidth}/>
      <rect x="16" y="5" width="3" height="3" rx="0.5" stroke="currentColor" strokeWidth={strokeWidth} opacity="0.6"/>
      <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth={strokeWidth}/>
      <rect x="5" y="16" width="3" height="3" rx="0.5" stroke="currentColor" strokeWidth={strokeWidth} opacity="0.6"/>
      <path d="M14 14h3M17 14v3M14 17h3M17 17v3M14 20h3M20 14v7" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.7"/>
    </svg>
  )
}

function MensageriaIA({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M8 10h.01M12 10h.01M16 10h.01" stroke="currentColor" strokeWidth={strokeWidth * 1.5} strokeLinecap="round" opacity="0.5"/>
      <path d="M15 7l1.5-1.5M15 13l1.5 1.5M18 10h2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.4"/>
    </svg>
  )
}

function Cockpit({ size = 24, className = '', strokeWidth = 1.5 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={strokeWidth}/>
      <path d="M12 12L16 8" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round"/>
      <circle cx="12" cy="12" r="1.5" stroke="currentColor" strokeWidth={strokeWidth}/>
      <path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.4"/>
      <path d="M7.05 7.05l1.06 1.06M15.89 15.89l1.06 1.06M7.05 16.95l1.06-1.06" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" opacity="0.3"/>
    </svg>
  )
}

const ICON_MAP: Record<EkthosIconName, React.FC<IconProps>> = {
  'pessoas':       Pessoas,
  'discipulado':   Discipulado,
  'eventos':       Eventos,
  'celulas':       Celulas,
  'voluntarios':   Voluntarios,
  'notificacoes':  Notificacoes,
  'qr-entrada':    QrEntrada,
  'mensageria-ia': MensageriaIA,
  'cockpit':       Cockpit,
}

interface EkthosIconProps extends IconProps {
  name: EkthosIconName
}

export default function EkthosIcon({ name, size = 24, className = '', strokeWidth = 1.5 }: EkthosIconProps) {
  const Icon = ICON_MAP[name]
  if (!Icon) return null
  return <Icon size={size} className={className} strokeWidth={strokeWidth} />
}
