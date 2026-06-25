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
  if (!nome_contato || !(nome_contato as string).trim()) missing.push('nome_contato')
  if (!telefone || !(telefone as string).trim()) missing.push('telefone')
  if (!email || !(email as string).trim()) missing.push('email')
  if (lgpd_consent !== true) missing.push('lgpd_consent')

  if (missing.length > 0) {
    return json({ error: 'Campos obrigatórios ausentes', fields: missing }, 422)
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
    const path = `empresarios/pendentes/${IGV_CHURCH_ID}/${Date.now()}.${ext}`

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
    categoria: (categoria as string).trim(),
    descricao: (descricao as string)?.trim() || null,
    telefone: (telefone as string).trim(),
    email: (email as string).trim(),
    instagram: (instagram as string)?.replace(/^@/, '').trim() || null,
    nome_contato: (nome_contato as string).trim(),
    site: (site as string)?.trim() || null,
    lgpd_consent: true,
    foto_url,
    active: true,
    authorized_public: false,
  })

  if (insertErr) {
    console.error('Insert error:', insertErr.message)
    return json({ error: 'Erro ao registrar. Tente novamente.' }, 500)
  }

  return json({ ok: true }, 201)
})
