import { useState, useEffect, useRef, useCallback } from 'react'
import Input from '@/components/ui/Input'
import { supabase } from '@/lib/supabase'
import { normalizeSearch } from '@/lib/normalizeSearch'

interface Person {
  id: string
  name: string
  email: string | null
}

interface PersonSelectProps {
  value: string | null
  onChange: (id: string | null, person?: Person) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  label?: string
  error?: string
  hint?: string
  /** Ids que não devem aparecer nos resultados (ex.: quem já pertence ao ministério). */
  excludeIds?: string[]
}

const RESULT_LIMIT = 20

export default function PersonSelect({
  value,
  onChange,
  placeholder = 'Buscar pessoa...',
  className = '',
  disabled = false,
  label,
  error,
  hint,
  excludeIds,
}: PersonSelectProps) {
  const excludeKey = (excludeIds ?? []).join(',')
  const [inputText, setInputText] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load selected person name when value prop is provided
  useEffect(() => {
    if (!value) {
      setSelectedPerson(null)
      setInputText('')
      return
    }

    // If already loaded and matches, skip
    if (selectedPerson?.id === value) return

    supabase
      .from('people')
      .select('id, name, email')
      .eq('id', value)
      .single()
      .then(({ data }) => {
        if (data) {
          setSelectedPerson(data as Person)
          setInputText(data.name)
        }
      })
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const [truncated, setTruncated] = useState(false)

  // Sem guard de 2 chars — query vazia lista as primeiras pessoas (ao focar)
  const search = useCallback(async (query: string) => {
    setIsLoading(true)
    setIsOpen(true)

    const exclude = excludeKey ? excludeKey.split(',') : []
    let q = supabase.from('people').select('id, name, email')
      .is('deleted_at', null).is('left_at', null)
      .order('name_sort', { ascending: true })
      .limit(RESULT_LIMIT + exclude.length + 1)   // +1 para detectar truncamento
    const normalized = normalizeSearch(query)
    if (normalized.length > 0) {
      // name_sort = unaccent(lower(name)) → busca insensível a acento/caixa/cedilha
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      q = (q as any).ilike('name_sort', `%${normalized}%`)
    }

    const { data, error: queryError } = await q
    if (queryError) console.error('[PersonSelect] query error:', queryError.message)

    const fetched = ((data as Person[]) ?? []).filter(p => !exclude.includes(p.id))
    setTruncated(fetched.length > RESULT_LIMIT)
    setResults(fetched.slice(0, RESULT_LIMIT))
    setIsLoading(false)
  }, [excludeKey])

  // Ao focar, buscar imediatamente (sem debounce) para mostrar lista instantânea
  function handleFocus() {
    if (selectedPerson) return // já tem seleção, não reabrir
    search(inputText)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const text = e.target.value
    setInputText(text)

    // If user typed after a selection, clear the selection
    if (selectedPerson) {
      setSelectedPerson(null)
      onChange(null)
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(text), 600)
  }

  function handleSelect(person: Person) {
    setSelectedPerson(person)
    setInputText(person.name)
    setIsOpen(false)
    setResults([])
    onChange(person.id, person)
  }

  function handleClear() {
    setSelectedPerson(null)
    setInputText('')
    setResults([])
    setIsOpen(false)
    onChange(null)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  const showDropdown = isOpen && (isLoading || results.length > 0)

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <Input
          label={label}
          error={error}
          hint={hint}
          value={inputText}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
        />
        {selectedPerson && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            style={label ? { top: 'calc(50% + 14px)' } : undefined}
            aria-label="Limpar seleção"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-50 w-full mt-1 bg-white rounded-2xl border border-black/10 shadow-lg overflow-hidden">
          {isLoading ? (
            <div className="px-3 py-3 text-sm text-gray-400 font-medium">Buscando...</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-gray-400">Nenhuma pessoa encontrada.</div>
          ) : (
            <ul>
              {results.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2.5 hover:bg-cream cursor-pointer flex flex-col transition-colors"
                    onMouseDown={(e) => {
                      // prevent input blur before click registers
                      e.preventDefault()
                      handleSelect(person)
                    }}
                  >
                    <span className="text-sm font-medium text-ekthos-black">{person.name}</span>
                    {person.email && (
                      <span className="text-xs text-gray-400">{person.email}</span>
                    )}
                  </button>
                </li>
              ))}
              {truncated && (
                <li className="px-3 py-2 text-xs text-amber-600 bg-amber-50 border-t border-black/5" data-testid="person-select-truncated">
                  Mostrando os primeiros {RESULT_LIMIT} resultados — refine a busca.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
