import { useState, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, X, Check, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useChurch } from '@/hooks/useChurch'

export function Branding() {
  const { churchId } = useAuth()
  const { data: church, isLoading } = useChurch()
  const queryClient = useQueryClient()

  const [primary, setPrimary]     = useState('var(--color-primary)')
  const [secondary, setSecondary] = useState('#670000')
  const [logoFile, setLogoFile]   = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [removeLogo, setRemoveLogo]   = useState(false)
  const [saved, setSaved] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Sync state when church data loads
  useEffect(() => {
    if (church) {
      setPrimary(church.primary_color ?? 'var(--color-primary)')
      setSecondary(church.secondary_color ?? '#670000')
    }
  }, [church])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setLogoFile(file)
    setRemoveLogo(false)
    const url = URL.createObjectURL(file)
    setLogoPreview(url)
  }

  const handleRemoveLogo = () => {
    setRemoveLogo(true)
    setLogoFile(null)
    setLogoPreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!churchId) throw new Error('Igreja não encontrada')

      let logo_url: string | null = church?.logo_url ?? null

      if (logoFile) {
        const ext = logoFile.name.split('.').pop() ?? 'png'
        const path = `${churchId}/logo.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('church-logos')
          .upload(path, logoFile, { upsert: true })
        if (uploadErr) throw uploadErr
        const { data: urlData } = supabase.storage
          .from('church-logos')
          .getPublicUrl(path)
        // Add cache-buster to force browser to reload updated logo
        logo_url = `${urlData.publicUrl}?t=${Date.now()}`
      }

      if (removeLogo) logo_url = null

      const { error } = await supabase
        .from('churches')
        .update({ primary_color: primary, secondary_color: secondary, logo_url })
        .eq('id', churchId)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['church-branding', churchId] })
      setLogoFile(null)
      setLogoPreview(null)
      setRemoveLogo(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    },
  })

  const currentLogo = logoPreview ?? (!removeLogo ? (church?.logo_url ?? null) : null)
  const churchInitial = church?.name?.charAt(0)?.toUpperCase() ?? 'E'

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Identidade Visual</h2>
        <p className="text-sm text-gray-500 mt-1">
          Logo e cores aplicadas em todo o CRM da sua igreja.
        </p>
      </div>

      {/* ── Logo ─────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700">Logo da Igreja</h3>
        <div className="flex items-start gap-6">
          {/* Preview */}
          <div
            className="h-16 w-16 rounded-xl flex items-center justify-center shrink-0 overflow-hidden border border-gray-100"
            style={{ background: primary + '18' }}
          >
            {currentLogo ? (
              <img
                src={currentLogo}
                alt="Logo"
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <span
                className="font-display text-2xl font-bold"
                style={{ color: primary }}
              >
                {churchInitial}
              </span>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Upload size={14} />
              {currentLogo ? 'Trocar logo' : 'Fazer upload'}
            </button>
            {currentLogo && (
              <button
                onClick={handleRemoveLogo}
                className="inline-flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition-colors"
              >
                <X size={12} />
                Remover logo
              </button>
            )}
            <p className="text-xs text-gray-400">
              PNG, JPG, WebP ou SVG. Máx. 2MB. Recomendado: 200×200px.
            </p>
          </div>
        </div>
      </section>

      {/* ── Cores ────────────────────────────────────────────── */}
      <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
        <h3 className="text-sm font-semibold text-gray-700">Cores</h3>

        <div className="grid grid-cols-2 gap-6">
          {/* Cor primária */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">Cor Primária</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primary}
                onChange={e => setPrimary(e.target.value)}
                className="h-10 w-10 rounded-lg cursor-pointer border border-gray-200 p-0.5 shrink-0"
              />
              <input
                type="text"
                value={primary.toUpperCase()}
                onChange={e => {
                  const v = e.target.value
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setPrimary(v)
                }}
                className="flex-1 text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 uppercase focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': primary + '40' } as React.CSSProperties}
                maxLength={7}
              />
            </div>
            <p className="text-xs text-gray-400">Botões, destaques, nav ativa</p>
          </div>

          {/* Cor secundária */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-600">Cor Secundária</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={secondary}
                onChange={e => setSecondary(e.target.value)}
                className="h-10 w-10 rounded-lg cursor-pointer border border-gray-200 p-0.5 shrink-0"
              />
              <input
                type="text"
                value={secondary.toUpperCase()}
                onChange={e => {
                  const v = e.target.value
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) setSecondary(v)
                }}
                className="flex-1 text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 uppercase focus:outline-none focus:ring-2"
                style={{ '--tw-ring-color': secondary + '40' } as React.CSSProperties}
                maxLength={7}
              />
            </div>
            <p className="text-xs text-gray-400">Banner, hover, destaques</p>
          </div>
        </div>

        {/* ── Live preview ─────────────────────────────────────── */}
        <div className="mt-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
            Preview em tempo real
          </p>
          <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
            {/* Sidebar simulada */}
            <div className="flex">
              <div className="w-36 shrink-0 flex flex-col gap-1 p-3" style={{ background: '#161616' }}>
                {/* Logo */}
                <div className="flex items-center gap-2 px-2 py-2 mb-1">
                  {currentLogo ? (
                    <img src={currentLogo} alt="" className="h-5 w-auto object-contain max-w-[80px]" />
                  ) : (
                    <span className="text-sm font-bold font-display" style={{ color: primary }}>
                      {church?.name?.split(' ')[0] ?? 'Ekthos'}
                    </span>
                  )}
                </div>
                {/* Nav items */}
                {['Dashboard', 'Pessoas', 'Pipeline'].map((item, i) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm border-l-2"
                    style={
                      i === 0
                        ? { borderColor: primary, background: 'rgba(255,255,255,0.06)', color: '#fff' }
                        : { borderColor: 'transparent', color: 'rgba(255,255,255,0.4)' }
                    }
                  >
                    <div className="h-3 w-3 rounded-sm bg-current opacity-60" />
                    {item}
                  </div>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 p-3" style={{ background: 'var(--bg-primary)' }}>
                <div className="flex gap-2 mb-3">
                  <button
                    className="px-3 py-1 rounded-lg text-xs font-semibold text-white"
                    style={{ background: primary }}
                  >
                    Salvar
                  </button>
                  <button
                    className="px-3 py-1 rounded-lg text-xs font-semibold text-white"
                    style={{ background: secondary }}
                  >
                    Cancelar
                  </button>
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 w-24 rounded-full" style={{ background: primary, opacity: 0.25 }} />
                  <div className="h-2 w-32 rounded-full bg-gray-200" />
                  <div className="h-2 w-20 rounded-full bg-gray-200" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Salvar ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-60"
          style={{ background: primary }}
        >
          {saveMutation.isPending ? (
            <><Loader2 size={15} className="animate-spin" /> Salvando...</>
          ) : saved ? (
            <><Check size={15} /> Salvo com sucesso!</>
          ) : (
            'Salvar alterações'
          )}
        </button>
        {saveMutation.isError && (
          <p className="text-sm text-red-500">
            Erro ao salvar. Verifique e tente novamente.
          </p>
        )}
      </div>
    </div>
  )
}
