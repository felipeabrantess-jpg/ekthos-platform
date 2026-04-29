import { AlertCircle } from 'lucide-react'

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

export default function ErrorState({ message = 'Algo deu errado.', onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="h-12 w-12 rounded-full flex items-center justify-center mb-4"
        style={{ background: 'var(--color-danger-bg)' }}
      >
        <AlertCircle size={24} strokeWidth={1.5} style={{ color: 'var(--color-danger)' }} />
      </div>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Erro ao carregar</p>
      <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 text-sm font-semibold transition-colors"
          style={{ color: 'var(--color-primary)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-primary-hover)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-primary)')}
        >
          Tentar novamente
        </button>
      )}
    </div>
  )
}
