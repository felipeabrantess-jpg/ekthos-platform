// web/src/pages/admin/agent-tabs/TabIdentidade.tsx
import { useNavigate } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import type { useChurchAgentFullConfig } from '@/hooks/useChurchAgentConfig'

type Hook = ReturnType<typeof useChurchAgentFullConfig>

interface Props { hook: Hook }

const inputCls = 'w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e13500]/30 focus:border-[#e13500] transition-colors'

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="mb-3">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">
        {value || <span className="text-gray-400 italic">—</span>}
      </p>
    </div>
  )
}

export function TabIdentidade({ hook }: Props) {
  const { formData, setFormData, saving, saveIdentidade, markDirty, church } = hook
  const navigate = useNavigate()

  const churchId = (church?.id as string) ?? ''
  const sm = (church?.social_media_handles as { instagram?: string; youtube?: string } | null) ?? {}

  function update<K extends keyof typeof formData>(key: K, value: typeof formData[K]) {
    setFormData(prev => ({ ...prev, [key]: value }))
    markDirty('identidade')
  }

  return (
    <div className="space-y-4">
      {/* Bloco read-only da Igreja */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/[0.04]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Dados da Igreja</h3>
          <button
            type="button"
            onClick={() => navigate(`/admin/churches/${churchId}?tab=cadastro`)}
            disabled={!churchId}
            className="flex items-center gap-1.5 text-xs text-[#e13500] hover:text-[#FF4D1A] font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <ExternalLink size={12} />
            Editar cadastro da Igreja
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-6">
          <ReadOnlyField label="Nome" value={church?.name as string} />
          <ReadOnlyField label="Denominação" value={church?.denomination as string} />
          <ReadOnlyField label="Cidade" value={church?.city as string} />
          <ReadOnlyField label="Estado" value={church?.state as string} />
          <ReadOnlyField label="Pastor Titular" value={church?.pastor_titular_name as string} />
          <ReadOnlyField label="Telefone do Pastor" value={church?.pastor_titular_phone as string} />
          <ReadOnlyField label="E-mail Principal" value={church?.main_email as string} />
          <ReadOnlyField label="Telefone Principal" value={church?.main_phone as string} />
        </div>

        <ReadOnlyField label="Visão / Missão" value={church?.vision_statement as string} />
        <ReadOnlyField label="Instagram" value={sm.instagram} />
      </div>

      {/* Overrides do Agente */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/[0.04]">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">
          Configurações do Agente (override)
        </h3>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Agente</label>
          <p className="text-xs text-gray-400 mb-1.5">Como o agente se apresenta. Ex: 'Assistente da Igreja X'</p>
          <input className={inputCls} value={formData.agent_name}
            onChange={e => update('agent_name', e.target.value)} />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome do Pastor (mencionado pelo agente)
          </label>
          <p className="text-xs text-gray-400 mb-1.5">Nome que o agente usa ao referenciar o pastor</p>
          <input className={inputCls} value={formData.pastor_name}
            onChange={e => update('pastor_name', e.target.value)} />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nome Curto da Igreja (override)
          </label>
          <p className="text-xs text-gray-400 mb-1.5">Substitui o nome completo em mensagens. Ex: 'AD Centro'</p>
          <input className={inputCls} value={formData.church_name_short}
            onChange={e => update('church_name_short', e.target.value)} />
        </div>

        <div className="flex justify-end mt-6">
          <button
            type="button"
            onClick={() => void saveIdentidade()}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-[#e13500] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#FF4D1A] transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar Overrides'}
          </button>
        </div>
      </div>
    </div>
  )
}
