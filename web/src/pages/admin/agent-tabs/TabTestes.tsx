// web/src/pages/admin/agent-tabs/TabTestes.tsx
import { useState } from 'react'
import { Send, CheckCircle2, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { useChurchAgentConfig } from '@/hooks/useChurchAgentConfig'

type Hook = ReturnType<typeof useChurchAgentConfig>
interface Props { hook: Hook; churchId: string; agentSlug: string }

export function TabTestes({ churchId, agentSlug }: Props) {
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)

  const inputCls = 'w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e13500]/30 focus:border-[#e13500] transition-colors'

  async function sendTest() {
    if (!phone || !message) return
    setSending(true)
    setResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/test-whatsapp-message`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ church_id: churchId, agent_slug: agentSlug, to: phone, message }),
        }
      )
      const json = await res.json()
      setResult({ ok: json.ok ?? res.ok, msg: json.error ?? (json.ok ? 'Mensagem enviada com sucesso!' : 'Erro desconhecido') })
    } catch (e: unknown) {
      setResult({ ok: false, msg: (e as Error).message ?? 'Erro ao enviar' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/[0.04]">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Enviar mensagem de teste</h3>
      <p className="text-xs text-gray-500 mb-5">
        Envia uma mensagem de teste real via WhatsApp para validar o agente desta igreja.
        Use apenas números de membros da equipe.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Número destino</label>
          <input className={inputCls} type="tel" placeholder="+55 11 99999-9999"
            value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Mensagem</label>
          <textarea className={inputCls} rows={3}
            placeholder="Mensagem de teste..."
            value={message} onChange={e => setMessage(e.target.value)} />
        </div>
      </div>

      {result && (
        <div className={`flex items-center gap-2 mt-4 p-3 rounded-xl text-sm ${
          result.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {result.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
          {result.msg}
        </div>
      )}

      <div className="flex justify-end mt-6">
        <button
          onClick={sendTest}
          disabled={sending || !phone || !message}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#e13500] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#FF4D1A] transition-colors"
        >
          <Send size={15} />
          {sending ? 'Enviando...' : 'Enviar Teste'}
        </button>
      </div>
    </div>
  )
}
