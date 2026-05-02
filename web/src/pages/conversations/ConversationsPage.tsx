// ============================================================
// ConversationsPage — Sprint 3C
// Rota: /conversas e /conversas/:id
//
// Layout 3 colunas:
//   [320px] ConversationList | [flex-1] ConversationThread | [280px] ConversationContext
//
// Mobile: apenas lista; ao selecionar, mostra thread fullscreen.
// ============================================================

import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ConversationList }    from './ConversationList'
import { ConversationThread }  from './ConversationThread'
import { ConversationContext } from './ConversationContext'

// ── Componente ─────────────────────────────────────────────

export default function ConversationsPage() {
  const { id }         = useParams<{ id?: string }>()
  const navigate       = useNavigate()
  const [selected, setSelected] = useState<string | null>(id ?? null)

  // Sincroniza URL ↔ estado
  useEffect(() => {
    setSelected(id ?? null)
  }, [id])

  function handleSelect(conversationId: string) {
    setSelected(conversationId)
    navigate(`/conversas/${conversationId}`, { replace: false })
  }

  function handleBack() {
    setSelected(null)
    navigate('/conversas', { replace: false })
  }

  return (
    <div className="flex h-full bg-[#f9eedc] overflow-hidden">

      {/* ── Coluna 1: Lista ─────────────────────────────── */}
      <div
        className={`w-[320px] shrink-0 h-full
          ${selected ? 'hidden md:flex md:flex-col' : 'flex flex-col w-full md:w-[320px]'}`}
      >
        <ConversationList
          selectedId={selected}
          onSelect={handleSelect}
        />
      </div>

      {/* ── Coluna 2: Thread ────────────────────────────── */}
      {selected && (
        <>
          <div className="flex-1 flex flex-col min-w-0 h-full">
            {/* Botão voltar — apenas mobile */}
            <div className="md:hidden bg-white border-b border-[#EDE0CC] px-3 py-2">
              <button
                onClick={handleBack}
                className="flex items-center gap-1.5 text-sm text-[#e13500] font-medium"
              >
                <ArrowLeft size={16} />
                Voltar
              </button>
            </div>

            <ConversationThread conversationId={selected} />
          </div>

          {/* ── Coluna 3: Contexto — apenas desktop ─────── */}
          <div className="hidden lg:flex lg:flex-col h-full">
            <ConversationContext conversationId={selected} />
          </div>
        </>
      )}

      {/* Placeholder quando nenhuma conversa selecionada em desktop */}
      {!selected && (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-[#f9eedc] gap-3">
          <div className="w-20 h-20 rounded-full bg-white border border-[#EDE0CC]
                          flex items-center justify-center shadow-sm">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.5" className="text-[#EDE0CC]">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[#5A5A5A]">Central de Conversas</p>
          <p className="text-xs text-[#8A8A8A]">Selecione uma conversa para iniciar</p>
        </div>
      )}
    </div>
  )
}
