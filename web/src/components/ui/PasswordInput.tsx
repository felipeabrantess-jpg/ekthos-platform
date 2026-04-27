import { useState, forwardRef, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

// ─────────────────────────────────────────────────────────────
// PasswordInput — wrapper reutilizável sobre <input type="password">
// com toggle de visibilidade (Eye / EyeOff).
//
// Aceita todas as props nativas de <input> (exceto `type`, que é
// gerenciado internamente). Expõe as mesmas props extras de Input.tsx:
// label, error, hint.
//
// Acessibilidade:
//   aria-label muda dinamicamente: "Mostrar senha" / "Ocultar senha"
// ─────────────────────────────────────────────────────────────

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
          <label className="block text-sm font-medium text-ekthos-black mb-1.5">
            {label}
          </label>
        )}

        <div className="relative">
          <input
            ref={ref}
            type={show ? 'text' : 'password'}
            className={`
              block w-full rounded-xl border px-3 py-2.5 text-sm pr-10
              placeholder-gray-400 bg-white shadow-sm
              focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600
              disabled:bg-cream disabled:text-gray-500
              ${error ? 'border-brand-600' : 'border-black/10'}
              ${className}
            `}
            {...props}
          />

          <button
            type="button"
            onClick={() => setShow(v => !v)}
            aria-label={show ? 'Ocultar senha' : 'Mostrar senha'}
            tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {error && <p className="mt-1.5 text-xs text-brand-600 font-medium">{error}</p>}
        {hint && !error && <p className="mt-1.5 text-xs text-gray-400">{hint}</p>}
      </div>
    )
  }
)

PasswordInput.displayName = 'PasswordInput'
export default PasswordInput
