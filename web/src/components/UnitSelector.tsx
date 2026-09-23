import { MapPin } from 'lucide-react'
import { useUnit } from '@/contexts/UnitContext'
import { UNIT_ALL, UNIT_NONE } from '@/lib/filters/unitScope'

interface Props {
  compact?: boolean
}

/** Seletor global de unidade — única UI que altera o escopo de unidade da aplicação. */
export default function UnitSelector({ compact = false }: Props) {
  const { units, selectedUnit, setSelectedUnit, isLoading } = useUnit()

  if (isLoading || units.length === 0) return null

  return (
    <label className="inline-flex items-center gap-1.5" title="Escopo de unidade (vale para toda a aplicação)">
      <MapPin size={14} strokeWidth={1.75} style={{ color: 'var(--church-primary, var(--color-primary))' }} />
      {!compact && <span className="text-xs text-text-tertiary">Unidade</span>}
      <select
        value={selectedUnit}
        onChange={e => setSelectedUnit(e.target.value)}
        aria-label="Unidade"
        className="rounded-lg border border-border-default bg-bg-surface text-sm text-text-primary px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value={UNIT_ALL}>Todas as unidades</option>
        {units.map(u => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
        <option value={UNIT_NONE}>Sem unidade definida</option>
      </select>
    </label>
  )
}
