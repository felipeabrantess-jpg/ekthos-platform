/**
 * QrCodeModal.tsx — Modal rápido de QR Code de entrada
 *
 * Usado na página /pessoas para acesso rápido ao QR de visitantes.
 * A página completa de administração continua em /configuracoes/qr-visitante.
 *
 * Props:
 *   open         — controla visibilidade
 *   onOpenChange — callback para fechar
 *   churchId     — ID da igreja (para buscar qr_codes)
 */

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { X, Copy, Check, Download, ExternalLink } from 'lucide-react'
import QRCode from 'qrcode'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/ui/Spinner'

// ── Constantes ───────────────────────────────────────────────

const APP_BASE_URL =
  (import.meta.env.VITE_APP_URL as string | undefined) ??
  (typeof window !== 'undefined' ? window.location.origin : 'https://ekthos-platform.vercel.app')

const QR_PREVIEW_SIZE  = 200
const QR_DOWNLOAD_SIZE = 1024

function visitorUrl(slug: string) {
  return `${APP_BASE_URL}/visita/${slug}`
}

async function generateQrCanvas(text: string, size: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, text, {
    width: size,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#1a1a1a', light: '#ffffff' },
  })
  return canvas
}

async function downloadPng(url: string, slug: string) {
  const canvas = await generateQrCanvas(url, QR_DOWNLOAD_SIZE)
  const link = document.createElement('a')
  link.download = `qr-visitante-${slug}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

async function downloadSvg(url: string, slug: string) {
  const svgString = await QRCode.toString(url, {
    type: 'svg',
    width: QR_DOWNLOAD_SIZE,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#1a1a1a', light: '#ffffff' },
  })
  const blob = new Blob([svgString], { type: 'image/svg+xml' })
  const link = document.createElement('a')
  link.download = `qr-visitante-${slug}.svg`
  link.href = URL.createObjectURL(blob)
  link.click()
  URL.revokeObjectURL(link.href)
}

// ── Componente ───────────────────────────────────────────────

interface QrCodeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  churchId: string
}

export default function QrCodeModal({ open, onOpenChange, churchId }: QrCodeModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [copied,  setCopied]  = useState(false)
  const [dlPng,   setDlPng]   = useState(false)
  const [dlSvg,   setDlSvg]   = useState(false)

  // Fechar com Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false) }
    if (open) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  // Travar scroll do body quando aberto
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  const { data: qrData, isLoading } = useQuery({
    queryKey: ['qr_code', churchId],
    enabled: !!churchId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('qr_codes')
        .select('id, slug, is_active, scanned_count')
        .eq('church_id', churchId)
        .single()
      if (error) throw error
      return data
    },
  })

  // Renderizar QR no canvas de preview
  useEffect(() => {
    if (!qrData?.slug || !canvasRef.current || !open) return
    const url = visitorUrl(qrData.slug)
    void QRCode.toCanvas(canvasRef.current, url, {
      width: QR_PREVIEW_SIZE,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: { dark: '#1a1a1a', light: '#ffffff' },
    })
  }, [qrData?.slug, open])

  async function handleCopy() {
    if (!qrData?.slug) return
    await navigator.clipboard.writeText(visitorUrl(qrData.slug))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleDownloadPng() {
    if (!qrData?.slug || dlPng) return
    setDlPng(true)
    try { await downloadPng(visitorUrl(qrData.slug), qrData.slug) }
    finally { setDlPng(false) }
  }

  async function handleDownloadSvg() {
    if (!qrData?.slug || dlSvg) return
    setDlSvg(true)
    try { await downloadSvg(visitorUrl(qrData.slug), qrData.slug) }
    finally { setDlSvg(false) }
  }

  if (!open) return null

  const url = qrData ? visitorUrl(qrData.slug) : ''

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog — bottom-sheet em mobile, modal centrado em desktop */}
      <div className="relative bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-slide-up sm:animate-fade-in-up">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-black/5 shrink-0">
          <div>
            <h2 className="font-display text-base font-semibold text-ekthos-black">QR Code de Entrada</h2>
            <p className="text-xs text-ekthos-black/50 mt-0.5">Visitantes escaneiam e se cadastram automaticamente</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-gray-400 hover:text-gray-700 transition-colors rounded-lg p-1.5 hover:bg-gray-100"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner size="lg" />
            </div>
          ) : !qrData ? (
            <p className="text-sm text-center text-ekthos-black/40 py-8">
              QR Code não encontrado. Contate o suporte Ekthos.
            </p>
          ) : (
            <>
              {/* Status badge */}
              {!qrData.is_active && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-3 py-2 text-xs text-yellow-800 font-medium">
                  ⚠️ QR Code está desativado. Ative em Configurações para receber visitantes.
                </div>
              )}

              {/* QR Preview */}
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

              {/* URL + Copiar */}
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

              {/* Downloads */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => void handleDownloadPng()}
                  disabled={dlPng}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-black/10 text-sm font-medium text-ekthos-black hover:bg-cream transition-colors disabled:opacity-50"
                >
                  {dlPng ? <Spinner size="sm" /> : <Download className="w-4 h-4" />}
                  PNG (1024px)
                </button>
                <button
                  onClick={() => void handleDownloadSvg()}
                  disabled={dlSvg}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-black/10 text-sm font-medium text-ekthos-black hover:bg-cream transition-colors disabled:opacity-50"
                >
                  {dlSvg ? <Spinner size="sm" /> : <Download className="w-4 h-4" />}
                  SVG (vetorial)
                </button>
              </div>

              {/* Stats */}
              {(qrData.scanned_count ?? 0) > 0 && (
                <p className="text-center text-xs text-ekthos-black/40">
                  {qrData.scanned_count} {qrData.scanned_count === 1 ? 'pessoa escaneou' : 'pessoas escanearam'} até agora
                </p>
              )}
            </>
          )}
        </div>

        {/* Footer — link para configurações avançadas */}
        <div className="shrink-0 px-5 py-3 border-t border-black/5">
          <Link
            to="/configuracoes/qr-visitante"
            onClick={() => onOpenChange(false)}
            className="flex items-center justify-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors"
          >
            Configurações avançadas
            <ExternalLink size={11} strokeWidth={2} />
          </Link>
        </div>
      </div>
    </div>
  )
}
