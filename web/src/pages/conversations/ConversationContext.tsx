// ============================================================
// ConversationContext — Sprint 3C
// Coluna direita: dados da pessoa, info do canal, handoffs.
//
// Handoff buttons (Assumir / Devolver / Encerrar) aparecem aqui
// mas ficam DESABILITADOS no 3C — habilitados no Sprint 3D.
// ============================================================

import type { ReactNode } from 'react'
import {
  User, Phone, Bot, Calendar, Tag,
  UserCheck, XCircle, Archive,
} from 'lucide-react'
import { useConversations, type Conversation } from '@/hooks/useConversations'

// ── Helpers ────────────────────────────────────────────────

function formatDate(ts: string | null): string {
  if (!ts) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(ts))
  } catch { return '—' }
}

function OwnershipBadge({ c }: { c: Conversation }) {
  if (c.ownership === 'agent')  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600
                     bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
      <Bot size={11} /> IA
    </span>
  )
  if (c.ownership === 'human')  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700
                     bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
      <User size={11} /> {c.human_actor_name ?? 'Staff'}
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#8A8A8A]
                     bg-[#f9eedc] border border-[#EDE0CC] px-2 py-0.5 rounded-full">
      Sem atribuição
    </span>
  )
}

function StatusBadge({ status }: { status: Conversation['status'] }) {
  const map: Record<string, { label: string; className: string }> = {
    open:    { label: 'Aberta',    className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    pending: { label: 'Pendente',  className: 'text-amber-700 bg-amber-50 border-amber-200'       },
    closed:  { label: 'Encerrada', className: 'text-[#5A5A5A] bg-[#f9eedc] border-[#EDE0CC]'     },
  }
  const s = map[status] ?? map.closed
  return (
    <span className={`inline-flex items-center text-xs font-semibold border px-2 py-0.5 rounded-full ${s.className}`}>
      {s.label}
    </span>
  )
}

// ── Props ──────────────────────────────────────────────────

interface ConversationContextProps {
  conversationId: string | null
}

// ── Componente ─────────────────────────────────────────────

export function ConversationContext({ conversationId }: ConversationContextProps) {
  const { conversations } = useConversations()
  const conversation      = conversations.find(c => c.id === conversationId)

  if (!conversationId || !conversation) {
    return (
      <div className="w-[280px] bg-white border-l border-[#EDE0CC] flex flex-col items-center
                      justify-center gap-2 text-center px-6 shrink-0">
        <User size={32} className="text-[#EDE0CC]" />
        <p className="text-xs text-[#8A8A8A]">Selecione uma conversa para ver os detalhes</p>
      </div>
    )
  }

  const contactName = [conversation.person?.first_name, conversation.person?.last_name]
    .filter(Boolean).join(' ') || conversation.contact_phone

  return (
    <div className="w-[280px] bg-white border-l border-[#EDE0CC] flex flex-col shrink-0 overflow-y-auto">

      {/* ── Avatar + nome ─────────────────────────────── */}
      <div className="px-5 pt-5 pb-4 border-b border-[#EDE0CC] text-center">
        <div className="w-14 h-14 rounded-full bg-[#f9eedc] flex items-center justify-center
                        text-2xl font-semibold text-[#670000] mx-auto mb-2">
          {contactName.charAt(0).toUpperCase()}
        </div>
        <p className="font-semibold text-[#161616] text-sm">{contactName}</p>
        <p className="text-xs text-[#8A8A8A] mt-0.5">{conversation.contact_phone}</p>
        <div className="flex items-center justify-center gap-2 mt-2">
          <StatusBadge status={conversation.status} />
          <OwnershipBadge c={conversation} />
        </div>
      </div>

      {/* ── Detalhes ──────────────────────────────────── */}
      <div className="flex-1 px-4 py-4 space-y-5">

        {/* Conversa */}
        <section>
          <h3 className="text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wide mb-2">
            Conversa
          </h3>
          <div className="space-y-2">
            <InfoRow
              icon={<Calendar size={13} className="text-[#8A8A8A]" />}
              label="Última mensagem"
              value={formatDate(conversation.last_message_at)}
            />
            <InfoRow
              icon={<Tag size={13} className="text-[#8A8A8A]" />}
              label="Canal"
              value={conversation.channel?.provider_label ?? conversation.channel_type ?? 'WhatsApp'}
            />
            {conversation.channel?.phone_number && (
              <InfoRow
                icon={<Phone size={13} className="text-[#8A8A8A]" />}
                label="Número do canal"
                value={conversation.channel.phone_number}
              />
            )}
          </div>
        </section>

        {/* Tags */}
        <section>
          <h3 className="text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wide mb-2">
            Tags
          </h3>
          <div className="flex flex-wrap gap-1">
            <span className="text-xs text-[#8A8A8A] italic">Nenhuma tag</span>
          </div>
        </section>

        {/* Histórico de ownership */}
        {conversation.ownership === 'human' && conversation.human_actor_name && (
          <section>
            <h3 className="text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wide mb-2">
              Atribuição atual
            </h3>
            <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-50 border border-emerald-100">
              <UserCheck size={14} className="text-emerald-600 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-emerald-700">{conversation.human_actor_name}</p>
                <p className="text-[10px] text-emerald-600">Em atendimento</p>
              </div>
            </div>
          </section>
        )}

        {/* Ações de handoff — DESABILITADAS no 3C */}
        <section>
          <h3 className="text-[10px] font-semibold text-[#8A8A8A] uppercase tracking-wide mb-2">
            Ações
          </h3>
          <div className="space-y-2">
            {/* Assumir */}
            <HandoffButton
              icon={<UserCheck size={14} />}
              label="Assumir conversa"
              description="Você passa a responder"
              variant="emerald"
              disabled
            />
            {/* Devolver para IA */}
            <HandoffButton
              icon={<Bot size={14} />}
              label="Devolver para IA"
              description="IA retoma o atendimento"
              variant="blue"
              disabled
            />
            {/* Encerrar */}
            <HandoffButton
              icon={<XCircle size={14} />}
              label="Encerrar conversa"
              description="Marcar como resolvida"
              variant="gray"
              disabled
            />
            {/* Arquivar */}
            <HandoffButton
              icon={<Archive size={14} />}
              label="Arquivar"
              description="Remover da inbox"
              variant="gray"
              disabled
            />
          </div>
          <p className="text-[10px] text-[#8A8A8A] mt-2 text-center">
            Ações disponíveis no Sprint 3D
          </p>
        </section>
      </div>
    </div>
  )
}

// ── Sub-componentes ────────────────────────────────────────

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] text-[#8A8A8A]">{label}</p>
        <p className="text-xs font-medium text-[#161616] truncate">{value}</p>
      </div>
    </div>
  )
}

interface HandoffButtonProps {
  icon:        ReactNode
  label:       string
  description: string
  variant:     'emerald' | 'blue' | 'red' | 'gray'
  disabled:    boolean
  onClick?:    () => void
}

const variantMap: Record<string, { base: string; icon: string }> = {
  emerald: { base: 'border-emerald-200 bg-emerald-50 text-emerald-700', icon: 'text-emerald-500' },
  blue:    { base: 'border-blue-200 bg-blue-50 text-blue-700',          icon: 'text-blue-500'    },
  red:     { base: 'border-red-200 bg-red-50 text-[#e13500]',           icon: 'text-[#e13500]'   },
  gray:    { base: 'border-[#EDE0CC] bg-[#f9eedc] text-[#5A5A5A]',     icon: 'text-[#8A8A8A]'  },
}

function HandoffButton({ icon, label, description, variant, disabled, onClick }: HandoffButtonProps) {
  const v = variantMap[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left
                  transition-all text-xs font-medium ${v.base}
                  ${disabled ? 'opacity-40 cursor-not-allowed' : 'hover:brightness-95 active:brightness-90'}`}
    >
      <span className={`${v.icon} shrink-0`}>{icon}</span>
      <div className="min-w-0">
        <p className="font-semibold">{label}</p>
        <p className="text-[10px] opacity-70">{description}</p>
      </div>
    </button>
  )
}
