/**
 * useChurchIdentity — Load/save dos dados de identidade de uma Igreja
 *
 * Lê e grava diretamente na tabela churches via RLS.
 * A política churches_admin_update (is_ekthos_admin() FOR UPDATE) permite
 * que admins Ekthos façam UPDATE sem precisar de Edge Function ou RPC.
 *
 * Usado pela aba "Cadastro" em Church.tsx (admin cockpit).
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export interface ChurchIdentityFields {
  name: string
  city: string
  state: string
  region: string
  denomination: string
  vision_statement: string
  address_full: string
  main_phone: string
  main_email: string
  website_url: string
  pastor_titular_name: string
  pastor_titular_phone: string
  social_media_handles: { instagram?: string; youtube?: string; facebook?: string }
  timezone: string
}

const EMPTY: ChurchIdentityFields = {
  name: '', city: '', state: '', region: '',
  denomination: '', vision_statement: '', address_full: '',
  main_phone: '', main_email: '', website_url: '',
  pastor_titular_name: '', pastor_titular_phone: '',
  social_media_handles: {},
  timezone: 'America/Sao_Paulo',
}

export function useChurchIdentity(churchId: string) {
  const [fields, setFields] = useState<ChurchIdentityFields>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  const showToast = useCallback((ok: boolean, msg: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast({ ok, msg })
    timerRef.current = setTimeout(() => setToast(null), 5000)
  }, [])

  // Load
  useEffect(() => {
    if (!churchId) return
    let cancelled = false
    setLoading(true)
    supabase
      .from('churches')
      .select([
        'name', 'city', 'state', 'region', 'denomination',
        'vision_statement', 'address_full', 'main_phone', 'main_email',
        'website_url', 'pastor_titular_name', 'pastor_titular_phone',
        'social_media_handles', 'timezone',
      ].join(','))
      .eq('id', churchId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { showToast(false, error.message); setLoading(false); return }
        setFields({
          name:                  (data as Record<string, unknown>)?.name                  as string ?? '',
          city:                  (data as Record<string, unknown>)?.city                  as string ?? '',
          state:                 (data as Record<string, unknown>)?.state                 as string ?? '',
          region:                (data as Record<string, unknown>)?.region                as string ?? '',
          denomination:          (data as Record<string, unknown>)?.denomination          as string ?? '',
          vision_statement:      (data as Record<string, unknown>)?.vision_statement      as string ?? '',
          address_full:          (data as Record<string, unknown>)?.address_full          as string ?? '',
          main_phone:            (data as Record<string, unknown>)?.main_phone            as string ?? '',
          main_email:            (data as Record<string, unknown>)?.main_email            as string ?? '',
          website_url:           (data as Record<string, unknown>)?.website_url           as string ?? '',
          pastor_titular_name:   (data as Record<string, unknown>)?.pastor_titular_name   as string ?? '',
          pastor_titular_phone:  (data as Record<string, unknown>)?.pastor_titular_phone  as string ?? '',
          social_media_handles:  ((data as Record<string, unknown>)?.social_media_handles as ChurchIdentityFields['social_media_handles']) ?? {},
          timezone:              (data as Record<string, unknown>)?.timezone              as string ?? 'America/Sao_Paulo',
        })
        setDirty(false)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [churchId, showToast])

  const update = useCallback(<K extends keyof ChurchIdentityFields>(
    key: K, value: ChurchIdentityFields[K]
  ) => {
    setFields(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }, [])

  const save = useCallback(async () => {
    setSaving(true)
    const { error } = await supabase
      .from('churches')
      .update({
        // name e timezone não são nullable — não enviar se vazios
        name:                  fields.name.trim()                  || undefined,
        timezone:              fields.timezone.trim()              || undefined,
        // campos opcionais: enviar null para limpar valor no banco
        city:                  fields.city.trim()                  || null,
        state:                 fields.state.trim()                 || null,
        region:                fields.region.trim()                || null,
        denomination:          fields.denomination.trim()          || null,
        vision_statement:      fields.vision_statement.trim()      || null,
        address_full:          fields.address_full.trim()          || null,
        main_phone:            fields.main_phone.trim()            || null,
        main_email:            fields.main_email.trim()            || null,
        website_url:           fields.website_url.trim()           || null,
        pastor_titular_name:   fields.pastor_titular_name.trim()   || null,
        pastor_titular_phone:  fields.pastor_titular_phone.trim()  || null,
        social_media_handles:  Object.keys(fields.social_media_handles).length > 0
          ? fields.social_media_handles : null,
      })
      .eq('id', churchId)
    setSaving(false)
    if (error) {
      showToast(false, error.message)
    } else {
      setDirty(false)
      showToast(true, 'Cadastro salvo com sucesso.')
    }
  }, [churchId, fields, showToast])

  return { fields, update, loading, saving, dirty, toast, save }
}
