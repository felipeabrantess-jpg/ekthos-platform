// _shared/d0-welcome.ts — planejamento do template de boas-vindas (D+0) do agent-acolhimento.
//
// Por quê: o vídeo do template `acolhimento_boasvindas` era enviado por `video.id` (media id da Meta). Esse id é
// preso ao número que fez o upload e expira em ~30 dias; depois disso cada envio falha com 131009 e nada é visível
// para quem opera. Aqui o vídeo passa a ser enviado por LINK HTTPS estável (Supabase Storage), com verificação
// PRÉVIA e erro explícito — nunca substituição silenciosa por texto.
//
// Funções puras (fetch injetável) para teste sem rede e sem envio.

export const D0_TEMPLATE_VIDEO = 'acolhimento_boasvindas'        // template aprovado, header VIDEO + corpo {{1}}
export const D0_VIDEO_MAX_BYTES = 16 * 1024 * 1024               // limite da Meta para vídeo de template
export const D0_VIDEO_TIMEOUT_MS = 8_000

export interface D0ChannelMetadata {
  meta_media?: { acolhimento_boasvindas_video_url?: string | null } | null
  meta_templates?: { acolhimento?: string | null; acolhimento_video?: string | null } | null
  meta_media_ids?: { acolhimento_boasvindas?: string | null } | null
}

export type D0Component =
  | { type: 'header'; parameters: Array<{ type: 'video'; video: { link: string } | { id: string } }> }
  | { type: 'body'; parameters: Array<{ type: 'text'; text: string }> }

export type D0Plan =
  /** vídeo por link HTTPS verificado + template aprovado (caminho definitivo) */
  | { kind: 'video_link'; template: string; components: D0Component[]; videoUrl: string; bytes: number | null }
  /** vídeo CONFIGURADO mas indisponível: NÃO enviar e NÃO substituir por texto — registrar e tentar de novo */
  | { kind: 'video_unavailable'; reason: string; videoUrl: string | null }
  /** template de texto (meta_templates.acolhimento), sem mídia */
  | { kind: 'text_template'; template: string; components: D0Component[] }
  /** legado: media id (expira) */
  | { kind: 'legacy_media_id'; template: string; components: D0Component[]; warning: string }
  /** nada configurado → comportamento anterior (Claude escreve a mensagem) */
  | { kind: 'none' }

const bodyComponent = (firstName: string): D0Component => ({ type: 'body', parameters: [{ type: 'text', text: firstName }] })

/** URL HTTPS bem formada, sem credenciais embutidas. */
export function isValidHttpsUrl(u: unknown): u is string {
  if (typeof u !== 'string' || u.length === 0 || u.length > 2000) return false
  try {
    const p = new URL(u)
    return p.protocol === 'https:' && !p.username && !p.password && p.hostname.length > 0
  } catch { return false }
}

export interface VideoCheck { ok: boolean; reason?: string; bytes: number | null }

/**
 * Verifica, do ponto de vista da Meta, se o link serve o vídeo: HTTPS, 200/206, tipo de vídeo MP4/3GP e ≤ 16 MB.
 * HEAD primeiro; se o servidor recusar HEAD, GET com Range 0-0. Sem seguir redirecionamentos (a Meta exige URL direta).
 */
export async function checkVideoUrl(
  url: string,
  fetchFn: typeof fetch = fetch,
  timeoutMs = D0_VIDEO_TIMEOUT_MS,
): Promise<VideoCheck> {
  if (!isValidHttpsUrl(url)) return { ok: false, reason: 'invalid_url', bytes: null }
  const attempt = async (init: RequestInit) => {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), timeoutMs)
    try { return await fetchFn(url, { ...init, redirect: 'manual', signal: ctl.signal }) } finally { clearTimeout(timer) }
  }
  try {
    let res = await attempt({ method: 'HEAD' })
    if (res.status === 405 || res.status === 501) res = await attempt({ method: 'GET', headers: { Range: 'bytes=0-0' } })
    if (res.status >= 300 && res.status < 400) return { ok: false, reason: `redirect_${res.status}`, bytes: null }
    if (res.status !== 200 && res.status !== 206) return { ok: false, reason: `http_${res.status}`, bytes: null }
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (type !== 'video/mp4' && type !== 'video/3gpp') return { ok: false, reason: `bad_content_type:${type || 'none'}`, bytes: null }
    let bytes: number | null = null
    const cr = res.headers.get('content-range')            // "bytes 0-0/4676784"
    const m = cr ? /\/(\d+)$/.exec(cr) : null
    if (m) bytes = Number(m[1])
    else if (res.headers.get('content-length')) bytes = Number(res.headers.get('content-length'))
    if (bytes !== null && !Number.isFinite(bytes)) bytes = null
    if (bytes === 0) return { ok: false, reason: 'empty_file', bytes }
    if (bytes !== null && bytes > D0_VIDEO_MAX_BYTES) return { ok: false, reason: `too_large:${bytes}`, bytes }
    return { ok: true, bytes }
  } catch (e) {
    const name = (e as { name?: string })?.name
    return { ok: false, reason: name === 'AbortError' ? 'timeout' : 'network_error', bytes: null }
  }
}

/**
 * Decide o que enviar no D+0. Prioridade:
 *  1. meta_media.acolhimento_boasvindas_video_url (vídeo por link) → verifica; falhou = `video_unavailable` (SEM fallback);
 *  2. meta_templates.acolhimento (template de texto);
 *  3. meta_media_ids.acolhimento_boasvindas (legado, media id — pode estar expirado);
 *  4. nada → `none`.
 */
export async function planD0Welcome(
  meta: D0ChannelMetadata | null | undefined,
  firstName: string,
  fetchFn: typeof fetch = fetch,
): Promise<D0Plan> {
  const videoUrl = meta?.meta_media?.acolhimento_boasvindas_video_url ?? null
  if (videoUrl !== null && videoUrl !== '') {
    const chk = await checkVideoUrl(videoUrl, fetchFn)
    if (!chk.ok) return { kind: 'video_unavailable', reason: chk.reason ?? 'unknown', videoUrl }
    const template = meta?.meta_templates?.acolhimento_video || D0_TEMPLATE_VIDEO
    return {
      kind: 'video_link', template, videoUrl, bytes: chk.bytes,
      components: [{ type: 'header', parameters: [{ type: 'video', video: { link: videoUrl } }] }, bodyComponent(firstName)],
    }
  }
  const textTemplate = meta?.meta_templates?.acolhimento ?? null
  if (textTemplate) return { kind: 'text_template', template: textTemplate, components: [bodyComponent(firstName)] }
  const mediaId = meta?.meta_media_ids?.acolhimento_boasvindas ?? null
  if (mediaId) {
    return {
      kind: 'legacy_media_id', template: D0_TEMPLATE_VIDEO,
      components: [{ type: 'header', parameters: [{ type: 'video', video: { id: String(mediaId) } }] }, bodyComponent(firstName)],
      warning: 'media id legado (expira em ~30 dias e é preso ao número que fez o upload)',
    }
  }
  return { kind: 'none' }
}
