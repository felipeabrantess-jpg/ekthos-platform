// ============================================================
// ModulosToggle — Toggle UI de Módulos do Cockpit (P3)
//
// Permite ao admin Ekthos habilitar/desabilitar módulos por
// igreja via enabled_modules jsonb na tabela churches.
//
// Regra: toggle ON  → admin-cockpit-sell (EF com auditoria)
//        toggle OFF → update direto via supabase client
//        coming_soon → toggle desabilitado, badge "Em breve"
// ============================================================

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

// ── Definição dos módulos ──────────────────────────────────

interface ModuloDef {
  key: string
  label: string
  description: string
  coming_soon?: boolean
}

const MODULOS: ModuloDef[] = [
  { key: 'pessoas',       label: 'Pessoas',        description: 'Cadastro e gestão de membros, visitantes e líderes.' },
  { key: 'aniversarios',  label: 'Aniversários',   description: 'Alertas e parabéns automáticos para a congregação.' },
  { key: 'pipeline',      label: 'Caminho',         description: 'Pipeline de discipulado — da visita à liderança.' },
  { key: 'celulas',       label: 'Células',         description: 'Gestão de grupos e células por liderança.' },
  { key: 'ministerios',   label: 'Ministérios',     description: 'Organização de equipes e departamentos ministeriais.' },
  { key: 'agenda',        label: 'Agenda',          description: 'Calendário de eventos, cultos e reuniões.' },
  { key: 'gabinete',      label: 'Gabinete',        description: 'Área restrita para comunicação confidencial.' },
  { key: 'voluntarios',   label: 'Voluntários',     description: 'Gestão de voluntários e confirmação de escalas.' },
  { key: 'escalas',       label: 'Escalas',         description: 'Escalas de serviço com notificação via WhatsApp.' },
  { key: 'financeiro',    label: 'Financeiro',      description: 'Registro de dízimos, ofertas e relatórios financeiros.' },
  // Pro — coming soon
  { key: 'patrimonio',    label: 'Patrimônio',      description: 'Controle de bens e imóveis da igreja.', coming_soon: true },
  { key: 'cursos',        label: 'Cursos',          description: 'Plataforma de ensino e capacitação ministerial.', coming_soon: true },
  { key: 'integrações',   label: 'Integrações',     description: 'Conexões com plataformas externas (ERP, planilhas etc.)', coming_soon: true },
]

// ── Props ──────────────────────────────────────────────────

interface ModulosToggleProps {
  churchId: string
  enabledModules: Record<string, boolean> | null
  onChanged?: (updated: Record<string, boolean>) => void
}

// ── Componente ─────────────────────────────────────────────

export default function ModulosToggle({ churchId, enabledModules, onChanged }: ModulosToggleProps) {
  const [local, setLocal] = useState<Record<string, boolean>>(enabledModules ?? {})
  const [loading, setLoading] = useState<string | null>(null) // key do módulo em loading
  const [error, setError]   = useState<string | null>(null)

  async function toggle(key: string, currentValue: boolean) {
    setLoading(key)
    setError(null)

    const newValue = !currentValue

    try {
      if (newValue) {
        // Ativar → via admin-cockpit-sell (com auditoria)
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        if (!token) throw new Error('Sessão expirada')

        const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-cockpit-sell`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            church_id: churchId,
            agents: [],
            modules: [key],
          }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
        }
      } else {
        // Desativar → update direto (cockpit pode escrever em enabled_modules)
        const updated = { ...local, [key]: false }
        const { error: dbErr } = await supabase
          .from('churches')
          .update({ enabled_modules: updated })
          .eq('id', churchId)
        if (dbErr) throw new Error(dbErr.message)

        // Audit trail: registra desativação do módulo (non-fatal)
        // admin_user_id é NOT NULL — só insere se sessão disponível
        await supabase.auth.getSession().then(({ data: { session: s } }) => {
          if (!s?.user?.id) return
          return supabase
            .from('admin_events')
            .insert({
              church_id: churchId,
              admin_user_id: s.user.id,
              actor_email: s.user.email ?? null,
              action: 'module_toggle_off',
              before: { [key]: true },
              after: { [key]: false },
              reason: `Módulo ${key} desativado via cockpit`,
              source: 'modulos-toggle',
            })
        }).catch(() => null) // non-fatal: auditoria não bloqueia o toggle
      }

      const next = { ...local, [key]: newValue }
      setLocal(next)
      onChanged?.(next)
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Erro desconhecido')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="font-display text-lg font-semibold text-gray-900">Módulos habilitados</h3>
        <p className="text-sm text-gray-500 mt-1">
          Gerencie quais módulos estão visíveis para esta igreja no CRM Ekthos.
        </p>
      </div>

      {/* Erro global */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Grid de módulos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {MODULOS.map(m => {
          const isOn      = !!local[m.key]
          const isLoading = loading === m.key
          const disabled  = m.coming_soon || isLoading

          return (
            <div
              key={m.key}
              className="flex items-center gap-4 bg-white rounded-2xl border border-black/5 shadow-sm p-4 transition-all"
              style={{ opacity: m.coming_soon ? 0.65 : 1 }}
            >
              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-semibold text-gray-800">{m.label}</span>
                  {m.coming_soon && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                      Em breve
                    </span>
                  )}
                  {!m.coming_soon && isOn && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                      Ativo
                    </span>
                  )}
                  {!m.coming_soon && !isOn && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                      Inativo
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 leading-relaxed">{m.description}</p>
              </div>

              {/* Toggle */}
              <button
                disabled={disabled}
                onClick={() => !disabled && void toggle(m.key, isOn)}
                aria-label={`${isOn ? 'Desativar' : 'Ativar'} ${m.label}`}
                className={[
                  'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent',
                  'transition-colors duration-200 ease-in-out focus:outline-none',
                  'disabled:cursor-not-allowed',
                  isOn && !m.coming_soon
                    ? 'bg-[#e13500]'
                    : m.coming_soon
                    ? 'bg-purple-300'
                    : 'bg-gray-200',
                ].join(' ')}
              >
                <span
                  className={[
                    'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow',
                    'transform transition duration-200 ease-in-out',
                    isLoading ? 'opacity-60' : '',
                    isOn ? 'translate-x-5' : 'translate-x-0',
                  ].join(' ')}
                />
              </button>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400">
        Módulos marcados como <strong>Em breve</strong> são funcionalidades em desenvolvimento e não podem ser ativados ainda.
      </p>
    </div>
  )
}
