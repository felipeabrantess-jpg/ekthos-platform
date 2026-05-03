/**
 * PromptCustomizadoSection — Seção de prompt customizado por igreja
 *
 * Exibida dentro de AtivacaoDetail.
 * Permite ao time Ekthos configurar as custom_instructions de church_agent_config
 * antes de ativar o agente para a igreja.
 */

import { useState, useEffect } from 'react'
import { Sparkles, Save, Loader2, Check, AlertCircle, Clock } from 'lucide-react'
import {
  useChurchAgentConfig,
  useUpsertChurchAgentConfig,
} from '@/hooks/useChurchAgentConfig'

// ── Props ─────────────────────────────────────────────────────────────────────

interface PromptCustomizadoSectionProps {
  churchId:   string
  agentSlug:  string
  churchName: string
  /** Callback chamado após salvar com sucesso — usado para atualizar checklist */
  onSaved?: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'agora mesmo'
  if (mins < 60) return `há ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `há ${hrs}h`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PromptCustomizadoSection({
  churchId,
  agentSlug,
  churchName,
  onSaved,
}: PromptCustomizadoSectionProps) {
  const { data: config, isLoading } = useChurchAgentConfig(churchId, agentSlug)
  const upsert = useUpsertChurchAgentConfig()

  const [draft, setDraft]   = useState('')
  const [saved, setSaved]   = useState(false)
  const [errMsg, setErrMsg] = useState<string | null>(null)

  // Preenche o draft quando a config carrega
  useEffect(() => {
    if (config?.custom_instructions != null) {
      setDraft(config.custom_instructions ?? '')
    }
  }, [config?.custom_instructions])

  const isDirty = draft.trim() !== (config?.custom_instructions?.trim() ?? '')
  const isEmpty = !draft.trim()

  const handleSave = async () => {
    setSaved(false)
    setErrMsg(null)
    try {
      await upsert.mutateAsync({
        church_id:           churchId,
        agent_slug:          agentSlug,
        custom_instructions: draft.trim(),
      })
      setSaved(true)
      onSaved?.()
      setTimeout(() => setSaved(false), 3000)
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : 'Erro desconhecido')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-5 border-b border-black/5">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] font-semibold text-ekthos-black/40 uppercase tracking-widest flex items-center gap-1.5">
            <Sparkles size={10} className="text-brand-500" />
            Prompt customizado
          </p>
          {config?.updated_at && (
            <p className="text-[10px] text-ekthos-black/30 mt-0.5 flex items-center gap-1">
              <Clock size={9} />
              Salvo {formatRelative(config.updated_at)}
            </p>
          )}
        </div>

        {/* Badge: configurado / não configurado */}
        {!isLoading && (
          config?.custom_instructions?.trim()
            ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 border border-green-200 shrink-0">
                <Check size={9} strokeWidth={3} /> Configurado
              </span>
            : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 border border-amber-200 shrink-0">
                Não configurado
              </span>
        )}
      </div>

      {/* Skeleton loading */}
      {isLoading && (
        <div className="space-y-2">
          <div className="h-3 w-3/4 rounded bg-cream-dark animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-cream-dark animate-pulse" />
        </div>
      )}

      {/* Textarea */}
      {!isLoading && (
        <>
          <p className="text-[11px] text-ekthos-black/45 mb-2 leading-relaxed">
            Instruções pastorais específicas de <strong className="font-semibold">{churchName}</strong> para o agente.
            Serão incorporadas ao prompt final da Edge Function.
          </p>

          <textarea
            value={draft}
            onChange={e => { setDraft(e.target.value); setSaved(false); setErrMsg(null) }}
            placeholder={`Ex: Esta é a ${churchName}. O tom deve ser acolhedor e usar linguagem evangélica tradicional. Evite gírias. Mencione o pastor Carlos quando falar em liderança…`}
            rows={5}
            className="w-full text-sm text-ekthos-black placeholder:text-ekthos-black/20 bg-cream-light border border-black/8 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand-200 leading-relaxed"
          />

          {/* Feedback inline */}
          {errMsg && (
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-red-600">
              <AlertCircle size={11} strokeWidth={2} />
              {errMsg}
            </div>
          )}

          {saved && (
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-green-600">
              <Check size={11} strokeWidth={2.5} />
              Prompt salvo com sucesso
            </div>
          )}

          {/* Botão salvar */}
          <div className="flex justify-end mt-2.5">
            <button
              onClick={handleSave}
              disabled={upsert.isPending || isEmpty || !isDirty}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white text-xs font-semibold rounded-xl transition-colors"
            >
              {upsert.isPending
                ? <><Loader2 size={12} className="animate-spin" /> Salvando…</>
                : <><Save size={12} strokeWidth={2.5} /> Salvar prompt</>}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
