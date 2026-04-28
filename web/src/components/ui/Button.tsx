import { ButtonHTMLAttributes } from 'react'
import Spinner from './Spinner'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'wine'

const variants: Record<ButtonVariant, string> = {
  primary:   'bg-brand-600 text-white hover:bg-brand-500 focus:ring-brand-600 active:bg-brand-700',
  secondary: 'bg-white text-ekthos-black border border-black/10 hover:border-brand-600 hover:text-brand-600 focus:ring-brand-600',
  danger:    'bg-brand-600 text-white hover:bg-brand-500 focus:ring-brand-600',
  ghost:     'text-ekthos-black hover:text-brand-600 hover:bg-brand-50 focus:ring-brand-600',
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
