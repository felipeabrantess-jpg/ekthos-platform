import { useState, useEffect, useRef, useCallback } from 'react'
import Input from '@/components/ui/Input'
import { supabase } from '@/lib/supabase'

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
  /** Quando true: filtra is_leader=true. Estado vazio sem value mostra mensagem orientativa. */
  onlyLeaders?: boolean
}

export default function PersonSelect({
  value,
  onChange,
  placeholder = 'Buscar pessoa...',
  className = '',
  disabled = false,
  label,
  error,
  hint,
  onlyLeaders = false,
}: PersonSelectProps) {
  const [inputText, setInputText] = useState('')
  const [results, setResults] = useState<Person[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  // true quando onlyLeaders=true + zero líderes + sem value atual
  const [noLeadersAtAll, setNoLeadersAtAll] = useState(false)

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

  // FIX: sem guard de 2 chars — query vazia retorna primeiras 8 pessoas (lista ao focar)
  const search = useCallback(async (query: string) => {
    setIsLoading(true)
    setIsOpen(true)
    setNoLeadersAtAll(false)

    let q = supabase.from('people').select('id, name, email').is('deleted_at', null).limit(8)
    if (query.length > 0) {
      q = q.ilike('name', `%${query}%`)
    }
    if (onlyLeaders) {
      q = q.eq('is_leader', true)
    }

    const { data, error: queryError } = await q
    if (queryError) console.error('[PersonSelect] query error:', queryError.message)

    let fetched = (data as Person[]) ?? []

    // Backward-compat: se há value atual mas ele foi filtrado (não é líder),
    // busca essa pessoa por ID e prepend — o form não quebra.
    if (onlyLeaders && value && !fetched.find((p) => p.id === value)) {
      const { data: fallback } = await supabase
        .from('people')
        .select('id, name, email')
        .eq('id', value)
        .single()
      if (fallback) {
        fetched = [fallback as Person, ...fetched]
      }
    }

    // Estado vazio: onlyLeaders + zero resultados + sem value atual
    if (onlyLeaders && fetched.length === 0 && !value) {
      setNoLeadersAtAll(true)
    }

    setResults(fetched)
    setIsLoading(false)
  }, [onlyLeaders, value])

  // FIX: ao focar, buscar imediatamente (sem debounce) para mostrar lista instantânea
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
    setNoLeadersAtAll(false)
    onChange(person.id, person)
  }

  function handleClear() {
    setSelectedPerson(null)
    setInputText('')
    setResults([])
    setIsOpen(false)
    setNoLeadersAtAll(false)
    onChange(null)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setIsOpen(false)
    }
  }

  // FIX: não exige mais inputText.length >= 2 para mostrar dropdown
  const showDropdown = isOpen && (isLoading || results.length > 0 || noLeadersAtAll)

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
          ) : noLeadersAtAll ? (
            /* Estado vazio — onlyLeaders + zero líderes + sem value atual */
            <div className="px-3 py-3 text-sm text-gray-500">
              <p className="font-medium">Nenhum líder cadastrado.</p>
              <p className="text-xs text-gray-400 mt-0.5">
                Marque uma pessoa como líder no cadastro dela para aparecer aqui.
              </p>
            </div>
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
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
