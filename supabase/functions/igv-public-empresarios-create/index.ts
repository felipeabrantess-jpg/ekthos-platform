import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const IGV_CHURCH_ID = '6c127559-874a-4748-8fce-55d4079613a5'
const MAX_LOGO_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Validação: as mesmas regras do app (web/src/lib/igv-validacao.ts) ────────
// O app já valida; aqui é a garantia para quem tentar enviar por fora do app.

const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function nomeCompleto(v: string): boolean {
  const palavras = v.trim().split(/\s+/).filter(p => (p.match(/\p{L}/gu) ?? []).length >= 2)
  return palavras.length >= 2
}

function sequenciaObvia(s: string): boolean {
  if (/^(\d)\1*$/.test(s)) return true
  return '0123456789'.includes(s) || '9876543210'.includes(s) ||
    /12345678|23456789|87654321|98765432/.test(s)
}

function telefoneBR(v: string): boolean {
  let d = v.replace(/\D/g, '')
  if (d.length > 13) return false
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length !== 10 && d.length !== 11) return false
  if (/^(\d)\1*$/.test(d)) return false
  if (!DDDS.has(Number(d.slice(0, 2)))) return false
  const numero = d.slice(2)
  if (d.length === 11 && numero[0] !== '9') return false
  if (d.length === 10 && !/^[2-5]/.test(numero)) return false
  if (sequenciaObvia(numero)) return false
  if (d.length === 11 && sequenciaObvia(numero.slice(1))) return false
  return true
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON inválido' }, 400)
  }

  const {
    nome,
    categoria,
    descricao,
    telefone,
    email,
    instagram,
    nome_contato,
    site,
    lgpd_consent,
    logo_base64,
    logo_mime,
  } = body as Record<string, string | boolean | null | undefined>

  const missing: string[] = []
  if (!nome || !(nome as string).trim()) missing.push('nome')
  if (!categoria || !(categoria as string).trim()) missing.push('categoria')
  if (!descricao || !(descricao as string).trim()) missing.push('descricao')
  if (!nome_contato || !(nome_contato as string).trim()) missing.push('nome_contato')
  if (!telefone || !(telefone as string).trim()) missing.push('telefone')
  if (!email || !(email as string).trim()) missing.push('email')
  if (lgpd_consent !== true) missing.push('lgpd_consent')

  if (missing.length > 0) {
    return json({ error: 'Campos obrigatórios ausentes', fields: missing }, 422)
  }

  const invalid: string[] = []
  if ((nome as string).trim().length < 2) invalid.push('nome')
  if (!nomeCompleto(nome_contato as string)) invalid.push('nome_contato')
  if (!telefoneBR(telefone as string)) invalid.push('telefone')
  if (!EMAIL_RE.test((email as string).trim())) invalid.push('email')
  if ((descricao as string).trim().length < 3) invalid.push('descricao')
  // "Outros" sozinho não vale: o app envia "Outros: <tipo de negócio>"
  const cat = (categoria as string).trim()
  if (/^outros?$/i.test(cat) || (/^outros?:/i.test(cat) && cat.replace(/^outros?:/i, '').trim().length < 2)) invalid.push('categoria')

  if (invalid.length > 0) {
    return json({ error: 'Dados inválidos', fields: invalid }, 422)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let foto_url: string | null = null

  if (logo_base64 && logo_mime) {
    if (!ALLOWED_MIME.includes(logo_mime as string)) {
      return json({ error: 'Tipo de imagem não permitido. Use JPEG, PNG ou WebP.' }, 422)
    }

    let logoBytes: Uint8Array
    try {
      logoBytes = Uint8Array.from(atob(logo_base64 as string), (c) => c.charCodeAt(0))
    } catch {
      return json({ error: 'logo_base64 inválido' }, 422)
    }

    if (logoBytes.length > MAX_LOGO_BYTES) {
      return json({ error: 'Imagem muito grande. Máximo 5 MB.' }, 422)
    }

    const ext = (logo_mime as string).split('/')[1].replace('jpeg', 'jpg')
    const path = `empresarios/${IGV_CHURCH_ID}/${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('church-logos')
      .upload(path, logoBytes, { contentType: logo_mime as string, upsert: false })

    if (upErr) {
      console.error('Upload error:', upErr.message)
      return json({ error: 'Erro ao salvar imagem' }, 500)
    }

    const { data: urlData } = supabase.storage.from('church-logos').getPublicUrl(path)
    foto_url = urlData.publicUrl
  }

  const { error: insertErr } = await supabase.from('church_empresarios').insert({
    church_id: IGV_CHURCH_ID,
    nome: (nome as string).trim(),
    categoria: cat,
    descricao: (descricao as string).trim(),
    telefone: (telefone as string).trim(),
    email: (email as string).trim(),
    instagram: (instagram as string)?.replace(/^@/, '').trim() || null,
    nome_contato: (nome_contato as string).trim(),
    site: (site as string)?.trim() || null,
    lgpd_consent: true,
    foto_url,
    active: true,
    authorized_public: true,
  })

  if (insertErr) {
    console.error('Insert error:', insertErr.message)
    return json({ error: 'Erro ao registrar. Tente novamente.' }, 500)
  }

  return json({ ok: true }, 201)
})
