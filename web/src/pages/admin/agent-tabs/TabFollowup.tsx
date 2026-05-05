// web/src/pages/admin/agent-tabs/TabFollowup.tsx
import { TOUCHPOINTS_ACOLHIMENTO, TOUCHPOINTS_REENGAJAMENTO } from '@/types/churchAgentConfig'
import type { useChurchAgentConfig } from '@/hooks/useChurchAgentConfig'

type Hook = ReturnType<typeof useChurchAgentConfig>
interface Props { hook: Hook }

const inputCls = 'rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e13500]/30 focus:border-[#e13500] transition-colors'

export function TabFollowup({ hook }: Props) {
  const { formData, setFormData, saving, saveFollowup, markDirty } = hook

  function update<K extends keyof typeof formData>(key: K, value: typeof formData[K]) {
    setFormData(prev => ({ ...prev, [key]: value }))
    markDirty('followup')
  }

  function toggleTouchpoint(tp: string) {
    const current = formData.enabled_touchpoints
    const next = current.includes(tp)
      ? current.filter(x => x !== tp)
      : [...current, tp]
    update('enabled_touchpoints', next)
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/[0.04] space-y-6">

      {/* Ativar/desativar */}
      <div className="flex items-center justify-between p-4 rounded-xl bg-gray-50 border border-gray-100">
        <div>
          <p className="text-sm font-medium text-gray-800">Follow-up ativo</p>
          <p className="text-xs text-gray-500">Enviar mensagens automáticas de acompanhamento</p>
        </div>
        <button
          onClick={() => update('followup_enabled', !formData.followup_enabled)}
          className={`w-12 h-6 rounded-full transition-colors relative ${
            formData.followup_enabled ? 'bg-[#e13500]' : 'bg-gray-300'
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            formData.followup_enabled ? 'translate-x-6' : ''
          }`} />
        </button>
      </div>

      {/* Touchpoints Acolhimento */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">
          Touchpoints — Acolhimento
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          Selecione quais mensagens serão enviadas na jornada de acolhimento
        </p>
        <div className="flex flex-wrap gap-2">
          {TOUCHPOINTS_ACOLHIMENTO.map(tp => (
            <button
              key={tp}
              onClick={() => toggleTouchpoint(tp)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                formData.enabled_touchpoints.includes(tp)
                  ? 'bg-[#e13500] text-white border-[#e13500]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-[#e13500]'
              }`}
            >
              {tp}
            </button>
          ))}
        </div>
      </div>

      {/* Touchpoints Reengajamento */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-1">
          Touchpoints — Reengajamento
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          Selecione quais mensagens serão enviadas para membros afastados
        </p>
        <div className="flex flex-wrap gap-2">
          {TOUCHPOINTS_REENGAJAMENTO.map(tp => (
            <button
              key={tp}
              onClick={() => toggleTouchpoint(tp)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                formData.enabled_touchpoints.includes(tp)
                  ? 'bg-[#670000] text-white border-[#670000]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-[#670000]'
              }`}
            >
              {tp}
            </button>
          ))}
        </div>
      </div>

      {/* Janela de envio */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Janela de envio</h3>
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Das</label>
            <input type="time" className={inputCls}
              value={formData.send_window_start}
              onChange={e => update('send_window_start', e.target.value)} />
          </div>
          <span className="text-gray-400 mt-5">até</span>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Às</label>
            <input type="time" className={inputCls}
              value={formData.send_window_end}
              onChange={e => update('send_window_end', e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Duração máxima (dias)</label>
            <input type="number" min={1} max={180} className={`${inputCls} w-24`}
              value={formData.duration_days}
              onChange={e => update('duration_days', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Condições de parada */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Condições de parada</h3>
        <div className="space-y-2">
          {[
            { key: 'stop_on_response' as const, label: 'Parar quando o membro responder' },
            { key: 'stop_on_attendance' as const, label: 'Parar quando o membro comparecer' },
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

      {/* Ação pós-conclusão */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Ação após conclusão da jornada
        </label>
        <select
          className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#e13500]/30 focus:border-[#e13500]"
          value={formData.next_action_after_completion}
          onChange={e => update('next_action_after_completion', e.target.value)}
        >
          <option value="">Nenhuma ação específica</option>
          <option value="notify_pastor">Notificar pastor</option>
          <option value="move_pipeline">Mover no pipeline</option>
          <option value="archive">Arquivar jornada</option>
        </select>
      </div>

      <div className="flex justify-end">
        <button onClick={saveFollowup} disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-[#e13500] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#FF4D1A] transition-colors">
          {saving ? 'Salvando...' : 'Salvar Follow-up'}
        </button>
      </div>
    </div>
  )
}
