import { AlertCircle } from 'lucide-react'

interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

export default function ErrorState({ message = 'Algo deu errado.', onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-12 w-12 rounded-full bg-brand-50 flex items-center justify-center mb-4">
        <AlertCircle size={24} strokeWidth={1.5} className="text-brand-600" />
      </div>
      <p className="text-sm font-semibold text-ekthos-black">Erro ao carregar</p>
      <p className="text-sm text-gray-500 mt-1">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 text-sm text-brand-600 hover:text-brand-700 font-semibold transition-colors"
        >
          Tentar novamente
        </button>
      )}
    </div>
  )
}
