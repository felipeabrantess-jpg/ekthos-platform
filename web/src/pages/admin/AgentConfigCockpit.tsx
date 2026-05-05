// web/src/pages/admin/AgentConfigCockpit.tsx
import { useState, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Building2, MessageSquare, GitBranch,
  AlertTriangle, Radio, Zap, History, CheckCircle2, XCircle,
} from 'lucide-react'
import { useChurchAgentConfig } from '@/hooks/useChurchAgentConfig'
import Spinner from '@/components/ui/Spinner'
import { TabIdentidade }     from './agent-tabs/TabIdentidade'
import { TabPromptTom }      from './agent-tabs/TabPromptTom'
import { TabFollowup }       from './agent-tabs/TabFollowup'
import { TabEscalonamento }  from './agent-tabs/TabEscalonamento'
import { TabCanais }         from './agent-tabs/TabCanais'
import { TabTestes }         from './agent-tabs/TabTestes'
import { TabHistorico }      from './agent-tabs/TabHistorico'

const TABS = [
  { id: 'identidade',   label: 'Identidade',   icon: <Building2     size={14} /> },
  { id: 'prompt',       label: 'Prompt + Tom',  icon: <MessageSquare size={14} /> },
  { id: 'followup',     label: 'Follow-up',     icon: <GitBranch     size={14} /> },
  { id: 'escalamento',  label: 'Escalonamento', icon: <AlertTriangle size={14} /> },
  { id: 'canais',       label: 'Canais',        icon: <Radio         size={14} /> },
  { id: 'testes',       label: 'Testes',        icon: <Zap           size={14} /> },
  { id: 'historico',    label: 'Histórico',     icon: <History       size={14} /> },
]

export default function AgentConfigCockpit() {
  const { id: churchId = '', slug: agentSlug = '' } = useParams<{ id: string; slug: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('identidade')

  const hook = useChurchAgentConfig(churchId, agentSlug)
  const { loading, error, toast, dirtyTabs } = hook

  const handleTabChange = useCallback((tabId: string) => {
    if (dirtyTabs.has(activeTab)) {
      const ok = window.confirm('Você tem alterações não salvas nesta aba. Deseja descartá-las?')
      if (!ok) return
    }
    setActiveTab(tabId)
  }, [activeTab, dirtyTabs])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <XCircle size={32} className="mx-auto mb-3 text-red-500" />
        <p className="text-sm text-gray-600 mb-4">{error}</p>
        <button onClick={() => navigate(-1)} className="text-sm text-[#e13500] underline">
          Voltar
        </button>
      </div>
    )
  }

  const agentName = hook.fullConfig?.template_meta?.name ?? agentSlug
  const churchName = hook.church?.name as string ?? churchId

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg, #f9eedc)' }}>
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.ok
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {toast.ok
            ? <CheckCircle2 size={16} className="text-green-600" />
            : <XCircle size={16} className="text-red-600" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-black/[0.06] px-6 py-4">
        <div className="flex items-center gap-3 mb-1">
          <Link
            to={`/admin/churches/${churchId}`}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">{churchName}</p>
            <h1 className="text-lg font-semibold text-gray-900">{agentName}</h1>
          </div>
          {hook.fullConfig?.config?.active && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
              Ativo
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 ml-7">
          Configuração multi-tenant do agente • Cockpit Ekthos
        </p>
      </div>

      {/* Tab nav */}
      <div className="bg-white border-b border-black/[0.06]">
        <div className="flex overflow-x-auto px-6 gap-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-[#e13500] text-[#e13500] font-medium'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.icon}
              {tab.label}
              {dirtyTabs.has(tab.id) && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 ml-1" title="Alterações não salvas" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6 max-w-3xl">
        {activeTab === 'identidade'  && <TabIdentidade  hook={hook} />}
        {activeTab === 'prompt'      && <TabPromptTom   hook={hook} />}
        {activeTab === 'followup'    && <TabFollowup    hook={hook} />}
        {activeTab === 'escalamento' && <TabEscalonamento hook={hook} />}
        {activeTab === 'canais'      && <TabCanais      hook={hook} />}
        {activeTab === 'testes'      && <TabTestes      hook={hook} churchId={churchId} agentSlug={agentSlug} />}
        {activeTab === 'historico'   && <TabHistorico   hook={hook} churchId={churchId} agentSlug={agentSlug} />}
      </div>
    </div>
  )
}
