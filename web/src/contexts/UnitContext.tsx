/**
 * UnitContext — escopo global de unidade da aplicação.
 *
 * Fonte de verdade da seleção: URL `?unidade=all|none|<uuid>`.
 * Fallback quando a URL não traz o parâmetro: localStorage por igreja.
 * A seleção persiste entre rotas (o provider reinsere o parâmetro ao navegar).
 *
 * Telas NÃO devem manter useState próprio de unidade — consumir `useUnit()`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useChurchUnits, type ChurchUnit } from '@/features/people/hooks/useChurchUnits'
import {
  UNIT_ALL, UNIT_PARAM, parseUnitScope, unitStorageKey, type UnitScope,
} from '@/lib/filters/unitScope'

interface UnitContextValue {
  churchId: string | null
  /** 'all' | 'none' | uuid — sempre um valor explícito. */
  selectedUnit: UnitScope
  setSelectedUnit: (scope: UnitScope) => void
  units: ChurchUnit[]
  /** Unidade selecionada (objeto) quando o escopo é um uuid. */
  selectedUnitRecord: ChurchUnit | null
  /** true enquanto as unidades ainda não carregaram — queries dependentes devem aguardar. */
  isLoading: boolean
}

const UnitContext = createContext<UnitContextValue | null>(null)

function readStored(churchId: string): string | null {
  try { return localStorage.getItem(unitStorageKey(churchId)) } catch { return null }
}
function writeStored(churchId: string, scope: UnitScope) {
  try { localStorage.setItem(unitStorageKey(churchId), scope) } catch { /* storage indisponível */ }
}

export function UnitProvider({ children }: { children: ReactNode }) {
  const { churchId } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  // Escopo operacional = people.unit_id bruto. churches.unit_cutoff_date fica só como histórico.
  const { data: units = [], isLoading: unitsLoading } = useChurchUnits(churchId ?? '')

  const unitIds = useMemo(() => units.map(u => u.id), [units])
  const params = useMemo(() => new URLSearchParams(location.search), [location.search])
  const rawParam = params.get(UNIT_PARAM)

  const selectedUnit: UnitScope = useMemo(() => {
    if (unitsLoading) return UNIT_ALL
    const fromUrl = rawParam ?? (churchId ? readStored(churchId) : null)
    return parseUnitScope(fromUrl, unitIds)
  }, [rawParam, churchId, unitIds, unitsLoading])

  // Mantém o parâmetro na URL em toda rota do CRM (persistência na navegação)
  useEffect(() => {
    if (unitsLoading || !churchId) return
    if (rawParam === selectedUnit) return
    const next = new URLSearchParams(location.search)
    next.set(UNIT_PARAM, selectedUnit)
    navigate({ pathname: location.pathname, search: `?${next.toString()}`, hash: location.hash }, { replace: true })
  }, [rawParam, selectedUnit, unitsLoading, churchId, location.pathname, location.search, location.hash, navigate])

  const setSelectedUnit = useCallback((scope: UnitScope) => {
    const normalized = parseUnitScope(scope, unitIds)
    if (churchId) writeStored(churchId, normalized)
    const next = new URLSearchParams(location.search)
    next.set(UNIT_PARAM, normalized)
    navigate({ pathname: location.pathname, search: `?${next.toString()}`, hash: location.hash }, { replace: true })
  }, [churchId, unitIds, location.pathname, location.search, location.hash, navigate])

  const value = useMemo<UnitContextValue>(() => ({
    churchId: churchId ?? null,
    selectedUnit,
    setSelectedUnit,
    units,
    selectedUnitRecord: units.find(u => u.id === selectedUnit) ?? null,
    isLoading: unitsLoading,
  }), [churchId, selectedUnit, setSelectedUnit, units, unitsLoading])

  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>
}

export function useUnit(): UnitContextValue {
  const ctx = useContext(UnitContext)
  if (!ctx) throw new Error('useUnit() precisa estar dentro de <UnitProvider>')
  return ctx
}
