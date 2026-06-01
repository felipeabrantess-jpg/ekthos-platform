import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { BarChart2, Trophy, TrendingDown, Users } from 'lucide-react'

export default function RelatorioEscalas() {
  const { churchId } = useAuth()
  const [period, setPeriod] = useState<30 | 60 | 90>(30)

  const { data: stats, isLoading } = useQuery({
    queryKey: ['volunteer-stats', churchId, period],
    queryFn: async () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - period)

      const { data, error } = await supabase.rpc('get_volunteer_attendance_stats', {
        p_church_id: churchId,
        p_start_date: start.toISOString().split('T')[0],
        p_end_date: end.toISOString().split('T')[0],
      })
      if (error) throw error
      return data ?? []
    },
    enabled: !!churchId,
  })

  const { data: topVols } = useQuery({
    queryKey: ['top-volunteers', churchId, period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_top_volunteers', {
        p_church_id: churchId,
        p_limit: 10,
        p_days_back: period,
      })
      if (error) throw error
      return data ?? []
    },
    enabled: !!churchId,
  })

  const totalVolunteers = stats?.length ?? 0
  const avgPresenca =
    stats && stats.length > 0
      ? Math.round(
          stats.reduce((s: number, v: { taxa_presenca: string | number }) => s + Number(v.taxa_presenca), 0) /
            stats.length
        )
      : 0
  const afastados = stats?.filter((v: { total_escalas: number }) => v.total_escalas === 0).length ?? 0

  return (
    <div className="min-h-screen bg-[#f9eedc] p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-['Playfair_Display'] text-3xl font-semibold text-[#161616] tracking-tight">
          Relatório de Voluntários
        </h1>
        <p className="text-[#5A5A5A] mt-1">Frequência, engajamento e serviço pastoral</p>
      </div>

      {/* Period Selector */}
      <div className="flex gap-2 mb-6">
        {([30, 60, 90] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              period === p
                ? 'bg-[#e13500] text-white'
                : 'bg-white text-[#5A5A5A] border border-gray-200 hover:border-[#e13500]'
            }`}
          >
            {p} dias
          </button>
        ))}
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-[#f9eedc] rounded-xl flex items-center justify-center">
              <Users size={20} className="text-[#e13500]" />
            </div>
            <span className="text-sm text-[#5A5A5A] font-medium uppercase tracking-wide">
              Voluntários Ativos
            </span>
          </div>
          <p className="font-mono text-3xl font-bold text-[#161616]">{totalVolunteers}</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-[#f9eedc] rounded-xl flex items-center justify-center">
              <BarChart2 size={20} className="text-[#e13500]" />
            </div>
            <span className="text-sm text-[#5A5A5A] font-medium uppercase tracking-wide">
              Presença Média
            </span>
          </div>
          <p className="font-mono text-3xl font-bold text-[#161616]">{avgPresenca}%</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-[#FDE8E0] rounded-xl flex items-center justify-center">
              <TrendingDown size={20} className="text-[#e13500]" />
            </div>
            <span className="text-sm text-[#5A5A5A] font-medium uppercase tracking-wide">
              Sem Escala no Período
            </span>
          </div>
          <p className="font-mono text-3xl font-bold text-[#e13500]">{afastados}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Voluntários */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={18} className="text-[#e13500]" />
            <h2 className="font-semibold text-[#161616]">Top Voluntários</h2>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 bg-[#f9eedc] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !topVols || topVols.length === 0 ? (
            <p className="text-[#8A8A8A] text-sm text-center py-8">
              Nenhum serviço registrado no período.
            </p>
          ) : (
            <div className="space-y-2">
              {topVols.slice(0, 8).map(
                (
                  vol: {
                    volunteer_id: string
                    person_name: string
                    ministry_name: string | null
                    total_servicos: number
                  },
                  idx: number
                ) => (
                  <div
                    key={vol.volunteer_id}
                    className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#f9eedc] transition-colors"
                  >
                    <span className="w-6 text-center font-mono text-sm font-bold text-[#8A8A8A]">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-[#161616] truncate">{vol.person_name}</p>
                      <p className="text-xs text-[#8A8A8A]">{vol.ministry_name ?? 'Sem ministério'}</p>
                    </div>
                    <span className="font-mono text-sm font-bold text-[#e13500]">
                      {vol.total_servicos}×
                    </span>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Lista de Frequência */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm">
          <h2 className="font-semibold text-[#161616] mb-4">Frequência por Voluntário</h2>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-10 bg-[#f9eedc] rounded-xl animate-pulse" />
              ))}
            </div>
          ) : !stats || stats.length === 0 ? (
            <p className="text-[#8A8A8A] text-sm text-center py-8">
              Dados insuficientes. Registre escalas para ver relatórios.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[#8A8A8A] text-xs uppercase tracking-wide border-b border-gray-100">
                    <th className="pb-2 font-medium">Voluntário</th>
                    <th className="pb-2 font-medium text-center">Total</th>
                    <th className="pb-2 font-medium text-center">Presença</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.slice(0, 10).map(
                    (vol: {
                      volunteer_id: string
                      person_name: string
                      total_escalas: number
                      taxa_presenca: string | number
                    }) => (
                      <tr
                        key={vol.volunteer_id}
                        className="border-b border-gray-50 last:border-0"
                      >
                        <td className="py-2">
                          <p className="font-medium text-[#161616] truncate max-w-[140px]">
                            {vol.person_name}
                          </p>
                        </td>
                        <td className="py-2 text-center font-mono text-[#5A5A5A]">
                          {vol.total_escalas}
                        </td>
                        <td className="py-2 text-center">
                          <span
                            className={`font-mono font-bold ${
                              Number(vol.taxa_presenca) >= 80
                                ? 'text-green-600'
                                : Number(vol.taxa_presenca) >= 50
                                ? 'text-amber-600'
                                : 'text-[#e13500]'
                            }`}
                          >
                            {vol.taxa_presenca}%
                          </span>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
