// web/src/pages/admin/agent-tabs/TabEscalonamento.tsx
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { useChurchAgentFullConfig } from '@/hooks/useChurchAgentConfig'

type Hook = ReturnType<typeof useChurchAgentFullConfig>
interface Props { hook: Hook }

const inputCls = 'w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e13500]/30 focus:border-[#e13500] transition-colors'

export function TabEscalonamento({ hook }: Props) {
  const { formData, setFormData, saving, saveEscalonamento, markDirty } = hook
  const [kwInput, setKwInput] = useState('')

  function update<K extends keyof typeof formData>(key: K, value: typeof formData[K]) {
    setFormData(prev => ({ ...prev, [key]: value }))
    markDirty('escalamento')
  }

  function addKeyword() {
    const v = kwInput.trim().toLowerCase()
    if (v && !formData.escalation_keywords.includes(v)) {
      update('escalation_keywords', [...formData.escalation_keywords, v])
      setKwInput('')
    }
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/[0.04] space-y-6">

      {/* Ativar escalonamento */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
        <div>
          <p className="text-sm font-medium text-gray-800">Escalonamento ativo</p>
          <p className="text-xs text-gray-500">Notificar pastor/liderança em situações sensíveis</p>
        </div>
        <button
          onClick={() => update('escalation_enabled', !formData.escalation_enabled)}
          className={`w-12 h-6 rounded-full transition-colors relative ${
            formData.escalation_enabled ? 'bg-[#e13500]' : 'bg-gray-300'
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            formData.escalation_enabled ? 'translate-x-6' : ''
          }`} />
        </button>
      </div>

      {/* Sem resposta */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Escalonar após inatividade</h3>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">Sem resposta por</span>
          <input type="number" min={1} max={60} className={`${inputCls} w-20`}
            value={formData.escalation_on_no_response_days}
            onChange={e => update('escalation_on_no_response_days', e.target.value)} />
          <span className="text-sm text-gray-600">dias → notificar</span>
          <select className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#e13500]/30"
            value={formData.escalation_notify_role}
            onChange={e => update('escalation_notify_role', e.target.value)}>
            <option value="pastor">Pastor</option>
            <option value="lider">Líder de célula</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
      </div>

      {/* Flags */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Comportamento</h3>
        <div className="space-y-2">
          {[
            { key: 'escalation_pause_followup' as const, label: 'Pausar follow-up automático ao escalonar' },
            { key: 'escalation_sensitive_case_flag' as const, label: 'Marcar como caso sensível no CRM' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 cursor-pointer">
              <input type="checkbox" className="accent-[#e13500]"
                checked={formData[key]}
                onChange={e => update(key, e.target.checked)} />
              <span className="text-sm text-gray-700">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Palavras-chave sensíveis */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">Palavras-chave sensíveis</h3>
        <p className="text-xs text-gray-400 mb-3">
          Se detectadas na conversa, a mensagem é escalada para revisão humana imediata
        </p>
        <div className="flex flex-wrap gap-2 mb-2">
          {formData.escalation_keywords.map(kw => (
            <span key={kw} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-700 text-xs font-medium border border-red-200">
              {kw}
              <button onClick={() => update('escalation_keywords', formData.escalation_keywords.filter(x => x !== kw))}>
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input className={inputCls} placeholder="ex: suicídio, abuso, drogas"
            value={kwInput}
            onChange={e => setKwInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addKeyword())} />
          <button onClick={addKeyword}
            className="px-3 py-2 rounded-xl border border-gray-200 hover:border-[#e13500] transition-colors">
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={saveEscalonamento} disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-[#e13500] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#FF4D1A] transition-colors">
          {saving ? 'Salvando...' : 'Salvar Escalonamento'}
        </button>
      </div>
    </div>
  )
}
