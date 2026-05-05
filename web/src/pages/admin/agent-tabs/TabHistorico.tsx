// web/src/pages/admin/agent-tabs/TabHistorico.tsx
import { useEffect, useState } from 'react'
import { Clock, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { useChurchAgentConfig } from '@/hooks/useChurchAgentConfig'

type Hook = ReturnType<typeof useChurchAgentConfig>
interface Props { hook: Hook; churchId: string; agentSlug: string }

function relDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

export function TabHistorico({ hook, churchId, agentSlug }: Props) {
  const { fullConfig } = hook
  const [journeys, setJourneys] = useState<Array<Record<string, unknown>>>([])
  const [loadingJ, setLoadingJ] = useState(true)

  useEffect(() => {
    if (!churchId) return
    let cancelled = false
    supabase
      .from('reengagement_journey')
      .select('id,current_touchpoint,status,started_at,next_touchpoint_at,iteration,is_sensitive_case')
      .eq('church_id', churchId)
      .order('started_at', { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setJourneys(data ?? [])
        setLoadingJ(false)
      })
    return () => { cancelled = true }
  }, [churchId, agentSlug])

  const config = fullConfig?.config
  const followup = fullConfig?.followup

  return (
    <div className="space-y-4">
      {/* Metadata da última edição */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/[0.04]">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Última modificação</h3>
        <div className="space-y-2">
          {[
            { label: 'Config do agente', updated_at: config?.updated_at, updated_by: config?.updated_by },
            { label: 'Follow-up',        updated_at: followup?.updated_at, updated_by: followup?.updated_by },
          ].map(row => (
            <div key={row.label} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
              <span className="text-xs text-gray-500">{row.label}</span>
              <div className="flex items-center gap-3 text-xs text-gray-700">
                {row.updated_at && (
                  <span className="flex items-center gap-1 text-gray-500">
                    <Clock size={12} />
                    {relDate(row.updated_at)}
                  </span>
                )}
                {row.updated_by && (
                  <span className="flex items-center gap-1">
                    <User size={12} />
                    <code className="text-[10px] text-gray-400">{(row.updated_by as string).slice(0, 8)}…</code>
                  </span>
                )}
                {!row.updated_at && <span className="text-gray-400">—</span>}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Histórico detalhado de alterações disponível na Onda C (auditoria de admin events).
        </p>
      </div>

      {/* Journeys de reengajamento recentes */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/[0.04]">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">
          Jornadas de reengajamento recentes
        </h3>
        {loadingJ ? (
          <p className="text-xs text-gray-400">Carregando...</p>
        ) : journeys.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhuma jornada de reengajamento iniciada.</p>
        ) : (
          <div className="space-y-2">
            {journeys.map(j => (
              <div key={j.id as string}
                className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                <div>
                  <span className="text-xs font-medium text-gray-700">
                    {j.current_touchpoint as string}
                  </span>
                  {(j.is_sensitive_case as boolean) && (
                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-700">
                      Sensível
                    </span>
                  )}
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    Iteração {j.iteration as number} • iniciada {relDate(j.started_at as string)}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  j.status === 'completed' ? 'bg-green-50 text-green-700' :
                  j.status === 'pending'   ? 'bg-amber-50 text-amber-700' :
                  j.status === 'cancelled' ? 'bg-gray-100 text-gray-500' :
                  'bg-blue-50 text-blue-700'
                }`}>
                  {j.status as string}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
