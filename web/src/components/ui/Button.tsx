import { ButtonHTMLAttributes } from 'react'
import Spinner from './Spinner'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'wine'

const variants: Record<ButtonVariant, string> = {
  primary:   'bg-primary text-white hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-dark)] focus:ring-primary',
  secondary: 'bg-bg-surface text-text-primary border border-border-default hover:border-primary hover:text-primary focus:ring-primary',
  danger:    'bg-[var(--color-danger)] text-white hover:opacity-90 focus:ring-[var(--color-danger)]',
  ghost:     'text-text-secondary hover:text-primary hover:bg-bg-hover focus:ring-primary',
  wine:      'bg-wine text-wine-bg hover:bg-wine-light focus:ring-wine border-0',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: React.ReactNode
}

const sizes = {
  sm: 'px-3 py-2 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center gap-2 rounded-xl font-semibold
        transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}
      `}
      {...props}
    >
      {loading && <Spinner size="sm" />}
      {children}
    </button>
  )
}
