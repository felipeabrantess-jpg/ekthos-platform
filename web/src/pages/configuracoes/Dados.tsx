/**
 * Dados.tsx — /configuracoes/dados
 *
 * Formulário de dados básicos da Igreja:
 * nome, telefone, email público, endereço, cidade, estado, CEP.
 *
 * Campos que a tabela `churches` aceita: name, phone, email,
 * address, city, state, zip_code.
 * Campos ausentes na tabela (CNPJ, site) ficam apenas como UI placeholder
 * até a migration correspondente.
 */

import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useChurch } from '@/hooks/useChurch'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'

interface ChurchDados {
  name:     string
  phone:    string
  email:    string
  address:  string
  city:     string
  state:    string
  zip_code: string
}

const ESTADOS_BR = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
]

export function Dados() {
  const { churchId } = useAuth()
  const { data: church, isLoading } = useChurch()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<ChurchDados>({
    name:     '',
    phone:    '',
    email:    '',
    address:  '',
    city:     '',
    state:    '',
    zip_code: '',
  })
  const [saved, setSaved] = useState(false)

  // Sincronizar quando dados carregam
  useEffect(() => {
    if (church) {
      setForm({
        name:     (church as unknown as { name?: string }).name     ?? '',
        phone:    (church as unknown as { phone?: string }).phone   ?? '',
        email:    (church as unknown as { email?: string }).email   ?? '',
        address:  (church as unknown as { address?: string }).address  ?? '',
        city:     (church as unknown as { city?: string }).city    ?? '',
        state:    (church as unknown as { state?: string }).state   ?? '',
        zip_code: (church as unknown as { zip_code?: string }).zip_code ?? '',
      })
    }
  }, [church])

  const mutation = useMutation({
    mutationFn: async (data: ChurchDados) => {
      const { error } = await supabase
        .from('churches')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(data as any)
        .eq('id', churchId!)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['church', churchId] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    },
  })

  function handleChange(field: keyof ChurchDados, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate(form)
  }

  if (isLoading) {
    return <p className="text-sm text-ekthos-black/40 py-6">Carregando...</p>
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-lg font-semibold text-ekthos-black">Dados da Igreja</h2>
        <p className="text-sm text-ekthos-black/50 mt-1">
          Informações gerais da sua Igreja no sistema Ekthos.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-ekthos-black/70 mb-1">Nome da Igreja *</label>
          <Input
            value={form.name}
            onChange={e => handleChange('name', e.target.value)}
            placeholder="Ex: Igreja Batista Central"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-ekthos-black/70 mb-1">Telefone</label>
            <Input
              value={form.phone}
              onChange={e => handleChange('phone', e.target.value)}
              placeholder="(11) 98765-4321"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ekthos-black/70 mb-1">E-mail público</label>
            <Input
              type="email"
              value={form.email}
              onChange={e => handleChange('email', e.target.value)}
              placeholder="contato@suaigreja.com"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-ekthos-black/70 mb-1">Endereço</label>
          <Input
            value={form.address}
            onChange={e => handleChange('address', e.target.value)}
            placeholder="Rua das Flores, 123"
          />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <label className="block text-sm font-medium text-ekthos-black/70 mb-1">CEP</label>
            <Input
              value={form.zip_code}
              onChange={e => handleChange('zip_code', e.target.value)}
              placeholder="00000-000"
            />
          </div>
          <div className="col-span-1">
            <label className="block text-sm font-medium text-ekthos-black/70 mb-1">Cidade</label>
            <Input
              value={form.city}
              onChange={e => handleChange('city', e.target.value)}
              placeholder="São Paulo"
            />
          </div>
          <div className="col-span-1">
            <label className="block text-sm font-medium text-ekthos-black/70 mb-1">Estado</label>
            <select
              value={form.state}
              onChange={e => handleChange('state', e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value="">UF</option>
              {ESTADOS_BR.map(uf => (
                <option key={uf} value={uf}>{uf}</option>
              ))}
            </select>
          </div>
        </div>

        {mutation.isError && (
          <p className="text-sm text-red-500">
            Erro ao salvar. Tente novamente.
          </p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button
            type="submit"
            variant="primary"
            disabled={mutation.isPending || !form.name.trim()}
          >
            {mutation.isPending ? (
              <><Loader2 size={14} className="animate-spin mr-1.5" />Salvando...</>
            ) : saved ? (
              <><Check size={14} className="mr-1.5" />Salvo!</>
            ) : (
              'Salvar dados'
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
