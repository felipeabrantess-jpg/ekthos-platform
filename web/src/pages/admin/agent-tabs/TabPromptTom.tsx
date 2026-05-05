// web/src/pages/admin/agent-tabs/TabPromptTom.tsx
import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import type { useChurchAgentConfig } from '@/hooks/useChurchAgentConfig'

type Hook = ReturnType<typeof useChurchAgentConfig>
interface Props { hook: Hook }

const inputCls = 'w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e13500]/30 focus:border-[#e13500] transition-colors'

const selectCls = 'w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#e13500]/30 focus:border-[#e13500] transition-colors'

function RadioGroup({
  label, value, onChange, options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string; hint?: string }>
}) {
  return (
    <div className="mb-5">
      <p className="text-sm font-medium text-gray-700 mb-2">{label}</p>
      <div className="grid grid-cols-2 gap-2">
        {options.map(opt => (
          <label key={opt.value} className={`flex items-start gap-2 p-3 rounded-xl border cursor-pointer transition-colors ${
            value === opt.value
              ? 'border-[#e13500] bg-red-50'
              : 'border-gray-200 hover:border-gray-300'
          }`}>
            <input type="radio" value={opt.value} checked={value === opt.value}
              onChange={() => onChange(opt.value)} className="mt-0.5 accent-[#e13500]" />
            <div>
              <p className="text-sm font-medium text-gray-800">{opt.label}</p>
              {opt.hint && <p className="text-xs text-gray-500">{opt.hint}</p>}
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}

function TagInput({
  label, items, onAdd, onRemove, placeholder,
}: {
  label: string
  items: string[]
  onAdd: (v: string) => void
  onRemove: (v: string) => void
  placeholder?: string
}) {
  const [inputVal, setInputVal] = useState('')
  const add = () => {
    const v = inputVal.trim()
    if (v && !items.includes(v)) { onAdd(v); setInputVal('') }
  }
  return (
    <div className="mb-5">
      <p className="text-sm font-medium text-gray-700 mb-2">{label}</p>
      <div className="flex flex-wrap gap-2 mb-2">
        {items.map(item => (
          <span key={item} className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-gray-100 text-xs text-gray-700">
            {item}
            <button onClick={() => onRemove(item)}><X size={12} /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input className={inputCls} placeholder={placeholder} value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), add())} />
        <button onClick={add}
          className="px-3 py-2 rounded-xl border border-gray-200 hover:border-[#e13500] transition-colors">
          <Plus size={16} />
        </button>
      </div>
    </div>
  )
}

export function TabPromptTom({ hook }: Props) {
  const { formData, setFormData, saving, savePromptTom, markDirty } = hook

  function update<K extends keyof typeof formData>(key: K, value: typeof formData[K]) {
    setFormData(prev => ({ ...prev, [key]: value }))
    markDirty('prompt')
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/[0.04]">
      <RadioGroup
        label="Formalidade da linguagem"
        value={formData.formality}
        onChange={v => update('formality', v as typeof formData.formality)}
        options={[
          { value: 'formal',   label: 'Formal',   hint: 'Linguagem respeitosa e profissional' },
          { value: 'proximo',  label: 'Próximo',   hint: 'Amigável, mas com respeito' },
          { value: 'caloroso', label: 'Caloroso',  hint: 'Acolhedor e pastoral' },
          { value: 'casual',   label: 'Casual',    hint: 'Descontraído, como um amigo' },
        ]}
      />

      <RadioGroup
        label="Profundidade pastoral"
        value={formData.pastoral_depth}
        onChange={v => update('pastoral_depth', v as typeof formData.pastoral_depth)}
        options={[
          { value: 'reservado',    label: 'Reservado',    hint: 'Responde só o necessário' },
          { value: 'equilibrado',  label: 'Equilibrado',  hint: 'Tom moderado e acolhedor' },
          { value: 'pastoral',     label: 'Pastoral',     hint: 'Profundo e humanamente presente' },
        ]}
      />

      <RadioGroup
        label="Uso de emojis"
        value={formData.emoji_usage}
        onChange={v => update('emoji_usage', v as typeof formData.emoji_usage)}
        options={[
          { value: 'none',     label: 'Nenhum',    hint: 'Sem emojis nas mensagens' },
          { value: 'discrete', label: 'Discreto',  hint: '1-2 emojis por mensagem' },
          { value: 'free',     label: 'Livre',     hint: 'Uso natural de emojis' },
        ]}
      />

      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Primeiro contato após visita
        </label>
        <select className={selectCls} value={formData.first_contact_delay}
          onChange={e => update('first_contact_delay', e.target.value as typeof formData.first_contact_delay)}>
          <option value="">Não configurado</option>
          <option value="same_day">Mesmo dia</option>
          <option value="d1">Dia seguinte (D+1)</option>
          <option value="d2_d3">Em 2-3 dias</option>
        </select>
      </div>

      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Denominação (override do agente)
        </label>
        <input className={inputCls} placeholder="ex: Evangélica, Pentecostal..."
          value={formData.denomination_override}
          onChange={e => update('denomination_override', e.target.value)} />
        <p className="mt-1 text-xs text-gray-400">Sobrescreve a denominação da igreja para o tom do agente</p>
      </div>

      <TagInput
        label="Versículos preferidos"
        items={formData.preferred_verses}
        placeholder="ex: João 3:16"
        onAdd={v => update('preferred_verses', [...formData.preferred_verses, v])}
        onRemove={v => update('preferred_verses', formData.preferred_verses.filter(x => x !== v))}
      />

      <TagInput
        label="Tópicos proibidos"
        items={formData.forbidden_topics}
        placeholder="ex: política, conspiração"
        onAdd={v => update('forbidden_topics', [...formData.forbidden_topics, v])}
        onRemove={v => update('forbidden_topics', formData.forbidden_topics.filter(x => x !== v))}
      />

      <div className="mb-5">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Instruções personalizadas (prompt override)
        </label>
        <textarea
          className={inputCls}
          rows={6}
          placeholder="Instruções específicas que sobrescrevem ou complementam o prompt base. Use para customizações únicas desta igreja."
          value={formData.custom_instructions}
          onChange={e => update('custom_instructions', e.target.value)}
        />
        <p className="mt-1 text-xs text-gray-400">
          Escreva em linguagem natural. Será concatenado ao prompt base do agente.
        </p>
      </div>

      <div className="flex justify-end mt-6">
        <button onClick={savePromptTom} disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-[#e13500] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#FF4D1A] transition-colors">
          {saving ? 'Salvando...' : 'Salvar Prompt + Tom'}
        </button>
      </div>
    </div>
  )
}
