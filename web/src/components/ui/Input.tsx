import { InputHTMLAttributes, forwardRef } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            block w-full rounded-xl px-3 py-3 text-base md:py-2.5 md:text-sm
            shadow-sm focus:outline-none transition-all duration-150
            disabled:opacity-50 disabled:cursor-not-allowed
            ${className}
          `}
          style={{
            background: 'var(--bg-surface)',
            border: `1.5px solid ${error ? 'var(--color-danger)' : 'var(--border-default)'}`,
            color: 'var(--text-primary)',
          } as React.CSSProperties}
          onFocus={e => {
            e.currentTarget.style.borderColor = error ? 'var(--color-danger)' : 'var(--border-focus)'
            e.currentTarget.style.boxShadow = `0 0 0 3px ${error ? 'rgba(162,45,45,0.12)' : 'rgba(41,182,255,0.12)'}`
          }}
          onBlur={e => {
            e.currentTarget.style.borderColor = error ? 'var(--color-danger)' : 'var(--border-default)'
            e.currentTarget.style.boxShadow = 'none'
          }}
          {...props}
        />
        {error && <p className="mt-1.5 text-xs font-medium" style={{ color: 'var(--color-danger)' }}>{error}</p>}
        {hint && !error && <p className="mt-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>{hint}</p>}
      </div>
    )
  }
)

Input.displayName = 'Input'
export default Input
