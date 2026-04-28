import { Construction } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/Button'

interface EmConstrucaoProps {
  name: string
  previstoPara?: string
  features?: string[]
}

export default function EmConstrucao({ name, previstoPara, features = [] }: EmConstrucaoProps) {
  const navigate = useNavigate()

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-cream flex items-center justify-center mb-6">
        <Construction className="w-8 h-8 text-brand-600" />
      </div>

      <h1 className="font-display text-2xl font-bold text-ekthos-black mb-2">{name}</h1>
      <p className="text-gray-500 text-sm mb-1">Esta funcionalidade está em desenvolvimento.</p>

      {previstoPara && (
        <p className="text-sm text-brand-600 font-medium mb-6">
          Previsão: {previstoPara}
        </p>
      )}

      {features.length > 0 && (
        <ul className="text-left space-y-2 mb-8 max-w-xs w-full">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
              <span className="mt-0.5 w-4 h-4 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center shrink-0 text-xs font-bold">
                {i + 1}
              </span>
              {f}
            </li>
          ))}
        </ul>
      )}

      <Button variant="secondary" onClick={() => navigate('/dashboard')}>
        Voltar para o Painel
      </Button>
    </div>
  )
}
