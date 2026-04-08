import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { useCreatePerson, useUpdatePerson } from '../hooks/usePeople'
import type { Person } from '@/lib/database.types'

interface PersonModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  person?: Person | null  // null = criar novo
}

export default function PersonModal({ open, onClose, churchId, person }: PersonModalProps) {
  const isEdit = Boolean(person)
  const createPerson = useCreatePerson()
  const updatePerson = useUpdatePerson()

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
  })
  const [error, setError] = useState<string | null>(null)

  // Preenche o form ao editar
  useEffect(() => {
    if (person) {
      setForm({
        name: person.name ?? '',
        phone: person.phone ?? '',
        email: person.email ?? '',
      })
    } else {
      setForm({ name: '', phone: '', email: '' })
    }
    setError(null)
  }, [person, open])

  const isPending = createPerson.isPending || updatePerson.isPending

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim()) {
      setError('Nome é obrigatório.')
      return
    }

    try {
      if (isEdit && person) {
        await updatePerson.mutateAsync({
          id: person.id,
          church_id: churchId,
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
        })
      } else {
        await createPerson.mutateAsync({
          church_id: churchId,
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          source: 'manual',
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar Pessoa' : 'Nova Pessoa'}
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Nome *"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Nome completo"
          required
        />
        <Input
          label="Telefone"
          value={form.phone}
          onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          placeholder="+55 11 99999-9999"
          type="tel"
        />
        <Input
          label="E-mail"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          placeholder="email@exemplo.com"
          type="email"
        />

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" loading={isPending}>
            {isEdit ? 'Salvar' : 'Criar Pessoa'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
