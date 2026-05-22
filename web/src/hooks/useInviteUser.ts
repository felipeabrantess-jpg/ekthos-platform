import { useState } from 'react'
import { supabase } from '@/lib/supabase'

interface InviteParams {
  email: string
  role: string
  name?: string
}

interface InviteResult {
  ok: boolean
  message: string
}

export function useInviteUser() {
  const [isLoading, setIsLoading] = useState(false)

  async function inviteUser(params: InviteParams): Promise<InviteResult> {
    setIsLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/church-invite-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify(params),
        },
      )
      const data = (await res.json()) as { error?: string }
      if (!res.ok) return { ok: false, message: data.error ?? 'Erro ao convidar usuário' }
      return { ok: true, message: `Convite enviado para ${params.email}!` }
    } catch {
      return { ok: false, message: 'Erro de conexão. Tente novamente.' }
    } finally {
      setIsLoading(false)
    }
  }

  return { inviteUser, isLoading }
}
