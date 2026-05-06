// web/src/pages/admin/agent-tabs/TabIdentidade.tsx
import type { useChurchAgentFullConfig } from '@/hooks/useChurchAgentConfig'

type Hook = ReturnType<typeof useChurchAgentFullConfig>

interface Props { hook: Hook }

function FieldGroup({ title }: { title: string }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3 mt-6 first:mt-0">{title}</h3>
}

function Field({
  label, children, hint,
}: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

const inputCls = 'w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e13500]/30 focus:border-[#e13500] transition-colors'

export function TabIdentidade({ hook }: Props) {
  const { formData, setFormData, saving, saveIdentidade, markDirty } = hook

  function update<K extends keyof typeof formData>(key: K, value: typeof formData[K]) {
    setFormData(prev => ({ ...prev, [key]: value }))
    markDirty('identidade')
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/[0.04]">
      <FieldGroup title="Igreja" />

      <Field label="Nome da Igreja">
        <input className={inputCls} value={formData.church_name}
          onChange={e => update('church_name', e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Cidade">
          <input className={inputCls} value={formData.church_city}
            onChange={e => update('church_city', e.target.value)} />
        </Field>
        <Field label="Estado (UF)">
          <input className={inputCls} maxLength={2} value={formData.church_state}
            onChange={e => update('church_state', e.target.value.toUpperCase())} />
        </Field>
      </div>

      <Field label="Região / Bairro">
        <input className={inputCls} value={formData.church_region}
          onChange={e => update('church_region', e.target.value)} />
      </Field>

      <Field label="Denominação">
        <input className={inputCls} placeholder="ex: Assembleia de Deus"
          value={formData.church_denomination}
          onChange={e => update('church_denomination', e.target.value)} />
      </Field>

      <Field label="Visão / Missão" hint="Até 500 caracteres">
        <textarea className={inputCls} rows={3} maxLength={500}
          value={formData.church_vision_statement}
          onChange={e => update('church_vision_statement', e.target.value)} />
      </Field>

      <Field label="Endereço Completo">
        <input className={inputCls} value={formData.church_address_full}
          onChange={e => update('church_address_full', e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Telefone Principal">
          <input className={inputCls} type="tel" value={formData.church_main_phone}
            onChange={e => update('church_main_phone', e.target.value)} />
        </Field>
        <Field label="Site">
          <input className={inputCls} type="url" placeholder="https://"
            value={formData.church_website_url}
            onChange={e => update('church_website_url', e.target.value)} />
        </Field>
      </div>

      <FieldGroup title="Pastor Titular" />

      <div className="grid grid-cols-2 gap-4">
        <Field label="Nome do Pastor Titular">
          <input className={inputCls} value={formData.church_pastor_titular_name}
            onChange={e => update('church_pastor_titular_name', e.target.value)} />
        </Field>
        <Field label="Telefone do Pastor (interno)">
          <input className={inputCls} type="tel" value={formData.church_pastor_titular_phone}
            onChange={e => update('church_pastor_titular_phone', e.target.value)} />
        </Field>
      </div>

      <FieldGroup title="Redes Sociais" />

      <div className="grid grid-cols-2 gap-4">
        <Field label="Instagram">
          <input className={inputCls} placeholder="@igrejax"
            value={formData.church_social_media_handles.instagram ?? ''}
            onChange={e => update('church_social_media_handles', {
              ...formData.church_social_media_handles, instagram: e.target.value,
            })} />
        </Field>
        <Field label="YouTube (channel ID)">
          <input className={inputCls} placeholder="UCxxxxx"
            value={formData.church_social_media_handles.youtube ?? ''}
            onChange={e => update('church_social_media_handles', {
              ...formData.church_social_media_handles, youtube: e.target.value,
            })} />
        </Field>
      </div>

      <FieldGroup title="Configurações do Agente (override)" />

      <Field label="Nome do Agente" hint="Como o agente se apresenta. Ex: 'Assistente da Igreja X'">
        <input className={inputCls} value={formData.agent_name}
          onChange={e => update('agent_name', e.target.value)} />
      </Field>

      <Field label="Nome do Pastor (mencionado pelo agente)"
        hint="Nome que o agente usa ao referenciar o pastor">
        <input className={inputCls} value={formData.pastor_name}
          onChange={e => update('pastor_name', e.target.value)} />
      </Field>

      <Field label="Nome Curto da Igreja (override)"
        hint="Substitui o nome completo em mensagens. Ex: 'AD Centro'">
        <input className={inputCls} value={formData.church_name_short}
          onChange={e => update('church_name_short', e.target.value)} />
      </Field>

      <div className="flex justify-end mt-6">
        <button
          onClick={saveIdentidade}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl bg-[#e13500] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#FF4D1A] transition-colors"
        >
          {saving ? 'Salvando...' : 'Salvar Identidade'}
        </button>
      </div>
    </div>
  )
}
