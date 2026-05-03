/**
 * AtivacaoDetail.tsx — /admin/cockpit/ativacoes/:id
 *
 * Detalhe de uma ativação pendente.
 * Checklist visual + botões de ação (Iniciar setup, Ativar, Pausar, Cancelar).
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Clock, Wrench, CheckCircle2, XCircle,
  Pause, Zap, Bot, Building2, AlertCircle, Loader2,
  Check, Square, CheckSquare,
} from 'lucide-react'
import {
  usePendingActivations,
  useStartSetup,
  useActivateAgent,
  usePauseAgent,
  useCancelAgent,
} from '@/hooks/usePendingActivations'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const CHECKLIST = [
  'Confirmou pagamento Stripe na conta Ekthos',
  'Contatou pastor via WhatsApp ou e-mail',
  'Agendou call de configuração',
  'Conectou canal (WhatsApp da igreja ou webhook)',
  'Configurou tom pastoral em church_agent_config',
  'Smoke test enviado e validado pelo pastor',
  'Pastor confirmou que recebeu a primeira mensagem',
]

// ── Toast inline ─────────────────────────────────────────────────────────────

function Toast({ ok, msg, onClose }: { ok: boolean; msg: string; onClose: () => void }) {
  return (
    <div className={`flex items-start gap-3 p-4 rounded-2xl border ${ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
      {ok
        ? <Check size={15} className="text-green-600 mt-0.5 shrink-0" strokeWidth={2.5} />
        : <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" strokeWidth={2} />}
      <p className={`text-sm flex-1 ${ok ? 'text-green-800' : 'text-red-800'}`}>{msg}</p>
      <button onClick={onClose} className="text-xs opacity-40 hover:opacity-70">✕</button>
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function AtivacaoDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = usePendingActivations()

  const item = data?.find(d => d.sa_id === id)

  const startSetup    = useStartSetup()
  const activateAgent = useActivateAgent()
  const pauseAgent    = usePauseAgent()
  const cancelAgent   = useCancelAgent()

  const [notes, setNotes]       = useState('')
  const [checked, setChecked]   = useState<boolean[]>(CHECKLIST.map(() => false))
  const [toast, setToast]       = useState<{ ok: boolean; msg: string } | null>(null)

  const toggleCheck = (i: number) =>
    setChecked(prev => prev.map((v, idx) => idx === i ? !v : v))

  const runAction = async (fn: () => Promise<unknown>, successMsg: string) => {
    setToast(null)
    try {
      await fn()
      setToast({ ok: true, msg: successMsg })
    } catch (e: unknown) {
      const err = e instanceof Error ? e.message : 'Erro desconhecido'
      setToast({ ok: false, msg: err })
    }
  }

  // ── Loading / not found ───────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-ekthos-black/40">
        <Loader2 size={16} className="animate-spin mr-2" />
        Carregando...
      </div>
    )
  }

  if (!item) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-xs text-ekthos-black/40 hover:text-ekthos-black/70 mb-6">
          <ArrowLeft size={13} /> Ativações
        </button>
        <div className="bg-white border border-black/8 rounded-2xl p-8 text-center">
          <p className="text-sm text-ekthos-black/50">Ativação não encontrada.</p>
          <p className="text-xs text-ekthos-black/30 mt-1">Pode ter sido ativada ou cancelada.</p>
        </div>
      </div>
    )
  }

  const isPending = item.activation_status === 'pending_activation'
  const isInSetup = item.activation_status === 'in_setup'
  const isActive  = item.activation_status === 'active'

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <button
        onClick={() => navigate('/admin/cockpit/ativacoes')}
        className="flex items-center gap-1.5 text-xs text-ekthos-black/40 hover:text-ekthos-black/70 transition-colors"
      >
        <ArrowLeft size={13} strokeWidth={2} />
        Ativações
      </button>

      {/* Status header */}
      {isPending && (
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <Clock size={18} className="text-amber-600 shrink-0 mt-0.5" strokeWidth={2} />
          <div>
            <p className="text-sm font-semibold text-amber-900">Aguardando ativação</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Igreja pagou. Clique em "Iniciar setup" quando começar o processo.
            </p>
          </div>
        </div>
      )}

      {isInSetup && (
        <div className="flex items-start gap-3 p-4 bg-orange-50 border border-orange-200 rounded-2xl">
          <Wrench size={18} className="text-orange-600 shrink-0 mt-0.5" strokeWidth={2} />
          <div>
            <p className="text-sm font-semibold text-orange-900">Em setup</p>
            <p className="text-xs text-orange-700 mt-0.5">
              Setup iniciado. Complete o checklist e clique em "Ativar agente".
            </p>
          </div>
        </div>
      )}

      {isActive && (
        <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-2xl">
          <CheckCircle2 size={18} className="text-green-500 shrink-0 mt-0.5" strokeWidth={2} />
          <div>
            <p className="text-sm font-semibold text-green-900">Agente ativo</p>
            <p className="text-xs text-green-700 mt-0.5">Ativação concluída com sucesso.</p>
          </div>
        </div>
      )}

      {toast && (
        <Toast ok={toast.ok} msg={toast.msg} onClose={() => setToast(null)} />
      )}

      {/* Info Igreja + Agente */}
      <div className="bg-white border border-black/8 rounded-2xl overflow-hidden">
        <div className="p-5 border-b border-black/5">
          <p className="text-[11px] font-semibold text-ekthos-black/40 uppercase tracking-widest mb-3">Igreja</p>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
              <Building2 size={18} className="text-brand-600" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-base font-semibold text-ekthos-black">{item.church_name}</p>
              <p className="text-[11px] text-ekthos-black/40 font-mono">{item.church_id}</p>
            </div>
          </div>
        </div>

        <div className="p-5 border-b border-black/5">
          <p className="text-[11px] font-semibold text-ekthos-black/40 uppercase tracking-widest mb-3">Agente contratado</p>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
              <Bot size={18} className="text-brand-600" strokeWidth={1.75} />
            </div>
            <div>
              <p className="text-base font-semibold text-ekthos-black">
                {item.agent_name || item.agent_slug}
              </p>
              <p className="text-[11px] text-ekthos-black/40 font-mono">{item.agent_slug}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="p-3 bg-cream-light rounded-xl">
              <p className="text-[10px] font-semibold text-ekthos-black/40 uppercase tracking-widest">Comprado em</p>
              <p className="text-xs text-ekthos-black/70 mt-1">{formatDate(item.created_at)}</p>
            </div>
            <div className="p-3 bg-cream-light rounded-xl">
              <p className="text-[10px] font-semibold text-ekthos-black/40 uppercase tracking-widest">Pacote</p>
              <p className="text-xs text-ekthos-black/70 mt-1">{item.package_type ?? 'avulso'}</p>
            </div>
          </div>
        </div>

        {/* Checklist */}
        <div className="p-5 border-b border-black/5">
          <p className="text-[11px] font-semibold text-ekthos-black/40 uppercase tracking-widest mb-3">
            Checklist de ativação
          </p>
          <ul className="space-y-2.5">
            {CHECKLIST.map((item, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 cursor-pointer group"
                onClick={() => toggleCheck(i)}
              >
                {checked[i]
                  ? <CheckSquare size={16} className="text-green-500 shrink-0 mt-0.5" strokeWidth={2} />
                  : <Square size={16} className="text-ekthos-black/25 group-hover:text-ekthos-black/50 shrink-0 mt-0.5" strokeWidth={1.5} />}
                <span className={`text-sm leading-snug ${checked[i] ? 'line-through text-ekthos-black/35' : 'text-ekthos-black/70'}`}>
                  {item}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-ekthos-black/30 mt-3">
            {checked.filter(Boolean).length}/{CHECKLIST.length} itens concluídos — checklist visual apenas, não salvo no banco.
          </p>
        </div>

        {/* Notas */}
        <div className="p-5">
          <p className="text-[11px] font-semibold text-ekthos-black/40 uppercase tracking-widest mb-2">Notas internas</p>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Observações do setup, contato com o pastor, configurações especiais…"
            className="w-full text-sm text-ekthos-black placeholder:text-ekthos-black/25 bg-cream-light border border-black/8 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand-200 min-h-[80px]"
          />
        </div>
      </div>

      {/* Botões de ação */}
      <div className="flex flex-col gap-2.5">
        {isPending && (
          <button
            onClick={() => runAction(
              () => startSetup.mutateAsync({ saId: item.sa_id, notes: notes || undefined }),
              'Setup iniciado! Status atualizado para "Em setup".'
            )}
            disabled={startSetup.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-2xl transition-colors"
          >
            {startSetup.isPending
              ? <><Loader2 size={15} className="animate-spin" /> Salvando…</>
              : <><Wrench size={15} strokeWidth={2} /> Iniciar setup</>}
          </button>
        )}

        {isInSetup && (
          <button
            onClick={() => runAction(
              () => activateAgent.mutateAsync(item.sa_id),
              'Agente ativado com sucesso! Igreja pode começar a usar.'
            )}
            disabled={activateAgent.isPending}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-2xl transition-colors"
          >
            {activateAgent.isPending
              ? <><Loader2 size={15} className="animate-spin" /> Ativando…</>
              : <><Zap size={15} strokeWidth={2} /> Ativar agente</>}
          </button>
        )}

        {['pending_activation', 'in_setup', 'paused'].includes(item.activation_status) && (
          <div className="flex gap-2.5">
            <button
              onClick={() => runAction(
                () => pauseAgent.mutateAsync(item.sa_id),
                'Agente pausado.'
              )}
              disabled={pauseAgent.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 border border-black/12 hover:bg-black/5 disabled:opacity-50 text-ekthos-black/70 text-sm font-medium rounded-2xl transition-colors"
            >
              {pauseAgent.isPending
                ? <Loader2 size={14} className="animate-spin" />
                : <><Pause size={14} strokeWidth={2} /> Pausar</>}
            </button>
            <button
              onClick={() => runAction(
                () => cancelAgent.mutateAsync(item.sa_id),
                'Assinatura cancelada.'
              )}
              disabled={cancelAgent.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 border border-red-200 hover:bg-red-50 disabled:opacity-50 text-red-600 text-sm font-medium rounded-2xl transition-colors"
            >
              {cancelAgent.isPending
                ? <Loader2 size={14} className="animate-spin" />
                : <><XCircle size={14} strokeWidth={2} /> Cancelar</>}
            </button>
          </div>
        )}
      </div>

      {/* Metadata de auditoria */}
      {item.metadata && Object.keys(item.metadata).length > 0 && (
        <div className="bg-white border border-black/8 rounded-2xl p-5">
          <p className="text-[11px] font-semibold text-ekthos-black/40 uppercase tracking-widest mb-3">
            Histórico de ações
          </p>
          <pre className="text-[11px] text-ekthos-black/50 font-mono bg-cream-light rounded-xl p-3 overflow-auto">
            {JSON.stringify(item.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
