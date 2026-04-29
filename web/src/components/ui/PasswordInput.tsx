import { useState, forwardRef, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
  error?: string
  hint?:  string
}

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ label, error, hint, className = '', ...props }, ref) => {
    const [show, setShow] = useState(false)

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-primary)' }}>
            {label}
          </label>
        )}

        <div className="relative">
          <input
            ref={ref}
            type={show ? 'text' : 'password'}
            className={`
              block w-full rounded-xl px-3 py-2.5 text-sm pr-10 shadow-sm
              focus:outline-none transition-all duration-150
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

          <button
            type="button"
            onClick={() => setShow(v => !v)}
            aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
            tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {error && <p className="mt-1.5 text-xs font-medium" style={{ color: 'var(--color-danger)' }}>{error}</p>}
        {hint && !error && <p className="mt-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>{hint}</p>}
      </div>
    )
  }
)

PasswordInput.displayName = 'PasswordInput'
export default PasswordInput
