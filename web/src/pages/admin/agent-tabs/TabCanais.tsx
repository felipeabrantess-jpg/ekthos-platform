// web/src/pages/admin/agent-tabs/TabCanais.tsx
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { Phone, Wifi } from 'lucide-react'
import type { useChurchAgentFullConfig } from '@/hooks/useChurchAgentConfig'

type Hook = ReturnType<typeof useChurchAgentFullConfig>
interface Props { hook: Hook }

interface Channel {
  id: string
  phone_number: string
  session_status: string
  provider_label: string | null
  context_type: string | null
}

export function TabCanais({ hook }: Props) {
  const churchId = hook.fullConfig?.church_id
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!churchId) return
    let cancelled = false
    supabase
      .from('church_whatsapp_channels')
      .select('id,phone_number,session_status,provider_label,context_type')
      .eq('church_id', churchId)
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setChannels(data ?? [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [churchId])

  if (loading) return <div className="p-8 text-center text-sm text-gray-400">Carregando canais...</div>

  if (channels.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 text-center border border-black/[0.04]">
        <Phone size={32} className="mx-auto mb-3 text-gray-300" />
        <p className="text-sm text-gray-500">Nenhum canal WhatsApp configurado para esta igreja.</p>
        <p className="text-xs text-gray-400 mt-1">O time Ekthos conecta o número manualmente.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/[0.04]">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Canais WhatsApp (read-only)</h3>
      <div className="space-y-3">
        {channels.map(ch => (
          <div key={ch.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50">
            <div className="flex items-center gap-3">
              <Wifi size={16} className="text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-800">{ch.phone_number}</p>
                <p className="text-xs text-gray-500">{ch.provider_label ?? ch.context_type ?? '—'}</p>
              </div>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              ch.session_status === 'open'
                ? 'bg-green-50 text-green-700'
                : 'bg-gray-100 text-gray-600'
            }`}>
              {ch.session_status === 'open' ? 'Conectado' : ch.session_status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
