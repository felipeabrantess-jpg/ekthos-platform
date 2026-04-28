/**
 * QrVisitor.tsx — /configuracoes/qr-visitante
 *
 * Frente B — Gerenciamento do QR Code de captura de visitantes.
 * Permite ao pastor/admin:
 *   - Ver URL pública e copiar link
 *   - Visualizar preview do QR
 *   - Baixar em PNG (1024×1024) e SVG
 *   - Ver estatísticas básicas (scans × cadastros)
 *   - Ativar/desativar o QR
 */

import { useState, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { QrCode, Copy, Check, Download, ToggleLeft, ToggleRight } from 'lucide-react'
import QRCode from 'qrcode'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Spinner from '@/components/ui/Spinner'

// ── Constantes ───────────────────────────────────────────────

const APP_BASE_URL = import.meta.env.VITE_APP_URL as string
  ?? (typeof window !== 'undefined' ? window.location.origin : 'https://ekthos-platform.vercel.app')

const QR_PREVIEW_SIZE  = 240
const QR_DOWNLOAD_SIZE = 1024

// ── Helpers ──────────────────────────────────────────────────

function visitorUrl(slug: string): string {
  return `${APP_BASE_URL}/visita/${slug}`
}

async function generateQrCanvas(text: string, size: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, text, {
    width:         size,
    margin:        2,
    errorCorrectionLevel: 'H',
    color: { dark: '#1a1a1a', light: '#ffffff' },
  })
  return canvas
}

async function downloadPng(url: string, filename: string) {
  const canvas = await generateQrCanvas(url, QR_DOWNLOAD_SIZE)
  const link   = document.createElement('a')
  link.download = filename
  link.href     = canvas.toDataURL('image/png')
  link.click()
}

async function downloadSvg(url: string, filename: string) {
  const svgString = await QRCode.toString(url, {
    type:                 'svg',
    width:                QR_DOWNLOAD_SIZE,
    margin:               2,
    errorCorrectionLevel: 'H',
    color: { dark: '#1a1a1a', light: '#ffffff' },
  })
  const blob = new Blob([svgString], { type: 'image/svg+xml' })
  const link = document.createElement('a')
  link.download = filename
  link.href     = URL.createObjectURL(blob)
  link.click()
  URL.revokeObjectURL(link.href)
}

// ── Componente principal ────────────────────────────────────

export function QrVisitor() {
  const { churchId } = useAuth()
  const queryClient  = useQueryClient()

  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const [copied,   setCopied]   = useState(false)
  const [dlPng,    setDlPng]    = useState(false)
  const [dlSvg,    setDlSvg]    = useState(false)

  // ── Dados do QR da church ─────────────────────────────
  const { data: qrData, isLoading: qrLoading } = useQuery({
    queryKey: ['qr_code', churchId],
    enabled:  !!churchId,
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('qr_codes')
        .select('id, slug, is_active, scanned_count')
        .eq('church_id', churchId!)
        .single()
      if (error) throw error
      return data
    },
  })

  // ── Estatísticas: cadastros via QR este mês ────────────
  const { data: monthlyCaptures } = useQuery({
    queryKey: ['qr_captures_month', churchId],
    enabled:  !!churchId,
    queryFn:  async () => {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const { count } = await supabase
        .from('people')
        .select('id', { count: 'exact', head: true })
        .eq('church_id', churchId!)
        .eq('source', 'qr_code')
        .gte('first_visit_date', startOfMonth.toISOString().split('T')[0])

      return count ?? 0
    },
  })

  // ── Total histórico via QR ─────────────────────────────
  const { data: totalCaptures } = useQuery({
    queryKey: ['qr_captures_total', churchId],
    enabled:  !!churchId,
    queryFn:  async () => {
      const { count } = await supabase
        .from('people')
        .select('id', { count: 'exact', head: true })
        .eq('church_id', churchId!)
        .eq('source', 'qr_code')
      return count ?? 0
    },
  })

  // ── Toggle is_active ──────────────────────────────────
  const toggleMutation = useMutation({
    mutationFn: async (newValue: boolean) => {
      const { error } = await supabase
        .from('qr_codes')
        .update({ is_active: newValue })
        .eq('church_id', churchId!)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['qr_code', churchId] })
    },
  })

  // ── Renderizar QR no canvas de preview ───────────────
  useEffect(() => {
    if (!qrData?.slug || !canvasRef.current) return
    const url = visitorUrl(qrData.slug)
    void QRCode.toCanvas(canvasRef.current, url, {
      width:                QR_PREVIEW_SIZE,
      margin:               2,
      errorCorrectionLevel: 'H',
      color: { dark: '#1a1a1a', light: '#ffffff' },
    })
  }, [qrData?.slug])

  // ── Copiar link ──────────────────────────────────────
  async function handleCopy() {
    if (!qrData?.slug) return
    await navigator.clipboard.writeText(visitorUrl(qrData.slug))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Download PNG ─────────────────────────────────────
  async function handleDownloadPng() {
    if (!qrData?.slug || dlPng) return
    setDlPng(true)
    try {
      await downloadPng(visitorUrl(qrData.slug), `qr-visitante-${qrData.slug}.png`)
    } finally {
      setDlPng(false)
    }
  }

  // ── Download SVG ─────────────────────────────────────
  async function handleDownloadSvg() {
    if (!qrData?.slug || dlSvg) return
    setDlSvg(true)
    try {
      await downloadSvg(visitorUrl(qrData.slug), `qr-visitante-${qrData.slug}.svg`)
    } finally {
      setDlSvg(false)
    }
  }

  // ── UI ────────────────────────────────────────────────

  if (qrLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!qrData) {
    return (
      <div className="text-center py-12 text-gray-400">
        <QrCode className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">QR Code não encontrado. Contate o suporte Ekthos.</p>
      </div>
    )
  }

  const url             = visitorUrl(qrData.slug)
  const scannedCount    = qrData.scanned_count ?? 0
  const capturesMonth   = monthlyCaptures ?? 0
  const capturesTotal   = totalCaptures ?? 0
  const conversionRate  = scannedCount > 0
    ? Math.round((capturesTotal / scannedCount) * 100)
    : 0

  return (
    <div className="space-y-6 max-w-lg">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-ekthos-black">QR Code de Visitantes</h2>
        <p className="text-sm text-ekthos-black/50 mt-1">
          Cole este QR na entrada da Igreja. Visitantes escaneiam e se cadastram automaticamente.
        </p>
      </div>

      {/* Status + link */}
      <div className="bg-white rounded-2xl border border-black/10 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ekthos-black">Status do QR</span>
          <button
            onClick={() => toggleMutation.mutate(!qrData.is_active)}
            disabled={toggleMutation.isPending}
            className="flex items-center gap-2 text-sm font-medium transition-colors"
          >
            {qrData.is_active ? (
              <>
                <ToggleRight className="w-5 h-5 text-brand-600" />
                <span className="text-brand-600">Ativo</span>
              </>
            ) : (
              <>
                <ToggleLeft className="w-5 h-5 text-gray-400" />
                <span className="text-gray-400">Inativo</span>
              </>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2 bg-cream rounded-xl px-3 py-2.5">
          <span className="text-xs text-ekthos-black/60 truncate flex-1 font-mono">{url}</span>
          <button
            onClick={() => void handleCopy()}
            className="shrink-0 flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            {copied ? (
              <><Check className="w-3.5 h-3.5" />Copiado</>
            ) : (
              <><Copy className="w-3.5 h-3.5" />Copiar</>
            )}
          </button>
        </div>
      </div>

      {/* Preview + downloads */}
      <div className="bg-white rounded-2xl border border-black/10 p-4 space-y-4">
        <p className="text-sm font-medium text-ekthos-black">Seu QR Code</p>

        {/* Canvas de preview */}
        <div className="flex justify-center">
          <div className="p-3 bg-white rounded-xl border border-black/5 shadow-sm inline-block">
            <canvas
              ref={canvasRef}
              width={QR_PREVIEW_SIZE}
              height={QR_PREVIEW_SIZE}
              className="rounded"
            />
          </div>
        </div>

        {/* Botões de download */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => void handleDownloadPng()}
            disabled={dlPng}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-black/10 text-sm font-medium text-ekthos-black hover:bg-cream transition-colors disabled:opacity-50"
          >
            {dlPng ? <Spinner size="sm" /> : <Download className="w-4 h-4" />}
            PNG (1024px)
          </button>
          <button
            onClick={() => void handleDownloadSvg()}
            disabled={dlSvg}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-black/10 text-sm font-medium text-ekthos-black hover:bg-cream transition-colors disabled:opacity-50"
          >
            {dlSvg ? <Spinner size="sm" /> : <Download className="w-4 h-4" />}
            SVG (vetorial)
          </button>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-black/10 p-3 text-center">
          <p className="text-xl font-bold text-ekthos-black">{capturesMonth}</p>
          <p className="text-xs text-gray-400 mt-0.5 leading-tight">Cadastros este mês</p>
        </div>
        <div className="bg-white rounded-2xl border border-black/10 p-3 text-center">
          <p className="text-xl font-bold text-ekthos-black">{scannedCount}</p>
          <p className="text-xs text-gray-400 mt-0.5 leading-tight">Scans totais</p>
        </div>
        <div className="bg-white rounded-2xl border border-black/10 p-3 text-center">
          <p className="text-xl font-bold text-brand-600">{conversionRate}%</p>
          <p className="text-xs text-gray-400 mt-0.5 leading-tight">Taxa conversão</p>
        </div>
      </div>

      {/* Instruções de uso */}
      <div className="bg-cream rounded-2xl p-4 space-y-2">
        <p className="text-sm font-medium text-ekthos-black">💡 Dicas de uso</p>
        <ul className="text-sm text-ekthos-black/60 space-y-1 list-disc list-inside">
          <li>Imprima em papel branco fosco, tamanho <strong>10×10cm</strong> ou maior</li>
          <li>Cole na entrada da Igreja, no púlpito ou no mural de avisos</li>
          <li>Visitante escaneia com a câmera do celular — sem app necessário</li>
          <li>O cadastro entra automaticamente em <strong>Consolidação</strong> e <strong>Pipeline</strong></li>
        </ul>
      </div>
    </div>
  )
}
