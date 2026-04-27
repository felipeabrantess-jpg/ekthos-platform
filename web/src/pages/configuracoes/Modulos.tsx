/**
 * Modulos.tsx — /configuracoes/modulos
 *
 * Visão geral dos módulos add-on disponíveis.
 * Todos bloqueados (placeholder Fase 4).
 * Links para /modulos/:id para detalhe de cada módulo.
 */

import { Link } from 'react-router-dom'
import { Lock, ChevronRight } from 'lucide-react'
import { MODULES_CONTENT } from '@/lib/modules-content'

export function Modulos() {
  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-lg font-semibold text-ekthos-black">Módulos</h2>
        <p className="text-sm text-ekthos-black/50 mt-1">
          Expanda o Ekthos com módulos especializados para sua Igreja.
        </p>
      </div>

      <div className="space-y-3">
        {MODULES_CONTENT.map(module => {
          const { Icon } = module
          return (
            <Link
              key={module.id}
              to={`/modulos/${module.id}`}
              className="group flex items-center gap-4 p-4 bg-white border border-cream-dark/60 rounded-2xl shadow-sm hover:shadow-md hover:border-brand-200 transition-all"
            >
              <div
                className="h-10 w-10 rounded-xl border flex items-center justify-center shrink-0"
                style={{ background: 'rgba(225,53,0,0.05)', borderColor: 'rgba(225,53,0,0.1)' }}
              >
                <Icon size={20} className="text-brand-500" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ekthos-black">{module.name}</span>
                  <Lock size={11} className="text-gray-400" strokeWidth={2} />
                </div>
                <p className="text-xs text-ekthos-black/50 mt-0.5 truncate">{module.tagline}</p>
                <p className="text-xs font-semibold text-brand-600 mt-1">{module.price}</p>
              </div>
              <ChevronRight
                size={16}
                className="text-ekthos-black/20 group-hover:text-brand-400 transition-colors shrink-0"
              />
            </Link>
          )
        })}
      </div>

      <p className="text-xs text-ekthos-black/30 text-center">
        Contratação de módulos via app chegará em breve.
        Fale com o time Ekthos para contratar.
      </p>
    </div>
  )
}
