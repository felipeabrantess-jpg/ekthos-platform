/**
 * useAddonActions.ts — CTAs de contratação de agentes e módulos
 *
 * Duas ações:
 *  - adicionarAoPlano: POST /addon-request → registra pedido para próxima fatura
 *  - falarComConsultor: POST /contact-consultant → notifica admin Ekthos
 */

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const EF_BASE = import.meta.env.VITE_SUPABASE_URL as string

async function getToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

export interface AddonActionResult {
  ok: boolean
  message: string
  chargeAt?: string
}

export function useAddonActions() {
  const [loadingAddon, setLoadingAddon] = useState(false)
  const [loadingConsultor, setLoadingConsultor] = useState(false)

  async function adicionarAoPlano(
    addonType: 'agent' | 'module',
    addonSlug: string
  ): Promise<AddonActionResult> {
    setLoadingAddon(true)
    try {
      const token = await getToken()
      if (!token) return { ok: false, message: 'Sessão expirada. Faça login novamente.' }

      const res = await fetch(`${EF_BASE}/functions/v1/addon-request`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ addon_type: addonType, addon_slug: addonSlug }),
      })

      const json = await res.json() as { error?: string; charge_at?: string }

      if (!res.ok) {
        if (res.status === 409) return { ok: false, message: json.error ?? 'Pedido já registrado.' }
        return { ok: false, message: json.error ?? 'Erro ao registrar pedido.' }
      }

      const date = json.charge_at
        ? new Date(json.charge_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : undefined

      return {
        ok: true,
        message: date
          ? `Pedido registrado! A cobrança entra na fatura de ${date}.`
          : 'Pedido registrado! Entraremos em contato em breve.',
        chargeAt: json.charge_at,
      }
    } catch {
      return { ok: false, message: 'Erro de conexão. Tente novamente.' }
    } finally {
      setLoadingAddon(false)
    }
  }

  async function falarComConsultor(
    context: 'agent' | 'module' | 'plan',
    targetSlug: string
  ): Promise<AddonActionResult> {
    setLoadingConsultor(true)
    try {
      const token = await getToken()
      if (!token) return { ok: false, message: 'Sessão expirada. Faça login novamente.' }

      const res = await fetch(`${EF_BASE}/functions/v1/contact-consultant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ context, target_slug: targetSlug }),
      })

      if (!res.ok) {
        const json = await res.json() as { error?: string }
        return { ok: false, message: json.error ?? 'Erro ao enviar mensagem.' }
      }

      const message = context === 'module'
        ? 'Recebemos sua mensagem! Nosso time vai contatar em até 24h para apresentar o módulo e fazer a ativação.'
        : 'Recebemos sua mensagem! Entraremos em contato em breve.'
      return { ok: true, message }
    } catch {
      return { ok: false, message: 'Erro de conexão. Tente novamente.' }
    } finally {
      setLoadingConsultor(false)
    }
  }

  return { adicionarAoPlano, falarComConsultor, loadingAddon, loadingConsultor }
}
