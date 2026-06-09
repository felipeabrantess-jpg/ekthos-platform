// ─────────────────────────────────────────────────────────────────────────────
// StageSelector — badge clicável para edição inline de people.person_stage
//
// Design:
//   Closed: [● Visitante ▾]  (badge colorido com dot + caret)
//   Open:   dropdown listbox com 6 opções, cada uma com dot colorido
//   Saving: spinner substituindo dot, badge desabilitado
//
// Tokens de cor por stage (em ordem de progressão):
//   visitante   → amarelo   (ponto de entrada)
//   contato     → sky       (interesse inicial)
//   frequentador→ azul      (presença regular)
//   consolidado → violeta   (compromisso)
//   discipulo   → verde     (discipulado ativo)
//   lider       → esmeralda (liderança)
//
// Acessibilidade: aria-expanded, aria-haspopup="listbox", role="option",
//   fecha com Escape, fecha ao clicar fora (pointerdown).
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useUpdatePersonStage, type PersonStageValue } from '../hooks/useUpdatePersonStage'
import type { PersonWithStage } from '@/lib/types/joins'

// ── Design tokens por stage ───────────────────────────────────────────────────

const STAGE_CONFIG: {
  value: PersonStageValue
  label: string
  badgeCls: string
  dotCls: string
}[] = [
  {
    value: 'visitante',
    label: 'Visitante',
    badgeCls: 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200',
    dotCls: 'bg-yellow-500',
  },
  {
    value: 'contato',
    label: 'Contato',
    badgeCls: 'bg-sky-100 text-sky-800 border-sky-200 hover:bg-sky-200',
    dotCls: 'bg-sky-500',
  },
  {
    value: 'frequentador',
    label: 'Frequentador',
    badgeCls: 'bg-blue-100 text-blue-800 border-blue-200 hover:bg-blue-200',
    dotCls: 'bg-blue-500',
  },
  {
    value: 'consolidado',
    label: 'Consolidado',
    badgeCls: 'bg-violet-100 text-violet-800 border-violet-200 hover:bg-violet-200',
    dotCls: 'bg-violet-500',
  },
  {
    value: 'discipulo',
    label: 'Discípulo',
    badgeCls: 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200',
    dotCls: 'bg-green-500',
  },
  {
    value: 'lider',
    label: 'Líder',
    badgeCls: 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200',
    dotCls: 'bg-emerald-500',
  },
]

function getConfig(value: string | null | undefined) {
  return STAGE_CONFIG.find((s) => s.value === value) ?? STAGE_CONFIG[0]
}

// ── Componente ────────────────────────────────────────────────────────────────

interface StageSelectorProps {
  person: PersonWithStage
}

export function StageSelector({ person }: StageSelectorProps) {
  const { churchId } = useAuth()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const mutation = useUpdatePersonStage()
  const current = getConfig(person.person_stage)

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  // Fecha com Escape
  useEffect(() => {
    if (!open) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open])

  function handleSelect(stage: PersonStageValue) {
    if (!churchId || stage === person.person_stage || mutation.isPending) return
    setOpen(false)
    mutation.mutate({ personId: person.id, churchId, stage })
  }

  return (
    <div ref={ref} className="relative inline-block">
      {/* Badge clicável */}
      <button
        type="button"
        aria-label={`Stage: ${current.label}. Clique para alterar`}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
        disabled={mutation.isPending}
        className={[
          'inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border transition-all select-none',
          current.badgeCls,
          mutation.isPending ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
        ].join(' ')}
      >
        {mutation.isPending ? (
          <Loader2 size={9} className="animate-spin shrink-0" />
        ) : (
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${current.dotCls}`} />
        )}
        <span>{current.label}</span>
        {!mutation.isPending && (
          <ChevronDown
            size={9}
            className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <ul
          role="listbox"
          aria-label="Selecionar stage"
          className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl border border-border-default shadow-lg py-1 min-w-[148px]"
        >
          {STAGE_CONFIG.map((s) => {
            const isSelected = s.value === person.person_stage
            return (
              <li key={s.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => handleSelect(s.value)}
                  className={[
                    'w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors',
                    isSelected
                      ? 'bg-bg-hover font-semibold text-text-primary'
                      : 'font-medium text-text-primary hover:bg-bg-hover',
                  ].join(' ')}
                >
                  <span className={`h-2 w-2 rounded-full shrink-0 ${s.dotCls}`} />
                  <span className="flex-1">{s.label}</span>
                  {isSelected && (
                    <span className="text-[10px] text-text-tertiary">✓</span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
