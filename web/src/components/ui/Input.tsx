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
          <label className="block text-sm font-medium text-ekthos-black mb-1.5">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`
            block w-full rounded-xl border px-3 py-2.5 text-sm
            placeholder-gray-400 bg-white shadow-sm
            focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600
            disabled:bg-cream disabled:text-gray-500
            ${error ? 'border-brand-600 focus:ring-brand-600 focus:border-brand-600' : 'border-black/10'}
            ${className}
          `}
          {...props}
        />
        {error && <p className="mt-1.5 text-xs text-brand-600 font-medium">{error}</p>}
        {hint && !error && <p className="mt-1.5 text-xs text-gray-400">{hint}</p>}
      </div>
    )
  }
)
Input.displayName = 'Input'
export default Input
