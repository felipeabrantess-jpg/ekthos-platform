type BadgeVariant =
  | 'visitante' | 'frequentador' | 'em-risco' | 'erro' | 'membro'
  | 'success' | 'warning' | 'danger' | 'info'
  | 'gray' | 'wine' | 'ekthos' | 'premium'
  // legados
  | 'blue' | 'green' | 'yellow' | 'red' | 'purple'

const variants: Record<BadgeVariant, React.CSSProperties> = {
  // Semânticos novos
  visitante:    { background: 'var(--badge-visitante-bg)',    color: 'var(--badge-visitante-text)' },
  frequentador: { background: 'var(--badge-frequentador-bg)', color: 'var(--badge-frequentador-text)' },
  'em-risco':   { background: 'var(--badge-em-risco-bg)',     color: 'var(--badge-em-risco-text)' },
  erro:         { background: 'var(--badge-erro-bg)',         color: 'var(--badge-erro-text)' },
  membro:       { background: 'var(--badge-membro-bg)',       color: 'var(--badge-membro-text)' },
  success:      { background: 'var(--color-success-bg)',      color: 'var(--color-success)' },
  warning:      { background: 'var(--color-warning-bg)',      color: 'var(--color-warning)' },
  danger:       { background: 'var(--color-danger-bg)',       color: 'var(--color-danger)' },
  info:         { background: 'var(--badge-visitante-bg)',    color: 'var(--badge-visitante-text)' },
  // Preservados (legados)
  gray:         { background: 'var(--bg-hover)',              color: 'var(--text-secondary)' },
  wine:         { background: '#F5E0E0',                      color: '#670000' },
  ekthos:       { background: 'var(--color-primary)',         color: '#ffffff' },
  premium:      { background: '#670000',                      color: '#F5E0E0' },
  blue:         { background: 'var(--badge-visitante-bg)',    color: 'var(--badge-visitante-text)' },
  green:        { background: 'var(--color-success-bg)',      color: 'var(--color-success)' },
  yellow:       { background: 'var(--color-warning-bg)',      color: 'var(--color-warning)' },
  red:          { background: 'var(--color-danger-bg)',       color: 'var(--color-danger)' },
  purple:       { background: '#EDE9FE',                      color: '#6D28D9' },
}

interface BadgeProps {
  label: string
  variant?: BadgeVariant
  className?: string
}

export default function Badge({ label, variant = 'gray', className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}
      style={variants[variant]}
    >
      {label}
    </span>
  )
}
