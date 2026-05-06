/**
 * PromptCustomizadoSection — Seção de prompt customizado por igreja
 *
 * Exibida dentro de AtivacaoDetail.
 * Permite ao time Ekthos configurar as custom_instructions de church_agent_config
 * antes de ativar o agente para a igreja.
 *
 * PASSO 6: adicionado botão "Voltar ao padrão do agente" que zera
 * custom_instructions via RPC reset_church_agent_config.
 */

import { useState, useEffect } from 'react'
import { Sparkles, Save, Loader2, Check, AlertCircle, Clock, RotateCcw } from 'lucide-react'
import {
  useChurchAgentConfig,
  useUpsertChurchAgentConfig,
  useResetChurchAgentConfig,
} from '@/hooks/useChurchAgentConfig'

// ── Props ─────────────────────────────────────────────────────────────────────

interface PromptCustomizadoSectionProps {
  churchId:   string
  agentSlug:  string
  churchName: string
  /** Callback chamado após salvar ou resetar com sucesso — atualiza checklist */
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
  const reset  = useResetChurchAgentConfig()

  const [draft, setDraft]             = useState('')
  const [saved, setSaved]             = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [errMsg, setErrMsg]           = useState<string | null>(null)
  const [showResetModal, setShowResetModal] = useState(false)

  // Preenche o draft quando a config carrega
  useEffect(() => {
    if (config?.custom_instructions != null) {
      setDraft(config.custom_instructions ?? '')
    } else if (config !== undefined) {
      // Config carregada mas custom_instructions é null (reset ou vazio)
      setDraft('')
    }
  }, [config?.custom_instructions])

  const isDirty     = draft.trim() !== (config?.custom_instructions?.trim() ?? '')
  const isEmpty     = !draft.trim()
  const isConfigured = !!(config?.custom_instructions?.trim())

  // ── Salvar ────────────────────────────────────────────────────────────────

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

  // ── Reset ─────────────────────────────────────────────────────────────────

  const handleConfirmReset = async () => {
    setShowResetModal(false)
    setErrMsg(null)
    try {
      await reset.mutateAsync({ church_id: churchId, agent_slug: agentSlug })
      setDraft('')
      setResetSuccess(true)
      onSaved?.()
      setTimeout(() => setResetSuccess(false), 3000)
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : 'Erro ao resetar')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
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
            isConfigured
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

        {/* Textarea + botões */}
        {!isLoading && (
          <>
            <p className="text-[11px] text-ekthos-black/45 mb-2 leading-relaxed">
              Instruções pastorais específicas de <strong className="font-semibold">{churchName}</strong> para o agente.
              Serão incorporadas ao prompt final da Edge Function.
            </p>

            <textarea
              value={draft}
              onChange={e => { setDraft(e.target.value); setSaved(false); setResetSuccess(false); setErrMsg(null) }}
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

            {resetSuccess && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-green-600">
                <Check size={11} strokeWidth={2.5} />
                Voltou ao padrão. Agente usará prompt global.
              </div>
            )}

            {/* Botões */}
            <div className="flex items-center justify-between mt-2.5 gap-2">
              {/* Botão reset — visível apenas quando há custom_instructions salvo */}
              {isConfigured && (
                <button
                  onClick={() => setShowResetModal(true)}
                  disabled={reset.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-transparent border border-black/15 hover:border-red-300 hover:text-red-600 disabled:opacity-40 text-ekthos-black/50 text-xs font-medium rounded-xl transition-colors"
                >
                  {reset.isPending
                    ? <><Loader2 size={11} className="animate-spin" /> Resetando…</>
                    : <><RotateCcw size={11} strokeWidth={2} /> Voltar ao padrão do agente</>}
                </button>
              )}

              {/* Spacer quando reset não está visível */}
              {!isConfigured && <span />}

              {/* Botão salvar */}
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

      {/* Modal de confirmação de reset */}
      {showResetModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowResetModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-ekthos-black mb-2">
              Voltar ao padrão do agente?
            </h3>
            <p className="text-sm text-ekthos-black/60 leading-relaxed mb-5">
              Isso removerá as instruções customizadas desta igreja.
              O agente continuará usando o prompt padrão global.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 text-sm font-medium text-ekthos-black/60 bg-cream-light border border-black/10 rounded-xl hover:bg-cream-dark transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmReset}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors"
              >
                Voltar ao padrão
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
