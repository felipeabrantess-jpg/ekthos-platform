// Janela lateral "Mais filtros" da tela Pessoas (28/10): fechada por padrão; nada daqui aparece na tela
// até ser aberta. Os números de cada etapa usam a mesma contagem do resto da tela (useStageFilterCounts).
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { RoleFilter } from '@/features/people/classification'

export interface MaisFiltros {
  stageKey: string
  source: string
  createdFrom: string
  createdTo: string
  role: RoleFilter | ''
}

interface Props {
  open: boolean
  onClose: () => void
  value: MaisFiltros
  onChange: (next: Partial<MaisFiltros>) => void
  stages: { stage_key: string; name: string }[]
  stageCounts: Record<string, number | undefined>
  roleLabels: Record<Exclude<RoleFilter, ''>, string>
}

const chip = (on: boolean) =>
  `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
    on ? 'border-primary text-primary-text bg-bg-hover' : 'border-border-default text-text-secondary bg-white hover:bg-bg-hover'
  }`
const select = 'w-full px-3 py-2 rounded-xl border border-border-default bg-white text-sm text-text-secondary'

export default function MaisFiltrosDrawer({ open, onClose, value, onChange, stages, stageCounts, roleLabels }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Mais filtros">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <aside data-testid="mais-filtros-janela" className="relative h-full w-full max-w-sm overflow-y-auto bg-white shadow-xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-text-primary">Mais filtros</h2>
          <button type="button" data-testid="mais-filtros-fechar" onClick={onClose} className="p-1.5 rounded-lg text-text-tertiary hover:bg-bg-hover" title="Fechar">
            <X size={18} />
          </button>
        </div>

        <section className="space-y-2">
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">Etapa</p>
          <div className="flex flex-wrap gap-2">
            {stages.map(s => (
              <button key={s.stage_key} type="button" data-testid={`etapa-${s.stage_key}`}
                className={chip(value.stageKey === s.stage_key)}
                style={value.stageKey === s.stage_key ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' } : {}}
                onClick={() => onChange({ stageKey: value.stageKey === s.stage_key ? '' : s.stage_key })}>
                {s.name}
                <span className="tabular-nums font-semibold">{stageCounts[s.stage_key] ?? '…'}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">Origem</p>
          <select value={value.source} onChange={e => onChange({ source: e.target.value })} className={select} data-testid="filtro-origem">
            <option value="">Todas as origens</option>
            <option value="qr_code">QR Code</option>
            <option value="manual">Manual</option>
            <option value="import_xlsx">Importação</option>
          </select>
        </section>

        <section className="space-y-2">
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">Data de cadastro</p>
          <div className="flex items-center gap-2">
            <input type="date" value={value.createdFrom} onChange={e => onChange({ createdFrom: e.target.value })} className={select} title="Cadastro — início" />
            <span className="text-text-tertiary text-xs">–</span>
            <input type="date" value={value.createdTo} onChange={e => onChange({ createdTo: e.target.value })} className={select} title="Cadastro — fim" />
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">Função</p>
          <select value={value.role} onChange={e => onChange({ role: e.target.value as RoleFilter | '' })} className={select} data-testid="funcao-filtro">
            <option value="">Todas</option>
            {(Object.keys(roleLabels) as Exclude<RoleFilter, ''>[]).map(k => <option key={k} value={k}>{roleLabels[k]}</option>)}
          </select>
        </section>
      </aside>
    </div>,
    document.body,
  )
}
